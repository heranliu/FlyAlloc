#!/usr/bin/env python3
"""Replay the frozen policy and compare it with the shipped original ledger."""
import sys
sys.dont_write_bytecode = True

import argparse
import gzip
import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
import torch

from paths import ROOT
from market_data import dataset, split
from policy import load
from engine import evaluate

ATOL = 1e-8
RTOL = 1e-9


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare(actual, expected):
    """Compare all structure/discrete values exactly; allow only numeric rounding."""
    report = dict(passed=True, exact=True, numeric_values=0, max_abs_difference=0.,
                  max_difference_path=None, structure_or_discrete_mismatches=0,
                  numeric_mismatches=0, examples=[])

    def fail(path, reason, numeric=False):
        report['passed'] = report['exact'] = False
        report['numeric_mismatches' if numeric else 'structure_or_discrete_mismatches'] += 1
        if len(report['examples']) < 10:
            report['examples'].append({'path': path, 'reason': reason})

    def walk(a, b, path):
        if isinstance(a, dict) and isinstance(b, dict):
            if a.keys() != b.keys():
                fail(path, 'dictionary keys differ')
            for k in a.keys() & b.keys():
                walk(a[k], b[k], f'{path}.{k}')
        elif isinstance(a, list) and isinstance(b, list):
            if len(a) != len(b):
                fail(path, f'list lengths {len(a)} != {len(b)}')
            for i, (x, y) in enumerate(zip(a, b)):
                walk(x, y, f'{path}[{i}]')
        elif isinstance(a, (bool, str, type(None), int)) or isinstance(b, (bool, str, type(None), int)):
            if type(a) is not type(b) or a != b:
                fail(path, 'discrete value or type differs')
        elif isinstance(a, float) and isinstance(b, float):
            report['numeric_values'] += 1
            delta = abs(a - b)
            if delta > report['max_abs_difference']:
                report['max_abs_difference'] = delta
                report['max_difference_path'] = path
            if a != b:
                report['exact'] = False
            if not np.isfinite([a, b]).all() or not np.isclose(a, b, atol=ATOL, rtol=RTOL):
                fail(path, f'numeric values {a} != {b}', numeric=True)
        else:
            fail(path, f'unsupported/differing types {type(a).__name__}, {type(b).__name__}')

    walk(actual, expected, '$')
    return report


def independent_ledger(result, data):
    """Execute the reported targets independently in NumPy, including liquidation."""
    q = np.zeros(7)
    cash = 100000.
    ids = {str(date): i for i, date in enumerate(data['dates'])}
    errors = []
    min_cash = cash

    def transact(price, quote, target):
        nonlocal q, cash
        wealth = cash + (q * price).sum()
        want = np.asarray(target[:7]) * wealth
        sell = np.maximum(q * price - want, 0) * quote
        cash += sell.sum() * (1 - .0005)
        q = q - sell / price
        buy = np.maximum(want - q * price, 0) * quote
        buy *= min(1., cash / max(buy.sum() * (1 + .0005), 1e-15))
        cash -= buy.sum() * (1 + .0005)
        q = q + buy / price
        return float((sell.sum() + buy.sum()) * .0005)

    for i, row in enumerate(result['daily']):
        t = ids[row['decision_date']]
        entry, end = data['open'][t + 1], data['open'][t + 2]
        pre = cash + (q * entry).sum()
        fee = transact(entry, data['actual'][t + 1], row['neural_target']) if row['rebalance_scheduled'] else 0.
        gross = q * (end - entry)
        errors.extend([abs(pre - row['preperiod_equity']), abs(cash - row['cash_at_entry']),
                       float(np.max(abs(q - row['adjusted_proxy_units_at_entry']))),
                       float(np.max(abs(gross - row['gross_stock_pnl'])))])
        if i == len(result['daily']) - 1:
            fee += transact(end, data['actual'][t + 2], [0] * 7 + [1])
        equity = cash + (q * end).sum()
        errors.extend([abs(equity - row['equity']), abs(fee - row['cost']),
                       abs(equity / pre - 1 - row['net_return']),
                       abs(equity - pre - gross.sum() + fee)])
        min_cash = min(min_cash, cash)
    largest = max(errors)
    return {'passed': bool(largest <= ATOL and min_cash >= -ATOL and np.min(q) >= -ATOL),
            'maximum_absolute_ledger_error': largest, 'minimum_cash': float(min_cash),
            'terminal_stock_value': float((q * end).sum()), 'rows': len(result['daily'])}


def run(output):
    private = json.loads((ROOT / 'provenance/private-data-manifest.json').read_text())['files']
    missing = [item['file'] for item in private if not (ROOT.parent / item['file']).is_file()]
    if missing:
        raise SystemExit('Local research data is required. Import an authorized bundle with '
                         'python scripts/local_data.py import /path/to/local-data.zip; '
                         'see docs/RUNNING.md. Missing files: ' + str(len(missing)))
    output.mkdir(parents=True, exist_ok=True)
    assets = json.loads((ROOT / 'provenance/asset_manifest.json').read_text())['files']
    bad_assets = sorted({item['file'] for item in assets if digest(ROOT / item['file']) != item['sha256']})
    if bad_assets:
        raise RuntimeError(f'Bundled asset hashes changed: {bad_assets}')
    data = dataset()
    fold = split(data, '2024-12-31', 2025)
    models = [load(ROOT / f'models/seed{seed}.npz', seed) for seed in (17, 29)]
    result = evaluate(models, data, fold)
    states = result.pop('joint_states')
    with gzip.open(ROOT / 'reference/ledger.json.gz', 'rt') as stream:
        original = json.load(stream)
    checks = {'original_ledger': compare(result, original),
              'split': compare(fold['metadata'], json.loads((ROOT / 'reference/split.json').read_text())),
              'independent_numpy_ledger': independent_ledger(result, data)}
    with np.load(ROOT / 'reference/normalizer.npz', allow_pickle=False) as z:
        for key in ('mean', 'scale'):
            checks[f'normalizer_{key}'] = compare(fold[key].tolist(), z[key].tolist())
    with np.load(ROOT / 'reference/states.npz', allow_pickle=False) as z:
        saved = z['joint_states']
        matching_shape = states.shape == saved.shape
        checks['joint_states'] = {
            'passed': bool(matching_shape and np.allclose(states, saved, atol=ATOL, rtol=RTOL)),
            'exact': bool(np.array_equal(states, saved)), 'shape': list(states.shape),
            'max_abs_difference': float(np.max(np.abs(states - saved))) if matching_shape else None}
    # The website adds only presentation fields to each canonical engine row.
    website = ROOT.parent / 'website/dist/static-raw.json'
    site = json.loads(website.read_text())
    canonical_fields = set(original['daily'][0])
    presentation_fields = sorted(set(site['daily_decisions'][0]) - canonical_fields)
    rows = [{k: v for k, v in row.items() if k in canonical_fields} for row in site['daily_decisions']]
    checks['website_daily'] = compare(result['daily'], rows)
    checks['website_orders'] = compare(result['orders'], site['simulated_orders'])
    checks['website_metrics'] = compare(result['metrics'], site['metrics'])
    report = {
        'release': 'FlyAlloc fixed model', 'passed': all(x['passed'] for x in checks.values()),
        'utc': datetime.now(timezone.utc).isoformat(),
        'environment': {'python': platform.python_version(), 'platform': platform.platform(),
                        'numpy': np.__version__, 'pandas': pd.__version__, 'scipy': scipy.__version__,
                        'torch': torch.__version__, 'torch_threads': torch.get_num_threads()},
        'atol': ATOL, 'rtol': RTOL,
        'comparison_note': 'Structure/discrete fields exact. Floating point uses the stated tolerances; exact reports are separate.',
        'rows': len(result['daily']), 'orders': len(result['orders']),
        'decision_start': result['daily'][0]['decision_date'],
        'valuation_end': result['daily'][-1]['valuation_date'],
        'metrics': result['metrics'], 'checks': checks,
        'website_presentation_fields_excluded': presentation_fields,
        'asset_files_verified': len(set(x['file'] for x in assets)),
        'model_sha256': {str(seed): digest(ROOT / f'models/seed{seed}.npz') for seed in (17, 29)},
        'reference_sha256': digest(ROOT / 'reference/ledger.json.gz'),
        'website_sha256': digest(website),
        'runtime_source_sha256': {p.name: digest(p) for p in sorted(ROOT.glob('*.py'))},
        'parameters_updated': False, 'network_access_required': False,
    }
    with gzip.open(output / 'replay.json.gz', 'wt') as stream:
        json.dump(result, stream, ensure_ascii=False, allow_nan=False)
    np.savez_compressed(output / 'replay_states.npz', joint_states=states)
    (output / 'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
    print(json.dumps({'passed': report['passed'], 'rows': report['rows'], 'orders': report['orders'],
                      'max_ledger_difference': checks['original_ledger']['max_abs_difference'],
                      'states_exact': checks['joint_states']['exact'],
                      'verification': str(output / 'verification.json')}, indent=2))
    if not report['passed']:
        raise RuntimeError('Replay verification failed; see verification.json')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'results', help='Directory for replay and verification files.')
    args = parser.parse_args()
    run(args.output.resolve())

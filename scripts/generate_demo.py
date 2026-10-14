#!/usr/bin/env python3
"""Generate deterministic interface-only data; no model or market data is read.

The separately bundled demo-graph.json contains a CC BY 4.0 MaleCNS-derived
connectivity graph. Its weights never drive the synthetic activity or allocation
formulas below. Dates are weekday placeholders, not an exchange calendar.
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH = ROOT / "website" / "dist" / "demo-graph.json"
DEFAULT_OUTPUT = ROOT / "website" / "dist" / "demo-data.json"
FRAME_COUNT = 120
ONE_WAY_FEE = 0.0005
REL_TOL = ABS_TOL = 1e-12


def weekdays(count: int) -> list[str]:
    days, day = [], date(2000, 1, 3)
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day.isoformat())
        day += timedelta(days=1)
    return days


def generate() -> dict:
    graph_bytes = GRAPH.read_bytes()
    graph = json.loads(graph_bytes)
    node_ids = [node["id"] for node in graph["nodes"]]
    symbols = [{"symbol": f"DEMO_{letter}", "name": f"虚构资产 {letter}",
                "sector": "合成序列", "icon": letter} for letter in "ABCDEFG"]
    days = weekdays(FRAME_COUNT + 2)
    initial = 100.0
    equity = baseline = initial
    holdings, cash = [0.0] * 7, initial
    base_holdings = [initial * (1 - ONE_WAY_FEE) / 7] * 7
    peak = base_peak = initial
    frames = []
    for i in range(FRAME_COUNT):
        previous, previous_baseline = equity, baseline
        # Explicit arbitrary formulas, never fitted against any return series.
        exposure = 0.50 + 0.12 * math.sin(i * 0.09)
        scores = [1.2 + 0.7 * math.sin(i * 0.057 + j * 0.91) for j in range(7)]
        target = [exposure * score / sum(scores) for score in scores]
        scheduled = i % 5 == 0
        fee = 0.0
        if scheduled:
            # A self-financing fractional-unit illustration, including toy fees.
            for _ in range(20):
                fee = ONE_WAY_FEE * sum(abs(w * (previous - fee) - h)
                                         for w, h in zip(target, holdings))
            holdings = [w * (previous - fee) for w in target]
            cash = (1 - exposure) * (previous - fee)
        weights = [h / (previous - fee) for h in holdings]
        cash_weight = cash / (previous - fee)
        asset_returns = [0.004 * math.sin((i + 2) * (j + 3) * 0.037)
                         + 0.002 * math.cos(i * 0.11 + j * 0.67) for j in range(7)]
        holdings = [h * (1 + r) for h, r in zip(holdings, asset_returns)]
        base_holdings = [h * (1 + r) for h, r in zip(base_holdings, asset_returns)]
        equity, baseline = cash + sum(holdings), sum(base_holdings)
        peak, base_peak = max(peak, equity), max(base_peak, baseline)
        # Integer pattern is unrelated to graph propagation, market observations,
        # model parameters, model inference, or recorded research states.
        activity = [(i * 7 + n * 13 + (i * n) % 41) % 256 for n in range(len(node_ids))]
        frames.append({
            "decisionDate": days[i], "entryDate": days[i + 1], "valuationDate": days[i + 2],
            "equity": equity, "preperiodEquity": previous,
            "baselineEquity": baseline, "baselinePreperiodEquity": previous_baseline,
            "drawdown": equity / peak - 1, "baselineDrawdown": baseline / base_peak - 1,
            "weights": weights, "cashWeight": cash_weight,
            "rebalanced": fee > 0, "rebalanceScheduled": scheduled,
            "proposedWeights": target + [1 - exposure], "cost": fee, "fees": fee,
            "slippage": 0.0, "modelVersion": "synthetic",
            "states": [{"symbol": "portfolio", "label": "人工活动示意", "date": days[i],
                        "values": activity, "nodeIds": node_ids}],
        })
    fees = sum(frame["fees"] for frame in frames)
    return {
        "schemaVersion": "1.1", "projectName": "FlyAlloc", "dataMode": "synthetic_demo",
        "synthetic": True, "modelInference": False, "title": "FlyAlloc 合成演示",
        "accountingStatus": "synthetic_demo", "generatedBy": "scripts/generate_demo.py",
        "sourceGraphSha256": hashlib.sha256(graph_bytes).hexdigest(),
        "generation": {"method": "Deterministic sine/cosine returns and weights; integer activity pattern",
                       "marketDataUsed": False, "modelLoaded": False, "randomness": "none",
                       "dates": "Weekday placeholders, not an exchange calendar",
                       "notice": "All assets, returns, allocations and activity are artificial interface examples; not model inference or research performance."},
        "strategy": {"id": "synthetic_illustration", "displayName": "合成演示（非模型输出）",
                     "maleCnsAssociated": True, "directNeural": False, "online": False},
        "stateScope": "joint_portfolio", "period": {"entryStart": frames[0]["entryDate"],
                     "valuationEnd": frames[-1]["valuationDate"]},
        "defaultPeriodStart": frames[40]["entryDate"], "initialCapital": initial,
        "symbols": symbols, "activationScale": 255,
        "activationNormalization": "Artificial integer values in [0,255]; no training quantiles used",
        "graph": graph, "graphVersions": {},
        "metrics": {"totalReturn": equity / initial - 1, "baselineReturn": baseline / initial - 1,
                    "maxDrawdown": min(frame["drawdown"] for frame in frames),
                    "meanExposure": sum(sum(frame["weights"]) for frame in frames) / len(frames),
                    "assumedCost": fees, "fees": fees, "slippage": 0.0},
        "frames": frames, "rawDataFile": "demo-data.json",
        "costModel": {"one_way_rate": ONE_WAY_FEE, "headline_extra_cost": 0},
        "feeDescription": "人工示例每边按 5bp 计算；并非真实执行成本。",
        "baselineLabel": "七项虚构资产买持示例",
        "modelDescription": "未加载或运行模型；权重、收益与活动由固定算式独立生成。",
        "caveat": "合成演示仅用于验证界面，不是研究结果、投资策略或未来收益证据。",
    }


def compare_json(expected: object, observed: object) -> dict:
    """Check the JSON contract, allowing only tiny platform floating-point drift."""
    stats = {"float_differences": 0, "max_abs_difference": 0.0,
             "relative_tolerance": REL_TOL, "absolute_tolerance": ABS_TOL}

    def visit(want: object, got: object, path: str) -> None:
        for value in (want, got):
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError(f"{path}: non-finite number is not allowed")
        # bool is an int subclass in Python: value equality alone is insufficient.
        if type(want) is not type(got):
            raise ValueError(f"{path}: expected {type(want).__name__}, got {type(got).__name__}")
        if isinstance(want, dict):
            missing, extra = want.keys() - got.keys(), got.keys() - want.keys()
            if missing or extra:
                raise ValueError(f"{path}: missing keys {sorted(missing)}, extra keys {sorted(extra)}")
            for key in want:
                visit(want[key], got[key], f"{path}[{json.dumps(key)}]")
        elif isinstance(want, list):
            if len(want) != len(got):
                raise ValueError(f"{path}: expected length {len(want)}, got {len(got)}")
            for index, (left, right) in enumerate(zip(want, got)):
                visit(left, right, f"{path}[{index}]")
        elif isinstance(want, float):
            difference = abs(want - got)
            if not math.isclose(want, got, rel_tol=REL_TOL, abs_tol=ABS_TOL):
                raise ValueError(f"{path}: float differs by {difference:.17g} "
                                 f"(expected {want:.17g}, got {got:.17g})")
            if difference:
                stats["float_differences"] += 1
                stats["max_abs_difference"] = max(stats["max_abs_difference"], difference)
        elif want != got:
            raise ValueError(f"{path}: expected {want!r}, got {got!r}")

    visit(expected, observed, "$")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="Check JSON values with 1e-12 absolute and relative float tolerances")
    args = parser.parse_args()
    expected = generate()
    stats = {}
    if args.check:
        try:
            payload = args.output.read_bytes()
            observed = json.loads(payload)
            stats = compare_json(expected, observed)
        except (OSError, ValueError) as error:
            raise SystemExit(f"Demo check failed: {error}") from error
    else:
        payload = (json.dumps(expected, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(payload)
    # In check mode this identifies the validated file, not regenerated bytes:
    # platform libm differences may change the latter's last floating-point digits.
    print(json.dumps({"status": "passed" if args.check else "generated", "frames": FRAME_COUNT,
                      "sha256": hashlib.sha256(payload).hexdigest(), "synthetic": True, **stats}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Audit the public Git file list without reading ignored local research data."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_PREFIXES = ('backend/data/', 'backend/reference/', 'backend/results/', '.runtime/',
                    '.venv/', 'validation/', 'website/validation/', 'outputs/', 'work/')
PRIVATE_FILES = {'website/dist/static-data.json', 'website/dist/static-raw.json',
                 'website/dist/data-provenance.json'}
REQUIRED = {'README.md', 'LICENSE', 'MODEL_CARD.md', 'DATA_SOURCES.md', 'THIRD_PARTY_NOTICES.md',
            'docs/RUNNING.md', 'LICENSES/CC-BY-4.0.txt', 'website/dist/demo-data.json',
            'website/dist/demo-graph.json', 'website/dist/vendor/THREE-LICENSE',
            'website/dist/assets/FONT-LICENSE', 'website/dist/assets/MONO-FONT-LICENSE',
            'website/dist/assets/flybody-LICENSE', 'backend/models/seed17.npz',
            'backend/models/seed29.npz'}


def public_paths():
    top = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, text=True).strip())
    if top.resolve() != ROOT:
        raise ValueError('Run this check in the independent FlyAlloc Git repository.')
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    return [name for name in names if name]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--committed', action='store_true', help='Also require the index to match HEAD before archiving.')
    args = parser.parse_args()
    problems = []
    names = public_paths()
    if subprocess.run(['git', 'diff', '--quiet', '--'], cwd=ROOT).returncode:
        problems.append('Tracked worktree files differ from the Git index; stage or discard those changes first.')
    if args.committed:
        if subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            problems.append('No commit exists; create a reviewed commit before archiving.')
        elif subprocess.run(['git', 'diff', '--cached', '--quiet', 'HEAD', '--'], cwd=ROOT).returncode:
            problems.append('Git index differs from HEAD; commit reviewed changes before archiving.')
    missing = REQUIRED - set(names)
    if missing:
        problems.append('Missing required tracked files: ' + ', '.join(sorted(missing)))
    private_manifest = json.loads((ROOT / 'backend/provenance/private-data-manifest.json').read_text())
    forbidden = PRIVATE_FILES | {item['file'] for item in private_manifest['files']}
    secret = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)')
    local_path = re.compile(r'/(?:Users|home)/[^/\s"\']+/')
    legacy = re.compile(r'\bv(?:[2-9]|1[0-8])(?![\d.])\b', re.I)
    total = 0
    for name in names:
        p = ROOT / name
        if (name.startswith(PRIVATE_PREFIXES) or name in forbidden or '.git' in p.relative_to(ROOT).parts
                or '__pycache__' in p.parts or p.name.startswith('.env') or p.suffix in ('.log', '.zip')):
            problems.append('Private/generated file is tracked: ' + name)
        if p.is_symlink() or not p.is_file():
            problems.append('Non-regular or missing file: ' + name)
            continue
        data = p.read_bytes()
        total += len(data)
        if len(data) > 25 * 1024 * 1024:
            problems.append('Unexpectedly large public file: ' + name)
        if legacy.search(name):
            problems.append('Historical project label in filename: ' + name)
        if p.suffix.lower() in ('.json', '.py', '.js', '.mjs', '.md', '.txt', '.html', '.css', '.yml'):
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                problems.append('Invalid UTF-8 source: ' + name)
                continue
            if secret.search(text) or local_path.search(text):
                problems.append('Possible secret or local account path: ' + name)
            if legacy.search(text) and not name.startswith(('website/dist/vendor/', '.github/')):
                problems.append('Historical project label in public text: ' + name)
            if p.suffix == '.md':
                for target in re.findall(r'\]\(([^)]+)\)', text):
                    if target.startswith(('https://', 'http://', '#', 'mailto:')):
                        continue
                    if not (p.parent / target.split('#')[0]).is_file():
                        problems.append(f'Broken documentation link: {name} -> {target}')
    demo = json.loads((ROOT / 'website/dist/demo-data.json').read_text())
    if not (demo.get('dataMode') == 'synthetic_demo' and demo.get('synthetic') is True
            and demo.get('modelInference') is False and demo.get('strategy', {}).get('directNeural') is False
            and all(re.fullmatch(r'DEMO_[A-G]', item['symbol']) for item in demo['symbols'])):
        problems.append('Synthetic demo is not clearly identified')
    model_card = (ROOT / 'MODEL_CARD.md').read_text()
    for seed in (17, 29):
        digest = hashlib.sha256((ROOT / f'backend/models/seed{seed}.npz').read_bytes()).hexdigest()
        if digest not in model_card:
            problems.append('Model card hash mismatch: seed ' + str(seed))
    print(json.dumps({'status': 'failed' if problems else 'passed', 'public_files': len(names),
                      'public_bytes': total, 'private_paths_excluded': len(forbidden),
                      'problems': problems}, ensure_ascii=False, indent=2))
    return bool(problems)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))

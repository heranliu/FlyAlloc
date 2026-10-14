#!/usr/bin/env python3
"""Import/export an authorized local research bundle without network access."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'backend/provenance/private-data-manifest.json'


def entries():
    items = json.loads(MANIFEST.read_text())['files']
    names = [item['file'] for item in items]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate paths in data manifest')
    for name in names:
        path = Path(name)
        allowed = (name.startswith('backend/data/') or name.startswith('backend/reference/')
                   or name in ('website/dist/static-data.json', 'website/dist/static-raw.json',
                               'website/dist/data-provenance.json'))
        if path.is_absolute() or '..' in path.parts or '\\' in name or not allowed:
            raise ValueError(f'Unexpected data path: {name}')
        if not (ROOT / path).resolve().is_relative_to(ROOT):
            raise ValueError(f'Data path escapes project: {name}')
    return items


def verify(data, item):
    if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError(f'Content does not match the research manifest: {item["file"]}')


def export_bundle(destination):
    destination = destination.resolve()
    if destination.exists():
        raise ValueError('Output already exists; choose another filename')
    items = entries()
    # Validate everything before creating an archive.
    for item in items:
        verify((ROOT / item['file']).read_bytes(), item)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as directory:
        temp = Path(directory) / 'bundle.zip'
        with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as archive:
            for item in items:
                archive.write(ROOT / item['file'], item['file'])
        temp.replace(destination)
    print(f'Exported {len(items)} local-only files: {destination}')
    print('This bundle is excluded from the public release; redistribution requires data-provider permission.')


def import_bundle(source):
    items = entries()
    # Validate the complete ZIP and existing destinations before writing any file.
    with zipfile.ZipFile(source) as archive:
        expected = {item['file'] for item in items}
        actual = archive.namelist()
        if len(actual) != len(expected) or set(actual) != expected:
            raise ValueError('ZIP must contain exactly the paths in the data manifest')
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            staging = Path(directory)
            for item in items:
                entry = archive.getinfo(item['file'])
                if entry.file_size != item['bytes']:
                    raise ValueError(f'Unexpected size: {item["file"]}')
                data = archive.read(item['file'])
                verify(data, item)
                destination = ROOT / item['file']
                if destination.exists():
                    verify(destination.read_bytes(), item)
                temp = staging / item['file']
                temp.parent.mkdir(parents=True, exist_ok=True)
                temp.write_bytes(data)
            for item in items:
                destination = ROOT / item['file']
                destination.parent.mkdir(parents=True, exist_ok=True)
                (staging / item['file']).replace(destination)
    print(f'Imported and verified {len(items)} local-only files. Refresh the website to load research records.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['export', 'import', 'check'])
    parser.add_argument('bundle', type=Path, nargs='?')
    args = parser.parse_args()
    try:
        if args.action == 'check':
            for item in entries():
                verify((ROOT / item['file']).read_bytes(), item)
            print('Local research data: all files and SHA-256 hashes match.')
        elif args.bundle is None:
            parser.error('export/import requires a ZIP path')
        elif args.action == 'export':
            export_bundle(args.bundle)
        else:
            import_bundle(args.bundle)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f'{error}\nSee docs/RUNNING.md for authorized local-data setup.\n')


if __name__ == '__main__':
    main()

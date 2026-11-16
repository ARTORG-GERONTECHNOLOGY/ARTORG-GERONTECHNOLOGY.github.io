"""Inspect and copy a complete static build into a fresh Pages artifact folder."""
import argparse
import importlib.util
import json
import re
import shutil
from pathlib import Path

spec = importlib.util.spec_from_file_location('check_build', Path(__file__).with_name('check-build.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
check_build = audit.check_build
PUBLIC_EXTENSIONS = {'.html', '.css', '.js', '.map', '.json', '.xml', '.txt',
                     '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
                     '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.webmanifest'}


def publication_metadata(source, revision=None):
    data = json.loads((source / 'publication.json').read_text(encoding='utf-8'))
    valid_sha = lambda value: isinstance(value, str) and re.fullmatch('[a-f0-9]{40}', value)
    if (data.get('schema') != 1 or not valid_sha(data.get('revision'))
            or revision and data['revision'] != revision
            or data.get('staff_revision') is not None and not valid_sha(data['staff_revision'])
            or not isinstance(data.get('content'), list)):
        raise ValueError('Invalid publication revision metadata')
    paths = set()
    for item in data['content']:
        if (not isinstance(item, dict) or not isinstance(item.get('path'), str)
                or item['path'] in paths or not re.fullmatch(r'_(?:posts|team|news)/[A-Za-z0-9-]+\.md|_data/(?:home|about|proposal_categories|removed_proposals)\.yml', item['path'])
                or not valid_sha(item.get('revision'))
                or not re.fullmatch('[a-f0-9]{64}', item.get('sha256', ''))):
            raise ValueError('Invalid content revision metadata')
        paths.add(item['path'])
    return data


def package(source, destination, revision=None):
    source, destination = source.resolve(), destination.resolve()
    if destination.exists() or destination == source or destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ValueError('Use a fresh artifact folder outside the build folder')
    check_build(source)
    publication_metadata(source, revision)
    files = []
    for file in source.rglob('*'):
        if file.is_symlink():
            raise ValueError('Links cannot enter a Pages artifact')
        if not file.is_file():
            continue
        relative = file.relative_to(source)
        # Maintenance guides and Markdown sources are not website assets.
        if relative.parts[0] == 'docs' or file.suffix.lower() == '.md':
            continue
        if any(part.startswith('.') for part in relative.parts):
            raise ValueError('Hidden file in public build')
        if file.suffix.lower() not in PUBLIC_EXTENSIONS and file.name not in {'CNAME', 'LICENSE'}:
            raise ValueError(f'Unrecognized public file: {relative}')
        files.append((file, relative))
    destination.mkdir(parents=True)
    for file, relative in files:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
    check_build(destination)
    publication_metadata(destination, revision)
    return len(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--revision')
    args = parser.parse_args()
    count = package(args.source, args.destination, args.revision)
    print(f'Inspected Pages artifact: {count} ordinary public files; no upload or deployment performed.')

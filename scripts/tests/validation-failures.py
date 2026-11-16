"""Prove that invalid candidates fail the actual checks, using temporary copies."""
import argparse
import importlib.util
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--ruby', default='ruby')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check_build', root / 'scripts/check-build.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def rejected(description, operation, expected):
    try:
        operation()
    except (ValueError, KeyError, FileNotFoundError) as error:
        assert expected in str(error), f'Unexpected rejection reason: {error}'
        print(f'Confirmed rejection: {description}')
        return
    raise AssertionError(f'Invalid candidate passed: {description}')


with tempfile.TemporaryDirectory(prefix='validation-failures-') as temporary:
    folder = Path(temporary)
    source = next((root / '_posts').glob('*.md'))
    invalid = folder / source.name
    text = source.read_text(encoding='utf-8')
    # Change the actual metadata value instead of relying on a test-only validator.
    import re
    invalid.write_text(re.sub(r'(?m)^status:.*$', 'status: invalid-status', text), encoding='utf-8')
    result = subprocess.run([args.ruby, str(root / 'scripts/validate-proposals.rb'), str(invalid)], capture_output=True, text=True)
    assert result.returncode == 1 and 'status' in result.stderr, f'Schema check did not reject invalid status: {result.stderr}'
    print('Confirmed rejection: invalid proposal schema')
    output = folder / 'site'
    shutil.copytree(args.output, output)
    audit.check_build(output)
    index = output / 'index.html'
    original = index.read_text(encoding='utf-8')
    index.write_text(original + '<img src="/missing-ci-fixture.png" alt="Fixture">', encoding='utf-8')
    rejected('broken local asset', lambda: audit.check_build(output), 'Broken local link/asset')
    index.write_text(original, encoding='utf-8')
    search = output / 'search.json'
    original_search = search.read_bytes()
    search.write_text('{ malformed JSON', encoding='utf-8')
    rejected('malformed search index', lambda: audit.check_build(output), 'Expecting property name')
    search.write_bytes(original_search)
    internal = output / 'private-source.docx'
    internal.write_text('Private source fixture', encoding='utf-8')
    rejected('copied source document', lambda: audit.check_build(output), 'Internal/private file')
    internal.unlink()
    pdf = next((output / 'assets/pdf').glob('*.pdf'))
    pdf.write_bytes(b'%PDF-broken')
    result = subprocess.run([sys.executable, str(root / 'scripts/tests/pdf-content.py'), str(output)], capture_output=True, text=True)
    assert result.returncode != 0, 'Broken PDF passed validation'
    print('Confirmed rejection: incomplete PDF')
print('All deliberate validation failures were rejected; original source and preview output were unchanged.')

"""Exercise the real Pages packager with generated static output, offline."""
import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

spec=importlib.util.spec_from_file_location('pages_packaging',Path(__file__).resolve().parents[1]/'package-pages.py')
pages=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


def rejected(operation, reason):
    try:
        operation()
    except (ValueError, FileNotFoundError) as error:
        assert reason in str(error), str(error)
        return
    raise AssertionError('Unsafe Pages artifact was accepted')


with tempfile.TemporaryDirectory(prefix='ger-pages-check-') as temporary:
    folder=Path(temporary).resolve()
    source=folder/'site'
    shutil.copytree(Path(sys.argv[1]).resolve(),source)
    revision='a'*40
    (source/'publication.json').write_text(json.dumps({'schema':1,'revision':revision,'staff_revision':None,'run_id':'fixture','built_at':'2026-11-16T00:00:00Z','content':[]}),encoding='utf-8')
    destination=folder/'artifact'
    count=pages.package(source,destination,revision)
    assert count>100
    assert (destination/'index.html').is_file() and (destination/'CNAME').read_bytes()==(source/'CNAME').read_bytes()
    assert len(list((destination/'assets/pdf').glob('*.pdf')))==len(list((source/'assets/pdf').glob('*.pdf')))
    assert not list(destination.rglob('*.md')) and not (destination/'docs').exists()
    before={str(file.relative_to(destination)):file.read_bytes() for file in destination.rglob('*') if file.is_file()}
    rejected(lambda:pages.package(source,destination,revision),'fresh artifact')
    rejected(lambda:pages.package(source,folder/'wrong-revision','b'*40),'revision metadata')
    private=source/'admin-service'
    private.mkdir()
    (private/'session.json').write_text('{}',encoding='utf-8')
    rejected(lambda:pages.package(source,folder/'unsafe',revision),'Internal/private')
    assert not (folder/'unsafe').exists()
    assert private.resolve().is_relative_to(folder) and private.name=='admin-service'
    shutil.rmtree(private)
    intermediate=source/'unexpected.zip'
    intermediate.write_bytes(b'fixture')
    rejected(lambda:pages.package(source,folder/'intermediate',revision),'Unrecognized public file')
    intermediate.unlink()
    (source/'temporary-draft.md').write_text('Private draft fixture',encoding='utf-8')
    # Markdown is excluded, even when an otherwise valid build contains it.
    clean=folder/'filtered'
    pages.package(source,clean,revision)
    assert not (clean/'temporary-draft.md').exists()
    assert before=={str(file.relative_to(destination)):file.read_bytes() for file in destination.rglob('*') if file.is_file()},'A failed/new candidate changed the previous artifact'
print('Pages packaging checks pass: exact revision, complete public assets/PDFs, source/private/intermediate exclusion, safe retries and retained previous artifact on failure.')

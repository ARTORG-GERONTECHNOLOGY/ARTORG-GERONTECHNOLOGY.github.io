"""Inspect generated public files without fetching remote links or publishing."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for field in ({'a': ['href'], 'link': ['href'], 'img': ['src'],
                       'script': ['src'], 'source': ['src'], 'track': ['src'],
                       'video': ['poster']}.get(tag, [])):
            if attrs.get(field):
                self.urls.append(attrs[field])


def check_build(directory):
    root = Path(directory).resolve()
    manifest = json.loads((root / 'pdf-manifest.json').read_text(encoding='utf-8'))
    baseurl = manifest['baseurl']
    public = urlsplit(manifest['public_url'])

    def target(url, page=None):
        parsed = urlsplit(url)
        if parsed.netloc and parsed.netloc != public.netloc:
            return None
        if parsed.scheme and parsed.scheme not in ('http', 'https'):
            return None
        if not parsed.path:
            return None
        path = unquote(parsed.path)
        if baseurl and path.startswith(baseurl + '/'):
            path = path[len(baseurl):]
        result = (root / path.lstrip('/') if path.startswith('/') else (page or root / 'index.html').parent / path).resolve()
        if not result.is_relative_to(root):
            raise ValueError(f'Link escapes build directory: {url}')
        if result.is_dir():
            result /= 'index.html'
        if not result.is_file():
            raise ValueError(f'Broken local link/asset in {page}: {url}')
        return result

    retained_pages = {entry['page_url'].lstrip('/') + 'index.html' for entry in manifest['proposals']}
    forbidden_roots = {'scripts', 'templates', 'admin-service',
                       'node_modules', '.git', '.github', '.bundle', 'vendor',
                       'private', 'drafts', '_drafts', 'tmp', 'output', '_team', 'team'}
    forbidden_suffixes = {'.docx', '.doc', '.rb', '.py', '.pyc', '.mjs', '.cjs',
                          '.pem', '.key', '.p12', '.pfx', '.sqlite', '.db', '.log',
                          '.yml', '.yaml', '.toml', '.ps1', '.bak', '.tmp'}
    credential = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}')
    for file in root.rglob('*'):
        relative = file.relative_to(root)
        if file.is_symlink():
            raise ValueError(f'Symlink in public output: {relative}')
        if not file.is_file():
            continue
        legacy_source = relative.parts[0] == 'post_archive' and relative.as_posix() not in retained_pages
        if (relative.parts[0] in forbidden_roots or relative.parts[:3] == ('assets', 'media', 'team')
                or legacy_source or file.suffix.lower() in forbidden_suffixes
                or file.name.startswith('.env') or file.name in {'AGENTS.md', 'new-features.md', 'Gemfile', 'Gemfile.lock', 'package.json', 'pnpm-lock.yaml', '¨'}):
            raise ValueError(f'Internal/private file in public output: {relative}')
        if credential.search(file.read_bytes()):
            # Never print the matching credential itself.
            raise ValueError(f'Credential-shaped content in public output: {relative}')
        if file.suffix == '.html':
            parser = Links()
            parser.feed(file.read_text(encoding='utf-8'))
            for url in parser.urls:
                target(url, file)
        elif file.suffix == '.css':
            for url in re.findall(r'url\(([^)]+)\)', file.read_text(encoding='utf-8')):
                target(url.strip('"\' '), file)
        elif file.suffix == '.json':
            json.loads(file.read_text(encoding='utf-8'))
        elif file.suffix == '.xml':
            ET.parse(file)

    entries = json.loads((root / 'search.json').read_text(encoding='utf-8'))
    if not isinstance(entries, list) or not entries:
        raise ValueError('Search index missing or empty')
    urls = set()
    for entry in entries:
        if entry['type'] not in {'proposal', 'news', 'page'} or not entry['title'].strip():
            raise ValueError('Invalid search entry')
        if entry['url'] in urls:
            raise ValueError('Duplicate search URL')
        urls.add(entry['url'])
        target(entry['url'])
        if entry['type'] == 'proposal' and entry['status'] not in {'available', 'taken', 'archived'}:
            raise ValueError('Invalid search availability')
    proposals = manifest['proposals']
    if {entry['url'] for entry in entries if entry['type'] == 'proposal'} != {baseurl + entry['page_url'] for entry in proposals}:
        raise ValueError('Search proposal set differs from published PDF manifest')
    expected_pdfs = {entry['pdf'].lstrip('/') for entry in proposals}
    actual_pdfs = {str(file.relative_to(root)).replace('\\', '/') for file in (root / 'assets/pdf').glob('*.pdf')}
    if expected_pdfs != actual_pdfs:
        raise ValueError('Missing or stale proposal PDFs')
    for name, kind in [('feed.xml', 'proposal'), ('news-feed.xml', 'news')]:
        feed = ET.parse(root / name)
        links = [item.findtext('link') for item in feed.findall('./channel/item')]
        expected = {target(entry['url']) for entry in entries if entry['type'] == kind}
        actual = {target(link) for link in links}
        # Both existing feeds expose at most the ten latest public entries.
        if len(links) != len(actual) or len(actual) != min(10, len(expected)) or not actual.issubset(expected):
            raise ValueError(f'{name} differs from published {kind} set')
    for location in ET.parse(root / 'sitemap.xml').iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
        target(location.text)
        if '/print/' in location.text or '/admin/' in location.text:
            raise ValueError('Internal route in sitemap')
    return len(list(root.rglob('*.html')))


if __name__ == '__main__':
    count = check_build(sys.argv[1] if len(sys.argv) > 1 else '_site')
    print(f'Final output inspection passed: {count} HTML files, local links/assets, JSON/XML, feeds, PDF inventory and internal/credential-file checks.')

"""Check generated PDFs against print HTML. Requires pypdf (verification only)."""
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

from pypdf import PdfReader


class Blocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag in {"h1", "h2", "h3", "p", "li", "dt", "dd", "figcaption"}:
            self.active.append([tag, ""])

    def handle_data(self, text):
        for block in self.active:
            block[1] += text

    def handle_endtag(self, tag):
        if self.active and self.active[-1][0] == tag:
            self.blocks.append(self.active.pop()[1])


def normalize(text):
    return re.sub(r"[\s\u00ad\u200b]+", "", unicodedata.normalize("NFKC", text))


root = Path(sys.argv[1] if len(sys.argv) > 1 else "../.local/site")
manifest = json.loads((root / "pdf-manifest.json").read_text(encoding="utf-8"))
for entry in manifest["proposals"]:
    pdf = root / entry["pdf"].lstrip("/")
    assert pdf.stat().st_size > 1000, f"Missing/empty PDF: {entry['id']}"
    reader = PdfReader(pdf)
    pages = [page.extract_text() for page in reader.pages]
    # Repeated page furniture can interrupt a paragraph split across pages.
    # Verify it separately, then join only prose for the full-content comparison.
    program = manifest['program']
    assert all(program in text for text in pages), 'Missing program footer'
    prose = []
    for text in pages:
        lines = [line for line in text.splitlines() if line.strip() != program and not re.fullmatch(r'\s*\d+\s*/\s*\d+\s*', line)]
        prose.append('\n'.join(lines))
    text = "\n".join(prose) + '\n' + program
    actual = normalize(text)
    print_path = entry["print_url"].removeprefix(manifest["baseurl"]).lstrip("/")
    parser = Blocks()
    parser.feed((root / print_path / "index.html").read_text(encoding="utf-8"))
    for block in parser.blocks:
        assert normalize(block) in actual, f"PDF omitted content in {entry['id']}: {block[:100]}"
    assert "Please return this proposal" not in text
    assert "Loading [MathJax]" not in text and "Processing math" not in text
    for page in reader.pages:
        assert abs(float(page.mediabox.width) - 595.28) < 2
        assert abs(float(page.mediabox.height) - 841.89) < 2
        for annot in page.get("/Annots", []):
            uri = str(annot.get_object().get("/A", {}).get("/URI", ""))
            assert "127.0.0.1" not in uri and "localhost" not in uri, uri
    html = (root / entry["page_url"].lstrip("/") / "index.html").read_text(encoding="utf-8")
    assert html.count('class="proposal-pdf-download"') == 1
    assert f'href="{manifest["baseurl"]}{entry["pdf"]}" download' in html
    assert f'Revision {entry["revision"]}' in html
assert not (root / "node_modules").exists(), "Node dependencies leaked into website"
print(f"PDF prose, A4 pages, public links and revision-labelled downloads pass for all {len(manifest['proposals'])} proposals.")

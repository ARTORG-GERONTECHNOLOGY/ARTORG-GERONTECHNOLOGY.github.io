# Project guide

## Content and source layout

- `_posts/`: five current proposal Markdown files, with publication dates and
  categories in YAML front matter. Edit scientific text carefully and preserve
  filenames, dates, and existing public URLs.
- `post_archive/`: five older source proposals. Folder membership does not prove
  that a proposal is taken or archived. The current default Jekyll build renders
  these files as standalone HTML pages under `/post_archive/<filename>/`; they
  are absent from the proposal catalogue and do not form a status-aware archive.
- `_layouts/`, `_includes/`: Liquid page structures and shared theme fragments.
- `_data/`: supporting structured data.
- `index.html`, `posts.html`, `posts-by-categories.html`: homepage and listings.
- `search.html`, `search.json`, `js/jekyll-search.js`: browser search.
- `css/`, `js/`, `favicons/`: styles, scripts, and browser icons.
- `feed.xml`, `404.html`: RSS and recovery navigation.

The workspace's `AGENTS.md`, `new-features.md`, and `template.docx` contain project
rules, the future implementation plan, and the original proposal reference.
Planned status controls, team/news pages, staff editing, QR codes, PDF generation,
and automated deployment are not implemented by this setup.

## Baseline issues preserved during setup

The five current and five older proposals are retained without content or status
changes. Legacy metadata lacks the planned immutable IDs, eligibility, and
availability fields. Some sources lack explicit supervisors/institutions, the
handwriting proposal refers to a missing Figure 1, and an older gait proposal has
a filename/front-matter date mismatch. These require review during migration.

The theme also has duplicate jQuery/MathJax loading, a placeholder print button,
limited search metadata, and inherited theme settings. The checked-in CNAME and
production URL differ; local overrides leave both untouched. These issues are
separate from installing the local build environment.

[Back to README](../README.md)

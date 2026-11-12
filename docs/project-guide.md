# Project guide

## Content and source layout

All ten proposals use the [shared proposal format](proposal-format.md),
with a blank template and separate draft/publication validation. The
[migration review](migration-issues.md) records confirmations and remaining issues.

- `_posts/`: all ten migrated proposal Markdown files, with publication dates and
  categories in YAML front matter. Edit scientific text carefully and preserve
  filenames, dates, and existing public URLs.
- `post_archive/`: former source location, now excluded from source copying.
  Its five proposals moved into `_posts/` with explicit permalinks preserving
  their existing `/post_archive/<filename>/` addresses. Status is metadata, not
  inferred from the former folder.
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

All ten proposals retain their scientific prose, filenames, publication dates
and existing public URLs. Metadata now includes immutable IDs, eligibility,
supervisors and institutes. Statuses for all ten and eligibility for the five
older proposals were randomized at the user's request. Two older proposals have
approved temporary workload splits. Replace those choices before release.
The handwriting proposal refers to a missing Figure 1, and an older gait proposal
has a preserved filename/front-matter date mismatch; see the migration review.

The theme also has duplicate jQuery/MathJax loading, a placeholder print button,
limited search metadata, and inherited theme settings. The checked-in CNAME and
production URL differ; local overrides leave both untouched. These issues are
separate from installing the local build environment.

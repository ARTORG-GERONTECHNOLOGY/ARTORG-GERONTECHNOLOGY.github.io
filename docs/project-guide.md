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

The theme also has duplicate jQuery/MathJax loading, unused print scripts,
limited search metadata, and inherited theme settings. The checked-in CNAME and
production URL differ; local overrides leave both untouched. These issues are
separate from installing the local build environment.
## Shared proposal rendering

Proposal pages follow the Word section order, including workload, affiliations,
student eligibility and separate staff submission instructions. Optional figure,
references, application, start-date and workplace information appears only when
provided. Previous/next links carry status labels; recommended projects are available.

The trusted Jekyll plugin uses `scripts/lib/proposal-renderer.rb` to render and
sanitize Markdown before Liquid templates or excerpts see it. Author Liquid stays
literal; metadata is escaped in shared includes. This renderer is the common basis
for later preview and print work. The pinned repository Gemfile is required.
Custom plugins require an ordinary Jekyll build; GitHub Pages safe-mode builds do
not run them. Publishing the generated artifact will be handled in the deployment
step; no production deployment has been made.

Run from the repository root with its Ruby environment active:

```sh
bundle exec ruby scripts/tests/proposal-format.rb
bundle exec jekyll build --config _config.yml,../.local/jekyll.yml --disable-disk-cache
bundle exec ruby scripts/tests/proposal-migration.rb ../.local/site
bundle exec ruby scripts/tests/proposal-rendering.rb ../.local/site
bundle exec ruby scripts/tests/proposal-rendering-fixtures.rb
```

The missing Figure 1 and temporary migration choices remain recorded in
[migration issues](migration-issues.md). A new layout does not resolve those gaps.

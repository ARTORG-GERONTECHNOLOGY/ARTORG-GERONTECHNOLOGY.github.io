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
The catalogue and archive support status/category/year/program filters. Homepage
content, news and team profiles can be maintained in source files. Staff browser
editing, QR codes, PDF generation and automated deployment remain planned.
About currently has a simple public page.

## Baseline issues preserved during setup

All ten proposals retain their scientific prose, filenames, publication dates
and existing public URLs. Metadata now includes immutable IDs, eligibility,
supervisors and institutes. Statuses for all ten and eligibility for the five
older proposals were randomized at the user's request. Two older proposals have
approved temporary workload splits. Replace those choices before release.
The handwriting proposal refers to a missing Figure 1, and an older gait proposal
has a preserved filename/front-matter date mismatch; see the migration review.

Search still has limited metadata, and some inherited theme settings remain. The checked-in CNAME and
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


## Navigation and responsive layout

The main navigation has Home, Proposals, Archive, News, Team, About and Search.
The new destination pages provide useful links and known group information;
status filters, news publishing and team profiles belong to later steps.
The shared list is `_data/navigation.yml`.

At widths below 1024 CSS pixels the menu uses Bootstrap 3 collapse. A real button
reports its expanded state. Escape closes the expanded menu and returns focus to
the button. Without JavaScript all navigation links remain visible. The former
MMenu initializer is no longer used. Its original source files remain unchanged.
A skip link, page language, labelled search input, visible keyboard focus and
reduced-motion styles support accessible navigation. Titles wrap in CSS.

The existing jQuery 3.2.1, Bootstrap 3.1.1 and Font Awesome 4.7.0 distributions are
stored locally in `assets/vendor/`, with original attribution and license notices.
No dependency upgrades were performed. Google Fonts, duplicate jQuery/MathJax,
browser-side highlighting, title-shrinking scripts, inactive sharing/comment UI
and placeholder print scripts are no longer loaded. Code highlighting uses Rouge.
MathJax 2.7.1 still loads externally, once on proposal pages (or pages explicitly
marked `mathjax: true`), so mathematical typesetting requires Internet access.

After building, check generated navigation and assets with:

```sh
bundle exec ruby scripts/tests/site-navigation.rb ../.local/site
```

Visual review is pending with the supervising user because automated browser
access to localhost is denied by a saved permission. Check 320, 375, 768, 1024 and
1440-pixel widths, long titles, 200% zoom, keyboard focus, skip link, Menu open/close,
Escape, and absence of horizontal page scrolling. Also check navigation with
JavaScript disabled. Static checks do not establish browser behaviour.

## Proposal catalogue and archive

The catalogue now has static Available, Taken and Archived routes, text status
badges, shared cards with eligibility and separate created/published/updated dates,
and list/year/category views. These pages are built from the same priority,
publication-date and immutable-ID ordering as the available homepage list.
Grouping keeps that order within each year or category. Status/group links work
without JavaScript. Original proposal detail URLs remain unchanged.

The catalogue initially shows available proposals; Archive initially shows both
Taken and Archived, with separate choices for each. All Status includes available, taken
and archived proposals in both browsing areas. Program filtering follows the
supervising user's decision: BME includes `bme_only` and `bme_and_aim`; AIM includes
only `bme_and_aim`. The shared mapping is in `_data/proposal_schema.yml`.

Filters combine status, category, publication year and student program. Counts
count each proposal once, even when it belongs to several category groups.
Selections are stored in the URL; refresh, shared links and browser Back/Forward
restore them. Switching status or grouping keeps other selected filters. Clear
filters restores the default for the current page (available for the catalogue,
both taken/archived for the Archive landing page). Unknown filter values show a
clear-filter message instead of silently displaying different results.

Static status pages, grouping links and group anchors remain useful without
JavaScript. Combined query filters need JavaScript, as explained on those pages.
The frontend scripts only hide/show existing static cards; no public server or
repository access is needed. An empty result gives a visible explanation.

The homepage uses the same available-only ordered data, with featured projects
shown first as described below. No proposal metadata was changed in Step 6.

Checks:

```sh
bundle exec ruby scripts/tests/proposal-catalogue.rb ../.local/site
node scripts/tests/catalogue-filters.cjs
```

These are domain/artifact checks, not evidence of browser or keyboard inspection.

## Homepage content and news

Edit `_data/home.yml` for the homepage title, plain introductory text, introductory
links, optional hero image and display limits. `sections.introduction`,
`sections.proposals` and `sections.news` are independent true/false switches.
The page title remains visible even when all sections are hidden. Keep
`hero_image` empty to omit it; an image requires an existing site-relative `src`
and meaningful `alt` text. Local asset paths preserve the configured base URL.

The supervising user chose existing introductory text, no image and no sample
announcements. News therefore shows an honest empty state. Featured available
proposals appear before other available proposals; priority ascending,
publication descending and immutable ID order are preserved within both groups.
Taken and archived proposals never enter the homepage's available section. The
catalogue keeps its normal order; marking a project featured does not reorder it.

To add real news, copy `templates/news.md` into `_news/<descriptive-slug>.md`.
Fill in `title`, `summary`, publication `date`, `updated_at`, and Markdown body.
Use timestamps with timezones, for example `2026-11-12T09:00:00Z`. An update cannot
precede publication. Start body sections with `##` headings. Optional `image`
requires a stable site-relative asset path and alt text, just like the hero image.
News detail pages use `/news/<descriptive-slug>/`. Keep the slug stable after
publication. Listings sort by publication descending, with URL as the tie-breaker;
editing an older announcement does not move it to the top.

News has its own output collection, listing, detail layout and homepage section.
It is separate from proposal `_posts/`, catalogue, homepage proposal highlights
and the existing proposal RSS feed. Broader search/news-feed work is planned in
later steps. Markdown uses the same sanitized renderer as proposals and does not
evaluate author Liquid. Metadata is escaped in the layouts.

`published: false` and future publication dates are excluded from normal builds.
They do not make files private in a public Git repository. Keep private drafts
outside this repository. The `_news/.gitkeep` file only retains the empty folder.
This step provides file-based maintenance; browser editing is a later step.

Verify the settings, ordering, optional images, safe rendering and separation with:

```sh
bundle exec ruby scripts/tests/home-news.rb
```

The examples used by these checks are created in a temporary directory and never
published to the real preview. Browser review remains with the supervising user
because automated localhost access is denied by the saved permission setting.

## Team profiles and supervisor links

Team profiles live in `_team/<team_id>.md`; copy `templates/team.md` and fill in
confirmed details. `team_id` is a stable lowercase/hyphen identifier matching the
filename. It determines `/team/<team_id>/` and must not be renamed after linking
or publication. `name`, boolean `active` and integer `display_order` are required.
Role, public email, Markdown biography, research-interest list, portrait and
labelled links can be omitted until confirmed. Roles are ordinary text, including
PhD student or Postdoctoral researcher; never infer them from a person's name.
Portraits require an existing site-relative image and meaningful alt text.

Active profiles appear in display_order ascending, then name and stable ID order.
At the user's request, `active: false` only removes a person from the Team listing;
the profile and links from proposals remain accessible. This does not make the
profile private. A profile without a portrait or biography has no dummy image or
empty biography section. Biography rendering uses the same sanitized Markdown
pipeline as news/proposals; author Liquid remains literal.

To link a supervisor, keep their original name and add `team_id` to that supervisor
entry in the proposal. Publication validation and the Jekyll build reject IDs
without a published profile. Supervisors without a profile retain their original
plain-text names. Linking is a substantive metadata change, so advance the
proposal's `updated_at`; do not alter its ID, publication date or existing URL.

The user explicitly supplied two temporary example profiles: Max Mustermann
(Postdoc, first) and Petra Musterfrau (PhD student, second), with their biographies
and interests. Emails are empty and portraits/links omitted as requested. Max is
an additional supervisor on the writing/drawing proposal, alongside the retained
Kevin Möri. Petra has no proposal references. This later explicit instruction
permits only these supplied examples despite the earlier no-dummy-names rule.
Replace these profiles and review Max's example supervisor assignment before
release; this is recorded in the release blockers and final user reminder.

Check the rendering, active/inactive handling, optional fields, IDs and links with:

```sh
bundle exec ruby scripts/tests/team.rb
```

The tests use temporary profiles outside the preview. Browser verification is
still limited by the saved permission denying automated localhost access.

Profiles automatically list the proposals whose supervisor entries reference their
team ID, in the catalogue order and with explicit status labels. Profiles without
linked proposals omit this section. Display-name corrections retain the stable
team ID and profile URL.

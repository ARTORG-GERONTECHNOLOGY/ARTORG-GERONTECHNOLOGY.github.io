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
- `search.html`, `search.json`, `js/search-engine.js`, `js/global-search.js`: global browser search.
- `css/`, `js/`, `favicons/`: styles, scripts, and browser icons.
- `feed.xml`, `404.html`: RSS and recovery navigation.

The workspace's `AGENTS.md`, `new-features.md`, and `template.docx` contain project
rules, the future implementation plan, and the original proposal reference.
The catalogue and archive support status/category/year/program filters. Homepage
content, news and team profiles can be maintained in source files. Staff browser
editing, QR codes, PDF generation and automated deployment remain planned.
About provides editable group information and project application guidance.

## Baseline issues preserved during setup

All ten proposals retain their scientific prose, filenames, publication dates
and existing public URLs. Metadata now includes immutable IDs, eligibility,
supervisors and institutes. Statuses for all ten and eligibility for the five
older proposals were randomized at the user's request. Two older proposals have
approved temporary workload splits. Replace those choices before release.
The handwriting proposal refers to a missing Figure 1, and an older gait proposal
has a preserved filename/front-matter date mismatch; see the migration review.

Some inherited theme settings remain. The checked-in CNAME and
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
and meaningful `alt` text. Local asset paths preserve the configured base URL. Step 10 also supports explicit
HTTPS image URLs; remote content is not inspected by the build.

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
and the existing proposal RSS feed. News and profiles are included in global search; a separate news feed is planned
in a later step. Markdown uses the same sanitized renderer as proposals and does not
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

## About and application guidance

The About page remains at `/about/`. Edit `_data/about.yml` for the group and
program introduction, institutional links, application steps and corrections
contact. Text is escaped; institutional URLs must use HTTPS. The shared
`_includes/about/content.html` renders the editable content.

Application guidance directs students to the Contact and How to apply fields on
individual proposals. It does not impose one document checklist or route student
applications to the staff address. Staff proposal submissions use the authoritative
`submission_email` and `submission_instruction` from `_data/program.yml`.

The group and BME program descriptions and institutional links were checked on
2026-11-12 against the official group, ARTORG and BME program pages linked on About.
The user confirmed `michael.single@unibe.ch` as the corrections/removal contact.
It is separate from project application contacts and the staff submission mailbox.
A missing or malformed corrections address stops the build. This content is
maintained in files; browser editing comes in a later step.

The stable About permalink and named content sections prepare the destination
for the later QR feature. A future QR must derive its target from `/about/` with
Jekyll's `absolute_url`; do not introduce a separately editable destination.
There is currently no QR image, download button or placeholder.

Verify content escaping, application/admin contact separation, institutional links,
preview base URLs and absence of a QR placeholder with:

```sh
bundle exec ruby scripts/tests/about.rb
```

Browser/mobile visual review remains with the user while automated localhost
access is denied by the saved permission setting. No production change is deployed.

## Public media and attachment support

Store public assets at stable paths under `assets/media/proposals/<proposal_id>/`,
`assets/media/team/<team_id>/` or `assets/media/news/<slug>/`. No real media or
proposal prose was added in Step 10. The missing writing/drawing Figure 1 remains
on the release checklist. Removing a reference never deletes its file.

A proposal's optional `figure` keeps its existing src/alt/caption format. Images
are responsive and lazy loaded. An attachment entry has `title`, `url`,
`mime_type`, and optional `size` in bytes for local assets. The build derives local
sizes and checks any supplied size. External attachments require an explicit
HTTPS URL, supported MIME type and declared byte size. Links show type and size;
local links carry the download attribute. A browser may open remote downloads in
its own viewer, so ordinary links are retained.

Optional `media` entries have `kind: link` or `kind: video`, `title` and an explicit
HTTPS `url`. Use a direct video-file URL for inline playback, or `kind: link` for a hosted
player page. Video additionally requires a `poster` image path and plain-text
`transcript`; optional `captions` is an HTTPS WebVTT track URL. Video uses controls,
preload none and no autoplay, with a normal link fallback. Host large videos
externally rather than committing them. Use persistent public URLs, not Actions
artifact links. External content is not fetched or inspected by the build.

`_data/media.yml` defines PNG/JPEG/WebP/PDF MIME types, 10 MiB per-file and 25 MiB
per-proposal defaults. The shared `scripts/lib/media.rb` checks local real paths,
extensions, declared MIME types, magic-byte signatures and sizes. These checks are
not a full image/PDF decoder or malware scanner. Proposal totals count unique
local figure/poster/attachment paths and declared external attachment sizes;
remote image/video bytes are not downloaded or included in that upload budget.
The same byte validator can be called by the future trusted upload service;
there is no browser upload endpoint in this step. Restart the local server after
changing the media-rule configuration. Home, news and team image
references also use the shared asset checks.

Verification:

```sh
bundle exec ruby scripts/tests/media.rb
bundle exec ruby scripts/tests/proposal-rendering-fixtures.rb
```

Temporary fixture assets exercise downloads and video markup without appearing
on the real website. Browser/mobile playback and visual checks still require
user review because automated localhost access is denied by saved permission.


## Global search

The normal Search link/icon opens `/search/`, with ordinary browsing links when
JavaScript is disabled. `search.json` serializes the complete index with `jsonify`.
The index explicitly includes published proposals, public team profiles, published
news and Home/About information. Private/administration routes and templates are
not indexed. Inactive profiles remain searchable because the user chose to retain
their public profile pages. Future/unpublished news follows normal build settings.

The proposal index includes scientific text, application instructions, categories,
tags, supervisors/institutes, contact details, eligibility and dates. News and
people stay distinct from proposals. Search results default to available proposals;
Include taken and archived proposals expands this scope without hiding other
content types. The content-type filter can restrict results to projects, people,
news or information.

The former bundled search script is retained but no longer loaded. Its unsafe
HTML substitution and incomplete options wiring are replaced by a pure matching
engine and DOM rendering through textContent. Titles rank above metadata and body
matches; Unicode accents/punctuation are normalized. All query tokens must match,
with a bounded one-edit typo fallback for words of at least four characters.
Queries are never interpreted as regular expressions. Results have type/status
labels and contextual snippets, with ten initially shown and More results adding
ten at a time. Enter submits and focuses the first result; result links use native
Enter navigation. Escape in the search controls clears the query and returns focus
to the input. More results focuses the first newly shown result.

URLs store `q`, `type` and `include_unavailable=1`. Reload/shared links and Back/
Forward restore the state. Typed changes replace the current URL; submitting or
changing filters adds a history entry. Failed HTTP/JSON loading shows an explicit
message, Retry button and browsing guidance. No results is distinct from a fetch
failure. No external search service or runtime server is required.

Run `node scripts/tests/search.cjs` for matching/ranking regressions and build the
site to inspect/parse `search.json`. The existing news fixture and migration tests
check content-type separation and retained proposal URLs. Browser keyboard/fetch
failure interaction and mobile visual review remain with the user because saved
permissions deny automated localhost browser access.

The user subsequently requested removal of proposal-administration instructions
from public proposal and About pages. The staff submission section and its search
text are omitted. Source submission metadata and the staff template are retained
for maintenance. This instruction overrides the original public template order.

## Feeds, metadata and sharing

`feed.xml` preserves the proposal RSS endpoint and its ten most recent proposals.
Every item carries an availability category and a readable status prefix.
`news-feed.xml` provides the ten most recent published announcements separately;
its initial empty channel is valid. RSS autodiscovery links in page heads expose both feeds. Footer links open the
Proposals and News pages, as requested by the user. Feeds retain initial publication dates and stable
canonical GUID URLs. Deleted/unpublished content is absent from normal builds.

Public pages have canonical URLs, page-specific descriptions, Open Graph and
Twitter preview tags. Images appear in metadata only when real figure/hero/news/
portrait metadata exists; no default example image is invented. Article publication
and substantive update dates use their respective source values. Local previews
use their configured local URL; production `_config.yml` and CNAME are unchanged.
All canonical/feed/sitemap links use Jekyll's absolute_url filter.

`sitemap.xml` lists public HTML pages and output-enabled collection documents,
with known update dates where supplied. It excludes 404, service/admin routes,
non-output collections, unpublished content and non-HTML build inputs. These
indexing choices do not restrict access or make public Git content private.

Copy link uses the Clipboard API only on a visitor's button click. It preserves
the current query and fragment (including search/catalogue filters). On denial or
unsupported browsers, the URL is selected with instructions for manual copying.
Without JavaScript the labelled readonly URL remains available. This replaces
third-party sharing; no tracking or social-network scripts are introduced.

```sh
bundle exec ruby scripts/tests/publishing.rb
```

The fixture checks XML/status data, canonical hosts and base paths, escaped preview
metadata, excluded drafts/admin routes, article dates and sharing fallback markup.
Actual browser clipboard success/denial, focus and mobile appearance still await
user review because automated browser access is denied by saved permission.

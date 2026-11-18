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
rules, the implementation/progress plan, and the original proposal reference.
The catalogue and archive support status/category/year/program filters. Homepage
content and news can be maintained in source files or the separate
staff editor. The publishing workflows are implemented with activation off.
The administration service is described below. QR codes and proposal PDF
generation are implemented.
About provides editable group information and project application guidance.

## Baseline issues preserved during setup

All ten proposals retain their filenames, original publication/creation dates
and existing public URLs. The user confirmed all statuses and
workload percentages on 2026-11-16. Those decisions were applied on 2026-11-18.
The only prose correction removes the missing Figure 1 cross-reference as
requested. Both example profiles and Max's example supervisor entry were removed;
Kevin Möri remains. Original migration
fingerprints and the approved prose exception remain in the migration record.
The older gait proposal's filename/front-matter date mismatch is preserved.

Some inherited theme settings remain. The checked-in CNAME and
production URL differ; local overrides leave both untouched. These issues are
separate from installing the local build environment.

## Shared proposal rendering

Proposal pages follow the Word section order, including workload, affiliations,
contact and application guidance. Staff submission instructions are retained in
source metadata and omitted from public pages and PDFs at the user's request. Optional figure,
references, application, start-date and workplace information appears only when
provided. Previous/next links carry status labels; recommended projects are available.

The trusted Jekyll plugin uses `scripts/lib/proposal-renderer.rb` to render and
sanitize Markdown before Liquid templates or excerpts see it. Author Liquid stays
literal; metadata is escaped in shared includes. This renderer is shared by
the editor preview and print work. The pinned repository Gemfile is required.
Custom plugins require an ordinary Jekyll build; GitHub Pages safe-mode builds do
not run them. The prepared publishing workflow builds the complete artifact;
no production deployment has been activated or verified.

Run from the repository root with its Ruby environment active:

```sh
bundle exec ruby scripts/tests/proposal-format.rb
bundle exec jekyll build --config _config.yml,../.local/jekyll.yml --disable-disk-cache
bundle exec ruby scripts/tests/proposal-migration.rb ../.local/site
bundle exec ruby scripts/tests/proposal-rendering.rb ../.local/site
bundle exec ruby scripts/tests/proposal-rendering-fixtures.rb
```

The confirmed final content and preserved source-history details are recorded in
[migration issues](migration-issues.md).


## Navigation and responsive layout

The main navigation has Home, Proposals, News, About and Search. Archive remains accessible through its existing URL.
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

The final local browser review checked catalogue widths of 320, 375, 768, 1024
and 1440 CSS pixels, long proposal titles, mobile About/QR, search,
keyboard entry, the skip link, Menu/Escape focus and page overflow.
See the [release handover](release-handover.md) for the exact evidence and
remaining manual checks; these checks are not a complete accessibility audit.

## Proposal catalogue and archive

The catalogue now has static Available, Taken and Archived routes, text status
badges, shared cards with separate created/published/updated dates,
and list/year/category views. These pages are built from the same priority,
publication-date and immutable-ID ordering as the available homepage list.
Grouping keeps that order within each year or category. Status/group links work
without JavaScript. Original proposal detail URLs remain unchanged.

The catalogue initially shows available proposals; Archive initially shows both
Taken and Archived, with separate choices for each. All Statuses includes
available, taken and archived proposals in both browsing areas.

Filters combine status, category and publication year. Counts
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
and the proposal RSS feed. News is included in global search;
news has its own `news-feed.xml`. Markdown uses the same sanitized renderer as proposals and does not
evaluate author Liquid. Metadata is escaped in the layouts.

`published: false` and future publication dates are excluded from normal builds.
They do not make files private in a public Git repository. Keep private drafts
outside this repository. The `_news/.gitkeep` file only retains the empty folder.
Both source maintenance and the News browser editor are implemented.

Verify the settings, ordering, optional images, safe rendering and separation with:

```sh
bundle exec ruby scripts/tests/home-news.rb
```

The examples used by these checks are created in a temporary directory and never
published to the real preview. Browser review remains with the supervising user
because automated localhost access is denied by the saved permission setting.

## About and application guidance

The About page remains at `/about/`. Edit `_data/about.yml` for the group and
program introduction, application steps and corrections contact. Put
institutional links directly in the overview, group or program paragraph with
`[link text](https://example.org)`. The public page and editor preview use the
same renderer. Institutional links require HTTPS and raw HTML is shown as text.

Application guidance directs students to the Contact and How to apply fields on
individual proposals. It does not impose one document checklist or route student
applications to the staff address. Staff proposal submissions use the authoritative
`submission_email` and `submission_instruction` from `_data/program.yml`.

The group and BME program descriptions and institutional links were checked on
2026-11-12 against the official group, ARTORG and BME program pages linked on About.
The user confirmed `michael.single@unibe.ch` as the corrections/removal contact.
It is separate from project application contacts and the staff submission mailbox.
A missing or malformed corrections address stops the build. This content is
maintained in files or the About browser editor.

About displays the downloadable website QR image implemented in Step 13. Its
destination is the configured public website root, not the About page or localhost.

Verify content escaping, application/admin contact separation, institutional links,
preview base URLs and absence of a QR placeholder with:

```sh
bundle exec ruby scripts/tests/about.rb
```

Browser/mobile visual review remains with the user while automated localhost
access is denied by the saved permission setting. No production change is deployed.

## Public media and attachment support

Store public assets at stable paths under `assets/media/proposals/<proposal_id>/` or
`assets/media/news/<slug>/`. No real media or
proposal prose was added in Step 10. The missing writing/drawing Figure 1
reference was removed during the release review. Removing a reference never
deletes its file.

A proposal's optional `figure` keeps its existing src/alt/caption format. Images
are responsive and lazy loaded. In the editor, **Upload proposal figure** resizes
new figures to at most 2,400 pixels on the longest side. The processed file is
used for preview, public HTML and the generated PDF. Website placement can be
chosen in the editor. PDFs keep the template position after Institutes. An
attachment entry has `title`, `url`,
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
The Step 19 trusted upload service reuses this validator and adds image decoding,
dimension limits and PDF inspection. Restart the local server after
changing the media-rule configuration. Home and news image
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
The index explicitly includes published proposals, published
news and Home/About information. Private/administration routes and templates are
not indexed. Future/unpublished news follows normal build settings.

The proposal index includes scientific text, application instructions, categories,
tags, supervisors/institutes, contact details and dates. News stays distinct from proposals. Search results default to available proposals;
Include taken and archived proposals expands this scope without hiding other
content types. The content-type filter can restrict results to projects,
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

## Feeds and metadata

`feed.xml` preserves the proposal RSS endpoint and its ten most recent proposals.
Every item carries an availability category and a readable status prefix.
`news-feed.xml` provides the ten most recent published announcements separately;
its initial empty channel is valid. RSS autodiscovery links in page heads expose
both feeds. The public footer shows the group name. Feeds retain initial publication dates and stable
canonical GUID URLs. Deleted/unpublished content is absent from normal builds.

Public pages have canonical URLs, page-specific descriptions, Open Graph and
Twitter preview tags. Images appear in metadata only when real figure, hero or news image metadata exists; no default example image is invented. Article publication
and substantive update dates use their respective source values. Local previews
use their configured local URL; production `_config.yml` and CNAME are unchanged.
All canonical/feed/sitemap links use Jekyll's absolute_url filter.

`sitemap.xml` lists public HTML pages and output-enabled collection documents,
with known update dates where supplied. It excludes 404, service/admin routes,
non-output collections, unpublished content and non-HTML build inputs. These
indexing choices do not restrict access or make public Git content private.

To share a page, copy its address from the browser address bar.

```sh
bundle exec ruby scripts/tests/publishing.rb
```

The fixture checks XML/status data, canonical hosts and base paths, escaped preview
metadata, excluded drafts/admin routes and article dates.


## Downloadable website QR

The About page displays `assets/images/site-qr.png` and a PNG download link with
visible destination text. A Jekyll post-write hook generates the image directly
in the public output, after cleanup; no generated PNG is committed to source.
The normal `bundle exec jekyll build`/`serve` sequence includes generation.

The destination comes from the website repository's `_config.yml` URL/baseurl,
so local preview overrides cannot accidentally create a localhost QR that phones
cannot open. Keep the existing production configuration unchanged unless the
public address actually changes. No independent editable QR destination exists.
The PNG uses high error correction, black modules on white, integer-pixel scaling
and a four-module quiet zone. Rebuilding regenerates it when the URL changes.
The generator and PNG dependencies are pinned in Gemfile/Gemfile.lock.

For explicit generation or later CI reuse, run from the website root:

```sh
bundle exec ruby scripts/generate-site-qr.rb --output ../.local/site/assets/images/site-qr.png
bundle exec ruby scripts/tests/site-qr.rb
```

The script optionally accepts `--config PATH`. Verification-only Python packages
are not required to build the website. Automatic decoding was verified on Windows
with Pillow 13.0.0 and zxing-cpp 2.3.0, installed outside the repository. With these
packages on Python's path:

```sh
python scripts/tests/decode-site-qr.py ../.local/site/assets/images/site-qr.png https://artorg-gerontechnology.github.io/
```

The generated PNG was decoded to the exact public URL and visually inspected;
Ruby checks cover repeatability, URL changes, subpaths, square geometry, contrast
and the white quiet zone. The supervising user confirmed a successful phone scan on 2026-11-12.
Local browser access was enabled and verified during Step 14.

## Downloadable proposal PDFs

Every published proposal has a stable, revision-labelled PDF download after the
PDF stage runs. This includes available, taken and archived proposals. PDFs use
the same sanitized content as the webpage and the Word template's figure
position after Institutes, with A4 pages,
12pt titles, 10pt body text, 9pt captions, institutional logos,
program branding and page numbers. The administration/submission instruction is
omitted from both formats at the user's request. Liberation Sans is the bundled,
SIL OFL-licensed Arial-compatible font; its accented glyphs and pagination have
been checked in generated PDFs.

Install Node.js and pnpm 11.25.0, then run from the website root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
bundle exec jekyll build
node scripts/generate-proposal-pdfs.mjs _site
```

Playwright 1.62.1 pins Chromium 151.0.7922.34 (revision 1234); MathJax 2.7.1 is
also locked. On Linux the browser can require OS libraries; use Playwright's
reported dependency instructions. The PDF generator was verified on Windows;
macOS and Linux PDF generation have not yet been tested.

For the prepared Windows environment, use the documented local override build
and replace `_site` with `../.local/site`. Run the PDF stage last: rebuilding
Jekyll can remove generated PDFs and download links. To preview completed PDFs,
serve that finished output without rebuilding it:

```sh
bundle exec jekyll serve --skip-initial-build --no-watch
```

Append `--config _config.yml,../.local/jekyll.yml` for the prepared Windows
preview. After editing content, stop the preview, rebuild Jekyll, regenerate
PDFs, and start the preview again. PDFs and their links are build output and
must not be committed. The validation command below automates this build sequence;
publication and deployment remain separate operations.

The generator serves files privately on loopback, blocks outbound requests,
loads the pinned local MathJax runtime with its Safe extension, and waits for
fonts, images and maths before printing. Syntax highlighting is already produced
by Jekyll/Rouge. PDF links point to the public website rather than the temporary
rendering server. Missing assets stop generation; external figures must first
be stored at a stable local media path. No scientific content or missing figure
is invented. The user resolved the missing Figure 1 by requesting removal of
only its cross-reference; no replacement image was added.

Download links appear only after all PDFs have been generated and their manifest
revision is unchanged. Each link displays the proposal's substantive update
revision. Public pages also have a secondary stylesheet for browser printing.

Verification commands (Python requires `pypdf` for PDF text checks):

```sh
bundle exec ruby scripts/tests/print-layout.rb _site
python scripts/tests/pdf-content.py _site
node scripts/tests/pdf-rendering.mjs _site ../.local/pdf-fixture
```

The last command creates only an isolated verification fixture, not a real
proposal. It exercises long content, a local image and mathematical notation,
and confirms that missing figures fail generation. Visually inspect the PDFs
with a PDF reader as well; text extraction alone cannot verify pagination.

## Validate changes before publication

Step 15 is prepared for local use. At the user's request, activating the checks
on GitHub and changing branch protection are deferred. No workflow has been run
on GitHub and no repository protection settings have been changed.

From the website root, after installing the Ruby and PDF dependencies above:

```sh
python -m pip install -r scripts/requirements-validation.txt
bundle exec ruby scripts/validate-site.rb --output ../.local/ci-site
```

This builds a separate candidate website and stops with an error if any check
fails. It leaves the local preview untouched. Without `--output`, the command
uses `_site`. `--config FILES` accepts Jekyll's comma-separated configuration
files. `NODE` and `PYTHON` can point to specific executable paths when they are
not on PATH. Run through Bundler so child checks use the same Ruby environment.

The command validates proposal fields and sections, workload totals, timestamps,
safe content rendering, filters/search, news/About behavior, Jekyll output,
local links and assets, generated JSON/XML, feeds and sitemap, QR decoding, and
all proposal PDFs and revision-labelled download links. It also exercises an
isolated long/figure/math PDF and confirms missing figures fail generation.
Temporary copies prove that invalid status metadata, broken assets, malformed
search JSON, accidentally copied Word sources and incomplete PDFs are rejected.
The original proposals and working preview are not modified by those fixtures.

The final output inspection rejects service/source/private folders, source Word
files, common temporary files, symlinks, private-key headers and known GitHub
token patterns. This is a targeted safeguard, not a complete secret scanner or
an assessment of whether scientific or personal information belongs in public.
The five historical `/post_archive/.../` proposal pages remain valid public
URLs; their original source folder is still excluded. CSS source maps are
intentional browser assets. The inherited stray source file named `¨` is now
excluded from the public output without deleting the original.

The GitHub workflow is `.github/workflows/validate.yml`. Once separately
authorized and pushed, it is configured to run for pull requests, branch pushes,
merge-queue candidates and manual requests. It calls this same validation
command, with no separate publishing implementation. The check name to require
later is **Website validation**; keep that job name stable. Activation requires
a successful GitHub run followed by an authorized branch rule requiring that
check before merging. Merely committing this file locally does not enable it.

The workflow uses Windows 2025, matching the locally verified Windows setup:
Ruby 3.3.13, Bundler 2.5.22, Node 24.22.1, Python 3.12.14 and pnpm 11.25.0.
Ruby and Node packages use their existing lockfiles; verification-only Python
packages have exact versions in `scripts/requirements-validation.txt`. Actions
are pinned to full commit SHAs. The token has only repository read access,
checkout does not retain Git credentials, and no production secrets, deployment
environment, write permissions or deployment/upload action is provided.
Workflow checks guard these constraints and the shared command. A hosted GitHub
run remains unverified until activation; macOS/Linux validation is unverified.

The final user review resolved the originally temporary content choices.
Before a real release, verify the current editorial record with:

```sh
bundle exec ruby scripts/validate-proposals.rb --release
```

That check now passes for the confirmed content and still fails if new editorial
blockers are recorded. Hosting and live acceptance remain separate requirements
in the [release handover](release-handover.md). Neither command deploys the site.

## Private administration access

[Administration service guide](../admin-service/README.md) describes Step 16:
shared private-link entry, two-hour protected sessions, logout, rotation and
revocation. Replacing or revoking the link signs everyone out on their next
request. The service and all secret files are separate from the public site;
service source is excluded from Jekyll output. Content read/create/update
operations use the Step 17 protected API. The Step 18 proposal editor provides
structured fields, Write/Preview views and downloaded Markdown drafts.
Step 19 adds an existing-file picker, private session uploads and temporary-file
downloads. The [service guide](../admin-service/README.md#media-picker-and-uploads-step-19)
explains supported files, inspection limits, expiry and atomic saves.
Step 20 adds status shortcuts, drag/keyboard ordering and confirmed deletion with
archiving offered first. Removed proposals retain a generic recovery page at the
old URL; shared files remain. See the [lifecycle controls](../admin-service/README.md#status-order-and-deletion-step-20).
Step 21 adds [revision history and restoration](../admin-service/README.md#revisions-and-restoration-step-21),
including comparisons, validated previews and recovery of deleted proposals.
Restoration returns content/status while preserving current order; deleted
proposals reuse their former priority. Confirmation creates a new revision.
Step 22 adds [Home, News and About editors](../admin-service/README.md#home-news-and-about-editors-step-22),
including images, private draft downloads, shared previews and revision restoration.
About's QR destination follows canonical configuration.
Step 23 prepares [validated publication through GitHub Pages](publication.md),
with a trusted content-only merge, protected checks, inspected public artifacts
and recovery through new revisions. Activation remains off and requires separate
authorization; hosted success/failure/rollback checks are still pending.
Step 24 adds [saved-version publication reports](../admin-service/README.md#save-build-and-live-publication-reports-step-24)
to administration rows and save results. Reports distinguish pending, building,
live, superseded, failed and unavailable without discarding form edits. Live
requires matching public revision and deployment evidence; local review claims
no deployment. The App's added workflow/deployment access is read-only.
Local access is prepared; live HTTPS hosting and production
credentials remain separate, unperformed operations.

The [service guide](../admin-service/README.md#github-saves-step-17) describes the
locally verified GitHub connection, fixed content branch, allowed file types,
shared validation, atomic saves and conflict responses. Successful saves are
reported as committed with checks pending, never live. The user selected eventual
automatic publication after checks pass; the publishing path is prepared with
activation off.
Actual App installation, remote branch protection and workflow triggering remain
deferred at the user's request. No GitHub credentials or remote writes were
provisioned as part of this local preparation.

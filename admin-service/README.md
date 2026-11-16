# Administration access service

Steps 16–21 provide private-link entry, protected sessions, a GitHub content
save API, proposal editing/uploads, lifecycle controls and revision restoration. GitHub integration is
disabled until explicitly configured; the local access demo needs no GitHub
credentials. The public website remains static and separate.

Use Node **24.22.1**, the repository's locked Ruby gems and its pinned Playwright,
Chromium and MathJax dependencies (see the local setup guide). Run checks from
the website repository root:

```sh
node --test admin-service/test/access.test.mjs
node --test admin-service/test/content.test.mjs
node --test admin-service/test/editor.test.mjs
node --test admin-service/test/media.test.mjs
node --test admin-service/test/lifecycle.test.mjs
```

## Private access configuration

Keep the access state file and private link file **outside the public repository
and every served/build directory**. Known local preview directories are rejected
as well. Restrict these files to the service account and the operator. The tool
requests private Unix modes; Windows operators must also use appropriate NTFS
permissions. Never upload them, paste them into a public issue or commit them.

The operator can generate or replace a link without printing the token:

```sh
node admin-service/manage-access.mjs rotate --state-file PRIVATE_STATE_PATH --link-file PRIVATE_LINK_PATH --origin https://YOUR_ADMIN_HOST
```

The link file contains the bearer URL for out-of-band distribution. The service
reads only the state file, which stores a SHA-256 verifier, a random generation
identifier and a revocation flag. The verifier is also confidential. Replacing
the state is atomic. Do not use the link file as the state file.

To revoke all shared access:

```sh
node admin-service/manage-access.mjs revoke --state-file PRIVATE_STATE_PATH
```

Rotation or revocation invalidates **all sessions on their next request**, as
the user requested. Missing/malformed state fails closed and invalidates current
sessions. Individual logout invalidates the current session only. Sessions are
held in server memory; restarting the process also requires fresh entry.

## Service settings and hosting

Set these in the service's private environment, then run
`node admin-service/start.mjs`:

| Variable | Meaning |
| --- | --- |
| `ADMIN_ORIGIN` | Exact HTTPS origin shared by this UI and its API; no path/query |
| `ADMIN_ACCESS_FILE` | Absolute private state-file path outside all served roots |
| `ADMIN_SESSION_SECONDS` | Absolute lifetime; default 7200 (two hours), configurable from 60 to 86400 |
| `ADMIN_PORT` | Loopback backend port; default 4100 |
| `ADMIN_TRUST_LOOPBACK_PROXY` | Set to `1` for the same-host HTTPS reverse proxy |

The service binds only to `127.0.0.1`. A dedicated **Caddy 2.11.9** instance uses
the supplied `Caddyfile` for HTTPS termination. Set `ADMIN_HOST` to the actual
administration hostname. Forwarded HTTPS/client-IP headers are trusted only
from loopback when explicitly enabled; public clients cannot reach the backend
port. Do not expose that port or place an untrusted proxy on this loopback trust
boundary. Deploy one service process; multi-instance sessions/rate limits would
require a shared trusted store before scaling.

`deploy/ger-admin.service` is a Linux systemd hosting template using a dedicated
unprivileged account. Adjust its paths/hostname and provide a private secret-store
file before activation. Live hosting, DNS, certificate issuance and production
secret provisioning have not been performed. The systemd template is unverified
on a live Linux host. Caddy's configuration was validated locally with its
official SHA-512-verified Windows 2.11.9 release, without starting a proxy.

The dedicated proxy configuration discards both runtime/error and access logs,
and skips request access logging. This intentionally trades proxy diagnostics
for avoiding accidental URL/credential logging. Do not reuse it to suppress
unrelated services' logs. Application events contain only a fixed route category
and status. Do not add request dumps, headers, raw errors or query strings.
Audit any upstream load balancer, CDN, tracing and hosting logs separately before
real use. The requested GET link can remain in browser history, copied messages,
browser synchronization or upstream logs. A clean redirect cannot erase those.

## Local review

The prepared local-only demo uses `http://localhost:4100`, a private state file
at `../.local/admin-private/access.json` and a private entry link at
`../.local/admin-private/link.txt`. These paths are outside the website repository.
Open the address from that link file in your browser. Successful entry redirects
to `/admin/` without the token. The proposal list supports editing, preview and
Markdown draft download. With GitHub disabled, Save proposal is disabled;
the service does not write to the local checkout as a substitute.

For this loopback-only development mode, set `ADMIN_ALLOW_LOCAL_HTTP=1` and
`NODE_ENV=development`. This mode refuses production/non-loopback origins and
**does not remove Secure, HttpOnly or SameSite=Strict from cookies**. Browsers
that do not accept Secure cookies on localhost require trusted local HTTPS;
do not disable cookie protection or bypass certificate warnings to compensate.
Production always uses the separate HTTPS administration origin.

On 2026-11-16 the user confirmed that this local private link opens the active
administration session and its Sign out button in their browser.

## Security boundary and verification

The server checks a random 256-bit entry token using fixed-length constant-time
digest comparison. Session identifiers and CSRF values are independent random
256-bit values. Cookies use the `__Host-` prefix, Path=/, Secure, HttpOnly,
SameSite=Strict and the absolute session lifetime. CSRF tokens and an exact
Origin match protect POST logout; unsupported writes never change content.
Sessions do not identify a particular staff member. Anyone holding the shared
link has bearer access, until it is replaced or revoked.

Rate limits are 20 entry attempts per client per ten minutes, 60 mutation
attempts per client per minute and 2000 total requests per minute. There are
bounded rate buckets and at most 1000 concurrent sessions. Limits are per
process and reset on restart. The request body limit is 8 KiB. Missing/incorrect
origins, tokens, CSRF values or duplicate cookies do not grant access. Responses
use no-store, no-referrer, no third-party assets, script-free CSP, framing denial
and no indexing; production responses also set HSTS.

Integration checks cover successful/invalid/duplicate entry, clean redirects,
cookie flags, fresh session IDs, absolute expiry, logout, missing/incorrect
Origin and CSRF, oversized bodies, revocation/rotation, malformed state,
transport/Host checks, rate limits and secret-free application events. Operator
checks verify that only the digest is stored and that no token/verifier is
printed. The shared site validation runs these checks and rejects service files
in the generated static output. Production proxy, upstream-log and live hosting
behavior remain deployment checks, rather than locally proven guarantees.

References: [Node crypto](https://nodejs.org/api/crypto.html),
[cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
[Caddy logging controls](https://caddyserver.com/docs/caddyfile/directives/log_skip).

## GitHub saves (Step 17)

This integration has been prepared and verified **locally with a GitHub API
simulator**, at the user's request. No App was registered/installed, no real
private key or installation token was provisioned, no content branch was created
on GitHub and no remote save/workflow/branch rule was activated. The simulator
exercises the actual client, RSA JWT signing, repository-scoped token requests,
GitHub request shapes, atomic commit preconditions and real shared validators;
it cannot prove that the eventual installation/branch rules trigger live checks.

`content-policy.json` is the trusted allowlist and publication policy. It fixes
the target repository, the `content/staff` working branch, `main` production
branch and the **Website validation** required check. The user selected
**automatic publication after checks pass**. That is eligibility for the later
publication step, not a deployment action supplied by this service. The service
has no merge, force-push, branch-creation or deployment endpoint and never writes
to the production branch. Do not grant the App a production-branch bypass.

Before real activation, a separately authorized operator must:

1. Register a repository-scoped App using `github-app-manifest.json` as the
   permission template, adjusting the App name/homepage if necessary. Install it
   **only** on the ARTORG GER website repository. Request Contents: read/write,
   Checks: read and GitHub's mandatory Metadata: read. No Actions write,
   Workflows write, Administration, user OAuth or webhook permissions are needed.
2. Store the App's RSA private key outside the repository and all web/build
   roots, readable only by the service account. Set the private service variables
   below. Do not paste the key/token/verifier into source files or logs.
3. Initialize `content/staff` from an approved revision containing the Step 15
   workflow. Do not put required-success checks on the working branch's initial
   content push: its new commit must exist before checks can run. Prevent force
   pushes/deletion. Protect `main` with the required **Website validation** check
   from GitHub Actions, with no App bypass. The later trusted publishing path
   must enforce successful checks on the exact revision before automatic
   publication, matching the user's choice.
4. Verify an App-originated save triggers that check, a failed check prevents
   production advancement and a successful save is still reported as pending
   until the later deployment reports the same revision live. These remote
   acceptance checks are explicitly deferred and must not be inferred from the
   local simulator passing.

| Private setting | Meaning |
| --- | --- |
| `ADMIN_GITHUB_ENABLED` | Set to `1` only for an authorized real connection; otherwise saves return a clear unavailable response |
| `ADMIN_GITHUB_APP_ID` | Numeric App ID |
| `ADMIN_GITHUB_INSTALLATION_ID` | Numeric installation ID |
| `ADMIN_GITHUB_REPOSITORY_ID` | Numeric ID of this repository, checked against its fixed owner/name |
| `ADMIN_GITHUB_PRIVATE_KEY_FILE` | Private RSA key file outside the repository and web/build roots |
| `ADMIN_RUBY_EXECUTABLE` | Optional path to the trusted Ruby executable; otherwise `ruby` on PATH |

The content validator requires Ruby/Bundler and the repository's locked Gemfile
in addition to Node. It invokes a fixed trusted Ruby script without a shell,
loads Bundler explicitly and reuses the same proposal, media, team, news and
Home/About validators as public content. It materializes bounded candidate
content/media in a temporary directory without copying or executing author
layouts, plugins, Liquid, scripts or configuration. Windows is locally verified;
an actual Linux host also needs the matching Ruby environment/lock platforms
verified before activation. The systemd template remains a hosting template.

The App client signs a short-lived JWT server-side and requests an installation
token narrowed to the single configured repository and Contents/Checks
permissions. Installation tokens expire within one hour, are refreshed before
expiry and never leave server memory. Requests use a fixed GitHub API origin,
refuse redirects and do not log upstream response bodies or credentials.

### Protected content API

All routes require the Step 16 session. POST also requires an exact Origin and
`X-CSRF-Token` from `GET /admin/api/session`. Cookie protection and rate limits
remain in force. JSON save bodies are bounded to 1 MiB; each text file is limited
to 128 KiB and each save to sixteen distinct files. Only the separate media
endpoint accepts binary uploads; the confirmed lifecycle action handles proposal
deletion. These APIs do not
provide unrestricted filesystem operations.

| Route | Behavior |
| --- | --- |
| `GET /admin/api/content` | Lists editable paths and blob SHAs at a returned branch commit |
| `GET /admin/api/content/file?path=...` | Returns the exact Markdown/YAML source, file SHA and branch commit |
| `POST /admin/api/content/save` | Accepts `baseCommit` plus `changes`, each with `path`, last-read `sha` (null for a new file) and UTF-8 `content` |
| `GET /admin/api/content/checks?commit=...` | Reports the matching GitHub Actions check's pending/passed/failed state, always with `live: false` in this step |

Only dated proposal Markdown, stable team/news Markdown and Home/About/category
YAML plus the validated removed-URL registry are editable. Schemas, program defaults, workflows, site configuration,
service code, arbitrary paths and media bytes are not writable through this API.
Existing approved assets can be referenced and are validated from the same Git
snapshot. Text and supporting changes are validated together before any write.
New proposals require an immutable ID, explicit stable permalink and a filename
matching initial publication. Existing IDs, filenames, creation/publication
dates and URLs stay unchanged; substantive changes must advance `updated_at`.
Private/unpublished drafts must stay outside this public repository.

GitHub's `createCommitOnBranch` operation creates the underlying tree/commit and
advances only the fixed working branch with an atomic `expectedHeadOid`
precondition. This is stronger than separately checking a REST ref and updating
it later: a concurrent update is rejected at the write itself. Multiple files
become visible together. The browser supplies both branch and per-file revisions;
stale writes return **409 Conflict** and reload/compare guidance. They are never
blindly retried. If the connection fails after a save may have reached GitHub,
the response says the outcome is unknown and asks the caller to reload/compare;
it does not claim a failure means nothing was committed.

Commit authorship is the shared App/bot, not a verified staff identity. The
server supplies a fixed commit message so callers cannot insert workflow-skip
directives. A confirmed save returns the commit SHA and
`committed_validation_pending`, never “Live”. Only the exact named check from
the GitHub Actions App is reported as passing; a missing, skipped, failed or
ambiguous check cannot be reported as a successful publication.

Local checks cover valid multi-file updates and proposal/category creation,
malformed content/paths, immutable metadata, invalid preconditions, absent CSRF
and foreign Origin, credential isolation, atomic failure, two-session conflicts,
revocation during validation and ambiguous network outcomes without retry. They
also preserve source BOM/CRLF bytes and scientific Unicode split across network
chunks, and reject excess App permissions and untrusted/skipped check results.

API references: [atomic commit operation](https://docs.github.com/en/graphql/reference/commits#createcommitonbranch),
[App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation),
[App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
[App tokens and workflow triggers](https://docs.github.com/en/actions/concepts/security/github_token).

## Proposal editor (Step 18)

After private-link entry, select a proposal or choose **New proposal**. The form
uses the same categories and proposal rules as the public website. Workload
percentages must total 100%; required publication fields are checked beside the
fields and in an error list. Creation, initial publication and last substantive
edit dates are separate. New proposals receive a stable ID and URL; initial
publication is assigned on the first successful publication save. An existing
proposal keeps its ID, URL, filename and creation/publication dates.

**Write** edits structured fields and Markdown sections. **Preview** uses the
shared Kramdown renderer and proposal body includes in a temporary trusted
Jekyll workspace. Author Liquid is displayed literally, never evaluated. The
workspace contains trusted layouts/assets, no author plugins or configuration.
HTML is sanitized before controlled server-side MathJax rendering; resulting
SVG maths and styles are displayed in a script-disabled sandboxed iframe. The
wide-screen split option shows both views; refresh Preview after editing.

**Check proposal** reports missing/invalid fields without saving. **Download
Markdown draft** saves unfinished work to the operator's computer, marked
`published: false`. Reopen it with **Open downloaded Markdown**. Its revision
annotation retains the original branch/file revisions so an old downloaded
working copy cannot silently overwrite later edits. It contains no access
credentials. These draft files must not be committed to the public repository.
There is no server draft store, browser persistent storage or automatic draft
recovery. The current tab holds the working copy and warns before leaving.
After expiry, sign in using the private link in another tab and retry in the
original tab to preserve your work.

**Save proposal** submits the complete publication candidate to the Step 17
atomic save gate. Confirmed saves update the displayed file/branch revisions;
stale saves are rejected and ambiguous failures are never automatically retried.
Failed requests retain all form fields and offer download/reload guidance.
Saving is disabled in local review; isolated fake-provider checks exercise
creation, edits, conflicts and draft rejection without remote writes. The
local checkout is not used as a write destination.

Existing figure/download paths can be edited; existing embedded media metadata
is retained. Step 19 adds file upload and media selection below. Public pages remain
static; preview and editing require the separate trusted administration service.
No live GitHub connection, public hosting or publication has been activated.

## Media picker and uploads (Step 19)

Open **Optional figure, downloads and media** in a proposal. Choose a file from
the existing/temporary list, then **Use as figure** or **Add as attachment**.
Images need meaningful alternative text; captions and attachment titles can be
edited below the picker. PNG/JPEG/WebP images and PDF attachments are supported.
Removing a reference never deletes its shared repository file.

Upload inspection also requires Python **3.12.14** with the exact versions in
`admin-service/requirements-media.txt`. Install those dependencies in a private
virtual environment outside the repository and served folders. Set
`ADMIN_PYTHON_EXECUTABLE` to its Python executable (or provide that environment's
Python on PATH). Ruby uses the repository's Bundler environment. The prepared
Windows preview reuses the isolated dependencies at `../.local/validation-python`;
they are not copied into the public website. Missing inspection dependencies
reject uploads rather than accepting unchecked bytes.

The shared `_data/media.yml` supplies allowed MIME types and limits: 10 MiB per
file and 25 MiB per proposal, with image sides up to 12,000 pixels and at most
40 million decoded pixels across all animation frames. The server checks the
filename, extension, declared type, signature, decoding and dimensions. PDF
inspection rejects encrypted/malformed documents, scripts, automatic actions,
forms, embedded files and unsafe actions/links. This is targeted file validation,
not antivirus scanning. Existing published assets retain their original bytes;
the deeper decoding rules apply to new uploads.

Uploads stay in bounded server memory, owned by the authenticated session.
Sign-out, link rotation, expiry and service restart remove access. A cleanup
pass runs on requests and every 30 seconds. There is a 128 MiB/200-file service
budget and at most two simultaneous incoming uploads. No upload is written to
the local checkout or public build. Stable destinations use the proposal ID,
normalized descriptive name and a content hash; existing files are never
overwritten. Re-uploading the same original filename/bytes recovers the same URL.

Use **Download temporary file** after selecting an upload to keep its original
bytes and filename. A Markdown download contains references, not file bytes.
Keep both downloads before signing out; reopen the Markdown and upload the
original files again when resuming. Missing/expired figure and attachment
references are reported beside their fields before preview/publication.

When GitHub is enabled, Save submits selected upload IDs with the proposal.
Only uploads belonging to that session and proposal, referenced as its figure
or attachments, are eligible. Trusted server code adds those bytes to the same
atomic commit after shared whole-candidate validation. Failed/conflicting saves
retain uploads and the working copy; confirmed commits release selected
temporary buffers and use permanent repository files. Unselected uploads stay
private until expiry. The sixteen-file save limit includes the proposal and
new assets; the existing 40 MiB repository snapshot limit still applies.

Protected routes are `GET /admin/api/media/list`, `GET /admin/api/media/file`
(an own-session `id`, or allowed existing asset `path`) and
`POST /admin/api/media/upload?proposalId=...&filename=...`. Uploads use raw bytes,
their declared MIME type and the same Origin/CSRF requirements as other
mutations. Downloads require an active session and use attachment disposition,
no-store and nosniff. Editor previews embed approved temporary image bytes into
the script-disabled preview, without making public temporary URLs.

The local review supports upload, selection, download and preview. Real GitHub
saves remain disabled; atomic binary saves are exercised against isolated fake
providers/API responses. No real proposal files, public media or production
settings were changed for demonstration.

## Status, order and deletion (Step 20)

The proposal list uses the shared priority/publication/ID order. Staff may switch
directly between any two of Available, Taken and Archived, as requested. List
shortcuts and the proposal form follow `_data/proposal_schema.yml` transitions.
Status saves advance the substantive update date and keep the proposal ID,
initial publication/creation dates, scientific text and permanent URL.

Use **Move up**, **Move down** or the drag handle to propose a new order, then
**Save order**. Keyboard buttons are equivalent to dragging. Priorities become
10, 20, 30… in one atomic commit; only changed priorities are written, and
scientific update dates stay unchanged. This shared order applies within each
public view's existing filters/groups; the homepage retains featured-first
grouping. **Reset order** discards only the proposed order.
Reordering supports up to fifty changed proposal files per trusted operation;
ordinary saves retain their sixteen-file limit and all snapshot/byte limits.

**Delete…** opens a confirmation that offers **Archive instead**, **Cancel**,
and **Delete proposal**. Escape/Cancel sends no mutation. Archiving keeps the
detail page and downloads. Confirmed deletion removes the proposal Markdown
and adds a minimal `_data/removed_proposals.yml` record in the same conditional
Git commit. Only that proposal can be deleted; this route cannot delete media,
configuration or arbitrary files. Public Git history still retains the content.

Deleted proposals disappear from generated home/catalogue/team links, search,
feeds, sitemap, print pages and PDF inventory. The old address shows a generic
**Proposal removed** page, with no title, scientific text or download links,
and links to available projects/contact information. It carries noindex; static
GitHub Pages serves this as an ordinary HTML response, not an HTTP 410. Reserved
removed IDs/URLs cannot be reused or silently cleared; restoring the same proposal
later must remove its record atomically. Shared source media is retained. The
PDF generator removes obsolete generated PDFs, including an empty catalogue.

The protected endpoint is `POST /admin/api/editor/lifecycle`. Every action
requires the branch revision; status/delete also require the current file SHA.
Delete requires confirmation of the immutable proposal ID. Order submits every
current proposal path exactly once. Paths/sources are resolved and validated on
the server; callers cannot supply arbitrary deletion targets or rewritten files.
The same session, Origin, CSRF, whole-candidate validation and atomic GitHub
preconditions apply. Conflicts preserve proposed ordering/forms; **Reload list**
obtains new list data without discarding a working proposal. **Close editor**
offers a discard warning. Successful commits are shown separately from failed
refreshes, with checks/build pending rather than claiming live publication.

Local review allows staging/resetting order, previewing status edits and opening
or cancelling the deletion dialog. Actual save/delete buttons remain disabled
without GitHub configuration. No real proposal has been changed or deleted by
the local lifecycle checks; they use isolated providers and generated output.

## Revisions and restoration (Step 21)

Open a saved proposal and select **Revisions**. Commit timestamps use
Europe/Zurich, including daylight-saving changes; the table/editor's last-edited
date still means a substantive content/status change, not a reorder. Recorded
Git authors and App/bot accounts are shown with an explicit warning that they
do not identify the individual staff member using the shared link. No optional
staff name is treated as verified identity.

Select a revision for its change summary, metadata before/after values and
line-by-line text differences. Added/removed text is labeled with +/− and color.
Historical scripts, HTML and Liquid are displayed as text, never executed.
Order-only commits and status changes have distinct summaries. Changes are
compared against the commit's first parent; an older/invalid format remains
readable as raw text with a warning. History is paged twenty revisions at a
time, up to 1,000 file revisions; a maintainer can inspect older Git history.

**Preview restoration** validates the historical proposal against current
categories, team links, media and schema, and renders it through the same trusted
preview pipeline. Restoration returns content and status, keeps a current
proposal's priority, and preserves immutable ID, URL, filename and original
creation/publication dates. Its substantive update date advances. A revision
that changes only ordering has nothing to restore under this rule. Invalid or
pre-schema content cannot be automatically restored; repair/migration is a
separate editorial action.

**Deleted proposals and recovery** lists removed addresses. Their source filename
is now recorded alongside the ID/URL/removal time. Select an address to browse
history; a deletion revision offers the version immediately before deletion.
Recovery reuses the priority from just before deletion, as the user requested,
and leaves other priorities unchanged. Equal priorities retain the shared
publication/ID tie-break. The proposal and removal-record update are committed
atomically, restoring the original address instead of leaving its removal notice.
Older removal records lacking a source filename remain readable but require a
maintainer to locate the source history; no such real removals existed in this
local-only installation when this feature was introduced.

Review the rendered restoration and its comparison against current saved content,
then use **Confirm restoration/recovery as a new revision**. Confirmation is
bound to the session, selected revision, exact branch/file preconditions and a
digest of the prepared changes. It expires after ten minutes or when the session
ends. Only preparation time/digests/revision identifiers are held for confirmation;
this is not a private draft store. The server recalculates and revalidates the
same candidate at confirmation. A newer edit returns a conflict, and history is
never rewritten. Unsaved form edits remain intact while browsing; finish or
download/close them before confirming a restoration.

Protected routes are `GET /admin/api/editor/history?path=...&page=...`,
`GET /admin/api/editor/revision?path=...&commit=...`,
`GET /admin/api/editor/deleted`, `POST /admin/api/editor/restore-preview` and
`POST /admin/api/editor/restore`. Reads are restricted to allowed current content
or recorded deleted proposal paths, and to commits reachable from the fixed
content branch. Historical blobs must be bounded UTF-8 ordinary files. Restore
accepts a session-owned preview ID and explicit confirmation, not caller-supplied
replacement content. The existing session, Origin/CSRF, validation and atomic
GitHub commit gates remain in force. A confirmed save means checks/build pending.

Local review reads actual local Git history without Git writes or network access,
and supports restoration previews. Final confirmation is disabled until GitHub
is configured. Read-only Git commands disable signature verification/notes and
external text converters/diff programs. Existing local drafts and source documents
are not used as historical proposals. Supporting Markdown/YAML history reads
are also available in the supporting-content editors described below.

API references: [GitHub commit history and comparison](https://docs.github.com/en/rest/commits/commits),
[immutable Git trees](https://docs.github.com/en/rest/git/trees).

## Home, News, Team and About editors (Step 22)

Open **Home**, **About**, an existing team/news item, **New team profile** or
**New news item** in the administration panel. These forms use the same protected
save connection, public-content warning, conflict handling, Write/Preview views
and Revisions tab as proposals. Local review keeps final saving/restoration
disabled while GitHub is disconnected. No sample announcement is created.

Home controls its title/introduction, section visibility, list limits, links and
optional hero image. About controls its existing public text, application steps,
institutional links and corrections contact. The QR destination remains derived
from the canonical website configuration, with the generated QR in the preview;
it is not a separate editable address. The previously removed staff submission
section stays absent from both the editor and public page.

Team profiles provide name, role, public email, research interests, biography,
links, portrait, display order and active flag. Inactive profiles disappear from
the Team listing while retaining their public profile and proposal links.
Stable IDs, filenames and addresses cannot be edited. As requested, renaming a
person does not change the supervisor names stored in existing proposals.
News provides title, summary, Markdown body and optional image in its separate
collection; announcements never become student proposals. Original publication
dates are preserved. New items receive their first publication date on save;
substantive team/news edits advance the update date, while profile-order changes
alone do not. Older profiles without recorded dates refer operators to Revisions.

Preview builds the candidate through the trusted Jekyll templates and shared
sanitized rendering. Scripts are removed and the embedded page cannot execute
scripts. Image reads use authenticated, read-only service URLs; the generated QR
and trusted fonts are embedded. These private preview URLs never enter public
content. Public output continues to use ordinary static assets.

The existing media picker supports Home hero images, team portraits and news
images. Temporary uploads belong to the current session and content item and
are inspected with the same image rules as proposal uploads. Selected images
save atomically with their referencing content. Unlinking keeps shared files.
Download temporary files before signing out or expiry.

**Download draft** saves team/news Markdown (`.md`) or Home/About YAML (`.yml`)
on your computer. **Open downloaded draft** reopens either format, including its
original revision information for conflict detection. Downloads are marked as
private drafts and rejected by the public-save validator until prepared for
publication. They contain no credentials or image bytes. Nothing is stored as a
durable server draft; unsaved-change warnings also apply to these forms.

History and restoration use the same session-bound confirmation and new-commit
flow as proposals. Team restoration returns profile content/active state while
keeping its current display order; news keeps its original publication date.
IDs and addresses remain unchanged. Shared assets must still exist and restored
content must pass current rules. Deletion/recovery controls remain proposal-only.

Supporting routes are `GET /admin/api/editor/supporting` and
`POST /admin/api/editor/support-prepare`; image preview reads use
`GET /admin/api/media/image?path=...`. Existing session, Origin/CSRF, allowed-path,
upload ownership, whole-candidate validation and SHA conflict gates apply.
Local checks exercise representative edits, public rendering, history and
restoration for all four types using isolated providers, without modifying real
site content or contacting GitHub.

# Administration access service

Steps 16–18 provide private-link entry, protected sessions, a GitHub content
save API and the proposal editor. GitHub integration is
disabled until explicitly configured; the local access demo needs no GitHub
credentials. The public website remains static and separate.

Use Node **24.22.1**, the repository's locked Ruby gems and its pinned Playwright,
Chromium and MathJax dependencies (see the local setup guide). Run checks from
the website repository root:

```sh
node --test admin-service/test/access.test.mjs
node --test admin-service/test/content.test.mjs
node --test admin-service/test/editor.test.mjs
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
to 128 KiB and each save to sixteen distinct files. Uploads/deletion are later
steps, rather than unrestricted filesystem operations hidden in this API.

| Route | Behavior |
| --- | --- |
| `GET /admin/api/content` | Lists editable paths and blob SHAs at a returned branch commit |
| `GET /admin/api/content/file?path=...` | Returns the exact Markdown/YAML source, file SHA and branch commit |
| `POST /admin/api/content/save` | Accepts `baseCommit` plus `changes`, each with `path`, last-read `sha` (null for a new file) and UTF-8 `content` |
| `GET /admin/api/content/checks?commit=...` | Reports the matching GitHub Actions check's pending/passed/failed state, always with `live: false` in this step |

Only dated proposal Markdown, stable team/news Markdown and Home/About/category
YAML are editable. Schemas, program defaults, workflows, site configuration,
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
is retained. File upload and media selection are Step 19. Public pages remain
static; preview and editing require the separate trusted administration service.
No live GitHub connection, public hosting or publication has been activated.

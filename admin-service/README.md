# Administration access service

Step 16 provides private-link entry, protected sessions and logout. Proposal
editing and GitHub writes are later steps. No GitHub credentials are needed by
this access service. The public website remains static and separate.

Use Node **24.22.1**. There are no third-party runtime packages. Run checks from
the website repository root:

```sh
node --test admin-service/test/access.test.mjs
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
to `/admin/` without the token. The current screen explicitly says proposal
editing is not yet available and offers Sign out.

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

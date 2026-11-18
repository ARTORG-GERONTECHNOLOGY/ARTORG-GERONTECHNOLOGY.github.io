# Release review and maintainer handover

Review date: **2026-11-18**, Europe/Zurich. **Local automated verification passed;
production release is not complete or authorized.** No push, GitHub App
installation, remote protection change, hosted service or Pages deployment has
been performed. Publication activation remains off. Local success is not live
acceptance evidence.

## Final content decisions

The requested reminder about temporary content was given. The supervising user
confirmed the final choices on 2026-11-16; they were applied on 2026-11-18:

- AI decision support is available; the other nine statuses were confirmed.
- All workload percentages are final, including the former temporary splits.
- Only “(see Figure 1)” was removed from writing/drawing. Its science, contacts
  and requirements remain unchanged.
- Max/Petra example profiles and Max's example supervisor entry were removed.
  Kevin Möri remains; the Team listing is intentionally empty. News also remains
  empty until real announcements are supplied.

All IDs, filenames, original publication/creation dates, existing URLs, contacts
and workload values are retained. Four substantively changed proposals have a
new update timestamp. Original migration fingerprints remain, with the single
approved prose correction recorded and checked reversibly. Details and the
current table are in [migration review](migration-issues.md).

## Verification evidence

The clean baseline was commit `e1c3ad0`. A separate local clone under the private
workspace `.local` folder reused the installed Windows toolchain and cached,
locked dependencies: Ruby 3.3.13, Bundler 2.5.22, Node 24.22.1, pnpm 11.25.0,
Python 3.12.14, Playwright 1.62.1/its pinned Chromium and the existing Python
inspection packages. `bundle check` and offline frozen pnpm installation passed.
The complete check command passed and left that checkout unchanged. No `git init`
was run in the projects folder and no original working files were used as drafts.

| Area | Evidence and scope |
| --- | --- |
| Clean build | `bundle exec ruby scripts/validate-site.rb --output ../release-site-e1c3ad0` passed from the separate committed checkout. |
| Final candidate | `bundle exec ruby scripts/validate-site.rb --output ../.local/release-candidate-site` passed on 2026-11-18 after the user-approved corrections. The separate `validate-proposals.rb --release` and `tests/proposal-migration.rb` checks also passed for all ten proposals, including preserved older URLs and the approved prose exception. |
| Proposal lifecycle and concurrency | Shared checks cover creation/editing, six status transitions, order/date semantics, atomic deletion/recovery/restoration and visible stale-write conflicts between sessions. These are isolated local providers, not real GitHub mutations. |
| Administration/security | 38 administration groups passed on both the clean baseline and final candidate, including bearer sessions, expiry/revocation, CSRF, safe paths/rendering, media inspection and exact saved/deployed revision reports. This is focused coverage, not a complete security audit. |
| Publishing | Eight publication groups and workflow/settings contracts passed. Success/failure/race/revert behavior is simulated locally; real workflow permissions and deployments remain unverified. |
| Public output | Final candidate: 144 proposal rendering, 478 catalogue and 1,093 navigation/asset checks passed, plus search/feeds/XML/JSON, all ten PDFs, QR decoding and inspected Pages packaging (50 HTML files). Deliberately broken content/assets/JSON/PDFs and leaked sources were rejected. The earlier baseline had 135 rendering and 1,143 navigation checks; counts changed with available proposals and removed profiles. |
| Browser journeys | On 2026-11-16, the in-app browser checked homepage, catalogue, a long proposal, search default/archived inclusion, an empty filter result/reset, team backlink, About/QR and empty News. Catalogue widths 320/375/768/1024/1440 CSS pixels had no whole-page horizontal overflow. Mobile proposal/profile/About views also fit. |
| Final public fallbacks | On 2026-11-18, isolated Chromium checks with JavaScript disabled verified visible navigation and no whole-page overflow at 375px on Home, Proposals, Archive, Search, Team, News and About. Search's fallback links were visible. Reduced-motion emulation produced the reduced navigation transition duration. The catalogue showed two available proposals; generated search/Team output and PDFs contained no example profiles. |
| Keyboard/accessibility | Browser Tab reached the skip link; Enter focused main content. Mobile Menu opened, Escape closed it and returned focus to the toggle. Labels/headings were exposed in the accessibility tree. On 2026-11-18, the user confirmed catalogue titles and filters work at 200% browser zoom without whole-page horizontal scrolling. Screen-reader software and a full accessibility audit were not run. |
| Editor journeys | The user previously confirmed list/preview, media downloads, lifecycle controls, revision previews, supporting editors/draft reopening and publication refresh preserving typed form edits. On 2026-11-18, isolated Chromium at 375px verified ten proposal rows, keyboard opening/preview, the rendered proposal title, contained page width, disabled saving, About preview and sign-out. Live saves remain disabled. Full mobile/keyboard, zoom and assistive-technology editor checks remain listed below. |
| PDFs | All ten PDFs passed automated text/A4/revision/link checks. Poppler renders of seismographic gait, both wrist-gait pages and writing/drawing were visually inspected; no clipping/overlap was seen. After the final corrections, writing/drawing and both AI decision-support pages were inspected again: correct status/supervisor, no missing-figure reference and no clipping. An isolated five-page figure/math/Unicode/long-text fixture was inspected on its first and last pages. A browser-downloaded biomarker PDF matched the served file's SHA-256. Real content contains no supplied figure, so figure/math coverage is a fixture, not invented project data. |
| QR | PNG decoded to the configured canonical root; the mobile browser loaded it and the user previously confirmed a phone scan on 2026-11-12. |

The full command is documented in the
[project guide](project-guide.md#validate-changes-before-publication).
The [Windows setup](setup-windows.md) remains the verified setup. macOS/Linux
instructions and live Linux service hosting are unverified. A clean clone needs
its own `BUNDLE_GEMFILE`, rather than the prepared environment script's original
repository path. The final uncommitted candidate is reviewed separately from
the clean committed baseline; repeat the clean checkout check for the final
approved commit when preparing an actual release.

The pinned Chromium browser cache was missing after the local runtime changed.
Reinstalling the browser matching the existing Playwright lock restored the
checks; no dependency manifests, versions or lockfiles were changed.

## Maintainer operations

| Task | Authoritative guide |
| --- | --- |
| Proposals, schema, immutable dates and IDs | [Proposal format](proposal-format.md) and [staff editor](../admin-service/README.md#proposal-editor-step-18) |
| Public/private boundaries and downloaded drafts | [Staff service](../admin-service/README.md), including session expiry and temporary-file downloads |
| Home, News, Team, About and linked supervisors | [Supporting-content editors](../admin-service/README.md#home-news-team-and-about-editors-step-22) |
| Service configuration, private key/state storage, rotation and revocation | [Private administration access](../admin-service/README.md#private-access-configuration) |
| Exact revision monitoring, failed/unavailable status and run details | [Publication reports](../admin-service/README.md#save-build-and-live-publication-reports-step-24) |
| Deployment activation, retries and recovery through a new revision | [Publication and recovery](publication.md) |

Keep unfinished Markdown/YAML and original media outside the public repository.
Preview a change, check it, and save only publishable content. A saved Git commit
still needs checks and deployment; use its publication report to confirm Live.
Applications go to each proposal's contact, not the staff submission address.
Restarting the service clears sessions/uploads. Rotating/revoking its shared link
signs everyone out on their next request. Do not print or commit links, digests,
private keys or write tokens. Shared-link access does not identify an individual.

For dependency maintenance, make a separate reviewed change: update only the
needed Ruby/Node/Python version and its manifest/lockfile or full action SHA;
reconcile the pinned CI/toolchain versions and setup guides; install from the
updated locks; run the complete website check plus `--release`; and repeat
affected upload, browser, PDF/math, QR and publication checks. Keep a new revert
commit as recovery. Do not perform incidental upgrades during content changes.

## Work remaining before production release

1. Authorize and provision the separate HTTPS administration host, secret store,
   service account, Caddy/TLS and repository-scoped App with the documented
   Contents-write and Checks/Actions/Deployments-read permissions. Audit upstream
   logs; the current local loopback demonstration is not production hosting.
2. Reconcile the inherited `CNAME` (`carte-noire.jacobtomlinson.co.uk`) with the
   settled canonical URL (`https://artorg-gerontechnology.github.io/`) under
   separate authorization. Both are intentionally preserved here. Do not enable
   Pages while assuming these different values are a verified domain setup.
3. Push only after authorization; verify hosted validation, strict branch rules,
   the App-originated workflow trigger, the protected Pages environment and its
   explicit activation switches. Follow [publication activation](publication.md).
4. Exercise a real save, stale conflict, failed build/deployment with the previous
   site retained, successful exact-revision Live report and new-commit rollback.
   Verify real attachments/downloads, canonical links and a phone QR scan there.
5. Complete full mobile/keyboard editor journeys,
   editor zoom and assistive-technology checks.
   Catalogue zoom at 200% was confirmed by the user; editor zoom still needs
   review. Remaining manual review is not a known
   functional defect, but cannot be marked passed without a check.
6. Re-run the final approved commit's clean build, editorial gate and complete
   public artifact inspection before declaring the release ready. If an actual
   functional defect is found, agree a separately numbered corrective step and
   commit rather than hiding feature fixes in this handover.

There are no remaining requests for invented project facts. The editorial gate
passing does not resolve these hosting and acceptance requirements or authorize
publication. The original Word reference remains unchanged outside the repository.

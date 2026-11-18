# Validated website publication

Step 23 prepares automatic publication after checks pass, as requested. It is
**local preparation only**: no workflow, branch rule, Pages setting, App
installation or deployment has been activated on GitHub. The existing domain,
`CNAME` and production URL are preserved. Both activation variables default to
off when absent; the proposed settings explicitly keep them off.

## How a staff save reaches the website

1. The administration service's repository-scoped App commits allowed content
   to `content/staff`. Its installation token can trigger the existing
   **Validate website** workflow. It cannot change workflows through the service
   or bypass production protection.
2. A successful run starts **Accept validated staff content**, whose privileged
   job checks out trusted `main` tools, not staff-branch code or artifacts. The
   job verifies the repository, workflow file, exact checked revision and latest
   branch head. A manual run on `main` can retry preparation.
3. The tools compare the shared Git ancestor, current production tree and staff
   tree. Only existing content-policy paths may change; files must be ordinary,
   bounded files. Shared assets cannot be overwritten/deleted. Independent edits
   to the same content stop publication for a maintainer to resolve. Production
   code is retained. A two-parent content-only merge preserves both histories.
4. That merge goes to a dedicated
   `publication/staff-<staff SHA>-<main SHA>` candidate branch. The workflow
   explicitly dispatches **Validate website**: a `GITHUB_TOKEN` branch update
   alone does not reliably trigger another push workflow. Candidate validation
   proves its exact tree, checks changes against the previous production content
   with the shared validators and inspects new media, then runs the complete
   website checks with a read-only token.
5. After that exact candidate passes, the trusted accepting job verifies its tree
   again and checks both branch heads. It advances `main` with a non-force,
   fast-forward-only update, subject to branch protection, then explicitly
   dispatches **Publish website** for that revision. Changed heads, rejected
   writes and ambiguous failures are not automatically retried.
6. The production build checks out one exact `main` revision, enforces the
   editorial release gate and runs the complete shared build/validation,
   including QR generation and all PDFs. `publication.json` records the build
   revision, associated staff revision and per-content Git revisions/hashes.
   Metadata generation requires a clean checkout. The staff revision is attached
   only to an exact publication merge; a later maintainer edit/revert does not
   inherit a misleading association with an older staff save.
7. The packager inspects a fresh `_pages` folder containing only public website
   files. Maintenance Markdown/guides are excluded; required legal notices and
   static assets remain. Source/service files, private files, unknown
   intermediates, symbolic links, broken public assets and invalid metadata stop the
   upload. The artifact is retained for one day.
8. A separate job uses the `github-pages` environment, rechecks that the build
   revision is still current and deploys that run's inspected artifact. It alone
   receives Pages-write and OpenID token permissions. A successful content save
   or merge is **not** proof of a live deployment.

Staff acceptance and complete Pages runs each have a serialized concurrency
group. Running deployments are not cancelled. An obsolete queued candidate
stops rather than overwriting newer work. GitHub may replace older pending runs
with a newer pending run. A newer save can exist while an earlier valid site
remains live; commit-specific editor reporting is Step 24.
The [Step 24 reports](../admin-service/README.md#save-build-and-live-publication-reports-step-24)
now implement this distinction locally, with live verification still pending.

## Activation requires separate authorization

Do not treat committing these files as permission to push, change repository
settings or deploy. The maintainer should review `.github/publication-settings.json`
and the existing [App setup](../admin-service/README.md#github-saves-step-17).
The settings file is a reviewable proposal, not an automatically applied script.
Its `branch_protection` entries are proposed branch-protection request bodies;
the `pages` entry describes the corresponding Pages/environment UI settings.

Once live activation is separately approved:

- Push the approved implementation and verify hosted **Website validation**.
  Initialize `content/staff` from that approved `main` revision. Use `main` as
  the default branch so the trusted `workflow_run` workflow is available.
- Protect `main` with strict **Website validation** from GitHub Actions
  (integration ID 15368), including administrators. Disable force pushes and
  deletion, allow merge commits and give the staff App no bypass. This path
  uses direct checked fast-forward advancement, so a separate requirement for
  pull requests or human reviews would intentionally block automatic acceptance.
  Reconcile any organization-level rules before enabling the path.
- Protect `content/staff` against force pushes/deletion. Do not require a check
  before its initial content push: that new commit must exist to run checks.
  Reserve `publication/staff-*` branches for this workflow. The service itself
  still writes only `content/staff`; it gains no production or Actions endpoint.
- Permit the accepting workflow's built-in token to write Contents and Actions.
  No new private key or personal token is used. Keep validation/build jobs
  read-only and retain the explicit job permissions in the workflows.
- Select GitHub Actions as the Pages source. Restrict the `github-pages`
  environment to `main`, without required human reviewers, matching the chosen
  automatic-publication policy. Preserve the configured domain and HTTPS.
- Recheck the final editorial review in `_data/proposal_migration.yml`. The user
  confirmed statuses, older eligibility and workloads, removed the example
  profiles, and resolved the Figure 1 cross-reference during Step 25. Production
  still runs `bundle exec ruby scripts/validate-proposals.rb --release`; do not
  remove a future blocker until its underlying issue has been resolved.
- Enable `ENABLE_STAFF_PUBLICATION` and `ENABLE_PAGES_PUBLICATION` only after
  authorization and the above checks. Test an actual App save, a failed
  candidate, a successful deployment and a recovery before claiming activation.

GitHub rules, runner permissions, Windows packaging on a hosted runner, App
workflow triggering, Pages/OIDC acceptance and the domain's live response remain
unverified until this authorized activation. Local simulations do not prove
that hosted protection is configured.

## Failure, retry and rollback

An invalid candidate does not advance `main`. A failed build, inspection, upload
or deployment does not intentionally replace the last successful Pages site.
Inspect the failed run first. Fix invalid content in the editor and save a new
revision, or fix the trusted code in a reviewed maintainer change. Retry
**Accept validated staff content** on `main` for the latest staff revision.
Retry **Publish website** on `main` for a failed production build; leave its
optional revision blank to build current `main`. It refuses old requested
revisions. If acceptance advanced `main` but its dispatch failed, rerun the
successful candidate's accepting run or manually request the production build.

Recover content through **Revisions → Preview restoration**, then confirm a new
revision once the live save connection is active. A maintainer may instead make
a reviewed **new revert commit** on a working branch and pass it through
validation before production advancement. Retain immutable IDs/URLs and original
dates, and advance substantive update timestamps when restoring earlier content;
the existing restoration tools handle these rules. A raw text revert that
regresses dates must be repaired before staff publication. Reverting an accepted
two-parent publication commit uses its first (production) parent as the baseline.
Do not reset branches, force push, repoint Pages to an old unchecked artifact or
silently redeploy an old revision. A revert is built and inspected as a new
revision, keeping the audit trail. The previous deployment stays the fallback
until that recovery succeeds.

After a maintainer changes content directly on `main`, reconcile any conflicting
staff working copy before the next acceptance. The merge tools stop rather than
guess which independent content edit to keep. Candidate branches are retained
for diagnosis; deleting obsolete candidates is a separate maintainer operation.

## Local evidence and references

The shared `bundle exec ruby scripts/validate-site.rb` command checks workflow
contracts, simulated successful/failed/stale/racing acceptance and new-commit
rollback, plus the actual generated Pages package. Simulations make no GitHub
writes. The package checks prove that a failed candidate leaves the previously
prepared artifact untouched; actual live Pages failure/recovery remains pending.
No local test initializes a Git repository in the workspace.

The implementation follows GitHub's documentation for
[workflow triggers and token exceptions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[trusted use of workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[branch protection](https://docs.github.com/en/rest/branches/branch-protection), and
[custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

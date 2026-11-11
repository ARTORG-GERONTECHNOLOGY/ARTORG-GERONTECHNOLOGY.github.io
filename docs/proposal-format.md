# Proposal format and validation

This is the reusable format for new proposals. The five current proposals and five
older sources have not been migrated. Their scientific content, dates and URLs
are unchanged, and strict validation is not yet part of the Jekyll build.

## Start a proposal

Copy `templates/proposal.md` into a private working folder. Fill in the blank
fields and narrative sections using the project's actual information. The
template contains no scientific example, supervisor, eligibility selection or
figure from the filled Word example. It starts with `published: false`; it is not
a publishable proposal and is excluded from site output along with `scripts/`.

Keep private drafts outside the public repository. `published: false` prevents
normal Jekyll rendering but does not conceal a file committed to GitHub.

When the proposal is ready for publication, remove `published: false` (or set it
to `true`), validate it, and use `_posts/YYYY-MM-DD-project-<slug>.md`. Do not
publish new-format proposals yet: the shared page rendering arrives in Step 4.

## Metadata and narrative

The file uses YAML front matter between `---` lines, followed by Markdown.
`_data/proposal_schema.yml` is authoritative for versions, statuses, eligibility
labels, narrative section names, immutable metadata, and ordering.

Required metadata includes title, immutable `proposal_id`, schema/template
versions, publication/creation/update timestamps, status, integer priority,
featured flag, summary, category list, language, eligibility, supervisors,
institutes, contact name/email, workload rows and the proposal-return email.
Use lowercase letters, numbers and hyphens for the immutable ID. Assign it once.

Categories come from the shared list in `_data/proposal_categories.yml`. Choose
its canonical IDs, not display labels or free text. Maintainers extend that file
with a new unique ID and label when needed. Its `legacy_labels` record old spelling
variants for migration; validation does not silently rewrite them. The initial
list covers the existing source categories, including corrected Decision Support.

Use the following level-two headings exactly, in template order:

- `## Background`
- `## Aim`
- `## Materials and Methods`
- `## Requirements` (at least one Markdown list item)
- `## References` (optional; remove it if unused)

Use level-three headings for subsections. Tables, code, links, math and Unicode
remain in the Markdown. Fenced or quoted `##` text is not treated as a section.
Duplicate headings, unknown level-two sections and content preceding the first
section fail validation. Store workload, supervisors, institutes, contact and
eligibility in metadata, rather than repeating them in narrative sections.

Publication requires nonempty required sections and at least one supervisor,
institute, category, requirement and workload row. Workload rows have an activity
and a numeric percentage between 0 and 100; their total must be exactly 100%.
The four blank template rows are suggestions: remove unused rows or add more.

Choose `bme_only` or `bme_and_aim` explicitly. Do not infer eligibility or project
availability from missing information. `_data/program.yml` defines the program
name, proposal-return instruction/email and Word logo source references. Public
logo files are not extracted until Step 4. The return address
`bme.artorg@unibe.ch` is for proposal administration; student applications use
the project's own contact and `application_instructions`.

Optional fields include `tags`, `start_date_text`, `workplace`, application
instructions, contact address/phone, and an explicit stable `permalink`.
Omit `figure` when unused; otherwise supply `src`, meaningful `alt` text and
`caption`. Attachments use `title`, `url`, `mime_type` and optional integer byte
`size`. Links reject executable schemes, credentials in URLs, and unsafe local
paths. Actual file signatures, upload limits, sanitization and asset-existence
checks are later steps, not guarantees of this metadata validator.

`team_id` is optional on supervisors. Reference existence will be checked when
the team collection becomes available in Step 8; names remain usable without
profiles. No team data or staff biographies are invented in this step.

## Identity, dates and ordering

- `created_at`: assign once when creating the proposal; a UTC timestamp.
- `date`: initial publication timestamp including timezone offset. Preserve it
  and the filename to retain existing URLs; changing a title must not rename the
  file. A `permalink`, if supplied, is also immutable in ordinary edits.
- `updated_at`: UTC timestamp for substantive text/metadata or status changes.
  It cannot precede creation. A pure priority change does not change this date.
- `status`: `available`, `taken` or `archived`. The future default listings show
  available proposals; taken/archived detail pages retain their addresses.
- Ordering: priority ascending, initial publication descending, immutable ID
  ascending for ties. Reordering is separate from scientific content edits.

For UTC fields use `2026-11-11T08:00:00Z`. Publication accepts that format or
`2026-11-11 09:00:00 +0100`. Never substitute a build time for a content date.
Migration must recover dates where reliable, and ask staff about missing data.

## Commands

Activate the environment from the relevant [setup guide](../README.md) first.
Run these commands from the website repository root:

```sh
bundle exec ruby scripts/tests/proposal-format.rb
bundle exec ruby scripts/validate-proposals.rb
bundle exec ruby scripts/validate-proposals.rb --draft ../private-proposal.md
bundle exec ruby scripts/validate-proposals.rb ../ready-proposal.md
```

Draft validation permits incomplete fields and workload totals. Supplied values
must still have valid types and choices. Publication validation requires all
mandatory information and rejects `published: false`.

Without paths, the validator checks versioned `_posts/` files and reports legacy
files as skipped. A file opts into the new format by declaring `schema_version`,
`template_version` or `proposal_id`. Explicit paths are always validated.
`--strict` rejects unversioned files too; enable it for the reviewed proposal set
after migration. Do not mistake skipped legacy files for validated proposals.
Failures include the file, field/section and reason, and return a nonzero exit code.

The shared Ruby implementation is `scripts/lib/proposal.rb`:
`Document.parse`/`Document.read`, `Document#sections`, `Document#serialize`, and
`Validator#validate`/`Validator#validate_set`. Unedited files round-trip exactly,
including YAML comments and newlines. Use `Document#body=` to replace the narrative
and reparse its sections. Editing a document regenerates its YAML while preserving
the narrative Markdown provided. `validate(previous: original_document)`
also rejects ordinary edits to immutable fields. Validation does not itself save,
publish, render HTML, sanitize authors' HTML, or assign timestamps.
When a previous revision is supplied, it also requires a later `updated_at` for
substantive content/status edits and an unchanged `updated_at` for pure reordering.

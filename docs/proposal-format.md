# Proposal format and validation

This is the reusable format for proposals. All ten source proposals have been
migrated into `_posts/` and are validated strictly. Scientific content,
publication dates and existing URLs are preserved. Validation is a separate
command, not yet part of Jekyll.

## Start a proposal

Copy `templates/proposal.md` into a private working folder. Fill in the blank
fields and narrative sections using the project's actual information. The
template contains no scientific example, supervisor or figure from the filled
Word example. It starts with `published: false`; it is not
a publishable proposal and is excluded from site output along with `scripts/`.

Keep private drafts outside the public repository. `published: false` prevents
normal Jekyll rendering but does not conceal a file committed to GitHub.

When the proposal is ready for publication, remove `published: false` (or set it
to `true`), validate it, and use `_posts/YYYY-MM-DD-project-<slug>.md`. Do not
publish new-format proposals yet: a compatibility appendix preserves moved details,
and the complete shared page rendering arrives in Step 4.

## Metadata and narrative

The file uses YAML front matter between `---` lines, followed by Markdown.
`_data/proposal_schema.yml` defines versions, statuses, narrative section names,
immutable metadata and ordering.

Required metadata includes title, immutable `proposal_id`, schema/template
versions, publication/creation/update timestamps, status, integer priority,
featured flag, summary, category list, language, supervisors,
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
section fail validation. Store workload, supervisors, institutes and contact in metadata.

Publication requires nonempty required sections and at least one supervisor,
institute, category, requirement and workload row. Workload rows have an activity
and a numeric percentage between 0 and 100; their total must be exactly 100%.
The four blank template rows are suggestions: remove unused rows or add more.

Set project availability explicitly. `_data/program.yml` defines the program
name, proposal-return instruction/email and Word logo source references. Public
logo files are not extracted until Step 4. The return address
`bme.artorg@unibe.ch` is for proposal administration; student applications use
the project's own contact and `application_instructions`.

Optional fields include `tags`, `start_date_text`, `workplace`, application
instructions, contact address/phone, and an explicit stable `permalink`.
Omit `figure` when unused; otherwise supply `src`, meaningful `alt` text and
`caption`. Set `figure.section` to Background, Aim, Materials and Methods,
Requirements or References to put the figure after that section's text on the
website. Omitting it keeps the default placement after Institutes. PDFs always
place the figure after Institutes and before References and Contact, following
the Word template.
Attachments use `title`, `url`, `mime_type` and optional integer byte
`size`. Links reject executable schemes, credentials in URLs, and unsafe local
paths. Actual file signatures, upload limits, sanitization and asset-existence
checks are later steps, not guarantees of this metadata validator.

`team_id` is optional on supervisors. Reference existence is checked against
published team profiles during validation and the site build. Names remain usable
without profiles; inactive profiles can still be linked.

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
bundle exec ruby scripts/tests/proposal-migration.rb
bundle exec ruby scripts/validate-proposals.rb
bundle exec ruby scripts/validate-proposals.rb --release
bundle exec ruby scripts/validate-proposals.rb --draft ../private-proposal.md
bundle exec ruby scripts/validate-proposals.rb ../ready-proposal.md
```

Draft validation permits incomplete fields and workload totals. Supplied values
must still have valid types and choices. Publication validation requires all
mandatory information and rejects `published: false`.

Without paths, the validator checks every `_posts/` file. Strict validation is now
the default: unversioned files are errors rather than skipped legacy content.
`--strict` remains available for explicit build commands. All ten proposals,
including the five formerly in `post_archive/`, belong to the validated set.
`--release` additionally rejects outstanding issues in
`_data/proposal_migration.yml`, including the historical status and workload choices
and the missing figure reference.
Update that record only after resolving the issues.
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

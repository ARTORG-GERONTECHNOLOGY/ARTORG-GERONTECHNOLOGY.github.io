# frozen_string_literal: true

# Focused domain checks using Ruby itself; no additional test framework.
require_relative "../lib/proposal"
require "tmpdir"
require "open3"
require "rbconfig"

def assert(condition, message)
  raise message unless condition
end

def metadata
  {
    "layout" => "post", "schema_version" => 1, "template_version" => 1,
    "proposal_id" => "ger-validation-fixture", "title" => "A test proposal — ü",
    "date" => "2026-11-11 09:00:00 +0100", "created_at" => "2026-11-11T08:00:00Z",
    "updated_at" => "2026-11-11T08:00:00Z", "status" => "available", "priority" => 100,
    "featured" => false, "summary" => "A synthetic validation fixture, not a real project.",
    "categories" => ["gait-analysis"], "tags" => ["test"], "language" => "en",
    "supervisors" => [{"name" => "Test supervisor"}],
    "institutes" => [{"name" => "Test institute", "url" => "https://example.org/"}],
    "contact" => {"name" => "Test contact", "email" => "test@example.org"},
    "workload" => [{"activity" => "First activity", "percentage" => 60}, {"activity" => "Second activity", "percentage" => 40}],
    "submission_email" => "bme.artorg@unibe.ch"
  }
end

def body
  <<~'MARKDOWN'
    ## Background

    Text with Unicode: α, ü, and “quotes”. A [reference](https://example.org/).

    ```markdown
    ## Aim
    This fenced heading is not a new proposal section.
    ```

    ## Aim

    Study a synthetic question.

    ### A nested detail

    Keep this subsection, the table, code and math unchanged.

    | Item | Value |
    | ---- | ----- |
    | α    | 2     |

    ## Materials and Methods

    Test $x^2$ and `code`.

    > ## Aim
    > A quoted heading is not a proposal section either.

    ## Requirements

    - Programming experience.

    ## References

    [A synthetic reference](https://example.org/reference).
  MARKDOWN
end

def document(data = metadata, narrative = body)
  Proposals::Document.new(data, narrative)
end

validator = Proposals::Validator.new
checks = 0
check = lambda do |name, &block|
  block.call
  checks += 1
  puts "PASS #{name}"
end
reject = lambda do |name, field, &mutate|
  check.call(name) do
    data = metadata
    mutate.call(data)
    errors = validator.validate(document(data))
    assert(errors.any? { |error| error.start_with?("#{field}:") }, "Expected #{field} error, got #{errors.inspect}")
  end
end

check.call("complete proposal and all three statuses") do
  Proposals::SCHEMA.fetch("statuses").each do |status|
    data = metadata.merge("status" => status)
    assert(validator.validate(document(data)).empty?, validator.validate(document(data)).inspect)
  end
end
check.call("blank template is an incomplete draft, never publishable") do
  template = Proposals::Document.read(File.join(Proposals::ROOT, "templates/proposal.md"))
  assert(validator.validate(template, mode: :draft).empty?, validator.validate(template, mode: :draft).inspect)
  assert(!validator.validate(template).empty?, "Template must not pass publication validation")
  assert(template.metadata["published"] == false, "Template must be unpublished")
end
check.call("lossless front matter, comments, body and CRLF round trip") do
  source = (YAML.dump(metadata).sub("---\n", "---\n# Preserve this comment\n") + "---\n" + body).gsub("\n", "\r\n")
  parsed = Proposals::Document.parse(source)
  assert(parsed.serialize == source, "Unedited document changed")
  parsed.metadata["title"] = "Edited title"
  reparsed = Proposals::Document.parse(parsed.serialize)
  assert(reparsed.body == parsed.body, "Metadata edit changed narrative")
  assert(reparsed.sections == parsed.sections, "Metadata edit lost sections")
  assert(reparsed.metadata["title"] == "Edited title", "Edit not serialized")
  reparsed.body = reparsed.body.sub("Study a synthetic question.", "Study an edited question.")
  edited = Proposals::Document.parse(reparsed.serialize)
  assert(edited.sections["Aim"].include?("Study an edited question."), "Narrative edit lost")
  assert(edited.metadata == reparsed.metadata, "Narrative edit changed metadata")
end
check.call("nested and fenced headings do not split sections") do
  parsed = document
  assert(parsed.section_errors.empty?, parsed.section_errors.inspect)
  assert(parsed.sections.keys == Proposals::SCHEMA.fetch("required_sections") + ["References"], parsed.sections.keys.inspect)
  assert(parsed.sections["Background"].include?("## Aim"), "Fenced code lost")
  assert(parsed.sections["Aim"].include?("| α"), "Table lost")
end
check.call("duplicate and unknown sections are rejected") do
  errors = validator.validate(document(metadata, body + "\n## Aim\n\nDuplicate\n\n## Custom\n\nUnknown\n"))
  assert(errors.any? { |error| error.include?("Duplicate section: Aim") }, errors.inspect)
  assert(errors.any? { |error| error.include?("Custom:") }, errors.inspect)
end
check.call("required sections and requirement lists") do
  errors = validator.validate(document(metadata, "## Background\n\n<!-- empty -->\n"))
  %w[Background Aim Requirements].each { |field| assert(errors.any? { |error| error.start_with?("#{field}:") }, errors.inspect) }
  errors = validator.validate(document(metadata, body.sub("- Programming experience.", "Programming experience.")))
  assert(errors.any? { |error| error.include?("at least one list item") }, errors.inspect)
end
check.call("optional references and metadata can be omitted") do
  assert(validator.validate(document(metadata, body.split("## References").first)).empty?, "Optional references required")
end
check.call("duplicate IDs are rejected across documents") do
  results = validator.validate_set({"one.md" => document, "two.md" => document})
  assert(results.values.all? { |errors| errors.any? { |error| error.include?("duplicate") } }, results.inspect)
end
check.call("duplicate YAML keys, aliases and unsafe YAML types fail") do
  ["title: one\ntitle: two\n", "name: &a test\nother: *a\n", "value: !ruby/object:Object {}\n"].each do |yaml|
    begin
      Proposals.load_yaml(yaml)
      raise "Unsafe or ambiguous YAML was accepted"
    rescue Proposals::FormatError
      # Expected.
    end
  end
end
check.call("identity, publication and creation fields are immutable") do
  %w[proposal_id date created_at permalink].each do |field|
    data = metadata.merge(field => (field == "proposal_id" ? "changed-id" : "changed"))
    errors = validator.validate(document(data), previous: document)
    assert(errors.any? { |error| error.include?("#{field}: cannot change") }, errors.inspect)
  end
end
check.call("priority changes preserve content timestamps") do
  original = document
  changed = document(metadata.merge("priority" => 10))
  assert(validator.validate(changed, previous: original).empty?, "Priority-only edit rejected")
  assert(changed.metadata["updated_at"] == original.metadata["updated_at"], "Reorder changed content date")
  changed.metadata["updated_at"] = "2026-11-11T09:00:00Z"
  assert(validator.validate(changed, previous: original).any? { |error| error.include?("priority-only") }, "Reorder changed content date without error")
end
check.call("substantive edits and status changes advance the content timestamp") do
  original = document
  changed = document(metadata.merge("status" => "taken"))
  assert(validator.validate(changed, previous: original).any? { |error| error.include?("must advance") }, "Status changed without updating date")
  changed.metadata["updated_at"] = "2026-11-11T09:00:00Z"
  assert(validator.validate(changed, previous: original).empty?, "Valid status change failed")
  changed = document(metadata, body.sub("Study a synthetic question.", "Study a revised question."))
  assert(validator.validate(changed, previous: original).any? { |error| error.include?("must advance") }, "Narrative changed without updating date")
end
check.call("fractional workload uses exact decimal totals") do
  data = metadata
  data["workload"] = [33.3, 33.3, 33.4].map { |percentage| {"activity" => "Test", "percentage" => percentage} }
  assert(validator.validate(document(data)).empty?, "Valid fractional total failed")
end
check.call("partial drafts still reject invalid supplied values") do
  assert(validator.validate(document({}, ""), mode: :draft).empty?, "Incomplete draft rejected")
  errors = validator.validate(document({"status" => "unknown"}, ""), mode: :draft)
  assert(errors.any? { |error| error.start_with?("status:") }, errors.inspect)
end
check.call("shared categories have unique stable IDs and labels") do
  ids = Proposals::CATEGORIES.map { |category| category.fetch("id") }
  assert(ids.uniq == ids, "Duplicate category IDs")
  assert(ids.all? { |id| id.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) }, "Invalid category ID")
  assert(Proposals::CATEGORIES.all? { |category| !category.fetch("label").strip.empty? }, "Missing category label")
end
check.call("program defaults agree with the blank template") do
  program = YAML.safe_load_file(File.join(Proposals::ROOT, "_data/program.yml"))
  template = Proposals::Document.read(File.join(Proposals::ROOT, "templates/proposal.md"))
  assert(program.fetch("submission_email") == template.metadata.fetch("submission_email"), "Template return address drifted from program settings")
end
check.call("figures and attachments retain optional metadata") do
  data = metadata.merge("figure" => {"src" => "/assets/media/proposals/ger-validation-fixture/figure.png", "alt" => "A test graph", "caption" => "Test caption"}, "attachments" => [{"title" => "Test PDF", "url" => "https://example.org/test.pdf", "mime_type" => "application/pdf", "size" => 100}])
  original = document(data)
  parsed = Proposals::Document.parse(original.serialize)
  assert(validator.validate(parsed).empty?, validator.validate(parsed).inspect)
  assert(parsed.metadata == original.metadata, "Optional metadata lost")
end
reject.call("unknown category", "categories") { |data| data["categories"] = ["Decsion Support"] }
reject.call("missing title", "title") { |data| data.delete("title") }
reject.call("bad schema version", "schema_version") { |data| data["schema_version"] = "1" }
reject.call("retired eligibility field", "student_eligibility") { |data| data["student_eligibility"] = "bme_and_aim" }
reject.call("bad status", "status") { |data| data["status"] = "closed" }
reject.call("bad contact email", "contact.email") { |data| data["contact"]["email"] = "not an email" }
reject.call("malformed email domain", "contact.email") { |data| data["contact"]["email"] = "test@example..org" }
reject.call("unsafe institution URL", "institutes[0].url") { |data| data["institutes"][0]["url"] = "javascript:alert(1)" }
reject.call("incorrect workload total", "workload") { |data| data["workload"][0]["percentage"] = 59 }
reject.call("malformed workload row", "workload[0]") { |data| data["workload"][0] = "wrong" }
reject.call("out-of-range workload", "workload[0].percentage") { |data| data["workload"][0]["percentage"] = 101 }
reject.call("timestamp without timezone", "date") { |data| data["date"] = "2026-11-11 09:00:00" }
reject.call("impossible calendar date", "date") { |data| data["date"] = "2026-02-30 09:00:00 +0100" }
reject.call("non-UTC edit date", "updated_at") { |data| data["updated_at"] = "2026-11-11T10:00:00+01:00" }
reject.call("edit before creation", "updated_at") { |data| data["updated_at"] = "2026-11-10T08:00:00Z" }
reject.call("missing supervisors", "supervisors") { |data| data["supervisors"] = [] }
reject.call("unpublished proposal", "published") { |data| data["published"] = false }
reject.call("unsafe media path", "figure.src") { |data| data["figure"] = {"src" => "/../private.png", "alt" => "Test", "caption" => "Test"} }
reject.call("figure without alternative text", "figure.alt") { |data| data["figure"] = {"src" => "/figure.png", "caption" => "Test"} }
reject.call("unknown figure placement", "figure.section") { |data| data["figure"] = {"src" => "/figure.png", "alt" => "Test", "caption" => "Test", "section" => "Contact"} }
check.call("placement after absent References") do
  data = metadata.merge("figure" => {"src" => "/figure.png", "alt" => "Test", "caption" => "Test", "section" => "References"})
  errors = validator.validate(document(data, body.split("## References").first))
  assert(errors.any? { |error| error.start_with?("figure.section:") }, "Missing placement error: #{errors.inspect}")
end
reject.call("malformed attachment", "attachments[0]") { |data| data["attachments"] = ["bad"] }

check.call("CLI separates draft, publication, invalid input and legacy migration") do
  cli = File.join(Proposals::ROOT, "scripts/validate-proposals.rb")
  Dir.mktmpdir("ger-proposal-check-") do |folder|
    file = File.join(folder, "proposal.md")
    File.write(file, document.serialize)
    stdout, stderr, status = Open3.capture3(RbConfig.ruby, cli, file)
    assert(status.success? && stdout.include?("0 failed"), "Valid CLI input failed: #{stderr}")
    File.write(file, document(metadata.reject { |key, _value| key == "title" }).serialize)
    _stdout, stderr, status = Open3.capture3(RbConfig.ruby, cli, file)
    assert(status.exitstatus == 1 && stderr.include?("title: is required"), "Missing field did not fail clearly")
    File.write(file, "---\nlayout: post\n---\n")
    _stdout, _stderr, status = Open3.capture3(RbConfig.ruby, cli, "--draft", file)
    assert(status.success?, "Incomplete CLI draft failed")
  end
  stdout, stderr, status = Open3.capture3(RbConfig.ruby, cli)
  legacy_count = Dir[File.join(Proposals::ROOT, "_posts/*.md")].count { |path| !Proposals::Document.read(path).versioned? }
  assert(status.success? && stdout.include?("#{legacy_count} legacy skipped"), "Legacy compatibility failed: #{stderr}")
  if legacy_count.positive?
    _stdout, _stderr, status = Open3.capture3(RbConfig.ruby, cli, "--strict")
    assert(status.exitstatus == 1, "Strict mode silently skipped legacy data")
  end
end

puts "#{checks} proposal format checks passed."

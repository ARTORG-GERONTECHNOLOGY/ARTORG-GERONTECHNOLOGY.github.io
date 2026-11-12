# frozen_string_literal: true

require_relative "../lib/proposal"
require "digest"
require "json"
require "open3"
require "rbconfig"
require "rexml/document"
require "cgi"

def assert(condition, message)
  raise message unless condition
end

def digest(text)
  Digest::SHA256.hexdigest(text.gsub(/^[ \t]*[-*+]\s+/, "").split.join(" "))
end

root = Proposals::ROOT
review = YAML.safe_load_file(File.join(root, "_data/proposal_migration.yml"))
records = review.fetch("proposals")
assert(review.fetch("older_sources").length == 5, "Five older sources must be accounted for")
unmigrated = review.fetch("older_sources").count { |record| !record.key?("migrated_file") }
assert(records.length + unmigrated == 10, "All ten source proposals must be accounted for")
assert(Dir[File.join(root, "_posts/*.md")].length == records.length, "Published proposal inventory differs from migration record")
documents = {}
records.each do |record|
  path = File.join(root, record.fetch("file"))
  document = Proposals::Document.read(path)
  documents[path] = document
  assert(document.metadata.fetch("proposal_id") == record.fetch("proposal_id"), "ID changed: #{path}")
  assert(document.metadata.fetch("permalink") == record.fetch("permalink"), "URL changed: #{path}")
  assert(document.metadata.fetch("date") == Time.iso8601(record.fetch("publication_date")), "Publication instant changed: #{path}")
  record.fetch("narrative_sha256").each do |section, expected|
    assert(digest(document.sections.fetch(section)) == expected, "Scientific prose/reference changed in #{path}, #{section}")
  end
  %w[contact workload application_instructions].each do |key|
    assert(document.metadata[key] == record[key], "Migrated #{key} changed: #{path}")
  end
end
errors = Proposals::Validator.new.validate_set(documents).reject { |_path, issues| issues.empty? }
assert(errors.empty?, errors.inspect)
review.fetch("older_sources").each do |record|
  if record["migrated_file"]
    migrated = records.find { |proposal| proposal.fetch("file") == record.fetch("migrated_file") }
    assert(migrated && migrated.fetch("permalink") == record.fetch("existing_url"), "Older source lost its existing URL")
    assert(File.basename(record.fetch("file")) == File.basename(record.fetch("migrated_file")), "Older proposal filename changed")
  else
    assert(Digest::SHA256.file(File.join(root, record.fetch("file"))).hexdigest == record.fetch("sha256"), "Older source changed without review")
  end
end
cli = File.join(root, "scripts/validate-proposals.rb")
stdout, stderr, status = Open3.capture3(RbConfig.ruby, cli, "--strict")
assert(status.success? && stdout.include?("#{records.length} proposal(s)"), "Strict migrated validation failed: #{stderr}")
_stdout, stderr, status = Open3.capture3(RbConfig.ruby, cli, "--release")
if review.fetch("release_blockers").empty?
  assert(status.success?, "Resolved release is still blocked: #{stderr}")
else
  assert(status.exitstatus == 1 && stderr.include?("migration review"), "Unresolved source data must block release")
end
puts "PASS #{records.length} migrated proposals, unchanged narrative/references, stable identities/URLs/dates, preserved contact/workload, all ten sources accounted for, strict validation, and release review gate."

if ARGV[0]
  output = File.expand_path(ARGV[0])
  records.each do |record|
    document = documents.fetch(File.join(root, record.fetch("file")))
    html = CGI.unescapeHTML(File.read(File.join(output, record.fetch("permalink").delete_prefix("/"), "index.html")))
    assert(html.include?(document.metadata.fetch("contact").fetch("email")), "Contact missing from output")
    document.metadata.fetch("workload").each do |row|
      assert(html.include?(row.fetch("activity")), "Workload missing from output")
    end
    assert(html.include?("mailto:"), "Mail link missing from output")
    %w[address phone].each do |field|
      value = document.metadata.fetch("contact")[field]
      assert(html.include?(value), "Contact #{field} missing from output") if value
    end
  end
  index = JSON.parse(File.read(File.join(output, "search.json")))
  assert(index.select { |entry| entry["type"] == "proposal" }.map { |entry| entry.fetch("url") }.sort == records.map { |entry| entry.fetch("permalink") }.sort, "Search URLs changed")
  feed = REXML::Document.new(File.read(File.join(output, "feed.xml")))
  assert(REXML::XPath.match(feed, "/rss/channel/item").length == [records.length, 10].min, "Proposal feed count differs from published set")
  %w[templates scripts].each { |folder| assert(!File.exist?(File.join(output, folder)), "Internal source leaked: #{folder}") }
  review.fetch("older_sources").each do |record|
    assert(File.file?(File.join(output, record.fetch("existing_url").delete_prefix("/"), "index.html")), "Older existing URL disappeared")
  end
  puts "PASS generated detail pages, contact/workload links, search JSON, RSS, source exclusions, and five retained older URLs."
end

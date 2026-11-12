# frozen_string_literal: true

require "optparse"
require_relative "lib/proposal"

mode = :publication
strict = true # The published proposal set was migrated in Step 3.
release = false
options = OptionParser.new do |parser|
  parser.banner = "Usage: bundle exec ruby scripts/validate-proposals.rb [--draft] [--strict] [--release] [files...]"
  parser.on("--draft", "Allow incomplete private working copies") { mode = :draft }
  parser.on("--strict", "Reject unversioned legacy proposals instead of skipping them") { strict = true }
  parser.on("--release", "Also require resolution of recorded source-data issues") { release = true }
end

begin
  options.parse!
  explicit_files = !ARGV.empty?
  paths = explicit_files ? ARGV : Dir[File.join(Proposals::ROOT, "_posts/*.md")].sort
  documents, failures, skipped = {}, {}, []
  paths.each do |path|
    begin
      document = Proposals::Document.read(path)
      if document.versioned? || explicit_files || strict
        documents[path] = document
      else
        skipped << path
      end
    rescue Proposals::FormatError, SystemCallError, EncodingError => e
      failures[path] = [e.message]
    end
  end
  failures.merge!(Proposals::Validator.new.validate_set(documents, mode: mode).reject { |_path, errors| errors.empty? })
  if release
    review = YAML.safe_load_file(File.join(Proposals::ROOT, "_data/proposal_migration.yml"))
    blockers = review.fetch("release_blockers")
    failures["migration review"] = blockers unless blockers.empty?
  end
  skipped.each { |path| puts "SKIP legacy (not migrated): #{path}" }
  failures.each { |path, errors| errors.each { |error| warn "#{path}: #{error}" } }
  puts "#{documents.length} proposal(s) checked in #{mode} mode; #{skipped.length} legacy skipped; #{failures.length} failed."
  exit(failures.empty? ? 0 : 1)
rescue OptionParser::ParseError => e
  warn e.message
  warn options
  exit 2
end

# frozen_string_literal: true

require "yaml"
require "date"
require "time"
require "uri"
require "bigdecimal"
require "kramdown"
require "kramdown-parser-gfm"

module Proposals
  ROOT = File.expand_path("../..", __dir__)
  SCHEMA = YAML.safe_load_file(File.join(ROOT, "_data/proposal_schema.yml"))

  def self.public_url?(value, local_only: false)
    return true if value.is_a?(String) && value.start_with?("/") && !value.start_with?("//") && !value.match?(/[\\\s%?#<>]/) && value.split("/").none? { |part| %w[. ..].include?(part) }
    parsed = URI.parse(value) if value.is_a?(String)
    !local_only && parsed.is_a?(URI::HTTP) && %w[http https].include?(parsed.scheme) && parsed.host && !parsed.host.empty? && parsed.userinfo.nil? && !value.match?(/[\s<>]/)
  end

  def self.public_email?(value)
    atom = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
    label = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
    value.is_a?(String) && value.length <= 254 && value.match?(/\A#{atom}(?:\.#{atom})*@(?:#{label}\.)+[A-Za-z]{2,63}\z/)
  end

  def self.team_ids(source = ROOT)
    Dir[File.join(source, "_team/**/*.md")].filter_map do |path|
      data = Document.read(path).metadata
      data["team_id"] unless data["published"] == false
    end
  end

  class FormatError < StandardError; end

  # Reject ambiguous YAML instead of letting a later duplicate silently win.
  def self.load_yaml(source, mapping: true)
    stream = Psych.parse_stream(source)
    raise FormatError, "Use one YAML document" if stream.children.length > 1
    inspect_node = lambda do |node|
      if node.is_a?(Psych::Nodes::Mapping)
        keys = node.children.each_slice(2).map do |key, _value|
          raise FormatError, "YAML field names must be strings" unless key.is_a?(Psych::Nodes::Scalar) && key.tag != "tag:yaml.org,2002:merge" && key.value != "<<"
          key.value
        end
        duplicate = keys.group_by(&:itself).find { |_key, occurrences| occurrences.length > 1 }
        raise FormatError, "Duplicate YAML field: #{duplicate.first}" if duplicate
      end
      node.children&.each { |child| inspect_node.call(child) }
    end
    inspect_node.call(stream)
    value = YAML.safe_load(source, permitted_classes: [Time, Date], aliases: false)
    valid = mapping ? value.is_a?(Hash) && value.keys.all? { |key| key.is_a?(String) } : value.is_a?(Array)
    raise FormatError, mapping ? "Front matter must be a YAML mapping" : "Provide a YAML list" unless valid
    value
  rescue Psych::Exception, ArgumentError => e
    raise FormatError, "Invalid YAML: #{e.message}"
  end

  def self.categories!(categories)
    unless categories.is_a?(Array) && !categories.empty? && categories.all? { |item| item.is_a?(Hash) && item['id'].is_a?(String) && item['id'].match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && item['label'].is_a?(String) && !item['label'].strip.empty? && (!item.key?('legacy_labels') || item['legacy_labels'].is_a?(Array) && item['legacy_labels'].all? { |label| label.is_a?(String) }) }
      raise FormatError, 'categories: provide stable IDs and nonempty display labels'
    end
    %w[id label].each { |key| raise FormatError, "categories: duplicate #{key}" unless categories.map { |item| item[key] }.uniq.length == categories.length }
    categories
  end
  CATEGORIES = categories!(load_yaml(File.read(File.join(ROOT, '_data/proposal_categories.yml'), encoding: 'UTF-8'), mapping: false))

  class Document
    attr_reader :metadata, :body, :sections, :section_errors

    def self.read(path)
      parse(File.read(path, encoding: "UTF-8"))
    end

    def self.parse(source)
      raise FormatError, "Document must be valid UTF-8" unless source.valid_encoding?
      match = /\A(?:\uFEFF)?---\r?\n(.*?)^---[ \t]*(?:\r?\n|\z)(.*)\z/m.match(source)
      raise FormatError, "Expected YAML front matter between --- lines" unless match
      new(Proposals.load_yaml(match[1]), match[2], source)
    end

    def initialize(metadata, body, original_source = nil)
      @metadata, @original_source = metadata, original_source
      @original_metadata = Marshal.load(Marshal.dump(metadata))
      self.body = body
      @original_body = @body
    end

    def body=(markdown)
      @body = markdown.dup.freeze
      @sections, @section_errors = {}, []
      parse_sections
    end

    def versioned?
      %w[schema_version template_version proposal_id].any? { |key| metadata.key?(key) }
    end

    # Unedited documents retain comments, Unicode and newline style exactly.
    # Edited metadata is safely serialized; the narrative is never reconstructed.
    def serialize
      return @original_source if @original_source && metadata == @original_metadata && body == @original_body
      "#{YAML.dump(metadata)}---\n#{body}"
    end

    # Reuse the AST section boundaries; nested/fenced headings remain prose.
    # Only changed sections are replaced, preserving untouched scientific bytes.
    def replace_sections(values)
      allowed = SCHEMA.fetch('required_sections') + SCHEMA.fetch('optional_sections')
      raise FormatError, 'Unknown narrative section' unless values.is_a?(Hash) && (values.keys - allowed).empty? && values.values.all? { |value| value.is_a?(String) }
      raise FormatError, section_errors.join('; ') unless section_errors.empty?
      lines = body.lines
      replacements = @section_ranges.filter_map do |name, first, finish|
        next unless values.key?(name) && values[name] != sections[name]
        [first, finish, values[name].end_with?("\n") ? values[name] : values[name] + "\n\n"]
      end
      replacements.reverse_each { |first, finish, value| lines[first...finish] = [value] }
      updated = lines.join
      (values.keys - sections.keys).each { |name| updated += "\n## #{name}\n\n#{values[name]}\n" unless values[name].strip.empty? }
      self.body = updated
    end

    private

    def parse_sections
      @section_ranges = []
      lines = body.lines
      ast = Kramdown::Document.new(body, input: "GFM").root
      headings = ast.children.select { |node| node.type == :header && node.options[:level] == 2 }
      prefix = headings.empty? ? body : lines[0...(headings.first.options[:location] - 1)].join
      @section_errors << "Narrative must start with a level-two section heading" unless prefix.strip.empty?
      headings.each_with_index do |node, index|
        line = node.options.fetch(:location) - 1
        # Canonical headings use ##, avoiding ambiguity with setext underline lines.
        heading = lines[line].to_s.match(/\A {0,3}##[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n)?\z/)
        unless heading
          @section_errors << "Use ## headings for proposal sections (line #{line + 1})"
          next
        end
        name = heading[1].strip
        next_heading = headings[index + 1]
        finish = next_heading ? next_heading.options.fetch(:location) - 1 : lines.length
        @section_errors << "Duplicate section: #{name}" if sections.key?(name)
        @sections[name] = lines[(line + 1)...finish].join unless sections.key?(name)
        @section_ranges << [name, line + 1, finish]
      end
      # Section names inside fences, nested lists, tables or quotes are not sections.
      ast.children.select { |node| node.type == :header && node.options[:level] == 1 }.each do |_node|
        @section_errors << "Use metadata for the title; narrative sections use ## headings"
      end
    end
  end

  class Validator
    def initialize(team_ids: Proposals.team_ids, categories: CATEGORIES)
      @schema = SCHEMA
      @team_ids = team_ids
      @categories = Proposals.categories!(categories)
    end

    def validate(document, mode: :publication, previous: nil)
      raise ArgumentError, "Unknown validation mode" unless %i[draft publication].include?(mode)
      @errors, @draft = [], mode == :draft
      data = document.metadata
      @errors.concat(document.section_errors)
      @schema.fetch("required_text").each { |field| text(data[field], field, required: true) }
      %w[schema_version template_version].each do |field|
        next if @draft && blank?(data[field])
        error(field, "must be #{@schema.fetch(field)}") unless data[field] == @schema.fetch(field) && data[field].is_a?(Integer)
      end
      error("layout", "must be post") unless data["layout"] == "post" || (@draft && blank?(data["layout"]))
      enum(data["status"], "status", @schema.fetch("statuses"))
      enum(data["student_eligibility"], "student_eligibility", @schema.fetch("eligibilities").keys)
      if !blank?(data["proposal_id"]) && (!data["proposal_id"].is_a?(String) || !data["proposal_id"].match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/))
        error("proposal_id", "use lowercase letters, numbers and single hyphens")
      end
      integer(data["priority"], "priority", required: true)
      %w[featured published].each do |field|
        next unless data.key?(field) || field == "featured"
        next if @draft && blank?(data[field])
        error(field, "must be true or false") unless [true, false].include?(data[field])
      end
      error("published", "must be true or omitted for publication") if !@draft && data["published"] == false
      timestamp(data["date"], "date", utc: false)
      created = timestamp(data["created_at"], "created_at", utc: true)
      updated = timestamp(data["updated_at"], "updated_at", utc: true)
      error("updated_at", "must not precede created_at") if created && updated && updated < created
      %w[start_date_text workplace application_instructions].each { |field| text(data[field], field) if data.key?(field) }
      string_list(data["tags"], "tags", required: false)
      string_list(data["categories"], "categories", required: true)
      if data["categories"].is_a?(Array)
        category_ids = @categories.map { |category| category.fetch("id") }
        data["categories"].each do |id|
          next if @draft && blank?(id)
          error("categories", "unknown category #{id.inspect}; use an ID from _data/proposal_categories.yml") unless category_ids.include?(id)
        end
      end
      people(data["supervisors"], "supervisors")
      people(data["institutes"], "institutes", links: true)
      contact(data["contact"])
      email(data["submission_email"], "submission_email")
      workload(data["workload"])
      figure(data["figure"]) unless data["figure"].nil?
      attachments(data["attachments"]) if data.key?("attachments")
      url(data["permalink"], "permalink", local_only: true) if data.key?("permalink")
      allowed = @schema.fetch("required_sections") + @schema.fetch("optional_sections")
      document.sections.each_key { |name| error(name, "is not an allowed narrative section") unless allowed.include?(name) }
      @schema.fetch("required_sections").each do |name|
        content = document.sections[name].to_s
        error(name, "section is required") if !@draft && !meaningful?(content)
      end
      requirements = document.sections["Requirements"].to_s
      if meaningful?(requirements)
        ast = Kramdown::Document.new(requirements, input: "GFM").root
        has_list = ast.children.any? { |node| %i[ul ol].include?(node.type) && node.children.any? { |item| meaningful?(item_text(item)) } }
        error("Requirements", "must contain at least one list item") unless has_list
      end
      if previous
        if data['status'] != previous.metadata['status'] && !@schema.fetch('status_transitions').fetch(previous.metadata['status'], []).include?(data['status'])
          error('status', 'is not an allowed transition')
        end
        @schema.fetch("immutable_fields").each do |field|
          error(field, "cannot change on an existing proposal") unless data[field] == previous.metadata[field]
        end
        previous_updated = timestamp(previous.metadata["updated_at"], "previous.updated_at", utc: true)
        content_keys = (data.keys | previous.metadata.keys) - %w[priority updated_at]
        content_changed = document.body != previous.body || content_keys.any? { |key| data[key] != previous.metadata[key] }
        if content_changed && previous_updated && updated && updated <= previous_updated
          error("updated_at", "must advance after substantive content or status changes")
        elsif !content_changed && data["priority"] != previous.metadata["priority"] && data["updated_at"] != previous.metadata["updated_at"]
          error("updated_at", "must stay unchanged for a priority-only edit")
        end
      end
      @errors
    end

    def validate_set(documents, mode: :publication)
      results = documents.to_h { |path, document| [path, validate(document, mode: mode)] }
      documents.group_by { |_path, document| document.metadata["proposal_id"] }.each do |id, entries|
        next if blank?(id) || entries.length < 2
        entries.each { |path, _document| results[path] << "proposal_id: duplicate #{id.inspect}" }
      end
      documents.group_by { |_path, document| document.metadata['permalink'] }.each do |url, entries|
        next if blank?(url) || entries.length < 2
        entries.each { |path, _document| results[path] << 'permalink: duplicate public URL' }
      end
      results
    end

    private

    def error(field, message) = @errors << "#{field}: #{message}"
    def blank?(value) = value.nil? || (value.is_a?(String) && value.strip.empty?)

    def text(value, field, required: false)
      return if blank?(value) && (!required || @draft)
      error(field, required && blank?(value) ? "is required" : "must be text") unless value.is_a?(String) && (!required || !value.strip.empty?)
    end

    def enum(value, field, choices)
      return if blank?(value) && @draft
      error(field, "choose #{choices.join(', ')}") unless choices.include?(value)
    end

    def integer(value, field, required: false)
      return if blank?(value) && (!required || @draft)
      error(field, "must be an integer") unless value.is_a?(Integer)
    end

    def string_list(value, field, required:)
      return if value.nil? && (!required || @draft)
      unless value.is_a?(Array)
        error(field, "must be a list of text values")
        return
      end
      error(field, "must contain at least one item") if required && !@draft && value.empty?
      value.each_with_index { |item, i| text(item, "#{field}[#{i}]", required: true) }
      error(field, "must not contain duplicates") if value.uniq.length != value.length
    end

    def people(value, field, links: false)
      return if value.nil? && @draft
      unless value.is_a?(Array)
        error(field, "must be a list")
        return
      end
      error(field, "requires at least one entry") if value.empty? && !@draft
      value.each_with_index do |entry, index|
        path = "#{field}[#{index}]"
        unless entry.is_a?(Hash)
          error(path, "must contain named fields")
          next
        end
        text(entry["name"], "#{path}.name", required: true)
        text(entry["team_id"], "#{path}.team_id") if entry.key?("team_id")
        if field == "supervisors" && entry["team_id"].is_a?(String) && !entry["team_id"].empty? && !@team_ids.include?(entry["team_id"])
          error("#{path}.team_id", "no published team profile has ID #{entry['team_id'].inspect}")
        end
        url(entry["url"], "#{path}.url") if links && !blank?(entry["url"])
      end
    end

    def contact(value)
      return if value.nil? && @draft
      unless value.is_a?(Hash)
        error("contact", "must contain name and email")
        return
      end
      text(value["name"], "contact.name", required: true)
      email(value["email"], "contact.email")
      %w[address phone].each { |key| text(value[key], "contact.#{key}") if value.key?(key) }
    end

    def email(value, field)
      return if blank?(value) && @draft
      valid = Proposals.public_email?(value)
      error(field, "must be an email address") unless valid
    end

    def timestamp(value, field, utc:)
      return if blank?(value) && @draft
      if value.is_a?(String)
        date_parts = value.match(/\A(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
        raise ArgumentError unless date_parts && Date.valid_date?(*date_parts.captures.first(3).map(&:to_i)) && date_parts[4].to_i < 24 && date_parts[5].to_i < 60 && date_parts[6].to_i < 60
      end
      if value.is_a?(Time)
        time = value
      elsif value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})\z/)
        time = Time.iso8601(value)
      elsif !utc && value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\z/)
        time = Time.strptime(value, "%Y-%m-%d %H:%M:%S %z")
      end
      raise ArgumentError unless time && (!utc || time.utc_offset.zero?)
      time
    rescue ArgumentError, TypeError
      error(field, utc ? "use a UTC timestamp such as 2026-11-11T08:00:00Z" : "use a publication timestamp with timezone offset")
      nil
    end

    def workload(value)
      return if value.nil? && @draft
      unless value.is_a?(Array)
        error("workload", "must be a list of activity/percentage rows")
        return
      end
      error("workload", "requires at least one row") if value.empty? && !@draft
      percentages = []
      value.each_with_index do |row, i|
        unless row.is_a?(Hash)
          error("workload[#{i}]", "must contain activity and percentage")
          next
        end
        text(row["activity"], "workload[#{i}].activity", required: true)
        percentage = row["percentage"]
        next if percentage.nil? && @draft
        unless percentage.is_a?(Numeric) && percentage.finite? && percentage >= 0 && percentage <= 100
          error("workload[#{i}].percentage", "must be a number from 0 to 100")
          next
        end
        percentages << BigDecimal(percentage.to_s)
      end
      error("workload", "percentages must total 100%") if !@draft && percentages.length == value.length && percentages.sum != 100
    end

    def url(value, field, local_only: false)
      return if blank?(value) && @draft
      valid = Proposals.public_url?(value, local_only: local_only)
      error(field, local_only ? "must be a safe site-relative path starting with /" : "must be an HTTP(S) URL or a safe site-relative path") unless valid
    rescue URI::InvalidURIError
      error(field, "is not a valid URL")
    end

    def figure(value)
      unless value.is_a?(Hash)
        error("figure", "must contain src, alt and caption, or be omitted")
        return
      end
      url(value["src"], "figure.src")
      %w[alt caption].each { |key| text(value[key], "figure.#{key}", required: true) }
    end

    def attachments(value)
      unless value.is_a?(Array)
        error("attachments", "must be a list")
        return
      end
      value.each_with_index do |entry, i|
        unless entry.is_a?(Hash)
          error("attachments[#{i}]", "must contain title, url and mime_type")
          next
        end
        text(entry["title"], "attachments[#{i}].title", required: true)
        url(entry["url"], "attachments[#{i}].url")
        text(entry["mime_type"], "attachments[#{i}].mime_type", required: true)
        integer(entry["size"], "attachments[#{i}].size") if entry.key?("size")
        error("attachments[#{i}].size", "must not be negative") if entry["size"].is_a?(Integer) && entry["size"].negative?
      end
    end

    def item_text(node)
      return "" if %i[blank comment xml_comment].include?(node.type)
      value = node.type == :html_element ? "" : node.value.to_s
      [value, *node.children.map { |child| item_text(child) }].join(" ")
    end

    def meaningful?(content)
      ast = Kramdown::Document.new(content, input: "GFM").root
      ast.children.any? { |node| !%i[blank comment].include?(node.type) && !item_text(node).strip.empty? }
    end
  end
end

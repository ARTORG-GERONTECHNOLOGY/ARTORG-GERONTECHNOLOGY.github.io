# frozen_string_literal: true

require_relative "proposal"
require "cgi"
require "sanitize"
require "tzinfo"
require "tzinfo/data"

module Proposals
  # Shared public/preview/print renderer: author Markdown never evaluates Liquid.
  class Renderer
    HTML_RULES = {
      elements: %w[a abbr b blockquote br code dd del div dl dt em figcaption figure h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tfoot tr ul],
      attributes: {:all => %w[class title], "a" => %w[href], "img" => %w[src alt width height], "td" => %w[colspan rowspan], "th" => %w[colspan rowspan scope], "ol" => %w[start]},
      protocols: {"a" => {"href" => ["http", "https", "mailto", :relative]}, "img" => {"src" => ["https", :relative]}},
      remove_contents: %w[script style iframe object embed svg math template]
    }.freeze
    ZURICH = TZInfo::Timezone.get("Europe/Zurich")

    def initialize(baseurl: "")
      @baseurl = baseurl.to_s.sub(%r{/\z}, "")
    end

    def markdown(source)
      html = Kramdown::Document.new(source.to_s, input: "GFM", syntax_highlighter: "rouge", math_engine: "mathjax").to_html
      clean = Sanitize.fragment(html, HTML_RULES)
      return clean if @baseurl.empty?
      fragment = Nokogiri::HTML5.fragment(clean)
      fragment.css("a[href], img[src]").each do |node|
        attribute = node.name == "a" ? "href" : "src"
        path = node[attribute]
        node[attribute] = @baseurl + path if path.start_with?("/") && !path.start_with?("//")
      end
      fragment.to_html
    end

    def render(document)
      errors = Validator.new.validate(document)
      raise FormatError, errors.join("; ") unless errors.empty?
      sections = document.sections.to_h { |name, body| [name, markdown(body)] }.reject { |_name, html| html.strip.empty? }
      dates = %w[date created_at updated_at].to_h do |field|
        time = Proposals.time(document.metadata.fetch(field))
        [field, {"iso" => time.iso8601, "label" => ZURICH.to_local(time).strftime("%-d %B %Y")}]
      end
      {
        "sections" => sections, "application_html" => markdown(document.metadata["application_instructions"]), "dates" => dates,
        "category_labels" => document.metadata.fetch("categories").map { |id| CATEGORIES.find { |category| category.fetch("id") == id }.fetch("label") },
        "minutes" => [document.body.split.length / 180, 1].max,
        "narrative_html" => sections.map { |name, html| "<h2>#{CGI.escapeHTML(name)}</h2>\n#{html}" }.join("\n")
      }
    end
  end

  def self.time(value)
    return value if value.is_a?(Time)
    Time.iso8601(value)
  end

  # The schema defines priority/date/immutable-ID ordering for all discovery views.
  def self.ordered(entries)
    entries.sort do |left, right|
      comparison = 0
      SCHEMA.fetch("order").each do |rule|
        field = rule.fetch("field")
        a, b = left.fetch(field), right.fetch(field)
        a, b = time(a), time(b) if field == "date"
        comparison = a <=> b
        comparison = -comparison if rule.fetch("direction") == "descending"
        break unless comparison.zero?
      end
      comparison
    end
  end
end

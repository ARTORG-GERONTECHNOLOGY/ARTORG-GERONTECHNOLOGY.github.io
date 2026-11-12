# frozen_string_literal: true
require_relative "proposal-renderer"

module SiteContent
  def self.home!(data, source)
    raise Proposals::FormatError, "home: provide _data/home.yml" unless data.is_a?(Hash)
    text!(data["title"], "home.title")
    text!(data["introduction"], "home.introduction")
    raise Proposals::FormatError, "home.sections: provide named visibility settings" unless data["sections"].is_a?(Hash)
    %w[introduction proposals news].each do |key|
      unless [true, false].include?(data.fetch("sections", {})[key])
        raise Proposals::FormatError, "home.sections.#{key}: use true or false"
      end
    end
    %w[proposal_limit news_limit].each do |key|
      raise Proposals::FormatError, "home.#{key}: use a positive whole number" unless data[key].is_a?(Integer) && data[key].positive?
    end
    raise Proposals::FormatError, "home.links: use a list" unless data["links"].is_a?(Array)
    data["links"].each do |link|
      raise Proposals::FormatError, "home.links: provide label and url" unless link.is_a?(Hash)
      text!(link["label"], "home.links.label")
      raise Proposals::FormatError, "home.links.url: use a public URL or site path" unless Proposals.public_url?(link["url"])
    end
    image!(data["hero_image"], source)
  rescue URI::InvalidURIError
    raise Proposals::FormatError, "home.links.url: invalid URL"
  end

  def self.text!(value, field)
    raise Proposals::FormatError, "#{field}: provide nonempty text" unless value.is_a?(String) && !value.strip.empty?
  end

  def self.image!(value, source)
    return if value.nil?
    raise Proposals::FormatError, "image: provide src and alt or omit the image" unless value.is_a?(Hash)
    text!(value["alt"], "image.alt")
    unless Proposals.public_url?(value["src"], local_only: true) && File.file?(File.join(source, value["src"].sub(%r{^/}, "")))
      raise Proposals::FormatError, "image.src: use an existing site-relative asset path"
    end
  rescue URI::InvalidURIError
    raise Proposals::FormatError, "image.src: use an existing site-relative asset path"
  end

  def self.timestamp!(value, field)
    if value.is_a?(String)
      raise ArgumentError unless value.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})\z/)
      DateTime.iso8601(value)
    end
    raise ArgumentError unless value.is_a?(String) || value.is_a?(Time)
    Proposals.time(value)
  rescue ArgumentError, TypeError
    raise Proposals::FormatError, "#{field}: use a timestamp with timezone, such as 2026-11-12T09:00:00Z"
  end

  def self.news!(document, source)
    %w[title summary].each { |key| text!(document.metadata[key], key) }
    text!(document.body, "body")
    published = timestamp!(document.metadata["date"], "date")
    updated = timestamp!(document.metadata["updated_at"], "updated_at")
    raise Proposals::FormatError, "updated_at: cannot precede publication" if updated < published
    image!(document.metadata["image"], source)
  end
end

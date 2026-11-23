# frozen_string_literal: true
require_relative "proposal-renderer"
require_relative "media"

module SiteContent
  RETIRED_ABOUT_FIELD = 'eligibility_text'
  ABOUT_PARAGRAPHS = %w[overview group_text program_text].freeze

  # Update older drafts and revisions to the current About fields.
  def self.upgrade_about!(data)
    data.delete(RETIRED_ABOUT_FIELD)
    data.delete('corrections_text')
    previous_email = data.delete('corrections_email')
    data['contact_email'] ||= previous_email if previous_email
    if data.key?('institutional_links')
      links = data.delete('institutional_links')
      raise Proposals::FormatError, 'About links: expected a list' unless links.is_a?(Array)
      unless links.empty?
        text!(data['group_text'], 'about.group_text')
        citations = links.map do |link|
          raise Proposals::FormatError, 'About links: expected link text and URL' unless link.is_a?(Hash)
          text!(link['label'], 'About link text')
          about_link!(link['url'], 'about.group_text')
          label = link['label'].gsub(/[\\\[\]]/) { |character| '\\' + character }
          "[#{label}](#{link['url']})"
        end
        data['group_text'] = "#{data['group_text'].rstrip} See also #{citations.join(', ')}."
      end
    end
    return unless data['application_steps'].is_a?(Array)

    replacements = {
      'Browse available proposals and use the student-program filter to find projects open to your program.' =>
        'Browse available proposals. Use the category or publication year filters to narrow your search.',
      'Open a proposal and read its aim, methods, workload, requirements and student eligibility. Check any start-date or workplace information.' =>
        'Open a proposal and read its aim, methods, workload and requirements. Check any start-date or workplace information.'
    }
    data['application_steps'] = data['application_steps'].map { |step| replacements.fetch(step, step) }
  end

  def self.about_link!(url, field)
    return if url.is_a?(String) && url.start_with?('https://') && Proposals.public_url?(url)

    raise Proposals::FormatError, "#{field}: use a valid HTTPS address for links"
  rescue URI::InvalidURIError
    raise Proposals::FormatError, "#{field}: invalid link address"
  end

  def self.about_paragraph(value, field)
    text!(value, field)
    # About accepts links in a single paragraph. Treat raw HTML as literal text.
    markdown = value.gsub('<', '&lt;').gsub('>', '&gt;')
    html = Kramdown::Document.new(markdown, input: 'GFM').to_html
    fragment = Nokogiri::HTML5.fragment(html)
    elements = fragment.element_children
    unless elements.length == 1 && elements.first.name == 'p' && fragment.css('img').empty?
      raise Proposals::FormatError, "#{field}: use one paragraph of text with optional links"
    end
    fragment.css('a').each do |link|
      text!(link.text, field)
      about_link!(link['href'], field)
    end
    safe = Sanitize.fragment(html, elements: %w[p a], attributes: {'a' => %w[href]},
      protocols: {'a' => {'href' => %w[https]}})
    {'html' => safe, 'text' => Nokogiri::HTML5.fragment(safe).text.gsub(/\s+/, ' ').strip}
  end

  def self.about!(data)
    raise Proposals::FormatError, "about: provide named content fields" unless data.is_a?(Hash)
    raise Proposals::FormatError, "about.#{RETIRED_ABOUT_FIELD}: field is retired" if data.key?(RETIRED_ABOUT_FIELD)
    if data.key?('institutional_links')
      raise Proposals::FormatError, 'about: put institutional links in the paragraph text'
    end
    %w[title administration_text].each do |field|
      text!(data[field], "about.#{field}")
    end
    text!(data['contact_name'], 'about.contact_name') if data.key?('contact_name')
    steps = data["application_steps"]
    raise Proposals::FormatError, "about.application_steps: provide a nonempty list" unless steps.is_a?(Array) && !steps.empty?
    steps.each { |step| text!(step, "about.application_steps") }
    unless Proposals.public_email?(data["contact_email"])
      raise Proposals::FormatError, "about.contact_email: use an institutional email address"
    end
    ABOUT_PARAGRAPHS.to_h { |field| [field, about_paragraph(data[field], "about.#{field}")] }
  end

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
    result = Media.asset!(source, value["src"])
    raise Proposals::FormatError, "Image must use PNG, JPEG or WebP" if result["mime_type"] == "application/pdf"

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

  def self.news!(document, source, previous: nil)
    %w[title summary].each { |key| text!(document.metadata[key], key) }
    text!(document.body, "body")
    published = timestamp!(document.metadata["date"], "date")
    updated = timestamp!(document.metadata["updated_at"], "updated_at")
    timestamp!(document.metadata['created_at'],'created_at') if document.metadata.key?('created_at')
    raise Proposals::FormatError, "updated_at: cannot precede publication" if updated < published
    image!(document.metadata["image"], source)
    if previous
      %w[date created_at].each { |key| raise Proposals::FormatError,"#{key}: original publication/creation cannot change" if previous.metadata.key?(key) && document.metadata[key]!=previous.metadata[key] }
      changed=document.body!=previous.body || ((document.metadata.keys|previous.metadata.keys)-['updated_at']).any? { |key| document.metadata[key]!=previous.metadata[key] }
      raise Proposals::FormatError,'updated_at: must advance after substantive news edits' if changed && updated<=timestamp!(previous.metadata['updated_at'],'previous.updated_at')
    end
  end
end

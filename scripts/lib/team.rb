# frozen_string_literal: true
require_relative "site-content"

module Team
  def self.validate!(document, path, source, previous: nil)
    data = document.metadata
    id = data["team_id"]
    unless id.is_a?(String) && id.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && File.basename(path, ".md") == id
      raise Proposals::FormatError, "team_id: use a stable lowercase/hyphen ID matching the filename"
    end
    SiteContent.text!(data["name"], "name")
    raise Proposals::FormatError, "active: use true or false" unless [true, false].include?(data["active"])
    raise Proposals::FormatError, "display_order: use a whole number" unless data["display_order"].is_a?(Integer)
    if data["role"] && !data["role"].is_a?(String)
      raise Proposals::FormatError, "role: use confirmed role text, or omit it"
    end
    if data["email"] && data["email"] != "" && !Proposals.public_email?(data["email"])
      raise Proposals::FormatError, "email: use a public email address or omit it"
    end
    interests = data["interests"] || []
    unless interests.is_a?(Array) && interests.all? { |item| item.is_a?(String) && !item.strip.empty? }
      raise Proposals::FormatError, "interests: use a list of text values"
    end
    links = data["links"] || []
    raise Proposals::FormatError, "links: use a list" unless links.is_a?(Array)
    links.each do |link|
      raise Proposals::FormatError, "links: provide label and url" unless link.is_a?(Hash)
      SiteContent.text!(link["label"], "links.label")
      raise Proposals::FormatError, "links.url: use a public URL or site path" unless Proposals.public_url?(link["url"])
    end
    SiteContent.image!(data["portrait"], source)
    if data["permalink"] && data["permalink"] != "/team/#{id}/"
      raise Proposals::FormatError, "permalink: retain /team/#{id}/"
    end
    %w[created_at updated_at].each { |key| SiteContent.timestamp!(data[key],key) if data.key?(key) }
    if previous
      %w[team_id created_at].each { |key| raise Proposals::FormatError,"#{key}: profile identity/creation cannot change" if previous.metadata.key?(key) && data[key]!=previous.metadata[key] }
      changed=document.body!=previous.body || ((data.keys|previous.metadata.keys)-%w[display_order updated_at]).any? { |key| data[key]!=previous.metadata[key] }
      if changed
        updated=SiteContent.timestamp!(data['updated_at'],'updated_at')
        raise Proposals::FormatError,'updated_at: must advance after profile edits' if previous.metadata['updated_at'] && updated<=SiteContent.timestamp!(previous.metadata['updated_at'],'previous.updated_at')
      elsif data['display_order']!=previous.metadata['display_order'] && data['updated_at']!=previous.metadata['updated_at']
        raise Proposals::FormatError,'updated_at: must stay unchanged for profile-order edits'
      end
    end
  rescue URI::InvalidURIError
    raise Proposals::FormatError, "links.url: invalid URL"
  end

  def self.ordered(profiles)
    profiles.sort_by { |profile| [profile.data.fetch("display_order"), profile.data.fetch("name").downcase, profile.data.fetch("team_id")] }
  end
end

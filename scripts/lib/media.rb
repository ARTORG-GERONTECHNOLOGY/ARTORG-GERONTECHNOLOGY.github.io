# frozen_string_literal: true
require_relative "proposal"

module Media
  RULES = YAML.safe_load_file(File.join(Proposals::ROOT, "_data/media.yml"))

  # Shared by static publication checks and the trusted upload service.
  # Validate bytes before accepting a destination; never infer type from its name alone.
  def self.validate_bytes!(filename, bytes, declared_type:)
    unless filename.is_a?(String) && !filename.match?(/[\\\x00-\x1f\x7f\/:<>"|?*]/)
      raise Proposals::FormatError, "Use a safe media filename, not a path"
    end
    extension = File.extname(filename).downcase
    expected = RULES.fetch("types")[extension]
    raise Proposals::FormatError, "Unsupported media extension" unless expected
    raise Proposals::FormatError, "Media MIME type disagrees with extension" unless declared_type == expected
    raise Proposals::FormatError, "Media exceeds per-file size limit" if bytes.bytesize > RULES.fetch("max_file_bytes")
    data = bytes.b
    valid = case expected
            when "image/png" then data.start_with?("\x89PNG\r\n\x1a\n".b)
            when "image/jpeg" then data.start_with?("\xff\xd8\xff".b)
            when "image/webp" then data.start_with?("RIFF") && data.byteslice(8, 4) == "WEBP"
            when "application/pdf" then data.start_with?("%PDF-")
            end
    raise Proposals::FormatError, "Media signature disagrees with declared type" unless valid
    {"mime_type" => expected, "size" => data.bytesize}
  end

  def self.validate_file!(source, url, declared_type:)
    unless Proposals.public_url?(url, local_only: true) && url.start_with?("/assets/")
      raise Proposals::FormatError, "Use a safe site-relative asset path"
    end
    root = File.realpath(source)
    path = File.realpath(File.join(root, url.delete_prefix("/")))
    unless path.start_with?(root + File::SEPARATOR) && File.file?(path)
      raise Proposals::FormatError, "Media must stay within the site source"
    end
    raise Proposals::FormatError, "Media exceeds per-file size limit" if File.size(path) > RULES.fetch("max_file_bytes")
    validate_bytes!(File.basename(url), File.binread(path), declared_type: declared_type)
  rescue Errno::ENOENT
    raise Proposals::FormatError, "Referenced media file does not exist: #{url}"
  end
  def self.https?(url)
    parsed = URI.parse(url) if url.is_a?(String)
    parsed.is_a?(URI::HTTPS) && parsed.host && !parsed.userinfo && !url.match?(/[\s<>]/)
  rescue URI::InvalidURIError
    false
  end

  def self.asset!(source, url, mime: nil)
    if url.is_a?(String) && url.start_with?("/") && !url.start_with?("//")
      expected = RULES.fetch("types")[File.extname(url).downcase]
      validate_file!(source, url, declared_type: mime || expected)
    else
      raise Proposals::FormatError, "External media requires an explicit HTTPS URL" unless https?(url)
      raise Proposals::FormatError, "Temporary Actions artifacts are not permanent media" if url.match?(%r{/actions/(?:runs/[^/]+/)?artifacts/})
      raise Proposals::FormatError, "External attachments require a supported MIME type" if mime && !RULES.fetch("types").value?(mime)
      extension = File.extname(URI.parse(url).path).downcase
      if mime && !extension.empty? && RULES.fetch("types")[extension] != mime
        raise Proposals::FormatError, "External attachment extension disagrees with declared type"
      end
      {"mime_type" => mime, "size" => nil}
    end
  end

  def self.proposal!(data, source)
    files = {}
    if data["figure"]
      figure = data.fetch("figure")
      result = asset!(source, figure.fetch("src"))
      raise Proposals::FormatError, "Figure must be an image" if result["mime_type"] == "application/pdf"
      files[figure.fetch("src")] = result["size"]
    end
    attachments = (data["attachments"] || []).map do |item|
      result = asset!(source, item.fetch("url"), mime: item.fetch("mime_type"))
      if item["size"] && result["size"] && item["size"] != result["size"]
        raise Proposals::FormatError, "Attachment size metadata disagrees with file"
      end
      raise Proposals::FormatError, "External attachments require a declared byte size" if result["size"].nil? && !item["size"].is_a?(Integer)
      size = result["size"] || item["size"]
      raise Proposals::FormatError, "Attachment exceeds per-file size limit" if size > RULES.fetch("max_file_bytes")
      files[item.fetch("url")] = size
      attachment_view(item, size)
    end
    (data["media"] || []).each do |item|
      raise Proposals::FormatError, "Media needs a title" unless item.is_a?(Hash) && item["title"].is_a?(String) && !item["title"].strip.empty?
      raise Proposals::FormatError, "Media requires HTTPS" unless https?(item["url"])
      raise Proposals::FormatError, "Unsupported media kind" unless %w[link video].include?(item["kind"])
      next unless item["kind"] == "video"
      poster = item["poster"]
      raise Proposals::FormatError, "Video requires a poster" unless poster.is_a?(String)
      result = asset!(source, poster)
      raise Proposals::FormatError, "Video poster must be an image" if result["mime_type"] == "application/pdf"
      files[poster] = result["size"]
      raise Proposals::FormatError, "Video requires a transcript" unless item["transcript"].is_a?(String) && !item["transcript"].strip.empty?
      if item["captions"] && !https?(item["captions"])
        raise Proposals::FormatError, "Caption track requires HTTPS"
      end
    end
    raise Proposals::FormatError, "Proposal exceeds combined media size limit" if files.values.compact.sum > RULES.fetch("max_proposal_bytes")
    attachments
  end

  def self.attachment_view(item, size)
    item.merge('size' => size, 'type_label' => item.fetch('mime_type').split('/').last.upcase, 'size_label' => size ? format('%.1f KB', size / 1024.0) : 'download')
  end

end

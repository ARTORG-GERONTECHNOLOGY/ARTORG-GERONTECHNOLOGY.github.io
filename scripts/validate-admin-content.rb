# frozen_string_literal: true
require 'bundler/setup'
require 'json'
require 'tmpdir'
require 'fileutils'
require_relative 'lib/team'
require_relative 'lib/proposal-lifecycle'

# This process uses only installed trusted validators. Author files are never
# loaded as Ruby, Liquid, plugins or configuration for a Jekyll build.
begin
  payload = JSON.parse(STDIN.read(64 * 1024 * 1024 + 1))
  policy = JSON.parse(File.read(File.join(Proposals::ROOT, 'admin-service/content-policy.json')))
  editable = ->(path) { path.is_a?(String) && path.length <= 240 && !path.match?(/[\x00-\x20\x7f\\%]/) && policy['editablePatterns'].any? { |pattern| Regexp.new(pattern).match?(path) } }
  assets = ->(path) { path.is_a?(String) && !path.match?(/[\x00-\x20\x7f\\%]/) && (path.split('/') & ['.', '..']).empty? && Regexp.new(policy['assetPattern']).match?(path) }
  files = payload.fetch('files'); previous = payload.fetch('previous')
  raise Proposals::FormatError, 'Unsafe content path' unless files.keys.all? { |path| editable.call(path) } && previous.keys.all? { |path| editable.call(path) }
  errors = {}
  Dir.mktmpdir('ger-content-validation-') do |source|
    files.each do |path, content|
      raise Proposals::FormatError, 'Content must be UTF-8 text' unless content.is_a?(String) && content.valid_encoding? && content.bytesize <= policy['maxTextBytes']
      destination = File.expand_path(path, source)
      raise Proposals::FormatError, 'Unsafe content path' unless destination.start_with?(source + File::SEPARATOR)
      FileUtils.mkdir_p(File.dirname(destination)); File.write(destination, content, encoding: 'UTF-8')
    end
    payload.fetch('assets').each do |item|
      raise Proposals::FormatError, 'Unsafe asset path' unless assets.call(item['path'])
      destination = File.expand_path(item['path'], source)
      raise Proposals::FormatError, 'Unsafe asset path' unless destination.start_with?(source + File::SEPARATOR)
      FileUtils.mkdir_p(File.dirname(destination)); File.binwrite(destination, item.fetch('bytes').unpack1('m0'))
    end
    categories = Proposals.categories!(Proposals.load_yaml(files.fetch('_data/proposal_categories.yml'), mapping: false))
    profiles = files.select { |path, _| path.start_with?('_team/') }.to_h { |path, content| [path, Proposals::Document.parse(content)] }
    team_ids = profiles.values.map { |document| document.metadata['team_id'] }
    raise Proposals::FormatError, 'Duplicate team IDs' unless team_ids.uniq.length == team_ids.length
    proposals = files.select { |path, _| path.start_with?('_posts/') }.to_h { |path, content| [path, Proposals::Document.parse(content)] }
    removed = Proposals.load_yaml(files.fetch('_data/removed_proposals.yml', '[]'), mapping: false)
    old_proposals = previous.select { |path, _| path.start_with?('_posts/') }.to_h { |path, content| [path, Proposals::Document.parse(content)] }
    Proposals.removed!(removed, proposals, previous: old_proposals)
    previous_removed = Proposals.load_yaml(previous.fetch('_data/removed_proposals.yml', '[]'), mapping: false)
    removed.each do |entry|
      deleted = old_proposals.any? { |path, document| !proposals.key?(path) && %w[proposal_id permalink].all? { |key| document.metadata[key] == entry[key] } }
      raise Proposals::FormatError, 'New removed-URL records must describe a deleted proposal' unless previous_removed.include?(entry) || deleted
    end
    previous_removed.each do |entry|
      restored = proposals.values.any? { |document| %w[proposal_id permalink].all? { |key| document.metadata[key] == entry[key] } }
      raise Proposals::FormatError, 'Keep removed URLs reserved unless restoring the same proposal' unless removed.include?(entry) || restored
    end
    validator = Proposals::Validator.new(team_ids: team_ids, categories: categories)
    errors.merge!(validator.validate_set(proposals).reject { |_, messages| messages.empty? })
    proposals.each do |path, document|
      messages = []
      if previous[path]
        messages.concat(validator.validate(document, previous: Proposals::Document.parse(previous[path])))
      elsif Proposals.time(document.metadata['date']).strftime('%Y-%m-%d') != File.basename(path)[0, 10]
        messages << 'filename: new proposal filenames must match the initial publication date'
      end
      url = document.metadata['permalink']
      if !url.is_a?(String) || !url.end_with?('/') || url == '/' || policy['reservedProposalPrefixes'].any? { |prefix| url.start_with?(prefix) }
        messages << 'permalink: provide a stable proposal URL outside reserved site routes'
      end
      begin Media.proposal!(document.metadata, source); rescue Proposals::FormatError => error; messages << error.message; end
      errors[path] = ((errors[path] || []) + messages).uniq unless messages.empty?
    end
    files.each do |path, content|
      begin
        if path.end_with?('.md')
          document = Proposals::Document.parse(content)
          data = document.metadata
          expected_layout = path.start_with?('_posts/') ? 'post' : path.start_with?('_team/') ? 'team' : 'news'
          raise Proposals::FormatError, 'Do not select another layout or enable author execution' if data['layout'] && data['layout'] != expected_layout || (data.keys & %w[render_with_liquid output redirect_to]).any?
          raise Proposals::FormatError, 'Private/unpublished drafts must stay outside the public repository' if data.key?('published') && data['published'] != true
          raise Proposals::FormatError, 'Proposals require layout: post' if path.start_with?('_posts/') && data['layout'] != 'post'
          if path.start_with?('_team/')
            Team.validate!(document, File.join(source, path), source)
          elsif path.start_with?('_news/')
            SiteContent.news!(document, source)
            stable = '/news/' + File.basename(path, '.md') + '/'
            raise Proposals::FormatError, 'Retain the news URL derived from its immutable filename' if data['permalink'] && data['permalink'] != stable
          end
        elsif path == '_data/home.yml'
          SiteContent.home!(Proposals.load_yaml(content), source)
        elsif path == '_data/about.yml'
          SiteContent.about!(Proposals.load_yaml(content))
        end
      rescue Proposals::FormatError => error
        (errors[path] ||= []) << error.message
      end
    end
  end
  puts JSON.generate({'valid' => errors.empty?, 'errors' => errors})
rescue StandardError
  puts JSON.generate({'valid' => false, 'errors' => {'content' => ['Unable to parse or validate the supplied content snapshot']}})
end

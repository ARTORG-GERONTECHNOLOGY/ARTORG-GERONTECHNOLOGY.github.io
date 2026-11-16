# frozen_string_literal: true
require 'bundler/setup'
require 'json'
require 'securerandom'
require 'tmpdir'
require 'fileutils'
require 'jekyll'
require_relative 'lib/proposal-renderer'
require_relative 'lib/team'
require_relative 'lib/media'
require_relative 'lib/proposal-lifecycle'
require_relative 'lib/content-revisions'

def field_errors(messages)
  messages.each_with_object({}) do |message, result|
    field, text = message.split(': ', 2)
    (result[text ? field : 'narrative'] ||= []) << (text || message)
  end
end

begin
  input = JSON.parse(STDIN.read(64 * 1024 * 1024 + 1))
  if input['operation'] == 'removed_list'
    records = Proposals.load_yaml(input.fetch('source', '[]'), mapping: false)
    Proposals.removed!(records, {})
    puts JSON.generate({'records'=>records}); exit
  end
  if input['operation'] == 'restore_prepare'
    result = Proposals.restoration(input['current'], input.fetch('historical'), input.fetch('baseline'), prepared_at: input['preparedAt'])
    if input['removedSource']
      records = Proposals.load_yaml(input['removedSource'], mapping: false)
      records.reject! { |record| record['source_path'] == input.fetch('path') }
      result['removedSource'] = YAML.dump(records)
    end
    puts JSON.generate(result); exit
  end
  if input['operation'] == 'revision_diff'
    puts JSON.generate(Proposals.revision_diff(input['before'], input['after'], input.fetch('path')))
    exit
  end
  if input['operation'] == 'lifecycle'
    documents = input.fetch('proposals').to_h { |item| [item.fetch('path'), Proposals::Document.parse(item.fetch('source'))] }
    puts JSON.generate(Proposals.lifecycle(documents, input.fetch('actionData'), input.fetch('removedSource', '[]')))
    exit
  end
  if input['operation'] == 'bootstrap'
    proposals = input.fetch('proposals').map do |item|
      document = Proposals::Document.parse(item.fetch('source'))
      item.merge('metadata' => document.metadata.transform_values { |value| value.is_a?(Time) ? value.iso8601 : value }, 'sections' => document.sections)
    end
    indexed = proposals.to_h { |item| [item['metadata']['proposal_id'], item] }
    proposals = Proposals.ordered(proposals.map { |item| item['metadata'] }).map { |metadata| indexed.fetch(metadata['proposal_id']) }
    puts JSON.generate({'proposals' => proposals, 'categories' => Proposals.categories!(Proposals.load_yaml(input.fetch('categories'), mapping: false)),
      'statuses' => Proposals::SCHEMA['statuses'], 'transitions' => Proposals::SCHEMA['status_transitions'], 'eligibilities' => Proposals::SCHEMA['eligibilities']})
    exit
  end
  source = input.fetch('source')
  document = Proposals::Document.parse(source)
  context = document.metadata.delete('_editor_draft') || input.fetch('context', {})
  raise Proposals::FormatError, 'Invalid downloaded draft revision information' unless context.is_a?(Hash) && (context.keys - %w[path sha baseCommit]).empty? && %w[sha baseCommit].all? { |key| context[key].nil? || context[key].is_a?(String) && context[key].match?(/\A[a-f0-9]{40}\z/) }
  patch = input.fetch('patch', {})
  fields = %w[title summary categories tags language status student_eligibility priority featured supervisors institutes contact workload start_date_text workplace application_instructions figure attachments media]
  raise Proposals::FormatError, 'Unsupported editor field' unless patch.is_a?(Hash) && (patch.keys - fields).empty?
  patch.each { |key, value| value.nil? ? document.metadata.delete(key) : document.metadata[key] = value }
  document.replace_sections(input.fetch('sections', {}))
  previous = input['originalSource'] && Proposals::Document.parse(input['originalSource'])
  now = Time.now.utc.iso8601
  if input['operation'] == 'new' || (input['operation'] == 'parse' && document.metadata['proposal_id'].to_s.empty?)
    document.metadata['proposal_id'] = 'ger-' + SecureRandom.hex(16)
    document.metadata['created_at'] = now
    document.metadata['updated_at'] = now
    document.metadata['permalink'] = '/projects/' + document.metadata['proposal_id'] + '/'
  end
  publication = Proposals::Document.parse(document.serialize)
  if previous && !previous.metadata['date'].to_s.empty?
    %w[proposal_id permalink date created_at].each { |field| publication.metadata[field] = previous.metadata[field] }
    previous.metadata.key?('published') ? publication.metadata['published'] = previous.metadata['published'] : publication.metadata.delete('published')
    content_keys = (publication.metadata.keys | previous.metadata.keys) - %w[priority updated_at published _editor_draft]
    changed = publication.body != previous.body || content_keys.any? { |key| publication.metadata[key] != previous.metadata[key] }
    publication.metadata['updated_at'] = changed ? [Time.now.utc, Proposals.time(previous.metadata['updated_at']) + 1].max.iso8601 : previous.metadata['updated_at']
  else
    publication.metadata['date'] = now
    publication.metadata['updated_at'] = now
    publication.metadata['published'] = true
  end
  categories = Proposals.categories!(Proposals.load_yaml(input.fetch('categories'), mapping: false))
  team = input.fetch('team', {}).to_h { |path, text| [path, Proposals::Document.parse(text).metadata] }
  validator = Proposals::Validator.new(team_ids: team.values.map { |person| person['team_id'] }, categories: categories)
  errors = field_errors(validator.validate(publication, previous: previous))
  operation = input['operation']
  if operation == 'publish'
    document = publication
  elsif operation == 'download'
    document.metadata['published'] = false
    document.metadata['_editor_draft'] = context
  end
  result = {'source' => document.serialize, 'metadata' => document.metadata.reject { |key, _| key == '_editor_draft' }.transform_values { |value| value.is_a?(Time) ? value.iso8601 : value }, 'sections' => document.sections, 'context' => context, 'errors' => errors, 'ready' => errors.empty?}
  if operation == 'preview'
    renderer = Proposals::Renderer.new(team_ids: team.values.map { |person| person['team_id'] }, categories: categories)
    draft_errors = validator.validate(document, mode: :draft)
    unless draft_errors.empty?
      result['previewErrors'] = field_errors(draft_errors)
      puts JSON.generate(result); exit
    end
    rendered = renderer.render(document, mode: :draft)
    Dir.mktmpdir('ger-proposal-preview-') do |temporary|
      %w[_includes _sass css assets].each do |directory|
        original = File.join(Proposals::ROOT, directory)
        FileUtils.cp_r(original, temporary) if File.directory?(original)
      end
      FileUtils.mkdir_p(File.join(temporary, '_layouts'))
      FileUtils.cp(File.join(Proposals::ROOT, '_layouts/proposal-preview.html'), File.join(temporary, '_layouts/proposal-preview.html'))
      site = Jekyll::Site.new(Jekyll.configuration('source' => temporary, 'destination' => File.join(temporary, '_output'), 'config' => [], 'plugins' => [], 'plugins_dir' => '_disabled_plugins', 'baseurl' => '', 'url' => '', 'disable_disk_cache' => true, 'quiet' => true, 'exclude' => ['_disabled_plugins']))
      site.reset
      site.read
      site.data['program'] = YAML.safe_load_file(File.join(Proposals::ROOT, '_data/program.yml'))
      site.data['proposal_schema'] = Proposals::SCHEMA
      view = Jekyll::PageWithoutAFile.new(site, temporary, '', 'index.html')
      view.data = document.metadata.merge('layout' => 'proposal-preview', 'permalink' => '/index.html', 'render_with_liquid' => false, 'proposal' => rendered)
      view.data['title'] = 'Untitled proposal' if view.data['title'].to_s.strip.empty?
      view.data['status'] = 'draft' if view.data['status'].to_s.strip.empty?
      view.data['supervisor_profiles'] = (view.data['supervisors'] || []).map do |person|
        id = person['team_id']; {'name' => person['name'], 'url' => team.values.any? { |profile| profile['team_id'] == id } ? '/team/' + id + '/' : nil}
      end
      view.data['public_attachments'] = (document.metadata['attachments'] || []).map { |file| Media.attachment_view(file, input.fetch('assetSizes', {})[file['url'].to_s.delete_prefix('/')] || file['size']) }
      site.pages << view
      site.generate
      site.render
      site.cleanup
      site.write
      result['html'] = File.read(File.join(site.dest, 'index.html'))
      result['css'] = File.read(File.join(site.dest, 'css/style.css'))
    end
  end
  puts JSON.generate(result)
rescue StandardError => error
  puts JSON.generate({'error' => 'invalid_editor_content', 'message' => 'The proposal could not be prepared.', 'errors' => {'content' => [error.is_a?(Proposals::FormatError) ? error.message : 'Unable to parse the proposal']}})
end

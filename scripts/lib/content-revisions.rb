# frozen_string_literal: true
require_relative 'proposal-lifecycle'
require_relative 'site-content'
require 'open3'
require 'tmpdir'

module Proposals
  def self.restoration(current_source, historical_source, baseline_source, prepared_at: nil)
    historical = Document.parse(historical_source)
    historical.metadata.delete(Document::RETIRED_FIELD)
    baseline = Document.parse(baseline_source)
    SCHEMA.fetch('immutable_fields').each do |field|
      raise FormatError, "#{field}: historical identity does not match this proposal" unless historical.metadata[field] == baseline.metadata[field]
    end
    current = current_source && Document.parse(current_source)
    historical.metadata['priority'] = current ? current.metadata['priority'] : baseline.metadata['priority']
    # Restore content/status, retain original identity and current ordering.
    SCHEMA.fetch('immutable_fields').each { |field| historical.metadata[field] = baseline.metadata[field] }
    raise FormatError, 'Private or unpublished historical drafts cannot be restored' if historical.metadata.key?('_editor_draft') || historical.metadata['published'] == false
    baseline.metadata.key?('published') ? historical.metadata['published'] = baseline.metadata['published'] : historical.metadata.delete('published')
    changed = !current || historical.body != current.body || ((historical.metadata.keys | current.metadata.keys) - ['updated_at']).any? { |key| historical.metadata[key] != current.metadata[key] }
    moment = prepared_at ? Time.iso8601(prepared_at) : Time.now.utc
    historical.metadata['updated_at'] = changed ? [moment, time(baseline.metadata['updated_at']) + 1].max.iso8601 : current.metadata['updated_at']
    {'source' => historical.serialize, 'changed' => changed}
  end

  def self.revision_projection(source, path)
    return nil if source.nil?
    if path.end_with?('.md')
      document = Document.parse(source)
      metadata = Marshal.load(Marshal.dump(document.metadata))
      metadata.delete(Document::RETIRED_FIELD) if path.start_with?('_posts/')
      %w[date created_at updated_at].each do |field|
        begin; metadata[field] = time(metadata[field]).iso8601 if metadata[field]; rescue ArgumentError, TypeError; end
      end
      {'metadata' => metadata, 'body' => document.body}
    else
      data = load_yaml(source, mapping: !%w[_data/proposal_categories.yml _data/removed_proposals.yml].include?(path))
      SiteContent.upgrade_about!(data) if path == '_data/about.yml'
      {'metadata' => data.is_a?(Hash) ? data : {'entries'=>data}, 'body'=>''}
    end
  end

  def self.revision_diff(before, after, path)
    warning = nil
    begin
      old = revision_projection(before, path); current = revision_projection(after, path)
    rescue FormatError
      warning = 'This revision uses an invalid or older content format. Automatic restoration may be unavailable.'
      old = before && {'metadata'=>{},'body'=>before}; current = after && {'metadata'=>{},'body'=>after}
    end
    fields = ((old&.fetch('metadata') || {}).keys | (current&.fetch('metadata') || {}).keys).sort.filter_map do |field|
      a = old&.dig('metadata',field); b = current&.dig('metadata',field)
      {'field'=>field,'before'=>a,'after'=>b} unless a == b
    end
    previous_text = old&.fetch('body').to_s; current_text = current&.fetch('body').to_s
    narrative = []
    if previous_text != current_text
      Dir.mktmpdir('ger-revision-diff-') do |directory|
        a = File.join(directory,'before.md'); b = File.join(directory,'after.md')
        File.write(a,previous_text,encoding:'UTF-8'); File.write(b,current_text,encoding:'UTF-8')
        output, _error, status = Open3.capture3('git','--no-pager','diff','--no-index','--no-color','--no-ext-diff','--no-textconv','--unified=3','--',a,b)
        raise FormatError, 'Text comparison is unavailable' unless [0,1].include?(status.exitstatus)
        narrative = output.lines.drop_while { |line| !line.start_with?('@@') }.map(&:chomp)
      end
    end
    changed = fields.map { |entry| entry['field'] }
    summary = if before.nil? then 'Content created'
              elsif after.nil? then 'Content deleted'
              elsif changed.empty? && narrative.empty? then 'No content differences'
              elsif narrative.empty? && (changed - %w[priority]).empty? then 'Order changed'
              elsif narrative.empty? && (changed - %w[status updated_at]).empty? && changed.include?('status') then "Status changed: #{old.dig('metadata','status')} → #{current.dig('metadata','status')}"
              elsif !narrative.empty? then 'Text updated' + (changed.empty? ? '' : ' and metadata changed')
              else 'Metadata updated: ' + changed.first(5).join(', ')
              end
    {'summary'=>summary,'metadata'=>fields,'narrative'=>narrative,'warning'=>warning}
  end
end

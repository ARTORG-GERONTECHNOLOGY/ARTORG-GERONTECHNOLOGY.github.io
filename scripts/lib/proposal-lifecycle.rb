# frozen_string_literal: true
require_relative 'proposal-renderer'
require 'json'

module Proposals
  # Removed URLs are reserved, with no scientific text or personal information.
  def self.removed!(entries, documents, previous: {})
    raise FormatError, 'Removed proposals must be a list' unless entries.is_a?(Array)
    entries.each do |entry|
      raise FormatError, 'Invalid removed-proposal record' unless entry.is_a?(Hash) && entry.keys.sort == %w[permalink proposal_id removed_at] && entry['proposal_id'].is_a?(String) && entry['proposal_id'].match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && public_url?(entry['permalink'], local_only: true) && entry['permalink'].end_with?('/') && entry['permalink'] != '/'
      reserved = JSON.parse(File.read(File.join(ROOT, 'admin-service/content-policy.json'))).fetch('reservedProposalPrefixes')
      raise FormatError, 'Removed URL uses a reserved site route' if reserved.any? { |prefix| entry['permalink'].start_with?(prefix) }
      raise FormatError, 'Invalid removal timestamp' unless entry['removed_at'].is_a?(String) && entry['removed_at'].end_with?('Z') && Time.iso8601(entry['removed_at'])
    end
    %w[proposal_id permalink].each do |key|
      raise FormatError, "Duplicate removed-proposal #{key}" unless entries.map { |entry| entry[key] }.uniq.length == entries.length
      raise FormatError, "A current proposal conflicts with a removed #{key}" if documents.values.any? { |document| entries.any? { |entry| entry[key] == document.metadata[key] } }
    end
    previous.each do |path, document|
      next if documents.key?(path)
      raise FormatError, 'Deleting a proposal requires its removed-URL record' unless entries.any? { |entry| %w[proposal_id permalink].all? { |key| entry[key] == document.metadata[key] } }
    end
    entries
  rescue ArgumentError
    raise FormatError, 'Invalid removal timestamp'
  end

  def self.lifecycle(documents, input, removed_source)
    action = input.fetch('action')
    changes = []; deletions = []
    if action == 'order'
      order = input.fetch('order')
      raise FormatError, 'Reordering requires every current proposal exactly once' unless order.is_a?(Array) && order.length == documents.length && order.uniq.length == order.length && order.sort == documents.keys.sort
      order.each_with_index do |path, index|
        document = documents.fetch(path)
        priority = (index + 1) * 10
        next if document.metadata['priority'] == priority
        document.metadata['priority'] = priority
        changes << {'path' => path, 'content' => document.serialize}
      end
    else
      path = input.fetch('path'); document = documents.fetch(path)
      if action == 'status'
        status = input.fetch('status')
        raise FormatError, 'Choose an allowed status transition' unless SCHEMA.fetch('status_transitions').fetch(document.metadata['status']).include?(status)
        document.metadata['status'] = status
        document.metadata['updated_at'] = [Time.now.utc, time(document.metadata['updated_at']) + 1].max.iso8601
        changes << {'path' => path, 'content' => document.serialize}
      elsif action == 'delete'
        raise FormatError, 'Confirm the exact proposal before deleting' unless input['confirmation'] == document.metadata['proposal_id']
        removed = Proposals.load_yaml(removed_source, mapping: false)
        removed << document.metadata.slice('proposal_id', 'permalink').merge('removed_at' => Time.now.utc.iso8601)
        changes << {'path' => '_data/removed_proposals.yml', 'content' => YAML.dump(removed)}
        deletions << path
      else
        raise FormatError, 'Unknown proposal action'
      end
    end
    {'changes' => changes, 'deletions' => deletions}
  rescue KeyError
    raise FormatError, 'The proposal or required action information is missing'
  end
end

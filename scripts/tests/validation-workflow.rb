# frozen_string_literal: true
require 'yaml'
workflow = YAML.safe_load_file(File.expand_path('../../.github/workflows/validate.yml', __dir__))
events = workflow.fetch('on')
raise 'Unsafe or missing validation event' unless events.keys.sort == %w[merge_group pull_request push workflow_dispatch]
raise 'Only main pushes may trigger validation' unless events.dig('push', 'branches') == ['main']
raise 'PR checks must not be skipped by file/branch filters' unless events['pull_request'].nil?
raise 'Validation requires read-only repository access' unless workflow['permissions'] == {'contents' => 'read'}
raise 'Ruby dependency lock must be frozen' unless workflow.fetch('env')['BUNDLE_FROZEN'] == 'true'
job = workflow.fetch('jobs').fetch('validate')
raise 'Required check name changed' unless job['name'] == 'Website validation'
raise 'No deployment environment belongs in validation' if job.key?('environment')
steps = job.fetch('steps')
steps.select { |step| step.key?('uses') }.each do |step|
  raise 'Action must be pinned to a full commit SHA' unless step['uses'].match?(/@[a-f0-9]{40}\z/)
end
checkout = steps.find { |step| step.fetch('uses', '').start_with?('actions/checkout@') }
raise 'Checkout must not retain Git credentials' unless checkout&.dig('with', 'persist-credentials') == false
raise 'CI must check that Jekyll can build the site' unless steps.last['run'] == 'bundle exec jekyll build --disable-disk-cache'
raise 'Validation must not receive production secrets' if workflow.to_s.match?(/\$\{\{\s*secrets\./)
puts 'Validation workflow contracts pass: stable required check, pinned actions, unfiltered PRs, read-only credentials and a Jekyll build.'

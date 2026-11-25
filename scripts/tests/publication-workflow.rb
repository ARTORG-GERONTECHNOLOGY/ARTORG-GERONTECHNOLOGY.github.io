# frozen_string_literal: true
require 'yaml'
require 'json'
root=File.expand_path('../..',__dir__)
accept=YAML.safe_load_file(File.join(root,'.github/workflows/publish-content.yml'))
pages=YAML.safe_load_file(File.join(root,'.github/workflows/publish-pages.yml'))
validation=YAML.safe_load_file(File.join(root,'.github/workflows/validate.yml'))
[accept,pages].each do |workflow|
  raise 'Publication must start read-only' unless workflow['permissions']=={'contents'=>'read'}
  raise 'Do not cancel an active publication' unless workflow.dig('concurrency','cancel-in-progress')==false
  workflow.fetch('jobs').each_value do |job|
    job.fetch('steps').each do |step|
      raise 'Action must be fully pinned' if step['uses'] && !step['uses'].match?(/@[a-f0-9]{40}\z/)
      raise 'Do not retain checkout credentials' if step.fetch('uses','').start_with?('actions/checkout@') && step.dig('with','persist-credentials')!=false
      raise 'Untrusted values must not enter command text' if step.fetch('run','').include?('${{')
    end
  end
end
raise 'Use completed validation runs' unless accept.dig('on','workflow_run')=={'workflows'=>['Validate website'],'types'=>['completed'],'branches'=>['content/staff','publication/staff-**']}
raise 'Publication reports require the checked revision in the acceptance run title' unless accept['run-name']=='Accept checked revision ${{ github.event.workflow_run.head_sha || github.sha }}'
job=accept.fetch('jobs').fetch('accept')
raise 'Staff publication must be explicitly enabled' unless job['if'].include?("vars.ENABLE_STAFF_PUBLICATION == 'true'")
raise 'Publisher has only merge/dispatch and check-read permissions' unless job['permissions']=={'contents'=>'write','actions'=>'write','checks'=>'read'}
checkout=job['steps'].find { |step| step.fetch('uses','').start_with?('actions/checkout@') }
raise 'Privileged publisher must use trusted main code' unless checkout.dig('with','ref')=='main'
raise 'No untrusted artifact/dependency execution in publisher' if job['steps'].any? { |step| step.fetch('uses','').match?(/download-artifact/) || step.fetch('run','').match?(/install|bundle|pnpm/) }
build=pages.fetch('jobs').fetch('build');deploy=pages.fetch('jobs').fetch('deploy')
raise 'Pages activation must be explicit' unless build['if'].include?("vars.ENABLE_PAGES_PUBLICATION == 'true'")
raise 'Only main can build for production' unless build['if'].include?("github.ref == 'refs/heads/main'") && pages.dig('on','push','branches')==['main']
raise 'Builds must be immutable' unless build['steps'].first.dig('with','ref')=='${{ github.sha }}'
raise 'Build must remain read-only' if build.key?('permissions')
runs=build['steps'].filter_map { |step| step['run'] }
raise 'Production must use full shared validation' unless runs.include?('bundle exec ruby scripts/validate-site.rb')
raise 'Production must enforce editorial release readiness' unless runs.include?('bundle exec ruby scripts/validate-proposals.rb --release')
selected='${{ steps.select.outputs.revision }}'
raise 'Only a verified commit can be built' unless build.dig('outputs','revision')==selected && build['steps'].any? { |step| step['id']=='select' && step['run']=='node scripts/publication.mjs guard-pages' }
metadata=build['steps'].find { |step| step['run']&.include?('node scripts/publication.mjs metadata _site') }
package=build['steps'].find { |step| step['run']=='python scripts/package-pages.py _site _pages --revision $env:BUILD_REVISION' }
raise 'Metadata and packaging must use the selected revision' unless [metadata,package].all? { |step| step&.dig('env','BUILD_REVISION')==selected } && metadata['run'].include?('$env:GITHUB_SHA = $env:BUILD_REVISION')
upload=build['steps'].last
raise 'Only the inspected artifact is uploaded with short retention' unless upload['uses'].start_with?('actions/upload-pages-artifact@') && upload['with']=={'path'=>'_pages','retention-days'=>1}
raise 'Deploy must depend on the complete build' unless deploy['needs']=='build'
raise 'Deployment permissions must be isolated' unless deploy['permissions']=={'contents'=>'read','pages'=>'write','id-token'=>'write'}
raise 'Use protected Pages environment' unless deploy.dig('environment','name')=='github-pages'
raise 'Recheck freshness immediately before deploying' unless deploy['steps'][-2]['run']=='node scripts/publication.mjs guard-pages'
raise 'Deploy must recheck the built revision' unless deploy['steps'][-2].dig('env','BUILT_REVISION')=='${{ needs.build.outputs.revision }}'
raise 'Use same-run Pages artifact' unless deploy['steps'].last['uses'].start_with?('actions/deploy-pages@')
candidate=validation.dig('jobs','validate','steps').find { |step| step['run']=='node scripts/publication.mjs check-candidate' }
raise 'Merged candidates need previous-content/media validation' unless candidate && candidate['if']=="startsWith(github.ref, 'refs/heads/publication/staff-')"
settings=JSON.parse(File.read(File.join(root,'.github/publication-settings.json')))
raise 'Local settings must leave activation off' unless settings['activation_variables'].values.all? { |value| value=='false' }
main=settings.dig('branch_protection','main')
raise 'Main must require exact trusted checks without bypass' unless main['required_status_checks']=={'strict'=>true,'checks'=>[{'context'=>'Website validation','app_id'=>15368}]} && main['enforce_admins']==true
raise 'Merge commits and automatic checked publication must remain possible' unless main['required_linear_history']==false && main['required_pull_request_reviews'].nil?
settings['branch_protection'].each_value { |rule| raise 'Never allow force pushes or branch deletion' unless rule['allow_force_pushes']==false && rule['allow_deletions']==false }
raise 'Initial staff saves must be able to trigger validation' unless settings.dig('branch_protection','content/staff','required_status_checks').nil?
raise 'Pages environment must accept only main, without an extra staff approval gate' unless settings.dig('pages','allowed_deployment_branch')=='main' && settings.dig('pages','required_reviewers')==[]
puts 'Publication workflow contracts pass: explicit activation, trusted merge code, exact revision checks, least privilege, inspected same-run artifact, protected environment and no cancelled deployments.'

# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'nokogiri'
require_relative '../lib/team'

checks = 0
check = lambda { |condition, message| raise message unless condition; checks += 1 }
Dir.mktmpdir('team-fixture-') do |fixture|
  source = File.join(fixture, 'source')
  output = File.join(fixture, 'site')
  FileUtils.mkdir_p(source)
  %w[_layouts _includes _data assets].each { |dir| FileUtils.cp_r(File.join(Proposals::ROOT,dir),source) }
  FileUtils.mkdir_p(File.join(source,'_team'))
  FileUtils.mkdir_p(File.join(source,'_posts'))
  FileUtils.cp(File.join(Proposals::ROOT,'team.html'),source)
  original = Proposals::Document.read(Dir[File.join(Proposals::ROOT,'_posts/*.md')].first)
  original.metadata['supervisors'] = [
    {'name'=>'Original supervisor label','team_id'=>'active-a'},
    {'name'=>'Inactive supervisor label','team_id'=>'inactive'},
    {'name'=>'Named external supervisor'}
  ]
  File.write(File.join(source,'_posts/2026-01-01-project-fixture.md'),original.serialize)
  people = [
    {'team_id'=>'active-b','name'=>'Second person','role'=>'Postdoctoral researcher','active'=>true,'display_order'=>20},
    {'team_id'=>'active-a','name'=>'First person — ü <tag>','role'=>'PhD student','email'=>'first@example.org','active'=>true,'display_order'=>10,'interests'=>['Gait & balance'],'links'=>[{'label'=>'Institution','url'=>'https://example.org/'}],'portrait'=>{'src'=>'/assets/images/branding/bfh.png','alt'=>'Fixture & portrait'}},
    {'team_id'=>'inactive','name'=>'Inactive person','active'=>false,'display_order'=>0}
  ]
  people.each do |person|
    body = person['team_id'] == 'active-a' ? "Biography with **Markdown**. {{ site.title }} {% include secret.html %}\n<script>alert(1)</script>" : ''
    File.write(File.join(source,"_team/#{person['team_id']}.md"),Proposals::Document.new(person,body).serialize)
  end
  check.call(Proposals.team_ids(source).sort == %w[active-a active-b inactive], 'Filesystem reference index must retain inactive IDs')
  site = Jekyll::Site.new(Jekyll.configuration('source'=>source,'destination'=>output,'config'=>File.join(Proposals::ROOT,'_config.yml'),'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'),'baseurl'=>'/preview','disable_disk_cache'=>true,'quiet'=>true))
  site.process
  listing = Nokogiri::HTML5(File.read(File.join(output,'team/index.html')))
  check.call(listing.css('.team-card h2 a').map { |link| link['href'] } == %w[/preview/team/active-a/ /preview/team/active-b/], 'Team active selection/order')
  check.call(File.file?(File.join(output,'team/inactive/index.html')), 'Inactive direct profile missing')
  detail = Nokogiri::HTML5(File.read(File.join(output,'team/active-a/index.html')))
  check.call(detail.at_css('title').text == people[1]['name'] && detail.at_css('h1').text == people[1]['name'], 'Profile name/title escaping')
  check.call(detail.at_css('.team-portrait')['src'] == '/preview/assets/images/branding/bfh.png' && detail.at_css('.team-portrait')['alt'] == 'Fixture & portrait', 'Portrait base URL/alt')
  check.call(detail.at_css('.team-bio').text.include?('{{ site.title }} {% include secret.html %}') && detail.css('.team-bio script').empty?, 'Bio safe rendering')
  check.call(detail.at_css('.team-interests').text.include?('Gait & balance'), 'Research interests lost')
  check.call(detail.at_css('a[href="mailto:first@example.org"]'), 'Email missing')
  check.call(detail.at_css('.team-links a')['href'] == 'https://example.org/', 'Optional external link')
  check.call(detail.at_css('.team-proposals a')['href'] == '/preview'+original.metadata.fetch('permalink'), 'Profile proposal backlink/base URL')
  check.call(detail.at_css('.team-proposals .proposal-status').text == original.metadata.fetch('status').capitalize, 'Profile proposal availability label')
  plain = Nokogiri::HTML5(File.read(File.join(output,'team/active-b/index.html')))
  check.call(plain.css('.team-portrait, .team-bio, .team-interests, .team-links, .team-proposals').empty?, 'Empty optional fields created placeholders')
  proposal = Nokogiri::HTML5(File.read(File.join(output,original.metadata['permalink'].sub(%r{^/},''),'index.html')))
  supervisors = proposal.at_css('#supervisors').parent
  check.call(supervisors.css('a').map { |link| link['href'] } == %w[/preview/team/active-a/ /preview/team/inactive/], 'Proposal links include active and inactive profiles')
  check.call(supervisors.css('li').map(&:text) == ['Original supervisor label','Inactive supervisor label','Named external supervisor'], 'Original supervisor names changed')
  check.call(supervisors.css('li').last.css('a').empty?, 'External supervisor gained a false profile link')
  linked = Proposals::Validator.new(team_ids:%w[active-a inactive]).validate(original)
  check.call(linked.empty?, 'Supplied profile IDs do not resolve in validator')
  errors = Proposals::Validator.new(team_ids:[]).validate(original)
  check.call(errors.count { |error| error.include?('no published team profile') } == 2, 'Unknown profile references accepted')
  known = original.metadata['supervisors']
  original.metadata['supervisors'] = [{'name'=>'Someone','team_id'=>'missing'}]
  File.write(File.join(source,'_posts/2026-01-01-project-fixture.md'),original.serialize)
  begin
    Jekyll::Site.new(site.config).process
    raise 'Build accepted missing team reference'
  rescue Jekyll::Errors::FatalException => error
    check.call(error.message.include?('missing'), 'Build reference error was not useful')
  end
  original.metadata['supervisors'] = known
  File.write(File.join(source,'_posts/2026-01-01-project-fixture.md'),original.serialize)
  FileUtils.mkdir_p(File.join(source,'_team/duplicate'))
  File.write(File.join(source,'_team/duplicate/active-a.md'),Proposals::Document.new(people[1],'').serialize)
  begin
    Jekyll::Site.new(site.config).process
    raise 'Build accepted duplicate profile IDs'
  rescue Jekyll::Errors::FatalException => error
    check.call(error.message.include?('duplicate'), 'Duplicate-ID error was not useful')
  end
  {'active'=>'yes','display_order'=>1.5,'email'=>'invalid','interests'=>'text','portrait'=>{'src'=>'/assets/no-image.png','alt'=>'Missing'}}.each do |field,value|
    person = people[1].merge(field=>value)
    begin Team.validate!(Proposals::Document.new(person,''),File.join(source,'_team/active-a.md'),source); raise "Invalid #{field} accepted"; rescue Proposals::FormatError; checks += 1; end
  end
  begin Team.validate!(Proposals::Document.new(people[1],''),File.join(source,'_team/renamed.md'),source); raise 'ID/filename drift accepted'; rescue Proposals::FormatError; checks += 1; end
  puts "#{checks} team checks passed: ordering, inactive retention, optional fields, safe biography, supervisor names/links and reference validation."
end

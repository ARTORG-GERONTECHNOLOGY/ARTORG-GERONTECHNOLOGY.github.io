# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'nokogiri'
require 'json'
require 'rexml/document'
require_relative '../lib/site-content'
require_relative '../lib/proposal-catalogue'

checks = 0
check = lambda { |condition, message| raise message unless condition; checks += 1 }
Dir.mktmpdir('home-news-fixture-') do |fixture|
  source = File.join(fixture, 'source')
  output = File.join(fixture, 'site')
  FileUtils.mkdir_p(source)
  %w[_layouts _includes _data _team assets].each { |dir| FileUtils.cp_r(File.join(Proposals::ROOT, dir), source) }
  %w[index.html news.html search.json feed.xml].each { |file| FileUtils.cp(File.join(Proposals::ROOT, file), source) }
  FileUtils.mkdir_p(File.join(source, '_posts'))
  FileUtils.mkdir_p(File.join(source, '_news'))
  original = Proposals::Document.read(Dir[File.join(Proposals::ROOT, '_posts/*.md')].first)
  # Featured ordering must preserve priority/date/ID order within each partition.
  [['regular',0,false,'available'],['featured-late',20,true,'available'],['featured-early',10,true,'available'],['taken',-1,true,'taken']].each do |id, priority, featured, status|
    metadata = original.metadata.merge('proposal_id'=>id,'permalink'=>"/fixture/#{id}/",'priority'=>priority,'featured'=>featured,'status'=>status)
    File.write(File.join(source, "_posts/2026-01-01-project-#{id}.md"), Proposals::Document.new(metadata,original.body).serialize)
  end
  news = lambda do |slug, date, extra = {}|
    metadata = {'title'=>"Announcement #{slug} — ü <tag>", 'date'=>date,'updated_at'=>date,'summary'=>'A summary & context'}.merge(extra)
    body = "Intro with **Markdown**. {{ site.title }} {% include secret.html %}\n\n## Details\nNews body.\n<script>alert(1)</script>"
    File.write(File.join(source,"_news/#{slug}.md"), Proposals::Document.new(metadata,body).serialize)
  end
  news.call('older','2026-01-01T10:00:00Z', 'updated_at'=>'2026-11-01T10:00:00Z')
  news.call('new-a','2026-06-01T10:00:00Z', 'image'=>{'src'=>'/assets/images/branding/bfh.png','alt'=>'Fixture image & alt'})
  news.call('new-b','2026-06-01T10:00:00Z')
  news.call('unpublished','2026-01-01T10:00:00Z','published'=>false)
  news.call('future','2099-01-01T10:00:00Z')
  home = YAML.safe_load_file(File.join(source,'_data/home.yml'))
  home['hero_image'] = {'src'=>'/assets/images/branding/university-of-bern.png','alt'=>'Hero & alt'}
  build = lambda do
    File.write(File.join(source,'_data/home.yml'),YAML.dump(home))
    config = Jekyll.configuration('source'=>source,'destination'=>output,'config'=>File.join(Proposals::ROOT,'_config.yml'),'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'),'baseurl'=>'/preview','disable_disk_cache'=>true,'quiet'=>true)
    site = Jekyll::Site.new(config)
    site.process
    site
  end
  site = build.call
  html = Nokogiri::HTML5(File.read(File.join(output,'index.html')))
  project_links = html.css('.home-projects h3 a').map { |link| link['href'] }
  check.call(project_links == %w[featured-early featured-late regular].map { |id| "/preview/fixture/#{id}/" }, 'Featured/available homepage ordering')
  check.call(html.css('.featured-label').length == 2, 'Featured labels missing')
  check.call(html.at_css('.home-hero')['src'] == '/preview/assets/images/branding/university-of-bern.png', 'Hero base URL')
  check.call(html.at_css('.home-hero')['alt'] == 'Hero & alt', 'Hero alt escaping')
  expected_news = %w[new-a new-b older].map { |slug| "/preview/news/#{slug}/" }
  check.call(html.css('.home-news h3 a').map { |link| link['href'] } == expected_news, 'News must sort by publication, with deterministic ties')
  listing = Nokogiri::HTML5(File.read(File.join(output,'news/index.html')))
  check.call(listing.css('.news-card h3 a').map { |link| link['href'] } == expected_news, 'News listing differs from homepage')
  check.call(site.posts.docs.length == 4 && site.data['proposal_catalogue'].length == 4, 'News entered proposal posts/catalogue')
  search = JSON.parse(File.read(File.join(output,'search.json')))
  check.call(search.count { |item| item['type'] == 'proposal' } == 4 && search.count { |item| item['type'] == 'news' } == 3, 'Search collection types mixed or lost')
  feed = REXML::Document.new(File.read(File.join(output,'feed.xml')))
  check.call(REXML::XPath.match(feed,'//item').length == 4, 'News entered proposal feed')
  detail = Nokogiri::HTML5(File.read(File.join(output,'news/new-a/index.html')))
  check.call(detail.at_css('h1').text == 'Announcement new-a — ü <tag>', 'News metadata escaping')
  check.call(detail.at_css('.news-body h2').text == 'Details', 'News section heading lost')
  check.call(detail.at_css('.news-body').text.include?('{{ site.title }} {% include secret.html %}'), 'News author Liquid evaluated')
  check.call(detail.css('.news-body script').empty?, 'News author script retained')
  check.call(detail.at_css('.news-image')['alt'] == 'Fixture image & alt', 'News optional image')
  check.call(!File.exist?(File.join(output,'news/unpublished/index.html')) && !File.exist?(File.join(output,'news/future/index.html')), 'Hidden/future news output')
  check.call(Nokogiri::HTML5(File.read(File.join(output,'news/older/index.html'))).css('.news-image').empty?, 'Absent image produced placeholder')
  [true,false].repeated_permutation(3).each do |intro,proposals,announcements|
    home['sections'] = {'introduction'=>intro,'proposals'=>proposals,'news'=>announcements}
    build.call
    html = Nokogiri::HTML5(File.read(File.join(output,'index.html')))
    {'home-introduction'=>intro,'home-proposals'=>proposals,'home-news'=>announcements}.each do |klass,visible|
      check.call(!html.css(".#{klass}").empty? == visible, "Independent section visibility #{klass}")
    end
    check.call(html.css('h1').length == 1, 'Homepage title lost when sections hidden')
  end
  bad_home = Marshal.load(Marshal.dump(home))
  bad_home['hero_image'] = {'src'=>'/assets/missing.png','alt'=>'Missing'}
  begin SiteContent.home!(bad_home,source); raise 'Missing image accepted'; rescue Proposals::FormatError; checks += 1; end
  bad_home['hero_image'] = {'src'=>'/assets/images/branding/bfh.png','alt'=>''}
  begin SiteContent.home!(bad_home,source); raise 'Missing alt accepted'; rescue Proposals::FormatError; checks += 1; end
  valid_news = Proposals::Document.read(File.join(source,'_news/new-b.md'))
  %w[title summary date updated_at].each do |field|
    invalid = Proposals::Document.new(valid_news.metadata.reject { |key,_value| key == field }, valid_news.body)
    begin SiteContent.news!(invalid,source); raise "Missing #{field} accepted"; rescue Proposals::FormatError; checks += 1; end
  end
  invalid = Proposals::Document.new(valid_news.metadata.merge('updated_at'=>'2020-01-01T10:00:00Z'), valid_news.body)
  begin SiteContent.news!(invalid,source); raise 'Update before publication accepted'; rescue Proposals::FormatError; checks += 1; end
  puts "#{checks} homepage/news checks passed: featured order, chronology, visibility combinations, images, safe rendering, future/draft exclusion and proposal separation."
end

# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'rexml/document'
require 'nokogiri'
require_relative '../lib/proposal'
checks=0
check=lambda { |condition,message| raise message unless condition;checks+=1 }
Dir.mktmpdir('publishing-fixture-') do |fixture|
 source=File.join(fixture,'source');out=File.join(fixture,'site');FileUtils.mkdir_p(source)
 %w[_layouts _includes _data _team assets].each { |dir| FileUtils.cp_r(File.join(Proposals::ROOT,dir),source) }
 %w[index.html about.html team.html news.html feed.xml news-feed.xml sitemap.xml].each { |file| FileUtils.cp(File.join(Proposals::ROOT,file),source) }
 FileUtils.mkdir_p(File.join(source,'_posts'));FileUtils.mkdir_p(File.join(source,'_news'))
 proposal=Proposals::Document.read(Dir[File.join(Proposals::ROOT,'_posts/*.md')].first)
 File.write(File.join(source,'_posts/2026-01-01-project-fixture.md'),proposal.serialize)
 metadata={'title'=>'News & "quotes" — ü','summary'=>'Description <test> & context','date'=>'2026-01-01T10:00:00Z','updated_at'=>'2026-02-01T10:00:00Z','image'=>{'src'=>'/assets/images/branding/bfh.png','alt'=>'Fixture & image'}}
 File.write(File.join(source,'_news/example.md'),Proposals::Document.new(metadata,'News body').serialize)
 File.write(File.join(source,'_news/private.md'),Proposals::Document.new(metadata.merge('published'=>false),'Not indexed').serialize)
 File.write(File.join(source,'admin.html'),"---\nlayout: default\npermalink: /admin/\ntitle: Administration\n---\nService route")
 site=Jekyll::Site.new(Jekyll.configuration('source'=>source,'destination'=>out,'config'=>File.join(Proposals::ROOT,'_config.yml'),'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'),'url'=>'https://example.org','baseurl'=>'/preview','disable_disk_cache'=>true,'quiet'=>true));site.process
 feed=REXML::Document.new(File.read(File.join(out,'feed.xml')))
 news=REXML::Document.new(File.read(File.join(out,'news-feed.xml')))
 map=REXML::Document.new(File.read(File.join(out,'sitemap.xml')))
 check.call(REXML::XPath.first(feed,"//item/category[@domain='availability']").text==proposal.metadata['status'],'RSS status missing')
 check.call(REXML::XPath.first(feed,'//item/description').text.start_with?('Status: '),'RSS status not readable')
 check.call(REXML::XPath.match(news,'//item').length==1,'News draft leaked or real item lost')
 check.call(REXML::XPath.first(news,'//item/title').text==metadata['title'],'RSS XML escaping')
 urls=REXML::XPath.match(map,"//*[local-name()='loc']").map(&:text)
 check.call(urls.all? { |url| url.start_with?('https://example.org/preview/') },'Canonical host/base URL mismatch')
 check.call(urls.none? { |url| url.include?('/admin/')||url.include?('/private/')||url.end_with?('404.html') },'Excluded sitemap route leaked')
 check.call(urls.include?('https://example.org/preview/news/example/'),'News omitted from sitemap')
 check.call(urls.include?('https://example.org/preview'+proposal.metadata['permalink']),'Proposal omitted from sitemap')
 html=Nokogiri::HTML5(File.read(File.join(out,'news/example/index.html')))
 check.call(html.at_css('link[rel=canonical]')['href']=='https://example.org/preview/news/example/','Canonical URL')
 check.call(html.at_css('meta[property="og:title"]')['content']==metadata['title'],'Social title escaping')
 check.call(html.at_css('meta[name=description]')['content']==metadata['summary'],'Page description')
 check.call(html.at_css('meta[property="og:image"]')['content']=='https://example.org/preview/assets/images/branding/bfh.png','Preview image canonical URL')
 check.call(html.at_css('meta[property="article:modified_time"]')['content'].start_with?('2026-02-01'),'Article update date')
 check.call(html.at_css('#page-share-link')['value']=='https://example.org/preview/news/example/' && html.at_css('#page-share-link').key?('readonly'),'Sharing fallback missing')
 check.call(html.at_css('#copy-page-link').key?('hidden'),'Nonfunctional copy button exposed without JavaScript')
 puts "#{checks} feed/metadata/sitemap checks passed: XML, availability, canonical hosts, escaping, draft/admin exclusions and sharing fallback."
end

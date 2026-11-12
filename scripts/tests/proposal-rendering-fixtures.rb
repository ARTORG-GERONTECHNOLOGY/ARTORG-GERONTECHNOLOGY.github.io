# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'nokogiri'
require_relative '../lib/proposal-renderer'

Dir.mktmpdir('proposal-fixture-') do |fixture|
  source = File.join(fixture, 'source')
  output = File.join(fixture, 'site')
  FileUtils.mkdir_p(source)
  %w[_layouts _includes _data _team assets].each do |directory|
    FileUtils.cp_r(File.join(Proposals::ROOT, directory), source)
  end
  FileUtils.mkdir_p(File.join(source, '_posts'))
  document = Proposals::Document.read(Dir[File.join(Proposals::ROOT, '_posts/*.md')].first)
  document.metadata['title'] = 'Überblick <script>alert(1)</script> & études'
  document.metadata['status'] = 'archived'
  document.metadata['figure'] = { 'src'=>'/assets/images/branding/bfh.png', 'alt'=>'Fixture <figure>', 'caption'=>'Caption & Unicode — ü' }
  document.metadata['start_date_text'] = 'By arrangement'
  document.metadata['workplace'] = "Bern\nResearch group"
  document.metadata['attachments'] = [{'title'=>'Fixture download — ü','url'=>'/assets/images/branding/bfh.png','mime_type'=>'image/png'}]
  document.metadata['media'] = [{'kind'=>'video','title'=>'Fixture video','url'=>'https://example.org/video.mp4','poster'=>'/assets/images/branding/bfh.png','transcript'=>'Transcript fixture'}]
  document.metadata['application_instructions'] = 'Apply with a **CV**. {% include secret.html %}'
  document.body = "## Background\n{{ site.title }} {% include secret.html %}\n<script>alert(2)</script><img src=\"https://example.org/a.png\" onerror=\"alert(3)\">\n\n## Aim\nShort aim.\n\n## Materials and Methods\nScientific method.\n\n## Requirements\n- Programming\n\n## References\nA citation — étude.\n"
  File.write(File.join(source, '_posts/2026-01-01-project-fixture.md'), document.serialize)
  config = Jekyll.configuration('source'=>source, 'destination'=>output, 'config'=>File.join(Proposals::ROOT,'_config.yml'), 'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'), 'baseurl'=>'/preview', 'disable_disk_cache'=>true, 'quiet'=>true)
  Jekyll::Site.new(config).process
  page = Nokogiri::HTML5(File.read(File.join(output, document.metadata.fetch('permalink').sub(%r{^/}, ''), 'index.html')))
  article = page.at_css('article')
  raise 'Author script executed in title/body' unless page.css('script').none? { |script| script.text.include?('alert(') }
  raise 'Liquid was evaluated or lost' unless article.text.include?('{{ site.title }} {% include secret.html %}')
  raise 'Figure path/escaping broken' unless article.at_css('.proposal-figure img')['src'] == '/preview/assets/images/branding/bfh.png' && article.at_css('figcaption').text == 'Caption & Unicode — ü'
  raise 'Optional section order' unless article.css('.proposal-content h2').map(&:text).index('References') > article.css('.proposal-content h2').map(&:text).index('Institutes')
  %w[How\ to\ apply Start\ Date Workplace].each { |heading| raise "Missing #{heading}" unless article.css('h3').map(&:text).include?(heading) }
  raise 'Unsafe image attribute' if article.at_css('[onerror]')
  raise 'Download attributes/label missing' unless article.at_css('#proposal-attachments').parent.at_css('a')['download'] && article.at_css('#proposal-attachments').parent.text.include?('PNG,')
  raise 'Video accessibility/playback controls' unless article.at_css('video')['controls'] && !article.at_css('video').key?('autoplay') && article.at_css('details').text.include?('Transcript fixture')
  raise 'Metadata escaping' unless page.at_css('title').text == document.metadata.fetch('title') && article.at_css('h1').text == document.metadata.fetch('title')
  raise 'Excerpt executed author Liquid' unless File.read(File.join(output,document.metadata.fetch('permalink').sub(%r{^/},''),'index.html')).include?('{% include secret.html %}')
  catalogue = Nokogiri::HTML5(File.read(File.join(output, 'posts/index.html')))
  raise 'Empty catalogue state missing' if catalogue.at_css('.catalogue-empty').key?('hidden')
  raise 'Archived proposal visible by default' unless catalogue.css('.catalogue-card').all? { |card| card.key?('hidden') }
  puts 'PASS isolated Jekyll fixture: optional figure/caption, application/start/workplace, Unicode, escaped metadata, literal author Liquid, sanitized HTML and preview base URL.'
end

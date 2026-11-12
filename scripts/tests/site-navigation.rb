# frozen_string_literal: true
require 'nokogiri'
require 'uri'
require 'pathname'

output = File.expand_path(ARGV.fetch(0, '../.local/site'))
count = 0
check = lambda { |condition, message| raise message unless condition; count += 1 }
pages = Dir[File.join(output, '**/*.html')].select { |path| File.read(path).include?('id="primary-navigation"') }
check.call(pages.length >= 18, 'Missing generated public pages')
local_target = lambda do |url, page|
  uri = URI.parse(url)
  next true if uri.host || uri.scheme
  next true if uri.path.empty?
  path = uri.path.start_with?('/') ? File.join(output, uri.path.sub(%r{^/}, '')) : File.expand_path(uri.path, File.dirname(page))
  File.file?(path) || File.file?(File.join(path, 'index.html'))
end
pages.each do |path|
  html = Nokogiri::HTML5(File.read(path, encoding: 'UTF-8'))
  check.call(html.at_css('html')['lang'] == 'en', "Missing page language: #{path}")
  check.call(html.css('h1').length == 1 && !html.at_css('h1').text.strip.empty?, "Missing/empty/duplicate page title: #{path}")
  check.call(html.css('main, [role=main]').length == 1, "Main landmark missing/duplicated: #{path}")
  check.call(html.at_css('.skip-link')['href'] == '#main-content' && html.at_css('#main-content')['tabindex'] == '-1', "Skip link target: #{path}")
  nav = html.at_css('#primary-navigation')
  check.call(nav.css('a').map(&:text) == %w[Home Proposals Archive News Team About Search], "Navigation destinations: #{path}")
  check.call(!nav.key?('hidden') && !nav['class'].split.include?('collapse'), "No-JavaScript links hidden: #{path}")
  toggle = html.at_css('#navigation-toggle')
  check.call(toggle.name == 'button' && toggle['aria-controls'] == nav['id'] && toggle['aria-expanded'] == 'false', "Menu control: #{path}")
  scripts = html.css('script[src]').map { |script| script['src'] }
  check.call(scripts.count { |src| src.include?('jquery-') } == 1, "Duplicate/missing jQuery: #{path}")
  check.call(scripts.count { |src| src.include?('MathJax.js') } <= 1, "Duplicate math loader: #{path}")
  check.call(scripts.index { |src| src.include?('jquery-') } < scripts.index { |src| src.include?('bootstrap.min.js') }, "Script dependency order: #{path}")
  check.call(scripts.none? { |src| src.match?(/addthis|disqus|jspdf|highlight\.min|mmenu/) }, "Inactive inherited script: #{path}")
  html.css('#primary-navigation a[href], script[src], link[rel=stylesheet], img[src]').each do |node|
    url = node['href'] || node['src']
    check.call(local_target.call(url,path), "Broken navigation/asset #{url}: #{path}")
  end
end
Dir[File.join(output,'assets/vendor/**/*.css')].each do |path|
  File.read(path).scan(/url\(([^)]+)\)/).flatten.each do |url|
    url = url.delete('"\'').split(/[?#]/).first
    check.call(local_target.call(url,path), "Missing font asset #{url}")
  end
end
search = Nokogiri::HTML5(File.read(File.join(output, 'search/index.html')))
check.call(search.at_css('label[for=search-input]') && search.at_css('noscript'), 'Search label/fallback missing')
puts "#{count} generated-site navigation/asset checks passed across #{pages.length} pages."

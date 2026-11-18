# frozen_string_literal: true
require 'json'
require 'nokogiri'
require_relative '../lib/proposal'
out=File.expand_path(ARGV.fetch(0,'../.local/site'))
manifest=JSON.parse(File.read(File.join(out,'pdf-manifest.json')))
raise 'Missing proposal print set' unless manifest['proposals'].length==Dir[File.join(Proposals::ROOT,'_posts/*.md')].length
manifest['proposals'].each do |entry|
 path=entry['print_url'].delete_prefix(manifest['baseurl']).delete_prefix('/')
 html=Nokogiri::HTML5(File.read(File.join(out,path,'index.html')))
 raise 'Wrong print revision' unless html.at_css('body')['data-revision']==entry['revision']
 raise 'Incorrect print title' unless html.at_css('h1').text==entry['title']
 raise 'Author scripts in print HTML' unless html.css('script').empty?
 raise 'Retired eligibility controls in print' unless html.css('#eligibility, .eligibility-box').empty?
 raise 'Branding missing' unless html.css('.proposal-program img').length==2
end
puts 'Print layouts: all proposal IDs/revisions, title, branding and script-free HTML pass. PDF rendering not run.'

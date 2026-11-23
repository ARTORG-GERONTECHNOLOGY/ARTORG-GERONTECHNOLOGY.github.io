# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'nokogiri'
require_relative '../lib/site-content'

checks=0
check=lambda { |condition,message| raise message unless condition; checks+=1 }
root=Proposals::ROOT
Dir.mktmpdir('about-fixture-') do |fixture|
 source=File.join(fixture,'source'); output=File.join(fixture,'site')
 FileUtils.mkdir_p(source)
 %w[_layouts _includes _data assets].each { |dir| FileUtils.cp_r(File.join(root,dir),source) }
 FileUtils.cp(File.join(root,'about.html'),source)
 FileUtils.cp(File.join(root,'search.json'),source)
 about=YAML.safe_load_file(File.join(source,'_data/about.yml'))
 about['title']='About & information <test>'
 about['contact_name']='Website Contact & Colleague'
 about['contact_email']='website@example.org'
 about['overview']='Unicode — ü <script>alert(1)</script> {% include literal.html %} and [the group](https://example.org/about?a=1&b=2).'
 File.write(File.join(source,'_data/about.yml'),YAML.dump(about))
 config=Jekyll.configuration('source'=>source,'destination'=>output,'config'=>File.join(root,'_config.yml'),'plugins_dir'=>File.join(root,'_plugins'),'baseurl'=>'/preview','disable_disk_cache'=>true,'quiet'=>true)
 site=Jekyll::Site.new(config);site.process
 html=Nokogiri::HTML5(File.read(File.join(output,'about/index.html')))
 check.call(html.at_css('h1').text==about['title'] && html.at_css('title').text==about['title'],'Editable title escaping')
 overview = 'Unicode — ü <script>alert(1)</script> {% include literal.html %} and the group.'
 check.call(html.at_css('.about-content p').text==overview && html.css('.about-content script').empty?,'Editable text safe output')
 check.call(html.at_css('.about-content > p a')['href']=='https://example.org/about?a=1&b=2','Inline link lost URL query')
 check.call(html.at_css('meta[name=description]')['content']==overview,'Page metadata must use plain text')
 search = JSON.parse(File.read(File.join(output,'search.json'))).find { |item| item['url']=='/preview/about/' }
 check.call(search['summary']==overview && !search['text'].include?('https://www.bme.master.unibe.ch/'),'Search must use displayed text')
 section=lambda { |id| html.at_css("##{id}").parent }
 check.call(section.call('about-applications').css('ol li').length==about['application_steps'].length,'Application steps missing')
 check.call(section.call('about-applications').css('a[href^="mailto:"]').empty?,'Student applications routed to a universal mailbox')
 check.call(html.css('#about-staff').empty?, 'Staff administration section remains public')
 contact = section.call('about-contact')
 check.call(contact.at_css('h2').text=='Contact' && contact.at_css('p').text.include?(about['contact_name']) &&
   contact.at_css('a')['href']=='mailto:website@example.org','Website contact not configurable')
 check.call(search['text'].include?(about['contact_name']),'Website contact missing from search')
 check.call(html.css('.about-content a[href^="/preview/"]').map { |link| link['href'] }==%w[/preview/posts/ /preview/search/],'About should link to proposals and search with the configured base URL')
 check.call(html.css('.about-content img, .about-content canvas').empty?,'Unexpected image inside About prose')
 check.call(html.css('.about-content h2').map { |h| h['id'] }.uniq.length==3,'Section heading anchors not unique')
 group = section.call('about-group')
 check.call(group.at_css('p a')['href']=='https://www.bme.master.unibe.ch/index_eng.html' && group.css('ul').empty?,'Program link must appear in its paragraph')
 %w[application_steps overview].each do |field|
  invalid=about.merge(field=>42)
  begin SiteContent.about!(invalid);raise "Invalid #{field} accepted";rescue Proposals::FormatError;checks+=1;end
 end
 begin SiteContent.about!(about.merge('contact_email'=>'invalid'));raise 'Invalid email accepted';rescue Proposals::FormatError;checks+=1;end
 begin SiteContent.about!(about.merge('contact_email'=>nil));raise 'Missing email accepted';rescue Proposals::FormatError;checks+=1;end
 ['javascript:alert(1)', 'http://example.org/', '//example.org/', 'https://user@example.org/'].each do |url|
  begin SiteContent.about!(about.merge('group_text'=>"[bad](#{url})"));raise 'Invalid inline URL accepted';rescue Proposals::FormatError;checks+=1;end
 end
 legacy=about.merge('institutional_links'=>[{'label'=>'Legacy [institution]','url'=>'https://example.org/legacy'}])
 SiteContent.upgrade_about!(legacy)
 migrated=Nokogiri::HTML5.fragment(SiteContent.about!(legacy)['group_text']['html'])
 check.call(!legacy.key?('institutional_links') && migrated.at_css('p a').text=='Legacy [institution]' && migrated.at_css('p a')['href']=='https://example.org/legacy','Legacy links must survive as inline links')
 puts "#{checks} About checks passed: editable safe content, contact separation, institutional links, base URL and no QR placeholder."
end

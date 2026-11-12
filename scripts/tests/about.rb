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
 %w[_layouts _includes _data _team assets].each { |dir| FileUtils.cp_r(File.join(root,dir),source) }
 FileUtils.cp(File.join(root,'about.html'),source)
 about=YAML.safe_load_file(File.join(source,'_data/about.yml'))
 about['title']='About & information <test>'
 about['corrections_email']='corrections@example.org'
 about['overview']='Unicode — ü <script>alert(1)</script>'
 File.write(File.join(source,'_data/about.yml'),YAML.dump(about))
 config=Jekyll.configuration('source'=>source,'destination'=>output,'config'=>File.join(root,'_config.yml'),'plugins_dir'=>File.join(root,'_plugins'),'baseurl'=>'/preview','disable_disk_cache'=>true,'quiet'=>true)
 site=Jekyll::Site.new(config);site.process
 html=Nokogiri::HTML5(File.read(File.join(output,'about/index.html')))
 check.call(html.at_css('h1').text==about['title'] && html.at_css('title').text==about['title'],'Editable title escaping')
 check.call(html.at_css('.about-content p').text==about['overview'] && html.css('.about-content script').empty?,'Editable text safe output')
 section=lambda { |id| html.at_css("##{id}").parent }
 check.call(section.call('about-applications').css('ol li').length==about['application_steps'].length,'Application steps missing')
 check.call(section.call('about-applications').css('a[href^="mailto:"]').empty?,'Student applications routed to a universal mailbox')
 program=YAML.safe_load_file(File.join(root,'_data/program.yml'))
 check.call(html.css('#about-staff').empty?, 'Staff administration section remains public')
 check.call(section.call('about-corrections').at_css('a')['href']=='mailto:corrections@example.org','Corrections contact not configurable')
 check.call(html.css('.about-content a[href^="/preview/"]').length==3,'Internal links ignore base URL')
 check.call(html.css('.about-content img, .about-content canvas').empty?,'Unexpected image inside About prose')
 check.call(html.css('.about-content h2').map { |h| h['id'] }.uniq.length==3,'Section heading anchors not unique')
 links=section.call('about-group').css('a').map { |link| link['href'] }
 check.call(links==about['institutional_links'].map { |link| link['url'] },'Institutional links lost')
 %w[application_steps institutional_links].each do |field|
  invalid=about.merge(field=>'invalid')
  begin SiteContent.about!(invalid);raise "Invalid #{field} accepted";rescue Proposals::FormatError;checks+=1;end
 end
 begin SiteContent.about!(about.merge('corrections_email'=>'invalid'));raise 'Invalid email accepted';rescue Proposals::FormatError;checks+=1;end
 begin SiteContent.about!(about.merge('corrections_email'=>nil));raise 'Missing email accepted';rescue Proposals::FormatError;checks+=1;end
 begin SiteContent.about!(about.merge('institutional_links'=>[{'label'=>'Bad','url'=>'javascript:alert(1)'}]));raise 'Unsafe URL accepted';rescue Proposals::FormatError;checks+=1;end
 puts "#{checks} About checks passed: editable safe content, contact separation, institutional links, base URL and no QR placeholder."
end

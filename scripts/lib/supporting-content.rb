# frozen_string_literal: true
require_relative 'team'
require_relative 'site-qr'
require 'securerandom'
require 'base64'
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'nokogiri'

module SupportingContent
  FIELDS = {
    'home'=>%w[title introduction sections proposal_limit news_limit links hero_image],
    'about'=>%w[title overview group_text program_text application_steps corrections_text corrections_email],
    'team'=>%w[name role email active display_order interests links portrait],
    'news'=>%w[title summary image]
  }.freeze
  def self.kind(path)
    return 'home' if path == '_data/home.yml'
    return 'about' if path == '_data/about.yml'
    return 'team' if path&.match?(%r{\A_team/[a-z0-9]+(?:-[a-z0-9]+)*\.md\z})
    return 'news' if path&.match?(%r{\A_news/[a-z0-9]+(?:-[a-z0-9]+)*\.md\z})
    raise Proposals::FormatError, 'Choose Home, About, a news item or a team profile'
  end
  def self.parse(source, type)
    return Proposals::Document.parse(source) if %w[team news].include?(type)

    metadata = Proposals.load_yaml(source)
    SiteContent.upgrade_about!(metadata) if type == 'about'
    Proposals::Document.new(metadata, '')
  end
  def self.serialize(document, type)
    %w[team news].include?(type) ? document.serialize : YAML.dump(document.metadata)
  end
  def self.model(source,path,context={})
    type=kind(path); document=parse(source,type)
    {'kind'=>type,'path'=>path,'source'=>source,'metadata'=>document.metadata.transform_values { |value| value.is_a?(Time) ? value.iso8601 : value },'body'=>document.body,'context'=>context}
  end
  def self.restoration(path, source, current, prepared_at)
    type=kind(path); historical=parse(source,type); previous=parse(current,type)
    raise Proposals::FormatError,'Private historical drafts cannot be restored' if historical.metadata.key?('_editor_draft') || historical.metadata['published']==false
    immutable=type=='team' ? %w[team_id created_at permalink] : type=='news' ? %w[date created_at permalink] : []
    immutable.each do |field|
      next unless previous.metadata.key?(field)
      raise Proposals::FormatError,"#{field}: retain original identity and publication information" unless historical.metadata[field]==previous.metadata[field]
    end
    historical.metadata['display_order']=previous.metadata['display_order'] if type=='team'
    candidate(path,historical,previous,prepared_at)
  end
  def self.candidate(path,document,previous,now)
    type=kind(path)
    if %w[team news].include?(type)
      if previous
        fields=type=='team' ? %w[team_id created_at] : %w[date created_at]
        fields.each { |field| raise Proposals::FormatError,"#{field}: cannot change" if previous.metadata.key?(field) && document.metadata[field]!=previous.metadata[field] }
        previous.metadata.key?('published') ? document.metadata['published']=previous.metadata['published'] : document.metadata.delete('published')
      else
        document.metadata['published']=true
        document.metadata['created_at']=now if document.metadata['created_at'].to_s.empty?
        document.metadata['date']=now if type=='news' && document.metadata['date'].to_s.empty?
      end
      ignored=%w[updated_at]
      ignored<<'display_order' if type=='team'
      changed=!previous || document.body!=previous.body || ((document.metadata.keys|previous.metadata.keys)-ignored).any? { |key| document.metadata[key]!=previous.metadata[key] }
      if changed
        earlier=previous&.metadata&.fetch('updated_at',nil)
        document.metadata['updated_at']=[Time.iso8601(now), earlier ? Proposals.time(earlier)+1 : Time.iso8601(now)].max.utc.iso8601
      elsif previous.metadata.key?('updated_at')
        document.metadata['updated_at']=previous.metadata['updated_at']
      else
        document.metadata.delete('updated_at')
      end
    end
    source=serialize(document,type)
    {'source'=>source,'changed'=>!previous || source!=serialize(previous,type)}
  end
  def self.process(input)
    action=input.fetch('action'); files=input.fetch('files',{})
    if action=='bootstrap'
      items=files.filter_map { |path,source| model(source,path) if path.start_with?('_team/','_news/') || %w[_data/home.yml _data/about.yml].include?(path) }
      return {'items'=>items,'qrDestination'=>SiteQR.destination}
    end
    if action=='new'
      type=input.fetch('kind'); raise Proposals::FormatError,'Create a news item or team profile' unless %w[news team].include?(type)
      id=(type=='team'?'member-':'news-')+SecureRandom.hex(12); now=Time.now.utc.iso8601; path="_#{type}/#{id}.md"
      data=type=='team' ? {'team_id'=>id,'name'=>'','role'=>'','email'=>'','active'=>true,'display_order'=>100,'interests'=>[],'links'=>[]} : {'title'=>'','summary'=>'','date'=>'','updated_at'=>now}
      data.merge!('layout'=>type,'published'=>false,'created_at'=>now,'permalink'=>"/#{type}/#{id}/")
      return model(Proposals::Document.new(data,'').serialize,path)
    end
    source=input.fetch('source'); path=input['path']; context=input.fetch('context',{})
    if action=='parse'
      document=source.match?(/\A(?:\uFEFF)?---\r?\n.*?^---[ \t]*(?:\r?\n|\z)/m) ? Proposals::Document.parse(source) : Proposals::Document.new(Proposals.load_yaml(source),'')
      return {'isProposal'=>true} if document.metadata.key?('proposal_id')
      context=document.metadata.delete('_editor_draft')||context
      raise Proposals::FormatError,'Invalid draft context' unless context.is_a?(Hash) && (context.keys-%w[path sha baseCommit kind]).empty?
      path=context['path']||path
      path||="_team/#{document.metadata['team_id']}.md" if document.metadata['team_id']
      path||='_data/home.yml' if document.metadata.key?('sections')
      path||='_data/about.yml' if document.metadata.key?('overview')
      path||="_news/#{document.metadata['permalink'].split('/')[2]}.md" if document.metadata['permalink'].is_a?(String) && document.metadata['permalink'].match?(%r{\A/news/[a-z0-9]+(?:-[a-z0-9]+)*/\z})
      path||="_news/#{SecureRandom.hex(12)}.md" if document.metadata['layout']=='news'
      type=kind(path)
      SiteContent.upgrade_about!(document.metadata) if type == 'about'
      return model(serialize(document,type),path,context)
    end
    type=kind(path); document=parse(source,type); document.metadata.delete('_editor_draft')
    if action=='restore'
      return restoration(path,source,input.fetch('current'),input.fetch('preparedAt'))
    end
    patch=input.fetch('patch',{})
    raise Proposals::FormatError,'Unsupported content field' unless patch.is_a?(Hash) && (patch.keys-FIELDS.fetch(type)).empty?
    patch.each { |key,value| value.nil? ? document.metadata.delete(key) : document.metadata[key]=value }
    if input.key?('body')
      raise Proposals::FormatError,'Use Markdown text for the body' unless input['body'].is_a?(String) && %w[news team].include?(type)
      document.body=input['body']
    end
    working=serialize(document,type)
    if action=='download'
      document.metadata['published']=false if %w[team news].include?(type)
      document.metadata['_editor_draft']=context.merge('path'=>path,'kind'=>type)
      return model(serialize(document,type),path,context)
    end
    previous=files[path] && parse(files[path],type)
    result=candidate(path,parse(working,type),previous,Time.now.utc.iso8601)
    result['source']=files[path] if !result['changed'] && files[path]
    model(result['source'],path,context).merge('changed'=>result['changed'])
  end

  # Build only trusted templates/plugins/configuration with the candidate snapshot.
  def self.preview(input)
    path=input.fetch('path'); type=kind(path)
    Dir.mktmpdir('ger-support-preview-') do |temporary|
      %w[_layouts _includes _sass _data assets css js favicons].each do |directory|
        FileUtils.cp_r(File.join(Proposals::ROOT,directory),temporary) if File.directory?(File.join(Proposals::ROOT,directory))
      end
      Dir[File.join(Proposals::ROOT,'*.{html,json,xml}')].each { |file| FileUtils.cp(file,temporary) }
      input.fetch('files').each do |relative,source|
        target=File.expand_path(relative,temporary); raise Proposals::FormatError,'Unsafe preview path' unless target.start_with?(temporary+File::SEPARATOR)
        FileUtils.mkdir_p(File.dirname(target)); File.write(target,source,encoding:'UTF-8')
      end
      input.fetch('assets',[]).each do |item|
        target=File.expand_path(item.fetch('path'),temporary); raise Proposals::FormatError,'Unsafe preview asset' unless target.start_with?(temporary+File::SEPARATOR)
        FileUtils.mkdir_p(File.dirname(target)); File.binwrite(target,Base64.strict_decode64(item.fetch('bytes')))
      end
      config=Jekyll.configuration('source'=>temporary,'destination'=>File.join(temporary,'_output'),'config'=>File.join(Proposals::ROOT,'_config.yml'),'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'),'baseurl'=>'','future'=>type=='news','disable_disk_cache'=>true,'quiet'=>true)
      site=Jekyll::Site.new(config);site.process
      url=type=='home' ? '/' : type=='about' ? '/about/' : "/#{type}/#{File.basename(path,'.md')}/"
      html=Nokogiri::HTML5(File.read(File.join(site.dest,url.delete_prefix('/'),'index.html')))
      html.css('script,link[rel!="stylesheet"]').remove
      html.css('link[rel="stylesheet"]').each do |link|
        filename=File.expand_path(link['href'].to_s.delete_prefix('/'),site.dest)
        raise Proposals::FormatError,'Unsafe preview stylesheet' unless filename.start_with?(site.dest+File::SEPARATOR) && File.file?(filename)
        css=File.read(filename).gsub(/url\((['"]?)([^)'"\s]+)\1\)/) do |match|
          url=Regexp.last_match(2);font=File.expand_path(url.split(/[?#]/).first,File.dirname(filename))
          mime={'.woff2'=>'font/woff2','.woff'=>'font/woff','.ttf'=>'font/ttf'}[File.extname(font).downcase]
          mime && font.start_with?(site.dest+File::SEPARATOR) && File.file?(font) ? "url(data:#{mime};base64,#{Base64.strict_encode64(File.binread(font))})" : match
        end
        style=Nokogiri::XML::Node.new('style',html);style.content=css;link.replace(style)
      end
      html.css('img[src]').each do |image|
        next unless image['src'].start_with?('/assets/')
        unless image['src']=='/assets/images/site-qr.png'
          image['src']='/admin/api/media/image?path='+URI.encode_www_form_component(image['src'].delete_prefix('/'))
          next
        end
        filename=File.expand_path(image['src'].delete_prefix('/'),site.dest)
        raise Proposals::FormatError,'Missing preview image' unless filename.start_with?(site.dest+File::SEPARATOR) && File.file?(filename)
        mime=Media::RULES['types'][File.extname(filename).downcase];raise Proposals::FormatError,'Unsafe preview image' unless mime&.start_with?('image/')
        image['src']="data:#{mime};base64,#{Base64.strict_encode64(File.binread(filename))}"
      end
      {'html'=>html.to_html}
    end
  end
end

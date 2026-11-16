# frozen_string_literal: true
require 'bundler/setup'
require 'json'
require 'base64'
require_relative 'lib/media'
begin
  input = JSON.parse(STDIN.read(16 * 1024 * 1024))
  case input.fetch('operation')
  when 'rules'
    puts JSON.generate(Media::RULES)
  when 'validate'
    puts JSON.generate(Media.validate_bytes!(input.fetch('filename'), Base64.strict_decode64(input.fetch('bytes')), declared_type: input.fetch('mime_type')))
  when 'references'
    if input['path']
      path=input['path'];type=path=='_data/home.yml' ? 'home' : path.start_with?('_team/') ? 'team' : path.start_with?('_news/') ? 'news' : nil
      raise Proposals::FormatError,'Choose supported image content' unless type
      data=type=='home' ? Proposals.load_yaml(input.fetch('source')) : Proposals::Document.parse(input.fetch('source')).metadata
      key={'home'=>'hero_image','team'=>'portrait','news'=>'image'}.fetch(type)
      puts JSON.generate({'paths'=>[data.dig(key,'src')].compact});exit
    end
    document = Proposals::Document.parse(input.fetch('source'))
    data = document.metadata
    puts JSON.generate({'proposal_id' => data['proposal_id'], 'paths' => [data.dig('figure', 'src'), *(data['attachments'] || []).map { |file| file['url'] }].compact})
  else
    raise Proposals::FormatError, 'Invalid media request'
  end
rescue StandardError => error
  puts JSON.generate({'error' => error.is_a?(Proposals::FormatError) ? error.message : 'The media request is invalid'})
end

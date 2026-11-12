# frozen_string_literal: true
require 'yaml'
require 'uri'
require 'fileutils'
require 'rqrcode'
require 'chunky_png'
module SiteQR
 CONFIG = File.expand_path('../../_config.yml', __dir__)
 def self.destination(config_path = CONFIG)
  config=YAML.safe_load_file(config_path)
  uri=URI.parse(config.fetch('url'))
  unless %w[http https].include?(uri.scheme) && uri.host && !uri.userinfo && !uri.query && !uri.fragment
   raise ArgumentError, 'QR destination requires the configured public HTTP(S) site URL'
  end
  base=config.fetch('baseurl','').to_s.gsub(%r{\A/+|/+\z},'')
  uri.to_s.sub(%r{/+\z},'')+'/'+(base.empty? ? '' : base+'/')
 end
 def self.generate(path, config_path: CONFIG)
  target=destination(config_path)
  modules=RQRCode::QRCode.new(target,level: :h).modules
  scale=8; quiet=4; size=(modules.length+quiet*2)*scale
  image=ChunkyPNG::Image.new(size,size,ChunkyPNG::Color::WHITE)
  modules.each_with_index do |row,y|
   row.each_with_index do |dark,x|
    next unless dark
    scale.times { |dy| scale.times { |dx| image[(x+quiet)*scale+dx,(y+quiet)*scale+dy]=ChunkyPNG::Color::BLACK } }
   end
  end
  FileUtils.mkdir_p(File.dirname(path)); image.save(path)
  target
 end
end

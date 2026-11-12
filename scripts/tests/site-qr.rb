# frozen_string_literal: true
require 'tmpdir'
require 'digest'
require_relative '../lib/site-qr'
Dir.mktmpdir('qr-fixture-') do |dir|
 config=File.join(dir,'config.yml');a=File.join(dir,'a.png');b=File.join(dir,'b.png')
 File.write(config,YAML.dump({'url'=>'https://example.org/','baseurl'=>'/subpath'}))
 raise 'Canonical destination' unless SiteQR.generate(a,config_path:config)=='https://example.org/subpath/'
 SiteQR.generate(b,config_path:config)
 raise 'Non-reproducible QR' unless Digest::SHA256.file(a).hexdigest==Digest::SHA256.file(b).hexdigest
 pixels=ChunkyPNG::Image.from_file(a)
 raise 'QR must be square' unless pixels.width==pixels.height
 32.times do |i|
  pixels.width.times do |j|
   raise 'Quiet zone not white' unless [pixels[i,j],pixels[j,i],pixels[pixels.width-1-i,j],pixels[j,pixels.height-1-i]].all? { |colour| colour==ChunkyPNG::Color::WHITE }
  end
 end
 raise 'Contrast/palette' unless pixels.pixels.uniq.sort==[ChunkyPNG::Color::BLACK,ChunkyPNG::Color::WHITE].sort
 File.write(config,YAML.dump({'url'=>'https://changed.example/','baseurl'=>''}))
 SiteQR.generate(b,config_path:config)
 raise 'URL change did not regenerate QR' if Digest::SHA256.file(a).hexdigest==Digest::SHA256.file(b).hexdigest
 puts 'QR destination/subpath, reproducibility, changed-URL regeneration, square geometry, contrast and four-module quiet-zone checks pass.'
end

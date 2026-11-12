# frozen_string_literal: true
require_relative '../scripts/lib/site-qr'
Jekyll::Hooks.register :site, :post_read do |site|
 site.data['site_qr']={'url'=>SiteQR.destination,'image'=>'/assets/images/site-qr.png'}
end
Jekyll::Hooks.register :site, :post_write do |site|
 SiteQR.generate(File.join(site.dest,'assets/images/site-qr.png'))
end

# frozen_string_literal: true
require 'optparse'
require_relative 'lib/site-qr'
config=SiteQR::CONFIG; output=nil
OptionParser.new do |parser|
 parser.on('--config PATH') { |value| config=value }
 parser.on('--output PATH') { |value| output=value }
end.parse!
abort 'Specify --output PATH for the generated PNG' unless output
puts SiteQR.generate(output,config_path:config)

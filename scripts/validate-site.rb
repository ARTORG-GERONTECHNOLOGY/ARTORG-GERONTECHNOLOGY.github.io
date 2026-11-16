# frozen_string_literal: true
require 'bundler/setup'
require 'optparse'
require 'rbconfig'
require 'tmpdir'
require_relative 'lib/site-qr'

root = File.expand_path('..', __dir__)
options = {output: File.join(root, '_site'), config: '_config.yml'}
OptionParser.new do |parser|
  parser.banner = 'Usage: bundle exec ruby scripts/validate-site.rb [--output DIR] [--config FILES]'
  parser.on('--output DIR') { |value| options[:output] = File.expand_path(value) }
  parser.on('--config FILES') { |value| options[:config] = value }
end.parse!
Dir.chdir(root)
node = ENV.fetch('NODE', 'node')
python = ENV.fetch('PYTHON', 'python')
run = lambda do |*command|
  puts "\nRunning #{command.map(&:to_s).join(' ')}"
  STDOUT.flush
  abort('Validation failed; the build must not be published.') unless system(*command)
end
ruby_check = ->(file, *arguments) { run.call(RbConfig.ruby, file, *arguments) }
ruby_check.call('scripts/validate-proposals.rb')
%w[validation-workflow publication-workflow proposal-format proposal-rendering-fixtures proposal-lifecycle content-revisions media home-news team about publishing site-qr].each do |name|
  ruby_check.call("scripts/tests/#{name}.rb")
end
%w[catalogue-filters search].each { |name| run.call(node, "scripts/tests/#{name}.cjs") }
run.call(node, '--test', 'admin-service/test/access.test.mjs', 'admin-service/test/content.test.mjs', 'admin-service/test/editor.test.mjs', 'admin-service/test/media.test.mjs', 'admin-service/test/lifecycle.test.mjs', 'admin-service/test/supporting.test.mjs', 'admin-service/test/publication-status.test.mjs')
run.call(node, '--test', 'scripts/tests/publication.test.mjs')
# Use the same Bundler/Jekyll command locally and on the CI runner.
run.call(RbConfig.ruby, '-S', 'bundle', 'exec', 'jekyll', 'build', '--config', options[:config],
         '--destination', options[:output], '--disable-disk-cache')
%w[proposal-rendering proposal-catalogue site-navigation print-layout].each do |name|
  ruby_check.call("scripts/tests/#{name}.rb", options[:output])
end
run.call(node, 'scripts/generate-proposal-pdfs.mjs', options[:output])
run.call(python, 'scripts/tests/pdf-content.py', options[:output])
Dir.mktmpdir('proposal-pdf-check-') do |fixture|
  run.call(node, 'scripts/tests/pdf-rendering.mjs', options[:output], fixture)
end
run.call(python, 'scripts/tests/decode-site-qr.py', File.join(options[:output], 'assets/images/site-qr.png'), SiteQR.destination)
run.call(python, 'scripts/check-build.py', options[:output])
run.call(python, 'scripts/tests/pages-artifact.py', options[:output])
run.call(python, 'scripts/tests/validation-failures.py', options[:output], '--ruby', RbConfig.ruby)
puts "\nWebsite validation passed. No publication or deployment was performed."

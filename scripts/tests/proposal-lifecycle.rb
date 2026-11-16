# frozen_string_literal: true
require 'jekyll'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'nokogiri'
require_relative '../lib/proposal-lifecycle'
checks = 0
assert = ->(condition, message) { raise message unless condition; checks += 1 }
reject = lambda do |&block|
  begin; block.call; raise 'Invalid lifecycle action accepted'; rescue Proposals::FormatError; checks += 1; end
end
paths = Dir[File.join(Proposals::ROOT, '_posts/*.md')].first(2)
originals = paths.to_h { |path| ['_posts/' + File.basename(path), File.read(path, encoding: 'UTF-8')] }
documents = -> { originals.transform_values { |source| Proposals::Document.parse(source) } }
Proposals::SCHEMA['statuses'].permutation(2).each do |from, to|
  docs = documents.call; path = docs.keys.first; docs[path].metadata['status'] = from
  before = Proposals::Document.parse(docs[path].serialize)
  result = Proposals.lifecycle(docs, {'action' => 'status', 'path' => path, 'status' => to}, '[]')
  after = Proposals::Document.parse(result['changes'].first['content'])
  assert.call(after.metadata['status'] == to, 'Status transition failed')
  assert.call(Proposals::Validator.new.validate(after, previous: before).empty?, 'Status transition failed shared validation')
  assert.call(after.body == before.body && %w[proposal_id permalink created_at date].all? { |key| after.metadata[key] == before.metadata[key] }, 'Status changed scientific text or identity')
end
docs = documents.call; docs.each_value { |document| document.metadata['priority'] = 100 }
expected = Proposals.ordered(docs.values.map(&:metadata)).map { |item| item['proposal_id'] }
assert.call(expected == Proposals.ordered(docs.values.reverse.map(&:metadata)).map { |item| item['proposal_id'] }, 'Equal-priority order is unstable')
order = docs.keys.reverse
result = Proposals.lifecycle(docs, {'action' => 'order', 'order' => order}, '[]')
result['changes'].each do |change|
  old = Proposals::Document.parse(originals.fetch(change['path'])); current = Proposals::Document.parse(change['content'])
  assert.call(current.metadata['priority'] == (order.index(change['path']) + 1) * 10 && current.metadata['updated_at'] == old.metadata['updated_at'] && current.body == old.body, 'Reordering changed substantive content/date')
end
reject.call { Proposals.lifecycle(documents.call, {'action'=>'order','order'=>[order.first,order.first]}, '[]') }
reject.call { Proposals.lifecycle(documents.call, {'action'=>'order','order'=>[]}, '[]') }
first = documents.call.keys.first; document = documents.call.fetch(first)
reject.call { Proposals.lifecycle(documents.call, {'action'=>'delete','path'=>first}, '[]') }
removed = Proposals.lifecycle(documents.call, {'action'=>'delete','path'=>first,'confirmation'=>document.metadata['proposal_id']}, '[]')
registry = Proposals.load_yaml(removed['changes'].first['content'], mapping: false)
remaining = documents.call.reject { |path,_| path == first }
assert.call(Proposals.removed!(registry, remaining, previous: documents.call).length == 1, 'Removal registry failed')
reject.call { Proposals.removed!([], remaining, previous: documents.call) }
reject.call { Proposals.removed!(registry, documents.call) }

# Rebuild the same output after deleting its only proposal: no stale page,
# search/feed/catalogue/sitemap/print/PDF entry may survive.
Dir.mktmpdir('proposal-lifecycle-') do |temporary|
  source = File.join(temporary,'source'); output = File.join(temporary,'site'); FileUtils.mkdir_p(source)
  %w[_layouts _includes _data _team _news assets css js favicons news].each do |directory|
    FileUtils.cp_r(File.join(Proposals::ROOT,directory),source) if File.directory?(File.join(Proposals::ROOT,directory))
  end
  Dir[File.join(Proposals::ROOT,'*.{html,json,xml}')].each { |path| FileUtils.cp(path,source) }
  FileUtils.mkdir_p(File.join(source,'_posts'))
  name = File.basename(paths.first); document = Proposals::Document.read(paths.first)
  File.write(File.join(source,'_posts',name),document.serialize)
  config = Jekyll.configuration('source'=>source,'destination'=>output,'config'=>File.join(Proposals::ROOT,'_config.yml'),'plugins_dir'=>File.join(Proposals::ROOT,'_plugins'),'quiet'=>true,'disable_disk_cache'=>true)
  id = document.metadata['proposal_id']; url = document.metadata['permalink']
  %w[available taken archived].each do |status|
    document.metadata['status'] = status
    document.metadata['updated_at'] = [Time.now.utc, Proposals.time(document.metadata['updated_at']) + 1].max.iso8601
    File.write(File.join(source,'_posts',name),document.serialize)
    Jekyll::Site.new(config).process
    detail = File.read(File.join(output,url.delete_prefix('/'),'index.html'))
    assert.call(detail.include?('proposal-status-' + status), 'Detail status did not update')
    search = JSON.parse(File.read(File.join(output,'search.json'))).find { |item| item['url'] == url }
    assert.call(search && search['status'] == status, 'Search status did not update')
    assert.call(File.read(File.join(output,'index.html')).include?(url) == (status == 'available'), 'Homepage availability did not update')
    {'posts' => status == 'available', 'archive' => status != 'available'}.each do |catalogue, visible|
      cards = Nokogiri::HTML5(File.read(File.join(output,catalogue,'index.html'))).css('.catalogue-card').reject { |card| card.key?('hidden') }
      assert.call(cards.any? { |card| card['data-proposal-id'] == id } == visible, 'Catalogue/archive membership did not update')
    end
    assert.call(File.read(File.join(output,'feed.xml')).include?(%(<category domain="availability">#{status}</category>)), 'Feed status did not update')
    assert.call(JSON.parse(File.read(File.join(output,'pdf-manifest.json')))['proposals'].any? { |entry| entry['id'] == id && entry['revision'] == document.metadata['updated_at'] }, 'PDF revision did not update')
  end
  pdf_directory = File.join(output,'assets/pdf'); FileUtils.mkdir_p(pdf_directory)
  File.binwrite(File.join(pdf_directory,id+'.pdf'),'%PDF-stale')
  File.delete(File.join(source,'_posts',name))
  registry = [document.metadata.slice('proposal_id','permalink').merge('removed_at'=>Time.now.utc.iso8601)]
  File.write(File.join(source,'_data/removed_proposals.yml'),YAML.dump(registry))
  Jekyll::Site.new(config).process
  page = File.read(File.join(output,url.delete_prefix('/'),'index.html'))
  assert.call(page.include?('Proposal removed') && page.include?('noindex') && !page.include?(document.metadata['title']), 'Old URL does not show a generic removal notice')
  %w[search.json feed.xml news-feed.xml sitemap.xml posts/index.html archive/index.html].each do |path|
    content = File.read(File.join(output,path))
    assert.call(!content.include?(id) && !content.include?(url), "Deleted proposal remains in #{path}")
  end
  assert.call(JSON.parse(File.read(File.join(output,'pdf-manifest.json')))['proposals'].empty?, 'Deleted PDF manifest entry survived')
  assert.call(!File.exist?(File.join(output,'print/proposals',id,'index.html')), 'Stale print page survived rebuild')
  node = ENV.fetch('NODE','node')
  raise 'Empty catalogue PDF cleanup failed' unless system(node,File.join(Proposals::ROOT,'scripts/generate-proposal-pdfs.mjs'),output)
  assert.call(!File.exist?(File.join(pdf_directory,id+'.pdf')), 'Deleted PDF survived generation')
  assert.call(File.file?(File.join(source,'assets/images/branding/bfh.png')), 'Shared source media was deleted')
end
puts "#{checks} lifecycle checks pass: six transitions, stable ordering/dates, confirmation, removed URLs and clean empty-catalogue output."

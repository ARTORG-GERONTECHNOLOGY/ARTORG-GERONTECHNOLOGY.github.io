# frozen_string_literal: true
require_relative '../lib/proposal-renderer'
require 'nokogiri'

output = ARGV[0] ? File.expand_path(ARGV[0]) : File.expand_path('../../../.local/site', __dir__)
expected = ['Background', 'Aim', 'Materials and Methods', 'Nature of the Thesis', 'Requirements', 'Supervisors', 'Institutes', 'Contact', 'Student eligibility', 'Proposal administration']
count = 0
check = lambda do |condition, message|
  raise message unless condition
  count += 1
end
paths = Dir[File.join(Proposals::ROOT, '_posts/*.md')]
paths.each do |path|
  proposal = Proposals::Document.read(path)
  data = proposal.metadata
  page_path = File.join(output, data.fetch('permalink').sub(%r{^/}, ''), 'index.html')
  html = Nokogiri::HTML5(File.read(page_path, encoding: 'UTF-8'))
  article = html.at_css('article.proposal-page') || html.at_css('.proposal-page article')
  check.call(article, "Missing proposal article: #{path}")
  headings = article.css('.proposal-content h2').map(&:text)
  check.call(headings.reject { |heading| heading == 'References' } == expected, "Section order/duplicates: #{path}: #{headings}")
  check.call(headings.count('References') == (proposal.sections.key?('References') ? 1 : 0), "Optional references: #{path}")
  check.call(article.at_css('[itemprop=datePublished]')['datetime'] == Proposals.time(data.fetch('date')).iso8601, "Publication date: #{path}")
  check.call(article.at_css('.proposal-status').text == data.fetch('status').capitalize, "Status: #{path}")
  check.call(article.css('.proposal-related .proposal-status').all? { |badge| badge.text == 'Available' }, "Unavailable recommendation: #{path}")
  check.call(article.at_css('#eligibility').parent.text.include?(Proposals::SCHEMA.fetch('eligibilities').fetch(data.fetch('student_eligibility'))), "Eligibility: #{path}")
  check.call(article.at_css("a[href='mailto:#{data.fetch('contact').fetch('email')}']"), "Contact link: #{path}")
  article.css('.proposal-program img, .proposal-neighbours a, .proposal-related a').each do |node|
    target = node['src'] || node['href']
    local = File.join(output, target.sub(%r{^/}, ''))
    check.call(File.file?(local) || File.file?(File.join(local, 'index.html')), "Missing local target #{target}")
  end
end
renderer = Proposals::Renderer.new
unsafe = '<script>alert(1)</script><img src="https://example.org/a.png" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><iframe src="https://example.org"></iframe>'
clean = Nokogiri::HTML5.fragment(renderer.markdown(unsafe))
check.call(clean.css('script, iframe, [onerror], a[href]').empty?, 'Executable author HTML retained')
check.call(clean.at_css('img')['src'] == 'https://example.org/a.png', 'Safe image lost')
check.call(renderer.markdown('{{ site.title }} {% include secret.html %}').include?('{{ site.title }}'), 'Author Liquid interpreted')
check.call(Proposals::Renderer.new(baseurl: '/preview').markdown('[local](/search/)').include?('href="/preview/search/"'), 'Base URL not applied')
short = Proposals::Document.read(paths.first)
short.body = "## Background\nÜberblick — étude\n\n## Aim\nShort aim.\n\n## Materials and Methods\nA method.\n\n## Requirements\n- A requirement.\n"
rendered = renderer.render(short)
check.call(rendered.fetch('sections').length == 4 && rendered.fetch('narrative_html').include?('Überblick'), 'Short Unicode sections lost')
short.body = short.body.sub('Short aim.', ('Long aim with scientific details. ' * 400))
check.call(renderer.render(short).fetch('minutes') > 1, 'Long proposal reading time missing')
entries = [{ 'proposal_id'=>'b', 'priority'=>1, 'date'=>'2026-01-01T12:00:00Z' }, { 'proposal_id'=>'a', 'priority'=>1, 'date'=>'2026-01-01T12:00:00Z' }, { 'proposal_id'=>'c', 'priority'=>0, 'date'=>'2020-01-01T12:00:00Z' }]
check.call(Proposals.ordered(entries).map { |entry| entry['proposal_id'] } == %w[c a b], 'Deterministic priority/date/ID ordering')
check.call(!File.exist?(File.join(output, '_plugins')) && !File.exist?(File.join(output, 'Gemfile.lock')), 'Private build inputs copied to site')
puts "#{count} proposal rendering checks passed across #{paths.length} pages."

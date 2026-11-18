# frozen_string_literal: true
require_relative "../lib/proposal-catalogue"
require "nokogiri"
require "json"

output = File.expand_path(ARGV.fetch(0, "../.local/site"))
documents = Dir[File.join(Proposals::ROOT, "_posts/*.md")].map { |path| Proposals::Document.read(path) }
entries = documents.map do |document|
  document.metadata.merge("proposal" => Proposals::Renderer.new.render(document))
end
ordered = Proposals.catalogue(entries)
count = 0
check = lambda { |condition, message| raise message unless condition; count += 1 }
%w[posts posts-by-year posts-by-categories].each do |base|
  (["all"] + Proposals::SCHEMA.fetch("statuses")).each do |status|
    path = File.join(output, base, status == "available" ? "" : status, "index.html")
    html = Nokogiri::HTML5(File.read(path, encoding: "UTF-8"))
    cards = html.css(".catalogue-card")
    visible = cards.reject { |card| card.key?("hidden") }
    expected = ordered.select { |entry| status == "all" || entry.fetch("status") == status }.map { |entry| entry.fetch("proposal_id") }
    check.call(visible.map { |card| card["data-proposal-id"] }.uniq.sort == expected.sort, "Static #{status} membership: #{base}")
    check.call(visible.all? { |card| status == "all" || card["data-status"] == status }, "Status leak: #{base}")
    check.call(html.at_css(".catalogue-count").text.strip == "#{expected.length} proposal#{expected.length == 1 ? '' : 's'}", "Duplicate-aware count: #{base}")
    check.call(cards.map { |card| card["data-proposal-id"] }.uniq.sort == ordered.map { |entry| entry.fetch("proposal_id") }.sort, "Interactive source loses proposals: #{base}")
    html.css(".catalogue-group").each do |group|
      ids = group.css(".catalogue-card").map { |card| card["data-proposal-id"] }
      check.call(ids == ordered.map { |entry| entry.fetch("proposal_id") }.select { |id| ids.include?(id) }, "Group order drift: #{base}")
    end
    cards.each do |card|
      project = ordered.find { |entry| entry.fetch("proposal_id") == card["data-proposal-id"] }
      check.call(card.at_css("h3 a")["href"] == project.fetch("url"), "Changed detail URL")
      check.call(card.css("time").map { |time| time["datetime"] } == %w[date created_at updated_at].map { |field| project.fetch("dates").fetch(field).fetch("iso") }, "Lost timestamp distinction")
    end
  end
end
home = Nokogiri::HTML5(File.read(File.join(output, "index.html"), encoding: "UTF-8"))
%w[archive archive/by-year archive/by-category].each do |base|
  %w[all unavailable taken archived].each do |status|
    path = File.join(output, base, status == "unavailable" ? "" : status, "index.html")
    html = Nokogiri::HTML5(File.read(path, encoding: "UTF-8"))
    allowed = status == "all" ? Proposals::SCHEMA.fetch("statuses") : (status == "unavailable" ? %w[taken archived] : [status])
    expected = ordered.select { |entry| allowed.include?(entry.fetch("status")) }.map { |entry| entry.fetch("proposal_id") }
    visible = html.css(".catalogue-card").reject { |card| card.key?("hidden") }
    check.call(visible.map { |card| card["data-proposal-id"] }.uniq.sort == expected.sort, "Archive scope mismatch: #{base} #{status}")
    check.call(html.at_css(".catalogue-count").text.strip == "#{expected.length} proposal#{expected.length == 1 ? '' : 's'}", "Archive count: #{base}")
    check.call(html.css('#filter-eligibility, [data-eligibility]').empty?, "Retired eligibility filter or card field")
    check.call(html.at_css('#filter-status option[value=all]').text == 'All Statuses', "All Statuses option missing")
    check.call(html.css('#primary-navigation [aria-current=page]').empty?, "Archive has no corresponding main navigation tab")
    html.css(".catalogue-status-links a, .catalogue-view-links a").each do |link|
      check.call(File.file?(File.join(output, link["href"].sub(%r{^/}, ""), "index.html")), "Broken static browsing link")
    end
  end
end
home_urls = home.css(".home-projects h3 a").map { |link| link["href"] }
check.call(home_urls == Proposals.home_proposals(ordered).first(5).map { |entry| entry.fetch("url") }, "Homepage differs from ordered available/featured projects")
fixture = [
  {"proposal_id"=>"newer", "priority"=>5, "date"=>"2026-01-01T12:00:00Z"},
  {"proposal_id"=>"older", "priority"=>0, "date"=>"2020-01-01T12:00:00Z"},
  {"proposal_id"=>"b", "priority"=>5, "date"=>"2025-01-01T12:00:00Z"},
  {"proposal_id"=>"a", "priority"=>5, "date"=>"2025-01-01T12:00:00Z"}
]
check.call(Proposals.ordered(fixture).map { |entry| entry["proposal_id"] } == %w[older newer a b], "Priority/date/ID contract")
puts "#{count} catalogue checks passed: static statuses, grouped ordering, counts, unchanged URLs/dates and homepage consistency."

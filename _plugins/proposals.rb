# frozen_string_literal: true

require_relative "../scripts/lib/proposal-renderer"
require_relative "../scripts/lib/proposal-catalogue"
require_relative "../scripts/lib/media"

Jekyll::Hooks.register :site, :post_read do |site|
  renderer = Proposals::Renderer.new(baseurl: site.baseurl)
  posts = site.posts.docs
  documents = posts.to_h { |post| [post.path, Proposals::Document.read(post.path)] }
  failures = Proposals::Validator.new.validate_set(documents).reject { |_path, errors| errors.empty? }
  unless failures.empty?
    raise Jekyll::Errors::FatalException, failures.map { |path, errors| "#{path}: #{errors.join('; ')}" }.join("\n")
  end
  posts.each do |post|
    post.data["public_attachments"] = Media.proposal!(post.data, site.source)
    post.data["proposal"] = renderer.render(documents.fetch(post.path))
    post.data["render_with_liquid"] = false
    # Excerpts and feeds only see sanitized HTML, never executable author Liquid.
    post.content = post.data.fetch("proposal").fetch("narrative_html")
    post.data.delete("excerpt")
    post.instance_variable_set(:@excerpt, nil)
  end
  ordered = Proposals.ordered(posts.map(&:data))
  catalogue = Proposals.catalogue(ordered)
  site.data["proposal_catalogue"] = catalogue
  site.data["available_proposals"] = catalogue.select { |project| project.fetch("status") == "available" }
  site.data["proposal_years"] = catalogue.map { |project| project.fetch("year") }.uniq.sort.reverse
  posts.each do |post|
    index = ordered.index { |data| data.fetch("proposal_id") == post.data.fetch("proposal_id") }
    link = lambda { |data| data && {"title" => data.fetch("title"), "url" => data.fetch("permalink"), "status" => data.fetch("status")} }
    post.data["proposal_navigation"] = {
      "previous" => index.positive? ? link.call(ordered[index - 1]) : nil,
      "next" => link.call(ordered[index + 1]),
      "related" => ordered.select { |data| data["status"] == "available" && data["proposal_id"] != post.data["proposal_id"] }.first(2).map(&link)
    }
  end
end

Jekyll::Hooks.register :posts, :post_convert do |post|
  post.content = post.data.fetch("proposal").fetch("narrative_html") if post.data["proposal"]
end

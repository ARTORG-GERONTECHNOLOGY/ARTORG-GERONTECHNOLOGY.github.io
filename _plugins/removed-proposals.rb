# frozen_string_literal: true
require_relative '../scripts/lib/proposal-lifecycle'
class RemovedProposalPages < Jekyll::Generator
  priority :high
  def generate(site)
    documents = site.posts.docs.to_h { |post| [post.path, Proposals::Document.read(post.path)] }
    Proposals.removed!(site.data.fetch('removed_proposals', []), documents).each do |entry|
      page = Jekyll::PageWithoutAFile.new(site, site.source, '', 'removed-' + entry.fetch('proposal_id') + '.html')
      page.data = {'layout' => 'proposal-removed', 'title' => 'Proposal removed', 'permalink' => entry.fetch('permalink'), 'noindex' => true}
      site.pages << page
    end
  end
end

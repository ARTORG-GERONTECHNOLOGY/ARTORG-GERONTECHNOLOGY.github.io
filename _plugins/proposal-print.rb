# frozen_string_literal: true
require 'json'
require_relative '../scripts/lib/site-qr'
class ProposalPrintPages < Jekyll::Generator
  def generate(site)
    manifest = site.posts.docs.map do |post|
      id = post.data.fetch('proposal_id')
      print = Jekyll::PageWithoutAFile.new(site, site.source, "print/proposals/#{id}", 'index.html')
      # Source permalinks must not overwrite the public proposal page.
      print.data = post.data.merge('layout' => 'proposal-print', 'permalink' => "/print/proposals/#{id}/")
      print.content = ''
      site.pages << print
      {
        'id' => id, 'title' => post.data.fetch('title'),
        'revision' => post.data.fetch('proposal')['dates']['updated_at']['iso'],
        'print_url' => site.baseurl + print.url, 'page_url' => post.url,
        'pdf' => "/assets/pdf/#{id}.pdf"
      }
    end
    page = Jekyll::PageWithoutAFile.new(site, site.source, '', 'pdf-manifest.json')
    page.data = {'layout' => nil}
    page.content = JSON.pretty_generate({
      'baseurl' => site.baseurl, 'public_url' => SiteQR.destination,
      'program' => site.data['program']['program_name'],
      'branding' => site.data['program']['branding'], 'proposals' => manifest
    })
    site.pages << page
  end
end

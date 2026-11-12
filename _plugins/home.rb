# frozen_string_literal: true
require_relative "../scripts/lib/site-content"
require_relative "../scripts/lib/proposal-catalogue"

module SiteContent
  class Homepage < Jekyll::Generator
    def generate(site)
      SiteContent.home!(site.data["home"], site.source)
      site.data["home_proposals"] = Proposals.home_proposals(site.data.fetch("proposal_catalogue"))
    rescue Proposals::FormatError => error
      raise Jekyll::Errors::FatalException, error.message
    end
  end
end

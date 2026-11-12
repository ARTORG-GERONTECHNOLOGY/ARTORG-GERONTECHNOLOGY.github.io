# frozen_string_literal: true
require_relative "../scripts/lib/site-content"

module SiteContent
  class About < Jekyll::Generator
    def generate(site)
      SiteContent.about!(site.data["about"])
      page = site.pages.find { |candidate| candidate.url == "/about/" }
      page.data["title"] = site.data.fetch("about").fetch("title") if page
    rescue Proposals::FormatError => error
      raise Jekyll::Errors::FatalException, "_data/about.yml: #{error.message}"
    end
  end
end

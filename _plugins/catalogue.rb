# frozen_string_literal: true

require_relative "../scripts/lib/proposal-catalogue"

module Proposals
  CATALOGUE_VIEWS = [
    {"mode" => "list", "label" => "List", "base" => "/posts/"},
    {"mode" => "year", "label" => "By year", "base" => "/posts-by-year/"},
    {"mode" => "category", "label" => "By category", "base" => "/posts-by-categories/"}
  ].freeze
  ARCHIVE_VIEWS = [
    {"mode" => "list", "label" => "List", "base" => "/archive/", "default_status" => "unavailable"},
    {"mode" => "year", "label" => "By year", "base" => "/archive/by-year/", "default_status" => "unavailable"},
    {"mode" => "category", "label" => "By category", "base" => "/archive/by-category/", "default_status" => "unavailable"}
  ].freeze

  def self.catalogue_path(view, status)
    view.fetch("base") + (status == view.fetch("default_status", "available") ? "" : "#{status}/")
  end

  class CataloguePages < Jekyll::Generator
    def generate(site)
      entries = site.data.fetch("proposal_catalogue")
      [[CATALOGUE_VIEWS, ["all"] + SCHEMA.fetch("statuses"), false], [ARCHIVE_VIEWS, %w[all unavailable taken archived], true]].each do |views, statuses, archive|
        views.each do |view|
          statuses.each do |status|
            visible_statuses = status == "all" ? SCHEMA.fetch("statuses") : (status == "unavailable" ? %w[taken archived] : [status])
            path = Proposals.catalogue_path(view, status)
            page = site.pages.find { |candidate| candidate.url == path }
            unless page
              page = Jekyll::PageWithoutAFile.new(site, site.source, path.sub(%r{^/}, ""), "index.html")
              page.content = ""
              site.pages << page
            end
            page.data["layout"] = "catalogue"
            label = lambda { |value| {"all" => "All Status", "unavailable" => "Taken and archived"}.fetch(value, value.capitalize) }
            page.data["title"] = archive ? "Proposal archive" : (status == "all" ? "All proposals" : "#{label.call(status)} proposals")
            groups = Proposals.catalogue_groups(entries, view.fetch("mode"))
            groups.each { |group| group["visible"] = group.fetch("projects").any? { |project| visible_statuses.include?(project.fetch("status")) } }
            page.data["catalogue"] = {
              "archive" => archive, "mode" => view.fetch("mode"), "status" => status, "statuses" => visible_statuses, "groups" => groups,
              "visible_count" => entries.count { |project| visible_statuses.include?(project.fetch("status")) },
              "status_links" => statuses.map { |value| {"status" => value, "label" => label.call(value), "url" => Proposals.catalogue_path(view, value)} },
              "view_links" => views.map { |value| {"mode" => value.fetch("mode"), "label" => value.fetch("label"), "url" => Proposals.catalogue_path(value, status)} }
            }
          end
        end
      end
    end
  end
end

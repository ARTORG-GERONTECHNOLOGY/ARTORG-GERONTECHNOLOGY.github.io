# frozen_string_literal: true

require_relative "proposal-renderer"

module Proposals
  # One ordered public projection shared by discovery pages and the homepage.
  def self.catalogue(entries)
    ordered(entries).map do |entry|
      {
        "proposal_id" => entry.fetch("proposal_id"), "title" => entry.fetch("title"),
        "url" => entry.fetch("permalink"), "summary" => entry.fetch("summary"),
        "status" => entry.fetch("status"), "priority" => entry.fetch("priority"),
        "categories" => entry.fetch("categories"), "student_eligibility" => entry.fetch("student_eligibility"),
        "eligibility_label" => SCHEMA.fetch("eligibilities").fetch(entry.fetch("student_eligibility")),
        "category_labels" => entry.fetch("proposal").fetch("category_labels"),
        "year" => entry.fetch("proposal").fetch("dates").fetch("date").fetch("label").split.last,
        "dates" => entry.fetch("proposal").fetch("dates")
      }
    end
  end

  def self.catalogue_groups(entries, mode)
    if mode == "category"
      CATEGORIES.map do |category|
        {"id" => "category-#{category.fetch('id')}", "label" => category.fetch("label"),
         "projects" => entries.select { |entry| entry.fetch("categories").include?(category.fetch("id")) }}
      end.reject { |group| group.fetch("projects").empty? }
    elsif mode == "year"
      entries.map { |entry| entry.fetch("year") }.uniq.sort.reverse.map do |year|
        {"id" => "year-#{year}", "label" => year, "projects" => entries.select { |entry| entry.fetch("year") == year }}
      end
    else
      [{"id" => "all-proposals", "label" => "Projects", "projects" => entries}]
    end
  end
end

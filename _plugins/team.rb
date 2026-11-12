# frozen_string_literal: true
require_relative "../scripts/lib/team"

Jekyll::Hooks.register :site, :post_read do |site|
  renderer = Proposals::Renderer.new(baseurl: site.baseurl)
  profiles = site.collections.fetch("team").docs
  registry = {}
  profiles.each do |profile|
    begin
      source = Proposals::Document.read(profile.path)
      Team.validate!(source, profile.path, site.source)
      id = source.metadata.fetch("team_id")
      raise Proposals::FormatError, "team_id: duplicate #{id.inspect}" if registry.key?(id)
      registry[id] = profile
      profile.data["title"] = source.metadata.fetch("name")
      profile.data["bio_html"] = renderer.markdown(source.body, allow_section_headings: true).strip
      profile.data["render_with_liquid"] = false
      profile.content = profile.data.fetch("bio_html")
      profile.data.delete("excerpt")
      profile.instance_variable_set(:@excerpt, nil)
    rescue Proposals::FormatError => error
      raise Jekyll::Errors::FatalException, "#{profile.path}: #{error.message}"
    end
  end
  site.data["team_profiles"] = registry
  site.data["active_team"] = Team.ordered(profiles.select { |profile| profile.data.fetch("active") })
  memberships = site.posts.docs.to_h do |post|
    [post.data.fetch("proposal_id"), post.data.fetch("supervisors").filter_map { |person| person["team_id"] }]
  end
  profiles.each do |profile|
    profile.data["proposals"] = site.data.fetch("proposal_catalogue").select do |proposal|
      memberships.fetch(proposal.fetch("proposal_id")).include?(profile.data.fetch("team_id"))
    end
  end
  site.posts.docs.each do |post|
    post.data["supervisor_profiles"] = post.data.fetch("supervisors").map do |supervisor|
      person = registry[supervisor["team_id"]]
      {"name" => supervisor.fetch("name"), "url" => person&.url}
    end
  end
end

Jekyll::Hooks.register :team, :post_convert do |profile|
  profile.content = profile.data.fetch("bio_html") if profile.data["bio_html"]
end

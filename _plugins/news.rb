# frozen_string_literal: true
require_relative "../scripts/lib/site-content"

Jekyll::Hooks.register :site, :post_read do |site|
  renderer = Proposals::Renderer.new(baseurl: site.baseurl)
  collection = site.collections["news"]
  next unless collection
  # Only publishable news may enter listings; future items follow Jekyll's setting.
  collection.docs.select! { |document| site.publisher.publish?(document) }
  collection.docs.each do |news|
    begin
      source = Proposals::Document.read(news.path)
      SiteContent.news!(source, site.source)
      news.data["news_dates"] = %w[date updated_at].to_h { |field| [field, renderer.date(source.metadata.fetch(field))] }
      news.data["news_html"] = renderer.markdown(source.body, allow_section_headings: true)
      news.data["render_with_liquid"] = false
      news.content = news.data.fetch("news_html")
      news.data.delete("excerpt")
      news.instance_variable_set(:@excerpt, nil)
    rescue Proposals::FormatError => error
      raise Jekyll::Errors::FatalException, "#{news.path}: #{error.message}"
    end
  end
  site.data["news_items"] = collection.docs.sort_by { |news| [-news.date.to_i, news.url] }
end

Jekyll::Hooks.register :news, :post_convert do |news|
  news.content = news.data.fetch("news_html") if news.data["news_html"]
end

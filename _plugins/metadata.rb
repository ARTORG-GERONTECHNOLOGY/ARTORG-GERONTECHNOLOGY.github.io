# frozen_string_literal: true
require 'nokogiri'
module SiteContent
 class Metadata < Jekyll::Generator
  priority :lowest
  def generate(site)
   public_path=lambda { |url| url && url != '/404.html' && !url.match?(%r{\A/(?:admin|service|api|scripts|templates)(?:/|$)}) }
   pages=site.pages.select { |page| %w[default page catalogue].include?(page.data['layout']) && public_path.call(page.url) }
   documents=site.collections.values.select(&:write?).flat_map(&:docs).select { |doc| site.publisher.publish?(doc) && public_path.call(doc.url) }
   site.data['sitemap_entries']=(pages+documents).map do |page|
    data=page.data
    plain=lambda { |text| Nokogiri::HTML5.fragment(text.to_s).text.gsub(/\s+/,' ').strip }
    title=data['name'] || data['title'] || site.data['home']['title']
    description=data['summary']
    description=page.is_a?(Jekyll::Document) ? plain.call(page.content) : title if description.nil? || description=='Project Proposal'
    description=site.data['home']['sections']['introduction'] ? site.data['home']['introduction'] : title if page.url=='/'
    description=site.data.dig('about_paragraphs','overview','text') if page.url=='/about/'
    description=title if description.to_s.empty?
    description="#{data['status'].capitalize}: #{description}" if data['status']
    image=data['figure'] || data['image']
    image=site.data['home']['sections']['introduction'] ? site.data['home']['hero_image'] : nil if page.url=='/'
    data['public_metadata']={'title'=>title,'description'=>description[0,200],'image'=>image,'article'=>%w[post news].include?(data['layout'])}
    {'url'=>page.url,'updated_at'=>data['updated_at']}
   end.uniq { |entry| entry['url'] }.sort_by { |entry| entry['url'] }
  end
 end
end

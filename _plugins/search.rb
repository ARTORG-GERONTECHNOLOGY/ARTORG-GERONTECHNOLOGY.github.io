# frozen_string_literal: true
require 'nokogiri'
module SiteContent
 class SearchIndex < Jekyll::Generator
  priority :lowest
  def generate(site)
   plain = lambda { |html| Nokogiri::HTML5.fragment(html.to_s).text.gsub(/\s+/, ' ').strip }
   entries = site.posts.docs.map do |post|
    data=post.data
    {'type'=>'proposal','title'=>data['title'],'url'=>site.baseurl+post.url,'status'=>data['status'],
     'summary'=>data['summary'],'text'=>plain.call([post.content,data['proposal']['application_html'],data['start_date_text'],data['workplace']].join(' ')),'categories'=>data['proposal']['category_labels'],'tags'=>data['tags'],
     'date'=>data['proposal']['dates']['date']['iso'],
     'updated_at'=>data['proposal']['dates']['updated_at']['iso'],
     'people'=>(data['supervisors']+data['institutes']).map { |person| person['name'] }+[data['contact']['name'],data['contact']['email']]}
   end
   %w[team news].each do |kind|
    site.collections.fetch(kind).docs.select { |doc| site.publisher.publish?(doc) }.each do |doc|
     data=doc.data
     entries << {'type'=>kind,'title'=>data[kind=='team' ? 'name' : 'title'],'url'=>site.baseurl+doc.url,
      'summary'=>data['summary'] || data['role'] || '', 'text'=>plain.call(doc.content),
      'people'=>[data['role'],data['email'],*(data['interests'] || [])].compact,
      'date'=>data['news_dates']&.dig('date','iso'),'updated_at'=>data['news_dates']&.dig('updated_at','iso')}
    end
   end
   home=site.data.fetch('home');about=site.data.fetch('about')
   entries << {'type'=>'page','title'=>home['title'],'url'=>site.baseurl+'/','summary'=>home['sections']['introduction'] ? home['introduction'] : '', 'text'=>''}
   paragraphs=site.data.fetch('about_paragraphs')
   entries << {'type'=>'page','title'=>about['title'],'url'=>site.baseurl+'/about/','summary'=>paragraphs['overview']['text'],
    'text'=>[paragraphs['group_text']['text'],paragraphs['program_text']['text'],about['corrections_text'],about['corrections_email'],*about['application_steps']].join(' ')}
   site.data['search_index']=entries.sort_by { |entry| entry.fetch('url') }
  end
 end
end

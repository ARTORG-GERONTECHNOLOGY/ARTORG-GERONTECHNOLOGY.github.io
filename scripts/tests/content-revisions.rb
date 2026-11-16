# frozen_string_literal: true
require_relative '../lib/content-revisions'
source = File.read(Dir[File.join(Proposals::ROOT,'_posts/*.md')].first,encoding:'UTF-8')
document = Proposals::Document.parse(source)
changed = Proposals::Document.parse(source); changed.metadata['priority'] += 10
raise 'Reordering summary incorrect' unless Proposals.revision_diff(source,changed.serialize,'proposal.md')['summary'] == 'Order changed'
changed = Proposals::Document.parse(source); changed.metadata['status'] = (Proposals::SCHEMA['statuses'] - [document.metadata['status']]).first
changed.metadata['updated_at'] = Time.now.utc.iso8601
raise 'Status summary incorrect' unless Proposals.revision_diff(source,changed.serialize,'proposal.md')['summary'].start_with?('Status changed:')
changed = Proposals::Document.parse(source); changed.body = changed.body.sub('## Background', "## Background\n\nÜnicode <script>alert(1)</script> {% include secret %}")
diff = Proposals.revision_diff(source,changed.serialize,'proposal.md')
raise 'Text diff lost literal unsafe author content or Unicode' unless diff['narrative'].any? { |line| line.start_with?('+') && line.include?('Ünicode <script>') && line.include?('{% include secret %}') }
raise 'Unchanged metadata differs' unless diff['metadata'].empty?
raise 'Identical revision differs' unless Proposals.revision_diff(source,source,'proposal.md')['summary'] == 'No content differences'
raise 'Deleted revision summary incorrect' unless Proposals.revision_diff(source,nil,'proposal.md')['summary'] == 'Content deleted'
raise 'Creation summary incorrect' unless Proposals.revision_diff(nil,source,'proposal.md')['summary'] == 'Content created'
raise 'Legacy/invalid history should remain readable' unless Proposals.revision_diff('Legacy prose without metadata',source,'proposal.md')['warning']
yaml = Proposals.revision_diff("title: Before\n","title: After\n",'_data/home.yml')
raise 'Supporting YAML history cannot be compared' unless yaml['metadata'].first == {'field'=>'title','before'=>'Before','after'=>'After'}
current = Proposals::Document.parse(source); current.metadata['priority'] = 10; current.metadata['title'] = 'Later title'
restored = Proposals::Document.parse(Proposals.restoration(current.serialize,source,current.serialize)['source'])
raise 'Restoration did not preserve order' unless restored.metadata['priority'] == 10 && restored.metadata['title'] == document.metadata['title']
raise 'Restoration did not advance substantive date' unless Proposals.time(restored.metadata['updated_at']) > Proposals.time(current.metadata['updated_at'])
bad = Proposals::Document.parse(source);bad.metadata['proposal_id'] = 'another-id'
begin; Proposals.restoration(current.serialize,bad.serialize,current.serialize); raise 'Historical identity was overwritten'; rescue Proposals::FormatError; end
bad = Proposals::Document.parse(source);bad.metadata['published'] = false
begin; Proposals.restoration(current.serialize,bad.serialize,current.serialize); raise 'An unpublished draft was restored'; rescue Proposals::FormatError; end
puts 'Revision comparison checks pass: ordering, status, text/metadata, Unicode, literal author content, creation/deletion and older formats.'

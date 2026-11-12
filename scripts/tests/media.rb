# frozen_string_literal: true
require 'tmpdir'
require 'fileutils'
require_relative '../lib/media'
checks=0
assert=lambda { |condition| raise 'Media assertion failed' unless condition;checks+=1 }
reject=lambda do |&block|
 begin;block.call;raise 'Unsafe media accepted';rescue Proposals::FormatError;checks+=1;end
end
Dir.mktmpdir('media-fixture-') do |source|
 FileUtils.mkdir_p(File.join(source,'assets/media'))
 png="\x89PNG\r\n\x1a\n".b
 path=File.join(source,'assets/media/shared.png');File.binwrite(path,png)
 result=Media.validate_file!(source,'/assets/media/shared.png',declared_type:'image/png')
 assert.call(result['size']==8)
 reject.call { Media.validate_bytes!('evil.exe','MZ',declared_type:'application/pdf') }
 reject.call { Media.validate_bytes!('../escape.png',png,declared_type:'image/png') }
 reject.call { Media.validate_bytes!('fake.png','<script>',declared_type:'image/png') }
 reject.call { Media.validate_bytes!('fake.png',png,declared_type:'application/pdf') }
 reject.call { Media.validate_bytes!('large.pdf','%PDF-'+('x'*Media::RULES['max_file_bytes']),declared_type:'application/pdf') }
 reject.call { Media.validate_file!(source,'/assets/../secret.pdf',declared_type:'application/pdf') }
 reject.call { Media.validate_file!(source,'/assets/media/missing.pdf',declared_type:'application/pdf') }
 reject.call { Media.asset!(source,'http://example.org/a.png') }
 reject.call { Media.asset!(source,'https://github.com/org/repo/actions/artifacts/1') }
 data={'attachments'=>[{'title'=>'Shared','url'=>'/assets/media/shared.png','mime_type'=>'image/png'}]}
 assert.call(Media.proposal!(data,source).first['size']==8)
 Media.proposal!({'attachments'=>[]},source)
 assert.call(File.file?(path))
 reject.call { Media.proposal!({'attachments'=>[{'title'=>'Remote','url'=>'https://example.org/a.pdf','mime_type'=>'application/pdf'}]},source) }
 reject.call { Media.proposal!({'media'=>[{'kind'=>'video','title'=>'Video','url'=>'https://example.org/a.mp4','poster'=>'/assets/media/shared.png'}]},source) }
 attachments=3.times.map do |index|
  name="/assets/media/#{index}.pdf";File.binwrite(File.join(source,name.delete_prefix('/')),'%PDF-'+('x'*(9*1024*1024)))
  {'title'=>'Large','url'=>name,'mime_type'=>'application/pdf'}
 end
 reject.call { Media.proposal!({'attachments'=>attachments},source) }
 puts "#{checks} media checks passed: MIME/signature/path/size rejection, shared-file retention and metadata requirements."
end

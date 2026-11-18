import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {MediaStore,inspectUpload} from '../media.mjs';
import {ProposalEditor,localSnapshot} from '../editor.mjs';
import {ContentStore} from '../content.mjs';
import {blobSha,conflict} from '../content-policy.mjs';
const authorize=async()=>{};
const python=process.env.ADMIN_PYTHON_EXECUTABLE||process.env.PYTHON||'python';
const generated=spawnSync(python,['-c',`
import io,json,base64,struct,zlib
from PIL import Image
from pypdf import PdfWriter
out={}
for fmt in ('PNG','JPEG','WEBP'):
    b=io.BytesIO();Image.new('RGB',(3,2),'green').save(b,format=fmt);out[fmt]=b.getvalue()
large = Image.new('RGBA',(3000,1500),(10,20,30,128))
b=io.BytesIO();large.save(b,format='PNG');out['LARGE_PNG']=b.getvalue()
oriented = Image.new('RGB',(3000,1500),'green')
exif = Image.Exif();exif[274]=6
b=io.BytesIO();oriented.save(b,format='JPEG',exif=exif);out['ORIENTED_JPEG']=b.getvalue()
for name in ('PDF','JS','ENCRYPTED','EMBEDDED'):
    w=PdfWriter();w.add_blank_page(width=300,height=300)
    if name=='JS':w.add_js('app.alert("unsafe")')
    if name=='ENCRYPTED':w.encrypt('password')
    if name=='EMBEDDED':w.add_attachment('hidden.txt',b'hidden')
    b=io.BytesIO();w.write(b);out[name]=b.getvalue()
for name,size in [('DIMENSION',(12001,1)),('PIXELS',(6500,6500))]:
    png=out['PNG'];chunk=b'IHDR'+struct.pack('>II',*size)+png[24:29]
    out[name]=png[:16]+chunk[4:]+struct.pack('>I',zlib.crc32(chunk))+png[33:]
print(json.dumps({key:base64.b64encode(value).decode() for key,value in out.items()}))
`],{encoding:'utf8',windowsHide:true});
assert.equal(generated.status,0,'trusted fixture generation requires the pinned media Python environment');
const fixture=Object.fromEntries(Object.entries(JSON.parse(generated.stdout)).map(([key,value])=>[key,Buffer.from(value,'base64')]));

test('uploads decode PNG/JPEG/WebP/PDF and reject spoofing, malformed files, unsafe PDFs and dimensions',async()=>{
  const store=new MediaStore(new ProposalEditor());const rules=await store.rules();
  for(const [name,filename,mime] of [['PNG','image.png','image/png'],['JPEG','image.jpg','image/jpeg'],['WEBP','image.webp','image/webp'],['PDF','file.pdf','application/pdf']]){
    const result=await inspectUpload(filename,mime,fixture[name],rules);assert.equal(result.size,fixture[name].length);
  }
  for(const [filename,mime,bytes] of [
    ['image.png','image/jpeg',fixture.PNG],['image.jpg','image/jpeg',fixture.PNG],['image.svg','image/svg+xml',Buffer.from('<svg/>')],
    ['../image.png','image/png',fixture.PNG],['image.png','image/png',fixture.PNG.subarray(0,24)],
    ['file.pdf','application/pdf',Buffer.from('%PDF-1.7\ninvalid')],
    ['file.pdf','application/pdf',fixture.JS],['file.pdf','application/pdf',fixture.ENCRYPTED],['file.pdf','application/pdf',fixture.EMBEDDED],
    ['huge.png','image/png',fixture.DIMENSION],['pixels.png','image/png',fixture.PIXELS]
  ])await assert.rejects(inspectUpload(filename,mime,bytes,rules),error=>error.status===422);
  const session={expires:Date.now()+100000};
  await assert.rejects(store.upload(session,{filename:'file.png',proposalId:'ger-test',mime:'image/png',bytes:Buffer.alloc(rules.max_file_bytes+1)},authorize),error=>error.status===422);
  await assert.rejects(store.upload(session,{filename:'file.png',proposalId:'../bad',mime:'image/png',bytes:fixture.PNG},authorize),error=>error.status===422);
});

test('proposal figure uploads preserve transparency and orientation, and leave attachment and small image bytes intact',async()=>{
  const store=new MediaStore(new ProposalEditor());const session={expires:Date.now()+120000};
  const upload=(filename,mime,bytes,purpose)=>store.upload(session,{filename,proposalId:'ger-test',mime,bytes,purpose},authorize);
  const downloadable=async file=>(await store.file(session,{id:file.id},authorize)).bytes;
  const large=await upload('large.png','image/png',fixture.LARGE_PNG,'figure');
  assert.deepEqual([large.width,large.height,large.resized],[2400,1200,true]);
  const largeBytes=await downloadable(large);
  assert.equal(large.size,largeBytes.length);
  const image=spawnSync(python,['-c','import sys,io; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())); print(im.format, im.size, im.getpixel((0,0))[3])'],{input:largeBytes,encoding:'utf8',windowsHide:true});
  assert.equal(image.status,0);
  assert.equal(image.stdout.trim(),'PNG (2400, 1200) 128');
  const rotated=await upload('portrait.jpg','image/jpeg',fixture.ORIENTED_JPEG,'figure');
  assert.deepEqual([rotated.width,rotated.height],[1200,2400]);
  const rotatedBytes=await downloadable(rotated);
  const decoded=await inspectUpload('portrait.jpg','image/jpeg',rotatedBytes,await store.rules());
  assert.deepEqual([decoded.width,decoded.height],[1200,2400]);
  const attachment=await upload('large.png','image/png',fixture.LARGE_PNG);
  assert.deepEqual(await downloadable(attachment),fixture.LARGE_PNG);
  const small=await upload('small.png','image/png',fixture.PNG,'figure');
  assert.deepEqual(await downloadable(small),fixture.PNG);
  await assert.rejects(upload('file.pdf','application/pdf',fixture.PDF,'figure'),error=>error.status===422);
});

test('temporary files belong to one session, preview safely, download unchanged and expire without repository writes',async()=>{
  let time=Date.now();const editor=new ProposalEditor();const store=new MediaStore(editor,null,{now:()=>time});const session={expires:time+100000};const other={expires:session.expires};
  const before=await localSnapshot();const bootstrap=await editor.bootstrap(authorize);const proposal=bootstrap.proposals[0];
  const uploaded=await store.upload(session,{filename:'Figure ü.png',proposalId:proposal.metadata.proposal_id,mime:'image/png',bytes:fixture.PNG},authorize);
  const duplicate=await store.upload(session,{filename:'Figure ü.png',proposalId:proposal.metadata.proposal_id,mime:'image/png',bytes:fixture.PNG},authorize);assert.equal(duplicate.id,uploaded.id);
  assert.match(uploaded.url,/\/figure-u-[a-f0-9]{16}\.png$/);
  assert.deepEqual((await store.file(session,{id:uploaded.id},authorize)).bytes,fixture.PNG);
  await assert.rejects(store.file(other,{id:uploaded.id},authorize),error=>error.status===404);
  await assert.rejects(store.file(session,{path:'../access.json'},authorize),error=>error.status===422);
  const patch={figure:{src:uploaded.url,alt:'Safe figure',caption:'A temporary example'}};
  const preview=await editor.prepare({operation:'preview',source:proposal.source,patch},authorize,store.temporary(session));
  assert.ok(preview.html.includes('data:image/png;base64,'+fixture.PNG.toString('base64')));
  assert.equal((await localSnapshot()).head,before.head);
  store.purge(active=>active===other);assert.equal(store.entries.size,0,'sign-out or rotation drops session uploads');
  const missing=await editor.prepare({operation:'preview',source:proposal.source,patch},authorize);
  assert.equal(missing.ready,false);assert.ok(missing.previewErrors['figure.src']);
  await store.upload(session,{filename:'new.png',proposalId:proposal.metadata.proposal_id,mime:'image/png',bytes:fixture.PNG},authorize);
  time=session.expires;store.purge(()=>true);assert.equal(store.entries.size,0);
});

test('proposal and selected uploads commit atomically; conflicts/failures retain uploads and unlinking retains shared files',async()=>{
  let snapshot=await localSnapshot();let commits=0;let fail=false;
  const provider={snapshot:async()=>snapshot,commit:async(head,changes)=>{
    if(fail)throw Error('simulated failure');if(head!==snapshot.head)throw conflict(snapshot.head);
    const files=new Map(snapshot.files);for(const item of changes){const bytes=item.bytes||Buffer.from(item.content);files.set(item.path,{bytes,sha:blobSha(bytes)});}
    snapshot={files,head:blobSha(Buffer.from('media commit '+ ++commits))};return snapshot.head;
  }};
  const content=new ContentStore(provider);const editor=new ProposalEditor(content);const store=new MediaStore(editor,content);const session={expires:Date.now()+100000};
  const bootstrap=await editor.bootstrap(authorize);const proposal=bootstrap.proposals[0];const context={path:proposal.path,sha:proposal.sha,baseCommit:bootstrap.baseCommit};
  const uploaded=await store.upload(session,{filename:'figure.png',proposalId:proposal.metadata.proposal_id,mime:'image/png',bytes:fixture.LARGE_PNG,purpose:'figure'},authorize);
  const preparedImage=(await store.file(session,{id:uploaded.id},authorize)).bytes;
  assert.equal(uploaded.resized,true);
  const candidate=await editor.prepare({operation:'publish',source:proposal.source,context,patch:{figure:{src:uploaded.url,alt:'New figure',caption:'New caption'}}},authorize,store.temporary(session));
  const payload={baseCommit:context.baseCommit,changes:[{path:context.path,sha:context.sha,content:candidate.source}],uploads:[uploaded.id]};
  fail=true;await assert.rejects(store.save(session,payload,authorize));assert.equal(commits,0);assert.ok(!snapshot.files.has(uploaded.url.slice(1)));assert.equal(store.temporary(session).length,1);
  fail=false;const saved=await store.save(session,payload,authorize);assert.equal(commits,1);assert.equal(saved.files.length,2);assert.deepEqual(snapshot.files.get(uploaded.url.slice(1)).bytes,preparedImage);
  assert.equal(store.temporary(session).length,0,'confirmed saves release committed temporary files');
  await assert.rejects(store.save(session,{...payload,uploads:[]},authorize),error=>error.status===409);assert.equal(commits,1);
  const unlinked=await editor.prepare({operation:'publish',source:candidate.source,context:{...context,baseCommit:saved.commit},patch:{figure:null}},authorize);
  await store.save(session,{baseCommit:saved.commit,changes:[{path:context.path,sha:saved.files.find(file=>file.path===context.path).sha,content:unlinked.source}],uploads:[]},authorize);
  assert.equal(commits,2);assert.ok(snapshot.files.has(uploaded.url.slice(1)),'shared assets are retained');
  await assert.rejects(store.save({...session},payload,authorize),error=>error.status===422);
});

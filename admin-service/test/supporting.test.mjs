import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ProposalEditor,localSnapshot} from '../editor.mjs';
import {SupportingEditor} from '../supporting.mjs';
import {ContentStore} from '../content.mjs';
import {MediaStore} from '../media.mjs';
import {blobSha,conflict} from '../content-policy.mjs';
import {ContentRevisions} from '../revisions.mjs';
const authorize=async()=>{};
async function fixture(){
  let snapshot=await localSnapshot();
  let count=0;const versions=new Map([[snapshot.head,{snapshot,parents:[],paths:[...snapshot.files.keys()]}]]);
  const provider={snapshot:async()=>snapshot,commit:async(head,changes)=>{if(head!==snapshot.head)throw conflict(snapshot.head);const files=new Map(snapshot.files);for(const item of changes){const bytes=item.bytes||Buffer.from(item.content);files.set(item.path,{bytes,sha:blobSha(bytes)});}snapshot={head:blobSha(Buffer.from('support '+ ++count)),files};versions.set(snapshot.head,{snapshot,parents:[head],paths:changes.map(item=>item.path)});return snapshot.head;},
    history:async(path)=>({hasMore:false,revisions:[...versions].reverse().filter(([,value])=>value.paths.includes(path)).map(([commit])=>({commit,time:new Date().toISOString(),author:'Fixture shared author (not verified)',message:'Update fixture content'}))}),
    revision:async(path,commit)=>{const value=versions.get(commit);const source=value.snapshot.files.get(path);const before=value.parents[0]&&versions.get(value.parents[0]).snapshot.files.get(path);return {commit,parents:value.parents,time:new Date().toISOString(),author:'Fixture shared author (not verified)',message:'Update fixture content',source:source?.bytes.toString('utf8')||null,before:before?.bytes.toString('utf8')||null,fileSha:source?.sha||null};}};
  const store=new ContentStore(provider);const editor=new ProposalEditor(store);const supporting=new SupportingEditor(editor);const media=new MediaStore(editor,store);
  return {store,editor,supporting,media,snapshot:()=>snapshot};
}
test('Home/About forms retain source on no-op, render trusted public templates and keep canonical QR',async()=>{
  const f=await fixture();const bootstrap=await f.supporting.bootstrap(authorize);const home=bootstrap.items.find(item=>item.kind==='home');const about=bootstrap.items.find(item=>item.kind==='about');
  const same=await f.supporting.prepare({operation:'compose',source:home.source,path:home.path},authorize);assert.equal(same.source,home.source);assert.equal(same.changed,false);
  const page=await f.supporting.prepare({operation:'preview',source:home.source,path:home.path,patch:{title:'Fixture homepage ü',introduction:'Literal {% include secret %} <script>unsafe</script>',sections:{introduction:true,proposals:false,news:true}}},authorize);
  assert.equal(page.ready,true);assert.ok(page.html.includes('Fixture homepage ü'));assert.ok(page.html.includes('{% include secret %}'));assert.ok(!page.html.includes('home-proposals-title'));assert.ok(!/<script\b/i.test(page.html));
  const info=await f.supporting.prepare({operation:'preview',source:about.source,path:about.path,patch:{overview:'Fixture About overview links to [this institution](https://example.org/institution).'}},authorize);
  assert.equal(info.ready,true);assert.match(info.html,/<p>Fixture About overview links to <a href="https:\/\/example\.org\/institution">this institution<\/a>\.<\/p>/);assert.ok(info.html.includes(bootstrap.qrDestination));assert.ok(info.html.includes('data:image/png;base64,'));
  const invalidLink=await f.supporting.prepare({operation:'preview',source:about.source,path:about.path,patch:{overview:'[Bad link](http://example.org/)'}},authorize);
  assert.equal(invalidLink.ready,false);assert.match(invalidLink.errors.overview[0],/HTTPS/);
  await assert.rejects(f.supporting.prepare({operation:'publish',source:about.source,path:about.path,patch:{qr_url:'https://wrong.example/'}},authorize),error=>error.status===422);
  const context={path:home.path,kind:'home',baseCommit:bootstrap.baseCommit,sha:home.sha};
  const draft=await f.supporting.prepare({operation:'download',source:home.source,path:home.path,context,patch:{title:'Unfinished home'}},authorize);
  await assert.rejects(f.store.save({baseCommit:bootstrap.baseCommit,changes:[{path:home.path,sha:home.sha,content:draft.source}]},authorize),error=>error.status===422);
  const reopened=await f.supporting.prepare({operation:'parse',source:draft.source},authorize);assert.equal(reopened.kind,'home');assert.deepEqual(reopened.context,context);assert.equal(reopened.metadata.title,'Unfinished home');
});

test('retired Team content cannot be created, imported, uploaded or restored',async()=>{
  const f=await fixture();
  const oldPath='_team/retired-profile.md';
  const oldDraft='---\nlayout: team\nteam_id: retired-profile\nname: Retired profile\n---\n';
  const revisions=new ContentRevisions(f.editor,{supporting:f.supporting});
  const session={expires:Date.now()+120000};
  await assert.rejects(f.supporting.prepare({operation:'new',kind:'team'},authorize),error=>error.status===422);
  await assert.rejects(f.supporting.prepare({operation:'parse',source:oldDraft},authorize),error=>error.status===422);
  await assert.rejects(f.media.upload(session,{filename:'old.png',target:oldPath,mime:'image/png',bytes:Buffer.from('image')},authorize),error=>error.status===422);
  await assert.rejects(revisions.list(oldPath,1,authorize),error=>error.status===422);
  await assert.rejects(revisions.preview(session,{path:oldPath},authorize),error=>error.status===422);
});

test('News creation uses a separate collection, preserves dates/URLs and renders safe Markdown',async()=>{
  const f=await fixture();const beforePosts=[...f.snapshot().files].filter(([path])=>path.startsWith('_posts/'));
  const news=await f.supporting.prepare({operation:'new',kind:'news'},authorize);
  const candidate=await f.supporting.prepare({operation:'publish',source:news.source,path:news.path,patch:{title:'Fixture news — ü',summary:'An announcement',image:{src:'/assets/images/branding/bfh.png',alt:'News fixture image'}},body:'## Announcement\n\n**Text** {% include secret %}\n<script>alert(1)</script>'},authorize);
  assert.equal(candidate.ready,true);assert.match(candidate.path,/^_news\//);
  const saved=await f.media.save({expires:Date.now()+7200000},{baseCommit:f.snapshot().head,changes:[{path:news.path,sha:null,content:candidate.source}],uploads:[]},authorize);assert.equal(saved.live,false);
  const preview=await f.supporting.prepare({operation:'preview',source:candidate.source,path:news.path},authorize);assert.ok(preview.html.includes('Fixture news — ü'));assert.ok(preview.html.includes('{% include secret %}'));assert.ok(!preview.html.includes('alert(1)'));
  assert.ok(preview.html.includes('/admin/api/media/image?path='),'preview images use authenticated reads');
  for(const [path,file] of beforePosts)assert.deepEqual(f.snapshot().files.get(path).bytes,file.bytes);
  const changed=await f.supporting.prepare({operation:'publish',source:candidate.source,path:news.path,patch:{summary:'Updated announcement'}},authorize);
  assert.equal(changed.metadata.date,candidate.metadata.date);assert.equal(changed.metadata.permalink,candidate.metadata.permalink);assert.ok(new Date(changed.metadata.updated_at)>new Date(candidate.metadata.updated_at));
  const home=(await f.supporting.bootstrap(authorize)).items.find(item=>item.kind==='home');const homepage=await f.supporting.prepare({operation:'preview',source:home.source,path:home.path},authorize);
  assert.ok(homepage.html.includes('Fixture news — ü'));const proposalSection=homepage.html.split('home-proposals-title')[1].split('</section>')[0];assert.ok(!proposalSection.includes('Fixture news'));
});

test('homepage images save with their owner and cannot be published as another content item’s upload',async()=>{
  const f=await fixture();const session={expires:Date.now()+7200000};const home=(await f.supporting.bootstrap(authorize)).items.find(item=>item.kind==='home');
  const bytes=await fs.readFile(new URL('../../assets/images/branding/bfh.png',import.meta.url));const upload=await f.media.upload(session,{filename:'hero.png',target:home.path,mime:'image/png',bytes},authorize);assert.ok(upload.url.startsWith('/assets/media/home/homepage/'));
  const value=await f.supporting.prepare({operation:'publish',source:home.source,path:home.path,patch:{hero_image:{src:upload.url,alt:'Home fixture image'}}},authorize,f.media.temporary(session));assert.equal(value.ready,true);
  const committed=await f.media.save(session,{baseCommit:f.snapshot().head,changes:[{path:home.path,sha:home.sha,content:value.source}],uploads:[upload.id]},authorize);assert.equal(committed.files.length,2);
  const privateUpload=await f.media.upload(session,{filename:'other.png',target:home.path,mime:'image/png',bytes},authorize);const news=await f.supporting.prepare({operation:'new',kind:'news'},authorize);
  const article=await f.supporting.prepare({operation:'publish',source:news.source,path:news.path,patch:{title:'Cross-owner fixture',summary:'Summary',image:{src:privateUpload.url,alt:'Image'}},body:'Body'},authorize,f.media.temporary(session));
  await assert.rejects(f.media.save(session,{baseCommit:f.snapshot().head,changes:[{path:news.path,sha:null,content:article.source}],uploads:[privateUpload.id]},authorize),error=>error.status===422);
  await assert.rejects(f.media.upload(session,{filename:'wrong.png',target:'_config.yml',mime:'image/png',bytes},authorize),error=>error.status===422);
  await assert.rejects(f.media.upload(session,{filename:'document.pdf',target:home.path,mime:'application/pdf',bytes},authorize),error=>error.status===422);
});

test('Home/About/News updates expose history and restore safely without altering news publication',async()=>{
  const f=await fixture();const session={expires:Date.now()+7200000};const revisions=new ContentRevisions(f.editor,{supporting:f.supporting});
  const news=await f.supporting.prepare({operation:'new',kind:'news'},authorize);const fresh=await f.supporting.prepare({operation:'publish',source:news.source,path:news.path,patch:{title:'Restorable news fixture',summary:'Original summary'},body:'Original news body'},authorize);
  await f.media.save(session,{baseCommit:f.snapshot().head,changes:[{path:fresh.path,sha:null,content:fresh.source}],uploads:[]},authorize);
  const initial=await f.supporting.bootstrap(authorize);const selectedCommit=f.snapshot().head;const chosen=['home','about','news'].map(kind=>initial.items.find(item=>item.kind===kind));
  const changes=[];
  for(const item of chosen){const patch=item.kind==='home'?{title:'Changed homepage'}:item.kind==='about'?{overview:'Changed overview'}:{summary:'Changed news'};
    const changed=await f.supporting.prepare({operation:'publish',path:item.path,source:item.source,patch},authorize);assert.equal(changed.ready,true);changes.push({path:item.path,sha:item.sha,content:changed.source});}
  await f.store.save({baseCommit:f.snapshot().head,changes},authorize);
  for(const item of chosen){const history=await revisions.list(item.path,1,authorize);assert.ok(history.revisions.length>=2);const detail=await revisions.detail(item.path,history.revisions[0].commit,authorize);assert.ok(detail.diff.metadata.length);
    const current=f.snapshot();const preview=await revisions.preview(session,{path:item.path,commit:selectedCommit,baseCommit:current.head,sha:current.files.get(item.path).sha},authorize);assert.ok(preview.html);
    await revisions.restore(session,{previewId:preview.previewId,confirmation:selectedCommit},authorize);
    const restored=(await f.supporting.bootstrap(authorize)).items.find(value=>value.path===item.path);
    if(item.kind==='home')assert.equal(restored.metadata.title,item.metadata.title);
    if(item.kind==='about')assert.equal(restored.metadata.overview,item.metadata.overview);
    if(item.kind==='news'){assert.equal(restored.metadata.summary,item.metadata.summary);assert.equal(restored.metadata.date,item.metadata.date);assert.equal(restored.metadata.permalink,item.metadata.permalink);}
  }
});

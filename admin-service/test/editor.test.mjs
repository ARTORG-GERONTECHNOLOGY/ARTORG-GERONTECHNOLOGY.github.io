import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ProposalEditor, localSnapshot} from '../editor.mjs';
import {ContentStore} from '../content.mjs';
import {blobSha, conflict} from '../content-policy.mjs';

const authorize=async()=>{};

test('editor draft download, reopen, field validation and immutable publication metadata', async()=>{
  const editor=new ProposalEditor();
  const bootstrap=await editor.bootstrap(authorize);
  assert.ok(bootstrap.proposals.length>0);
  assert.equal(bootstrap.canPublish,false);
  const original=bootstrap.proposals[0];
  const context={path:original.path,sha:original.sha,baseCommit:bootstrap.baseCommit};
  const untouched=await editor.prepare({operation:'compose',source:original.source,context},authorize);
  assert.equal(untouched.source,original.source,'an unchanged proposal round-trips byte for byte');
  const changed=await editor.prepare({operation:'publish',source:original.source,context,patch:{title:'Ünicode “proposal” — Parkinson’s '+ 'long title '.repeat(25)}},authorize);
  assert.equal(changed.ready,true);
  for(const key of ['proposal_id','created_at','date','permalink'])assert.equal(changed.metadata[key],original.metadata[key]);
  assert.ok(new Date(changed.metadata.updated_at)>new Date(original.metadata.updated_at));
  const draft=await editor.prepare({operation:'download',source:changed.source,context},authorize);
  assert.equal(draft.metadata.published,false);
  const oldDraft=draft.source.replace(/^---\r?\n/,'---\nstudent_eligibility: bme_only\n');
  const reopened=await editor.prepare({operation:'parse',source:oldDraft},authorize);
  assert.equal(Object.hasOwn(reopened.metadata,'student_eligibility'),false);
  assert.doesNotMatch(reopened.source,/^student_eligibility:/m);
  assert.deepEqual(reopened.context,context);
  assert.equal(reopened.metadata.title,changed.metadata.title);
  const publish=await editor.prepare({operation:'publish',source:reopened.source,context:reopened.context},authorize);
  assert.equal(publish.ready,true);
  assert.ok(!publish.source.includes('_editor_draft:'));
  assert.notEqual(publish.metadata.published,false);
  const invalid=await editor.prepare({operation:'compose',source:original.source,context,patch:{workload:[{activity:'Review',percentage:20}],contact:{name:'Name',email:'invalid'}}},authorize);
  assert.equal(invalid.ready,false);assert.ok(invalid.errors.workload);assert.ok(invalid.errors['contact.email']);
  const fresh=await editor.prepare({operation:'new'},authorize);
  assert.match(fresh.metadata.proposal_id,/^ger-[a-f0-9]{32}$/);
  assert.equal(fresh.metadata.date,'');assert.equal(fresh.ready,false);
  const downloaded=await editor.prepare({operation:'download',source:fresh.source,context:{baseCommit:bootstrap.baseCommit,sha:null}},authorize);
  assert.equal(downloaded.metadata.published,false);
  const imported=await editor.prepare({operation:'parse',source:await fs.readFile(new URL('../../templates/proposal.md',import.meta.url),'utf8')},authorize);
  assert.match(imported.metadata.proposal_id,/^ger-/);
  await assert.rejects(editor.prepare({operation:'compose',source:original.source,context:{path:'../private.md'}},authorize),error=>error.status===422);
});

test('preview shares proposal sections, sanitizes authors and renders math without client scripts',async()=>{
  const editor=new ProposalEditor();const bootstrap=await editor.bootstrap(authorize);const original=bootstrap.proposals[0];
  const background='\nÜnicode Parkinson’s\n\n| Test | Value |\n| --- | --- |\n| Data | 42 |\n\n```ruby\nputs "safe"\n## Aim\n```\n\n$$x^2 + y^2 = z^2$$\n\n<script>alert("unsafe")</script>\n<img src="x" onerror="alert(1)">\n{% include secret.txt %}\n\n';
  const preview=await editor.prepare({operation:'preview',source:original.source,context:{path:original.path},sections:{Background:background},patch:{figure:{src:'/assets/images/branding/bfh.png',alt:'Figure ü',caption:'Safe caption'}}},authorize);
  assert.ok(preview.html);
  assert.match(preview.html,/<table>/);assert.match(preview.html,/<pre/);
  assert.match(preview.html,/MathJax_SVG/);assert.match(preview.html,/<svg/);
  assert.ok(!/<script\b|\sonerror=|\sonclick=|<iframe\b/i.test(preview.html));
  assert.match(preview.html,/{% include secret.txt %}/);
  assert.match(preview.html,/data:image\/png;base64,/);
  for(const heading of ['Nature of the Thesis','Supervisors','Institutes','Contact'])assert.ok(preview.html.includes(heading));
  assert.doesNotMatch(preview.html,/Student eligibility/);
  assert.match(preview.html,/script-src &#39;none&#39;|script-src 'none'/);
  const changed=await editor.prepare({operation:'compose',source:original.source,sections:{Background:background}},authorize);
  assert.equal(changed.sections.Aim,original.sections.Aim);
  assert.equal(changed.sections['Materials and Methods'],original.sections['Materials and Methods']);
  const fresh=await editor.prepare({operation:'new'},authorize);
  const blankPreview=await editor.prepare({operation:'preview',source:fresh.source},authorize);
  assert.ok(blankPreview.html,'incomplete blank proposals can be previewed');
});

test('editor candidate saves atomically through the existing gate and stale drafts cannot overwrite',async()=>{
  let snapshot=await localSnapshot();let commits=0;
  const provider={snapshot:async()=>snapshot,commit:async(head,changes)=>{
    if(head!==snapshot.head)throw conflict(snapshot.head);
    const files=new Map(snapshot.files);
    for(const item of changes){const bytes=Buffer.from(item.content);files.set(item.path,{bytes,sha:blobSha(bytes)});}
    snapshot={head:blobSha(Buffer.from('commit '+ ++commits)),files};return snapshot.head;
  }};
  const content=new ContentStore(provider);const editor=new ProposalEditor(content);
  const bootstrap=await editor.bootstrap(authorize);const original=bootstrap.proposals[0];
  const context={path:original.path,sha:original.sha,baseCommit:bootstrap.baseCommit};
  const result=await editor.prepare({operation:'publish',source:original.source,context,patch:{summary:original.metadata.summary+' Editor verification.'}},authorize);
  assert.equal(result.ready,true);
  const payload={baseCommit:context.baseCommit,changes:[{path:context.path,sha:context.sha,content:result.source}]};
  const saved=await content.save(payload,authorize);assert.equal(saved.live,false);assert.equal(commits,1);assert.equal(saved.files[0].sha,blobSha(Buffer.from(result.source)));
  await assert.rejects(content.save(payload,authorize),error=>error.status===409);assert.equal(commits,1);
  const draft=await editor.prepare({operation:'download',source:result.source,context},authorize);
  await assert.rejects(content.save({baseCommit:snapshot.head,changes:[{path:context.path,sha:saved.files[0].sha,content:draft.source}]},authorize));
  assert.equal(commits,1,'private draft is never committed');
  const fresh=await editor.prepare({operation:'new'},authorize);
  const keys=['title','summary','categories','status','supervisors','institutes','contact','workload','language'];
  const candidate=await editor.prepare({operation:'publish',source:fresh.source,patch:Object.fromEntries(keys.map(key=>[key,original.metadata[key]])),sections:original.sections},authorize);
  assert.equal(candidate.ready,true);
  const path='_posts/'+candidate.metadata.date.slice(0,10)+'-project-'+candidate.metadata.proposal_id+'.md';
  const created=await content.save({baseCommit:snapshot.head,changes:[{path,sha:null,content:candidate.source}]},authorize);
  assert.equal(created.state,'committed_validation_pending');assert.equal(commits,2);
});

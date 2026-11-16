import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProposalEditor,localSnapshot} from '../editor.mjs';
import {ContentStore} from '../content.mjs';
import {blobSha,conflict,ContentError} from '../content-policy.mjs';
const authorize=async()=>{};
async function fixture(){
  let snapshot=await localSnapshot();let commits=0;let fail=false;
  const provider={snapshot:async()=>snapshot,commit:async(head,changes)=>{
    if(head!==snapshot.head)throw conflict(snapshot.head);if(fail)throw new ContentError(502,'save_rejected','Simulated failed commit');
    const files=new Map(snapshot.files);for(const item of changes){if(item.delete)files.delete(item.path);else{const bytes=item.bytes||Buffer.from(item.content);files.set(item.path,{bytes,sha:blobSha(bytes)});}}
    snapshot={files,head:blobSha(Buffer.from('lifecycle '+ ++commits))};return snapshot.head;
  }};
  const store=new ContentStore(provider);const editor=new ProposalEditor(store);
  return {editor,store,snapshot:()=>snapshot,commits:()=>commits,fail:value=>{fail=value;}};
}
test('six status transitions are atomic and preserve proposal URLs; stale changes are rejected',async()=>{
  const f=await fixture();const bootstrap=await f.editor.bootstrap(authorize);const proposal=bootstrap.proposals[0];const a=proposal.metadata.status;const [b,c]=bootstrap.statuses.filter(value=>value!==a);
  for(const status of [b,c,a,c,b,a]){
    const snapshot=f.snapshot();const file=snapshot.files.get(proposal.path);
    const result=await f.editor.lifecycle({action:'status',path:proposal.path,status,baseCommit:snapshot.head,sha:file.sha},authorize);
    assert.equal(result.state,'committed_validation_pending');assert.equal(result.live,false);
  }
  assert.equal(f.commits(),6);
  await assert.rejects(f.editor.lifecycle({action:'status',path:proposal.path,status:b,baseCommit:bootstrap.baseCommit,sha:proposal.sha},authorize),error=>error.status===409);
  await assert.rejects(f.editor.lifecycle({action:'status',path:'_config.yml',status:b,baseCommit:f.snapshot().head,sha:proposal.sha},authorize),error=>error.status===422);
  assert.equal(f.commits(),6);
});
test('reorder commits all priorities together, retains timestamps and fails safely on stale/invalid orders',async()=>{
  const f=await fixture();const bootstrap=await f.editor.bootstrap(authorize);const order=bootstrap.proposals.map(item=>item.path).reverse();
  const payload={action:'order',baseCommit:bootstrap.baseCommit,order};
  f.fail(true);await assert.rejects(f.editor.lifecycle(payload,authorize));assert.equal(f.commits(),0);assert.equal(f.snapshot().head,bootstrap.baseCommit);
  f.fail(false);await f.editor.lifecycle(payload,authorize);assert.equal(f.commits(),1);
  const next=await f.editor.bootstrap(authorize);assert.deepEqual(next.proposals.map(item=>item.path),order);
  for(const item of next.proposals){const before=bootstrap.proposals.find(old=>old.path===item.path);for(const key of ['proposal_id','date','permalink','created_at','updated_at'])assert.equal(item.metadata[key],before.metadata[key]);assert.deepEqual(item.sections,before.sections);}
  await assert.rejects(f.editor.lifecycle(payload,authorize),error=>error.status===409);
  await assert.rejects(f.editor.lifecycle({action:'order',baseCommit:next.baseCommit,order:order.slice(1)},authorize),error=>error.status===422);
  await assert.rejects(f.editor.lifecycle({action:'order',baseCommit:next.baseCommit,order:order.map(()=>order[0])},authorize),error=>error.status===422);
  assert.equal(f.commits(),1);
});
test('deletion needs confirmation, reserves the old URL atomically and keeps shared files',async()=>{
  const f=await fixture();const bootstrap=await f.editor.bootstrap(authorize);const item=bootstrap.proposals[0];
  const payload={action:'delete',path:item.path,baseCommit:bootstrap.baseCommit,sha:item.sha};
  await assert.rejects(f.editor.lifecycle(payload,authorize),error=>error.status===422);assert.equal(f.commits(),0);
  const assets=[...f.snapshot().files].filter(([path])=>path.startsWith('assets/'));
  f.fail(true);await assert.rejects(f.editor.lifecycle({...payload,confirmation:item.metadata.proposal_id},authorize));assert.ok(f.snapshot().files.has(item.path));assert.equal(f.commits(),0);
  f.fail(false);const result=await f.editor.lifecycle({...payload,confirmation:item.metadata.proposal_id},authorize);
  assert.equal(f.commits(),1);assert.equal(result.files.find(file=>file.path===item.path).sha,null);assert.ok(!f.snapshot().files.has(item.path));
  const registry=f.snapshot().files.get('_data/removed_proposals.yml');assert.ok(registry.bytes.toString().includes(item.metadata.proposal_id));assert.ok(registry.bytes.toString().includes(item.metadata.permalink));
  const forged=registry.bytes.toString()+"- proposal_id: ger-unrelated\n  permalink: /unrelated-page/\n  removed_at: '2026-11-16T10:00:00Z'\n";
  await assert.rejects(f.store.save({baseCommit:f.snapshot().head,changes:[{path:'_data/removed_proposals.yml',sha:registry.sha,content:forged}]},authorize),error=>error.status===422);
  for(const [path,file] of assets)assert.deepEqual(f.snapshot().files.get(path).bytes,file.bytes);
  await assert.rejects(f.store.save({baseCommit:f.snapshot().head,changes:[{path:'_data/removed_proposals.yml',sha:registry.sha,content:'[]\n'}]},authorize),error=>error.status===422);
  await assert.rejects(f.store.save({baseCommit:f.snapshot().head,changes:[{path:item.path,sha:null,content:item.source}]},authorize),error=>error.status===422);
  assert.equal(f.commits(),1);
});

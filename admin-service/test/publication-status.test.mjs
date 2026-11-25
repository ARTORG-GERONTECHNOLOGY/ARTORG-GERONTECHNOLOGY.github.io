import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPublicationFacts,readPublicRecord,publicationEntries,PublicationStatus} from '../publication-status.mjs';
import {ContentError} from '../content-policy.mjs';
import {policy} from '../content-policy.mjs';

const id=letter=>letter.repeat(40);
const file='_data/home.yml';
function fixture(){
  const data={head:id('a'),main:id('c'),blob:id('1'),liveBlob:id('1'),live:id('c'),deployment:'success',pages:'success',merged:true,candidate:null,candidateState:'in_progress',public:id('c'),extra:[],calls:[]};
  const run=(kind,revision,conclusion,branch='main')=>({id:kind==='pages'?100:90,run_attempt:1,path:'.github/workflows/'+(kind==='pages'?'publish-pages':'validate')+'.yml',repository:{full_name:policy.repository},head_sha:revision,head_branch:branch,status:conclusion==='in_progress'?'in_progress':'completed',conclusion:conclusion==='in_progress'?null:conclusion});
  data.api=async(method,route)=>{data.calls.push({method,route});assert.equal(method,'GET');
    if(route==='/git/ref/heads/content/staff')return {object:{sha:data.head}};
    if(route==='/git/ref/heads/main')return {object:{sha:data.main}};
    if(route.startsWith('/compare/')){const from=route.slice(9).split('...')[0];return !data.merged&&route.startsWith('/compare/'+data.head+'...'+data.main)?{status:'diverged',merge_base_commit:{sha:id('e')}}:{status:'ahead',merge_base_commit:{sha:from}};}
    if(route.startsWith('/git/commits/')){const sha=route.split('/').at(-1);return {tree:{sha},parents:sha===data.candidate?[{sha:data.main},{sha:data.head}]:[],message:sha===data.candidate?(data.tampered?'Forged candidate':`Publish validated staff content\n\nStaff-Content: ${data.head}\nMain-Base: ${data.main}`):''};}
    if(route.startsWith('/git/trees/')){const sha=route.split('/').at(-1).split('?')[0];return {truncated:false,tree:[{path:file,mode:'100644',type:'blob',sha:sha===data.live?data.liveBlob:sha===id('b')?id('2'):data.blob}]};}
    if(route.startsWith('/actions/workflows/validate.yml/runs?')){const revision=new URL('https://example.test'+route).searchParams.get('head_sha');return {workflow_runs:[run('validation',revision,revision===data.candidate?data.candidateState:'success','content/staff')]};}
    if(route.startsWith('/actions/workflows/publish-pages.yml/runs?')){const revision=new URL('https://example.test'+route).searchParams.get('head_sha');return {workflow_runs:[run('pages',revision,data.pages),...data.extra]};}
    if(route==='/actions/workflows/publish-content.yml/runs?per_page=20')return {workflow_runs:[]};
    if(route.startsWith('/git/matching-refs/'))return data.candidate?[{ref:'refs/heads/publication/staff-'+data.head+'-'+data.main,object:{sha:data.candidate}}]:[];
    if(route==='/deployments?environment=github-pages&per_page=20')return [{id:12,sha:data.live,environment:'github-pages',creator:{login:'human-workflow-trigger'},performed_via_github_app:{slug:data.deploymentApp||'github-actions'}}];
    if(route==='/deployments/12/statuses?per_page=1')return [{state:data.deployment}];
    throw Error('Unexpected fixture request: '+route);
  };return data;
}
test('Live evidence requires matching public metadata, successful Pages deployment and exact successful workflow',async()=>{
  const f=fixture();const facts=await readPublicationFacts(f.api,f.head,{revision:f.public});assert.equal(facts.live.revision,f.live);assert.equal(facts.live.files[file],f.blob);assert.ok(facts.live.url.endsWith('/100'));
  f.deployment='failure';assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null);
  f.deployment='success';f.public=id('d');assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null);
  f.public=f.live;f.pages='failure';assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null);
  f.pages='in_progress';assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null);
  f.pages='success';f.deploymentApp='unrelated-app';assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null,'the recorded human trigger is not deployment proof; the Actions integration must match');
});
test('an older actual successful deployment remains distinguishable from a newer failed attempt',async()=>{
  const f=fixture();f.pages='failure';f.extra=[{id:80,path:'.github/workflows/publish-pages.yml',repository:{full_name:policy.repository},head_sha:f.live,head_branch:'main',status:'completed',conclusion:'success'}];
  const facts=await readPublicationFacts(f.api,f.head,{revision:f.public});assert.equal(facts.pages.conclusion,'failure');assert.equal(facts.live.revision,f.live);
  f.extra[0].path='.github/workflows/unrelated.yml';assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public})).live,null);
});
test('a manual commit deployment is matched to its public revision and exact run',async()=>{
  const f=fixture();f.public=id('d');
  f.extra=[{id:110,path:'.github/workflows/publish-pages.yml',repository:{full_name:policy.repository},head_sha:f.main,head_branch:'main',event:'workflow_dispatch',display_title:`Publish commit ${f.public}`,status:'completed',conclusion:'success'}];
  const facts=await readPublicationFacts(f.api,f.head,{revision:f.public,run_id:'110'});
  assert.equal(facts.live.revision,f.public);assert.ok(facts.live.url.endsWith('/110'));
  assert.equal(facts.pages.id,100);
  assert.equal((await readPublicationFacts(f.api,f.head,{revision:f.public,run_id:'111'})).live,null);
});
test('facts retain exact requested and newer file identities without treating save/check success as deployment',async()=>{
  const f=fixture();f.head=id('b');const facts=await readPublicationFacts(f.api,id('a'),null);assert.equal(facts.commit,id('a'));assert.equal(facts.head,id('b'));assert.equal(facts.selected[file],id('1'));assert.equal(facts.current[file],id('2'));assert.equal(facts.live,null);assert.equal(facts.publicUnavailable,true);
  await assert.rejects(readPublicationFacts(f.api,'not-a-revision',null),error=>error.status===422);
  const wrong=async(method,route)=>route.startsWith('/compare/')?{status:'diverged',merge_base_commit:{sha:id('f')}}:f.api(method,route);await assert.rejects(readPublicationFacts(wrong,id('a'),null),error=>error.status===422);
});
test('merged candidate identities map checks to the saved staff head while the old live site remains separate',async()=>{
  const f=fixture();f.merged=false;f.candidate=id('d');f.blob=id('2');f.liveBlob=id('1');let facts=await readPublicationFacts(f.api,f.head,{revision:f.public});assert.equal(facts.candidate,f.candidate);assert.equal(facts.candidateValidation.head_sha,f.candidate);assert.equal(facts.selected[file],id('2'));assert.equal(facts.live.files[file],id('1'));assert.equal(publicationEntries(facts)[0].state,'building');
  f.candidateState='failure';facts=await readPublicationFacts(f.api,f.head,{revision:f.public});assert.equal(publicationEntries(facts)[0].state,'failed');f.tampered=true;await assert.rejects(readPublicationFacts(f.api,f.head,{revision:f.public}),/mapping mismatch/);
});
test('public revision reads use only canonical HTTPS without credentials or redirects and reject malformed/oversized metadata',async()=>{
  let requested;
  const fetcher=async(url,options)=>{requested={url:String(url),options};return new Response(JSON.stringify({schema:1,revision:id('c'),staff_revision:id('a'),content:[]}));};
  assert.equal((await readPublicRecord(fetcher)).revision,id('c'));assert.equal(requested.url,'https://artorg-gerontechnology.github.io/publication.json');assert.equal(requested.options.redirect,'error');assert.ok(!Object.keys(requested.options.headers).some(name=>name.toLowerCase()==='authorization'));
  await assert.rejects(readPublicRecord(async()=>new Response('{bad json')));await assert.rejects(readPublicRecord(async()=>new Response(JSON.stringify({schema:1,revision:'bad',content:[]}))));await assert.rejects(readPublicRecord(async()=>new Response('x'.repeat(1024*1024+1))));
});
test('pending, building, failed and unavailable labels retain saved versions and provide trusted run links',()=>{
  const facts={paths:[file],selected:{[file]:id('1')},current:{[file]:id('1')},production:null,validation:null,candidateValidation:null,acceptance:null,pages:null,live:null};
  assert.equal(publicationEntries(facts)[0].state,'pending');
  facts.validation={status:'in_progress',url:'https://github.com/'+policy.repository+'/actions/runs/1'};assert.equal(publicationEntries(facts)[0].state,'building');
  facts.validation={status:'completed',conclusion:'failure',url:facts.validation.url};let result=publicationEntries(facts)[0];assert.equal(result.state,'failed');assert.match(result.message,/saved revision is kept/);assert.ok(result.logs.length);
  facts.validation.conclusion='success';facts.pages={status:'completed',conclusion:'success',url:facts.validation.url};assert.equal(publicationEntries(facts)[0].state,'unavailable');
});
test('later publication can contain an earlier exact save; newer versions do not become Live from an older deployment',()=>{
  const facts={paths:[file],selected:{[file]:id('1')},current:{[file]:id('1')},production:{[file]:id('1')},live:{revision:id('c'),files:{[file]:id('1')},url:'https://github.com/'+policy.repository+'/actions/runs/1'}};
  let entry=publicationEntries(facts)[0];assert.equal(entry.state,'live');assert.equal(entry.live,true);
  facts.current[file]=id('2');entry=publicationEntries(facts)[0];assert.equal(entry.state,'live');assert.match(entry.message,/newer version is also saved/);
  facts.selected[file]=id('2');facts.production=null;entry=publicationEntries(facts)[0];assert.equal(entry.state,'pending');assert.equal(entry.live,false,'an old deployment must not mark a newer version live');
  facts.selected[file]=id('3');assert.equal(publicationEntries(facts)[0].state,'superseded');
  facts.current[file]=id('3');facts.production={[file]:id('4')};assert.equal(publicationEntries(facts)[0].state,'superseded','a maintainer revert must not be reported as the staff version live');
});
test('deletions are tracked as saved absence and recovery supersedes the earlier removal',()=>{
  const facts={paths:[file],selected:{},current:{},production:{},live:{files:{},url:'https://github.com/'+policy.repository+'/actions/runs/1'}};
  assert.equal(publicationEntries(facts)[0].state,'live');facts.live.files[file]=id('1');assert.equal(publicationEntries(facts)[0].state,'pending');facts.current[file]=id('2');assert.equal(publicationEntries(facts)[0].state,'superseded');
});
test('cached reports reauthorize, local review never fetches and failed refreshes never reuse an old Live label',async()=>{
  let now=1000,calls=0,allowed=true,failure=false;const authorize=async()=>{if(!allowed)throw new ContentError(401,'session_ended','Session ended');};
  const facts={commit:id('a'),head:id('a'),main:id('c'),paths:[file],selected:{[file]:id('1')},current:{[file]:id('1')},live:{revision:id('c'),files:{[file]:id('1')},url:'https://github.com/'+policy.repository+'/actions/runs/1'}};
  const content={provider:{publicationFacts:async()=>{calls++;if(failure)throw Error('Offline');return facts;}}};
  const status=new PublicationStatus(content,{now:()=>now,publicRecord:async()=>null});assert.equal((await status.get(id('a'),authorize)).entries[0].state,'live');await status.get(id('a'),authorize);assert.equal(calls,1);
  allowed=false;await assert.rejects(status.get(id('a'),authorize),error=>error.status===401);allowed=true;failure=true;now+=16000;const unavailable=await status.get(id('a'),authorize);assert.equal(unavailable.state,'unavailable');assert.equal(unavailable.entries.length,0);
  const local=new PublicationStatus(null,{publicRecord:async()=>{throw Error('Local review must never fetch');}});assert.equal((await local.get(id('a'),authorize)).state,'local_review');
  await assert.rejects(status.get('wrong',authorize),error=>error.status===422);
});
test('session revocation wins a slow status read without losing access to the retained working copy',async()=>{
  let active=true;const authorize=async()=>{if(!active)throw new ContentError(401,'session_ended','Session ended');};
  const status=new PublicationStatus({provider:{publicationFacts:async()=>{active=false;return {paths:[],head:id('a'),main:id('c'),live:null};}}},{publicRecord:async()=>null});
  await assert.rejects(status.get(id('a'),authorize),error=>error.status===401);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {publicationMetadata} from '../publication.mjs';
import {entries,treeSha,mergePlan,prepare,promote,candidate,verifyRun,GitHubPublication} from '../lib/publication.mjs';
import {policy,blobSha} from '../../admin-service/content-policy.mjs';
const hash=value=>createHash('sha1').update(value).digest('hex');
const file=(path,text,mode='100644')=>({path,mode,type:'blob',sha:blobSha(Buffer.from(text)),size:Buffer.byteLength(text)});
class Repository{
  constructor(){this.objects=new Map();this.trees=new Map();this.refs=new Map();this.checks=new Map();this.calls=[];this.serial=0;const base=this.add(new Map([['_data/home.yml',file('_data/home.yml','Original')],['index.html',file('index.html','Trusted code')]]),[]);this.base=base;this.refs.set('main',base);this.staff=this.edit(base,'_data/home.yml','Staff edit');this.refs.set('content/staff',this.staff);this.checks.set(this.staff,true);}
  add(files,parents,message='Fixture commit'){const tree=treeSha(files);this.trees.set(tree,new Map(files));const sha=hash(JSON.stringify([tree,parents,message,++this.serial]));this.objects.set(sha,{sha,tree:{sha:tree},parents:parents.map(sha=>({sha})),message});return sha;}
  edit(parent,path,text){const files=new Map(this.trees.get(this.objects.get(parent).tree.sha));files.set(path,file(path,text));return this.add(files,[parent]);}
  async head(branch){return this.refs.get(branch)||null;}
  async commit(id){return this.objects.get(id);}
  async tree(id){return this.trees.get(id);}
  ancestors(id){const found=[];const queue=[id];while(queue.length){const current=queue.shift();if(found.includes(current))continue;found.push(current);queue.push(...this.objects.get(current).parents.map(item=>item.sha));}return found;}
  async common(main,staff){const older=this.ancestors(main);return this.ancestors(staff).find(id=>older.includes(id));}
  async passed(id){return this.checks.get(id)===true;}
  async dispatch(workflow,ref,inputs){this.calls.push({workflow,ref,inputs});}
  async api(method,route,body){this.calls.push({method,route,body});if(route==='/git/trees'){const files=new Map(this.trees.get(body.base_tree));for(const change of body.tree){if(change.sha){let found;for(const values of this.trees.values())for(const item of values.values())if(item.sha===change.sha)found=item;assert.ok(found);files.set(change.path,found);}else files.delete(change.path);}const sha=treeSha(files);this.trees.set(sha,files);return {sha};}
    if(route==='/git/commits')return this.objects.get(this.add(this.trees.get(body.tree),body.parents,body.message));
    if(route==='/git/refs'){assert.ok(!this.refs.has(body.ref.slice(11)));this.refs.set(body.ref.slice(11),body.sha);return {};}
    if(route==='/git/refs/heads/main'){assert.equal(body.force,false);if(this.race){this.refs.set('main',this.race);this.race=null;}if(!this.ancestors(body.sha).includes(this.refs.get('main')))throw Error('Non-fast-forward rejected');this.refs.set('main',body.sha);return {};}
    throw Error('Unexpected fixture request');}
}

test('publication reproduces actual Git trees and rejects executable/path ambiguity',()=>{
  const result=spawnSync('git',['ls-tree','-rz','--long','HEAD'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0);
  const tree=result.stdout.split('\0').filter(Boolean).map(row=>{const [,mode,type,sha,size,path]=/^(\d+) (\w+) ([a-f0-9]+)\s+(\d+)\t(.*)$/s.exec(row);return {mode,type,sha,size:Number(size),path};});
  const actual=spawnSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8',windowsHide:true}).stdout.trim();assert.equal(treeSha(entries({tree})),actual);
  assert.throws(()=>entries({tree:[file('a','x'),file('A','y')]}),/Ambiguous/);assert.throws(()=>entries({tree:[file('../secret','x')]}),/ordinary/);assert.throws(()=>entries({tree:[file('link','x','120000')]}),/ordinary/);
});
test('trusted merge retains production code, rejects code/media changes and detects competing edits',async()=>{
  const repo=new Repository();const base=await repo.tree((await repo.commit(repo.base)).tree.sha);const staff=await repo.tree((await repo.commit(repo.staff)).tree.sha);
  const main=new Map(base);main.set('index.html',file('index.html','New trusted code'));const plan=mergePlan(base,main,staff);assert.equal(plan.files.get('index.html').sha,main.get('index.html').sha);assert.equal(plan.files.get('_data/home.yml').sha,staff.get('_data/home.yml').sha);
  const bad=new Map(staff);bad.set('scripts/run.mjs',file('scripts/run.mjs','evil'));assert.throws(()=>mergePlan(base,main,bad),/allowlist/);
  const conflict=new Map(main);conflict.set('_data/home.yml',file('_data/home.yml','Maintainer edit'));assert.throws(()=>mergePlan(base,conflict,staff),/independently/);
  const withAsset=new Map(base);withAsset.set('assets/images/a.png',file('assets/images/a.png','old'));assert.throws(()=>mergePlan(withAsset,withAsset,new Map(base)),/Shared media/);
});
test('successful checked publication advances only the exact merge and explicitly requests both workflows',async()=>{
  const repo=new Repository();const prepared=await prepare(repo,repo.staff);assert.equal(prepared.state,'validation_pending');assert.equal(await repo.head('main'),repo.base);assert.equal(repo.calls.at(-1).workflow,'validate.yml');
  const plan=await candidate(repo,prepared.candidate);assert.equal(plan.main,repo.base);assert.equal(plan.staff,repo.staff);
  await assert.rejects(promote(repo,prepared.candidate),/has not passed/);assert.equal(await repo.head('main'),repo.base);
  repo.checks.set(prepared.candidate,true);const accepted=await promote(repo,prepared.candidate);assert.equal(accepted.live,false);assert.equal(await repo.head('main'),prepared.candidate);assert.equal(repo.calls.at(-1).workflow,'publish-pages.yml');assert.equal(repo.calls.at(-1).inputs.revision,prepared.candidate);
  assert.equal((await prepare(repo,repo.staff)).state,'unchanged');
});
test('failed, stale, tampered and racing candidates leave production intact; rollback is a new checked commit',async()=>{
  const repo=new Repository();const first=await prepare(repo,repo.staff);repo.checks.set(first.candidate,true);
  const newer=repo.edit(repo.staff,'_data/home.yml','Newer staff edit');repo.refs.set('content/staff',newer);await assert.rejects(promote(repo,first.candidate),/superseded/);assert.equal(await repo.head('main'),repo.base);repo.refs.set('content/staff',repo.staff);
  const old=await repo.commit(first.candidate);const unsafe=new Map(await repo.tree(old.tree.sha));unsafe.set('index.html',file('index.html','Injected'));const tampered=repo.add(unsafe,old.parents.map(item=>item.sha),old.message);repo.checks.set(tampered,true);await assert.rejects(promote(repo,tampered),/outside/);
  const raced=repo.edit(repo.base,'index.html','New production code');repo.race=raced;await assert.rejects(promote(repo,first.candidate),/Non-fast-forward/);assert.equal(await repo.head('main'),raced);
  repo.checks.set(repo.staff,true);const refreshed=await prepare(repo,repo.staff);repo.checks.set(refreshed.candidate,true);await promote(repo,refreshed.candidate);
  // A reviewed revert adds a staff commit; neither content nor production history is reset.
  const rollback=repo.edit(repo.staff,'_data/home.yml','Original');repo.refs.set('content/staff',rollback);repo.checks.set(rollback,true);const reverted=await prepare(repo,rollback);assert.notEqual(reverted.candidate,repo.base);await assert.rejects(promote(repo,reverted.candidate),/has not passed/);repo.checks.set(reverted.candidate,true);await promote(repo,reverted.candidate);assert.ok(repo.ancestors(reverted.candidate).includes(refreshed.candidate));assert.equal((await repo.tree((await repo.commit(reverted.candidate)).tree.sha)).get('index.html').sha,(await repo.tree((await repo.commit(raced)).tree.sha)).get('index.html').sha);
});
test('workflow results must belong to the configured repository, exact branch/head and trusted validation file',async()=>{
  const sha='a'.repeat(40);const run={id:1,workflow_id:2,head_repository:{full_name:policy.repository},head_sha:sha,head_branch:'content/staff',event:'push',conclusion:'success'};
  const provider={api:async(method,route)=>route.includes('/workflows/')?{path:'.github/workflows/validate.yml'}:{...run,repository:{full_name:policy.repository}},head:async()=>sha};assert.equal((await verifyRun(provider,{workflow_run:run})).head_sha,sha);
  await assert.rejects(verifyRun(provider,{workflow_run:{...run,head_repository:{full_name:'fork/repo'}}}),/successful/);await assert.rejects(verifyRun({...provider,head:async()=>'b'.repeat(40)},{workflow_run:run}),/superseded/);await assert.rejects(verifyRun({...provider,api:async()=>({path:'.github/workflows/fake.yml'})},{workflow_run:run}),/identity/);
});
test('only the newest exact GitHub Actions validation counts; API writes are not retried',async()=>{
  const sha='a'.repeat(40);const runs=[{id:1,name:'Website validation',head_sha:sha,status:'completed',conclusion:'success',app:{slug:'github-actions'}},{id:2,name:'Website validation',head_sha:sha,status:'completed',conclusion:'failure',app:{slug:'github-actions'}}];
  const provider=new GitHubPublication('fixture-token',{fetch:async()=>new Response(JSON.stringify({total_count:2,check_runs:runs}))});assert.equal(await provider.passed(sha),false);runs.pop();assert.equal(await provider.passed(sha),true);runs[0].app.slug='untrusted';assert.equal(await provider.passed(sha),false);
  let calls=0;const failed=new GitHubPublication('fixture-token',{fetch:async()=>{calls++;throw Error('Offline fixture');}});await assert.rejects(failed.api('PATCH','/git/refs/heads/main',{sha,force:false}));assert.equal(calls,1);
});
test('command-line publication fails closed while activation is off and never prints its token',()=>{
  const token='private-fixture-do-not-log';const result=spawnSync(process.execPath,['scripts/publication.mjs','prepare'],{encoding:'utf8',windowsHide:true,env:{...process.env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:policy.repository,GITHUB_REF:'refs/heads/main',GH_TOKEN:token,PUBLICATION_ENABLED:'false'}});
  assert.equal(result.status,1);assert.match(result.stderr,/Publication stopped/);assert.ok(!(result.stdout+result.stderr).includes(token));
});
test('public metadata binds content hashes and history to one clean approved revision without author identities',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'ger-publication-metadata-'));const revision='a'.repeat(40),staff='b'.repeat(40),lastEdit='c'.repeat(40);
  const readGit=(...args)=>args[0]==='rev-parse'?revision:args[0]==='status'?'':args[0]==='ls-files'?'_data/home.yml\0admin-service/private.json\0':args.includes('--format=%B')?'Publish validated staff content\n\nStaff-Content: '+staff+'\nMain-Base: '+'d'.repeat(40):args.includes('--format=%P')?'d'.repeat(40)+' '+staff:lastEdit;
  try{const result=await publicationMetadata(folder,revision,{runId:'123',readGit});assert.equal(result.revision,revision);assert.equal(result.staff_revision,staff);assert.equal(result.content.length,1);assert.equal(result.content[0].revision,lastEdit);assert.equal(result.content[0].sha256,createHash('sha256').update(await fs.readFile('_data/home.yml')).digest('hex'));assert.ok(!JSON.stringify(result).includes('author'));assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'publication.json'),'utf8')),result);
    await assert.rejects(publicationMetadata(folder,revision,{readGit:(...args)=>args[0]==='status'?' M index.html':readGit(...args)}),/clean checkout/);await assert.rejects(publicationMetadata(folder,'e'.repeat(40),{readGit}),/does not match/);
    const manual=await publicationMetadata(folder,revision,{readGit:(...args)=>args.includes('--format=%B')?'Revert earlier publication':readGit(...args)});assert.equal(manual.staff_revision,null,'a maintainer revert must not claim that an ancestor staff save is the deployed content');
  }finally{const resolved=await fs.realpath(folder),temporaryRoot=await fs.realpath(os.tmpdir());if(path.dirname(resolved)!==temporaryRoot||!path.basename(resolved).startsWith('ger-publication-metadata-'))throw Error('Unexpected cleanup path');await fs.rm(resolved,{recursive:true,force:true});}
});

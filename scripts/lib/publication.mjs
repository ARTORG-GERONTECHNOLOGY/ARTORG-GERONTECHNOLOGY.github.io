import {createHash} from 'node:crypto';
import {policy,editable,asset,blobSha,sha} from '../../admin-service/content-policy.mjs';

export const candidatePrefix='publication/staff-';
export const validationWorkflow='.github/workflows/validate.yml';
const equal=(a,b)=>a?.sha===b?.sha&&a?.mode===b?.mode&&a?.type===b?.type;
export function entries(value){
  if(value.truncated||!Array.isArray(value.tree)||value.tree.length>10000)throw Error('Repository tree is incomplete or too large.');
  const result=new Map();
  for(const item of value.tree){
    if(item.type==='tree')continue;
    if(typeof item.path!=='string'||item.path.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x20\x7f\\]/.test(item.path)||!sha(item.sha)||!['100644','100755'].includes(item.mode)||item.type!=='blob')throw Error('Only ordinary repository files are supported.');
    if(result.has(item.path)||[...result.keys()].some(path=>path.toLowerCase()===item.path.toLowerCase()))throw Error('Ambiguous repository paths.');
    result.set(item.path,item);
  }
  return result;
}
// Compute the Git tree identity locally; never trust a candidate branch's code.
export function treeSha(files){
  const root=new Map();
  for(const [path,item] of files){const parts=path.split('/');let node=root;for(const part of parts.slice(0,-1)){if(!node.has(part))node.set(part,new Map());node=node.get(part);if(!(node instanceof Map))throw Error('File/directory collision.');}if(node.has(parts.at(-1)))throw Error('File/directory collision.');node.set(parts.at(-1),item);}
  function digest(node){const data=Buffer.concat([...node].sort(([a,x],[b,y])=>Buffer.compare(Buffer.from(a+(x instanceof Map?'/':'')),Buffer.from(b+(y instanceof Map?'/':'')))).map(([name,item])=>Buffer.concat([Buffer.from((item instanceof Map?'40000':item.mode)+' '+name+'\0'),Buffer.from(item instanceof Map?digest(item):item.sha,'hex')])));return createHash('sha1').update('tree '+data.length+'\0').update(data).digest('hex');}
  return digest(root);
}
export function mergePlan(base,main,staff){
  const files=new Map(main);const changes=[];
  for(const path of new Set([...base.keys(),...staff.keys()])){
    const before=base.get(path),desired=staff.get(path),current=main.get(path);
    if(equal(before,desired))continue;
    if(!editable(path)&&!asset(path))throw Error('Staff changes include a file outside the content allowlist.');
    if(desired?.mode!=='100644'&&desired)throw Error('Staff content must be an ordinary non-executable file.');
    if(asset(path)&&before&&!equal(before,desired))throw Error('Shared media cannot be replaced or deleted.');
    if(!desired&&!path.startsWith('_posts/'))throw Error('Only proposals can be deleted through staff publication.');
    if(!equal(current,before)&&!equal(current,desired))throw Error('Production content changed independently. Resolve the conflict before publication.');
    if(equal(current,desired))continue;
    if(desired)files.set(path,desired);else files.delete(path);
    changes.push({path,mode:'100644',type:'blob',sha:desired?.sha??null});
  }
  return {files,changes,tree:treeSha(files)};
}
export class GitHubPublication {
  constructor(token,{fetch:fetcher=fetch}={}){this.token=token;this.fetch=fetcher;this.prefix='/repos/'+policy.repository;}
  async request(method,route,body,{missing=false}={}){
    const response=await this.fetch('https://api.github.com'+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'GER-trusted-publication','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(missing&&response.status===404)return null;
    if(!response.ok)throw Error('GitHub rejected the publication request ('+response.status+'). No automatic write retry was made.');
    if(response.status===204)return null;
    const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>16*1024*1024)throw Error('GitHub response is too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  api(method,route,body,options){return this.request(method,this.prefix+route,body,options);}
  async head(branch){const ref=await this.api('GET','/git/ref/heads/'+branch,undefined,{missing:true});if(ref===null)return null;if(!sha(ref.object?.sha))throw Error('Invalid branch identity.');return ref.object.sha;}
  async commit(id){if(!sha(id))throw Error('Invalid revision.');const commit=await this.api('GET','/git/commits/'+id);if(commit.sha!==id||!sha(commit.tree?.sha)||!Array.isArray(commit.parents)||commit.parents.some(parent=>!sha(parent.sha)))throw Error('Invalid commit identity.');return commit;}
  async tree(id){const result=entries(await this.api('GET','/git/trees/'+id+'?recursive=1'));if(treeSha(result)!==id)throw Error('Repository tree identity mismatch.');return result;}
  async common(main,staff){const value=await this.api('GET','/compare/'+main+'...'+staff+'?per_page=1');if(!sha(value.merge_base_commit?.sha))throw Error('Branches have no verified common history.');return value.merge_base_commit.sha;}
  async files(tree){
    const files=new Map();let size=0;
    for(const [path,item] of tree){if(!editable(path)&&!asset(path))continue;if(!Number.isInteger(item.size)||item.size>10*1024*1024||editable(path)&&item.size>policy.maxTextBytes)throw Error('Content exceeds publication limits.');const blob=await this.api('GET','/git/blobs/'+item.sha);if(blob.encoding!=='base64'||typeof blob.content!=='string')throw Error('Invalid content blob.');const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64');size+=bytes.length;if(bytes.length!==item.size||blobSha(bytes)!==item.sha||size>policy.maxSnapshotBytes)throw Error('Content identity or size mismatch.');files.set(path,{bytes,sha:item.sha});}return files;
  }
  async passed(id){const value=await this.api('GET','/commits/'+id+'/check-runs?per_page=100');if(value.total_count>100||!Array.isArray(value.check_runs))throw Error('Ambiguous validation results.');const checks=value.check_runs.filter(check=>check.name===policy.requiredCheck&&check.app?.slug==='github-actions'&&check.head_sha===id).sort((a,b)=>b.id-a.id);return checks[0]?.status==='completed'&&checks[0]?.conclusion==='success';}
  async dispatch(workflow,ref,inputs={}){return this.api('POST','/actions/workflows/'+workflow+'/dispatches',{ref,inputs});}
}
export async function planFor(provider,main,staff){
  const [mainCommit,staffCommit,common]=await Promise.all([provider.commit(main),provider.commit(staff),provider.common(main,staff)]);
  const base=await provider.commit(common);
  const [before,current,desired]=await Promise.all([provider.tree(base.tree.sha),provider.tree(mainCommit.tree.sha),provider.tree(staffCommit.tree.sha)]);
  return {...mergePlan(before,current,desired),main,staff,mainTree:mainCommit.tree.sha,previous:current};
}
export async function candidate(provider,id){
  const value=await provider.commit(id);
  if(value.parents.length!==2)throw Error('A publication candidate must retain both production and staff history.');
  const [main,staff]=value.parents.map(parent=>parent.sha);
  if(value.message!==`Publish validated staff content\n\nStaff-Content: ${staff}\nMain-Base: ${main}`)throw Error('Unrecognized publication candidate.');
  const plan=await planFor(provider,main,staff);
  if(plan.tree!==value.tree.sha||!plan.changes.length)throw Error('Candidate contains changes outside the trusted merge plan.');
  return {...plan,id};
}
export async function requestStaffValidation(provider,staff){
  if(!sha(staff)||await provider.head(policy.contentBranch)!==staff)throw Error('The requested staff commit is invalid or has been superseded.');
  await provider.dispatch('validate.yml',policy.contentBranch,{revision:staff});
}
export async function prepare(provider,staff){
  if(!sha(staff)||await provider.head(policy.contentBranch)!==staff)throw Error('A newer staff save exists. Use the latest successful check.');
  if(!await provider.passed(staff))throw Error('The exact staff revision has not passed Website validation.');
  const main=await provider.head(policy.productionBranch);const plan=await planFor(provider,main,staff);
  if(!plan.changes.length)return {state:'unchanged',main,staff};
  const branch=candidatePrefix+staff+'-'+main;let id=await provider.head(branch);
  if(id){const existing=await candidate(provider,id);if(existing.main!==main||existing.staff!==staff)throw Error('Candidate branch identity mismatch.');}
  else{
    const tree=await provider.api('POST','/git/trees',{base_tree:plan.mainTree,tree:plan.changes});if(tree.sha!==plan.tree)throw Error('Prepared tree identity mismatch.');
    const commit=await provider.api('POST','/git/commits',{message:`Publish validated staff content\n\nStaff-Content: ${staff}\nMain-Base: ${main}`,tree:tree.sha,parents:[main,staff]});if(!sha(commit.sha))throw Error('Missing prepared commit identity.');id=commit.sha;
    await provider.api('POST','/git/refs',{ref:'refs/heads/'+branch,sha:id});
  }
  // GITHUB_TOKEN pushes suppress normal push workflows; dispatch explicitly.
  await provider.dispatch('validate.yml',branch);
  return {state:'validation_pending',main,staff,candidate:id,branch};
}
export async function promote(provider,id){
  const plan=await candidate(provider,id);
  if(!await provider.passed(id))throw Error('The exact merged revision has not passed Website validation.');
  if(await provider.head(policy.contentBranch)!==plan.staff)throw Error('A newer staff save superseded this candidate.');
  const current=await provider.head(policy.productionBranch);
  if(current!==plan.main&&current!==id)throw Error('Production advanced. Prepare a fresh candidate.');
  if(current!==id)await provider.api('PATCH','/git/refs/heads/'+policy.productionBranch,{sha:id,force:false});
  if(await provider.head(policy.productionBranch)!==id)throw Error('Production changed before publication could be requested.');
  await provider.dispatch('publish-pages.yml',policy.productionBranch,{revision:id});
  return {state:'committed_build_pending',revision:id,staff:plan.staff,live:false};
}
export async function verifyRun(provider,event){
  const run=event.workflow_run;
  if(!Number.isSafeInteger(run?.id)||!Number.isSafeInteger(run.workflow_id)||typeof run.head_branch!=='string'||run.head_repository?.full_name!==policy.repository||!sha(run.head_sha)||!['push','workflow_dispatch'].includes(run.event)||run.conclusion!=='success')throw Error('Not a successful repository validation run.');
  const workflow=await provider.api('GET','/actions/workflows/'+run.workflow_id);
  const recorded=await provider.api('GET','/actions/runs/'+run.id);
  if(workflow.path!==validationWorkflow||recorded.head_sha!==run.head_sha||recorded.conclusion!=='success'||recorded.head_branch!==run.head_branch||recorded.repository?.full_name!==policy.repository)throw Error('Validation run identity mismatch.');
  if(run.head_branch!==policy.contentBranch&&!/^publication\/staff-[a-f0-9]{40}-[a-f0-9]{40}$/.test(run.head_branch))throw Error('Not a publication branch.');
  if(await provider.head(run.head_branch)!==run.head_sha)throw Error('This validation run has been superseded.');
  return run;
}

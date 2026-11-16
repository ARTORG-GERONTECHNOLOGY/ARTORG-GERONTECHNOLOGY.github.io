import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GitHubPublication,prepare,promote,verifyRun,candidate} from './lib/publication.mjs';
import {policy,editable,asset,sha} from '../admin-service/content-policy.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
function git(...args){const result=spawnSync('git',['--no-pager','-c','core.hooksPath=NUL',...args],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw Error('Local revision metadata is unavailable.');return result.stdout.trim();}
export async function publicationMetadata(directory,revision,{runId=null,readGit=git}={}){
  if(!sha(revision)||readGit('rev-parse','HEAD')!==revision)throw Error('Build revision does not match the checked-out source.');
  if(readGit('status','--porcelain','--untracked-files=normal'))throw Error('Publication metadata requires a clean checkout of the approved revision.');
  const message=readGit('show','-s','--format=%B','HEAD');
  const match=/^Publish validated staff content\n\nStaff-Content: ([a-f0-9]{40})\nMain-Base: ([a-f0-9]{40})\n?$/.exec(message);
  const parents=readGit('show','-s','--format=%P','HEAD').split(' ');
  const records=[];
  for(const filename of readGit('ls-files','-z').split('\0').filter(editable)){
    const bytes=await fs.readFile(path.join(root,filename));
    const changed=readGit('log','-1','--format=%H','--',filename);
    records.push({path:filename,revision:changed,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const value={schema:1,revision,staff_revision:match&&parents.length===2&&parents[0]===match[2]&&parents[1]===match[1]?match[1]:null,run_id:runId,built_at:new Date().toISOString(),content:records};
  await fs.writeFile(path.join(directory,'publication.json'),JSON.stringify(value,null,2)+'\n');return value;
}
async function main(){
  const action=process.argv[2];
  if(action==='metadata'){await publicationMetadata(path.resolve(process.argv[3]||'_site'),process.env.GITHUB_SHA||git('rev-parse','HEAD'),{runId:process.env.GITHUB_RUN_ID||null});console.log('Revision-bound public metadata generated.');return;}
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==policy.repository||!process.env.GH_TOKEN)throw Error('Publication operations run only in the configured GitHub workflow.');
  const provider=new GitHubPublication(process.env.GH_TOKEN);
  if(action==='guard-pages'){
    const revision=process.env.GITHUB_SHA;
    if(process.env.GITHUB_REF!=='refs/heads/'+policy.productionBranch||!sha(revision)||process.env.REQUESTED_REVISION&&process.env.REQUESTED_REVISION!==revision||await provider.head(policy.productionBranch)!==revision)throw Error('This build is no longer the current production revision.');
    console.log('Current production revision verified.');return;
  }
  if(action==='check-candidate'){
    const plan=await candidate(provider,process.env.GITHUB_SHA);
    const [files,previous]=await Promise.all([provider.files(plan.files),provider.files(plan.previous)]);
    const {validateContent}=await import('../admin-service/content.mjs');
    await validateContent(files,previous);
    const {inspectUpload,mediaInfo}=await import('../admin-service/media.mjs');const rules=await mediaInfo({operation:'rules'});
    for(const change of plan.changes.filter(item=>asset(item.path)&&item.sha)){
      const bytes=files.get(change.path).bytes;const extension=path.extname(change.path).toLowerCase();await inspectUpload(path.basename(change.path),rules.types[extension],bytes,rules);
    }
    console.log('Candidate identity, allowlist, previous-content rules and new media verified.');return;
  }
  if(!['prepare','promote'].includes(action)||process.env.PUBLICATION_ENABLED!=='true'||process.env.GITHUB_REF!=='refs/heads/'+policy.productionBranch)throw Error('Staff publication is disabled or not running trusted production code.');
  const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  let id;
  if(process.env.GITHUB_EVENT_NAME==='workflow_run'){
    const run=await verifyRun(provider,event);
    if(action==='prepare'&&run.head_branch!==policy.contentBranch||action==='promote'&&!run.head_branch.startsWith('publication/staff-'))throw Error('Publication stage does not match the checked run.');
    id=run.head_sha;
  }else if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&action==='prepare')id=await provider.head(policy.contentBranch);
  else throw Error('Unsupported publication event.');
  const result=action==='prepare'?await prepare(provider,id):await promote(provider,id);
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Publication stopped. Check branch freshness, content conflicts, required validation and workflow permissions. No automatic write retry was made; no live deployment is claimed.');process.exitCode=1;});

import {policy,editable,sha,ContentError} from './content-policy.mjs';
import {rubyEditor} from './editor.mjs';

const runUrl=id=>'https://github.com/'+policy.repository+'/actions/runs/'+id;
const workflowPaths={validation:'.github/workflows/validate.yml',accept:'.github/workflows/publish-content.yml',pages:'.github/workflows/publish-pages.yml'};
const selectedPagesCommit=run=>run.event==='workflow_dispatch'&&run.display_title?.match(/^Publish commit\s+([a-f0-9]{40})\s*$/i)?.[1].toLowerCase();
let canonicalConfig;
function runs(value,kind,revision){
  if(!Array.isArray(value.workflow_runs)||value.workflow_runs.length>20)throw Error('Invalid workflow status response');
  return value.workflow_runs.filter(run=>Number.isSafeInteger(run.id)&&run.path===workflowPaths[kind]&&(!revision||run.head_sha===revision)&&run.repository?.full_name===policy.repository)
    .sort((a,b)=>b.id-a.id||b.run_attempt-a.run_attempt).map(run=>({...run,url:runUrl(run.id)}));
}
export async function readPublicationFacts(api,commit,publicRecord){
  if(!sha(commit))throw new ContentError(422,'invalid_revision','Choose a saved revision.');
  if(publicRecord&&!sha(publicRecord.revision))throw Error('Invalid public revision');
  const memo=new Map();
  const get=route=>{if(!memo.has(route))memo.set(route,api('GET',route));return memo.get(route);};
  async function tree(id){
    const info=await get('/git/commits/'+id);if(!sha(info.tree?.sha)||!Array.isArray(info.parents)||info.parents.some(parent=>!sha(parent.sha)))throw Error('Invalid revision tree');
    const value=await get('/git/trees/'+info.tree.sha+'?recursive=1');if(value.truncated||!Array.isArray(value.tree)||value.tree.length>10000)throw Error('Incomplete revision tree');
    const files={};for(const item of value.tree)if(editable(item.path)){if(item.mode!=='100644'||item.type!=='blob'||!sha(item.sha)||Object.hasOwn(files,item.path))throw Error('Invalid content tree');files[item.path]=item.sha;}return {files,info};
  }
  const ref=await get('/git/ref/heads/'+policy.contentBranch);const head=ref.object?.sha;if(!sha(head))throw Error('Invalid content branch');
  if(commit!==head){const relation=await get('/compare/'+commit+'...'+head+'?per_page=1');if(!['ahead','identical'].includes(relation.status)||relation.merge_base_commit?.sha!==commit)throw new ContentError(422,'invalid_revision','Choose a revision from the current staff-content history.');}
  const [selected,current,mainRef]=await Promise.all([tree(commit),tree(head),get('/git/ref/heads/'+policy.productionBranch)]);
  const main=mainRef.object?.sha;if(!sha(main))throw Error('Invalid production branch');
  const deleted=selected.info.parents[0]?(await tree(selected.info.parents[0].sha)).files:{};
  const paths=[...new Set([...Object.keys(selected.files),...Object.keys(deleted).filter(path=>!Object.hasOwn(selected.files,path))])];
  const workflow=async(kind,id)=>runs(await get('/actions/workflows/'+workflowPaths[kind].split('/').at(-1)+'/runs?'+new URLSearchParams({head_sha:id,per_page:'20'})),kind,id);
  const validation=await workflow('validation',head);
  const accepts=runs(await get('/actions/workflows/publish-content.yml/runs?per_page=20'),'accept');
  const acceptance=id=>accepts.find(run=>run.head_branch==='main'&&run.display_title==='Accept checked revision '+id)||null;
  const relation=head===main?{status:'identical',merge_base_commit:{sha:head}}:await get('/compare/'+head+'...'+main+'?per_page=1');
  const merged=['ahead','identical'].includes(relation.status)&&relation.merge_base_commit?.sha===head;
  let candidate=null,candidateValidation=[];
  if(!merged){
    const refs=await get('/git/matching-refs/heads/publication/staff-'+head+'-');if(!Array.isArray(refs)||refs.length>20)throw Error('Candidate history needs maintainer inspection');
    const expected='refs/heads/publication/staff-'+head+'-'+main;
    const match=refs.find(ref=>ref.ref===expected&&sha(ref.object?.sha));
    if(match){const info=(await tree(match.object.sha)).info;if(info.parents.length!==2||info.parents[0].sha!==main||info.parents[1].sha!==head||info.message!==`Publish validated staff content\n\nStaff-Content: ${head}\nMain-Base: ${main}`)throw Error('Candidate mapping mismatch');candidate=match.object.sha;candidateValidation=await workflow('validation',candidate);}
  }
  const pages=merged?(await workflow('pages',main)).filter(run=>{
    const selected=selectedPagesCommit(run);
    return !selected||selected===main;
  }):[];
  let live=null,publicUnavailable=!publicRecord;
  if(publicRecord){
    const deployments=await get('/deployments?environment=github-pages&per_page=20');if(!Array.isArray(deployments)||deployments.length>20)throw Error('Invalid deployment history');
    let active;
    for(const deployment of deployments.sort((a,b)=>b.id-a.id)){
      if(!Number.isSafeInteger(deployment.id)||!sha(deployment.sha)||deployment.environment!=='github-pages'||deployment.performed_via_github_app?.slug!=='github-actions')continue;
      const statuses=await get('/deployments/'+deployment.id+'/statuses?per_page=1');if(!Array.isArray(statuses))throw Error('Invalid deployment status');
      if(statuses[0]?.state==='success'){active=deployment;break;}
    }
    if(active){
      const completed=(await workflow('pages',active.sha)).find(run=>{
        if(run.head_branch!=='main'||run.status!=='completed'||run.conclusion!=='success')return false;
        const selected=selectedPagesCommit(run);
        return selected ? selected===publicRecord.revision&&String(run.id)===publicRecord.run_id : active.sha===publicRecord.revision;
      });
      if(completed)live={revision:publicRecord.revision,files:(await tree(publicRecord.revision)).files,url:completed.url};
    }
    publicUnavailable=!live;
  }
  return {commit,head,main,selected:selected.files,current:current.files,production:merged?(await tree(main)).files:null,paths,validation:validation[0]||null,acceptance:acceptance(candidate||head),candidate,candidateValidation:candidateValidation[0]||null,pages:pages[0]||null,live,publicUnavailable};
}

export function publicationEntries(facts){
  const stages=[['Website checks',facts.validation],['Merged-content checks',facts.candidateValidation],['Accepting checked content',facts.acceptance],['Website build/deployment',facts.pages]].filter(([,run])=>run);
  const logs=stages.map(([label,run])=>({label,url:run.url}));
  return facts.paths.map(path=>{
    const version=facts.selected[path]??null,newer=(facts.current[path]??null)!==version;
    const result=(state,label,message,links=logs)=>({path,state,label,message,logs:links,live:state==='live'});
    if(facts.live&&(facts.live.files[path]??null)===version)return result('live','Live','This exact saved version is confirmed on the website.'+(newer?' A newer version is also saved.':''),[{label:'Confirmed deployment',url:facts.live.url}]);
    if(newer)return result('superseded','Superseded','A newer version of this content is saved. This earlier version is not currently confirmed live. Review the latest source before making another save.');
    if(facts.production&&(facts.production[path]??null)!==version)return result('superseded','Superseded','Production contains another version after a maintainer change. Ask the maintainer to reconcile it with the staff working branch.');
    const failed=[...stages].reverse().find(([,run])=>run.status==='completed'&&run.conclusion!=='success');
    if(failed)return result('failed','Failed',failed[0]+' did not complete successfully. Your saved revision is kept. Open the run details; correct content and save a new revision, or ask a maintainer to retry the workflow.');
    if(stages.some(([,run])=>run.status==='in_progress'))return result('building','Building','Checks or the website build/deployment are running. Your saved revision is kept; refresh status to follow progress.');
    if(facts.pages?.status==='completed'&&facts.pages.conclusion==='success')return result('unavailable','Status unavailable','The build finished, but the current public revision and successful deployment could not be matched to this version. Refresh shortly; ask the maintainer to check Pages and its canonical address if this persists.');
    return result('pending','Saved — pending',facts.candidate?'Your revision is saved; the checked content merge is waiting for acceptance or publication.':'Your revision is saved; waiting for validation, acceptance or a website build. If progress stops, ask the maintainer to check activation and the workflow runs.');
  });
}

export class PublicationStatus {
  constructor(content,{now=Date.now,publicRecord=readPublicRecord}={}){this.content=content;this.now=now;this.publicRecord=publicRecord;this.cache=new Map();this.pending=new Map();this.recordCache=null;this.recordPending=null;}
  async record(){
    if(this.recordCache?.until>this.now())return this.recordCache.value;
    if(!this.recordPending)this.recordPending=(async()=>{try{const value=await this.publicRecord().catch(()=>null);this.recordCache={value,until:this.now()+15000};return value;}finally{this.recordPending=null;}})();
    return this.recordPending;
  }
  async get(commit,authorize){
    if(!sha(commit))throw new ContentError(422,'invalid_revision','Choose a saved revision.');
    await authorize();
    if(!this.content)return {commit,mode:'local_review',state:'local_review',checkedAt:new Date(this.now()).toISOString(),entries:[],message:'Local review — GitHub publication tracking is not connected. No live deployment is claimed.'};
    let result=this.cache.get(commit);
    if(!result||result.until<=this.now()){
      if(!this.pending.has(commit)){
        if(this.pending.size>=4)throw new ContentError(429,'status_busy','Publication reports are busy. Please refresh shortly.');
        const work=(async()=>{
          try{
            const record=await this.record();
            const facts=await this.content.provider.publicationFacts(commit,record);
            if(facts.paths.length>1000)throw Error('Too many status entries');
            const value={commit,head:facts.head,productionRevision:facts.main,liveRevision:facts.live?.revision??null,checkedAt:new Date(this.now()).toISOString(),entries:publicationEntries(facts),mode:'github'};
            this.cache.set(commit,{value,until:this.now()+15000});while(this.cache.size>24)this.cache.delete(this.cache.keys().next().value);return value;
          }catch(error){this.cache.delete(commit);if(error instanceof ContentError&&error.status===422)throw error;return {commit,mode:'github',state:'unavailable',entries:[],checkedAt:new Date(this.now()).toISOString(),message:'Publication status is unavailable. Your working copy and saved revision are kept. Refresh status or ask the maintainer to check GitHub access and the website.'};}
          finally{this.pending.delete(commit);}
        })();this.pending.set(commit,work);
      }
      result={value:await this.pending.get(commit)};
    }
    await authorize();return result.value;
  }
}

export async function readPublicRecord(fetcher=fetch){
  const config=await(canonicalConfig||=rubyEditor({operation:'publication_config'}).catch(error=>{canonicalConfig=null;throw error;}));const root=new URL(config.url);
  if(root.protocol!=='https:'||root.username||root.password||root.search||root.hash||!root.pathname.endsWith('/'))throw Error('Invalid canonical website address');
  const response=await fetcher(new URL('publication.json',root),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store'});
  if(!response.ok)throw Error('Public revision metadata is unavailable');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('Public metadata is too large');chunks.push(chunk);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(value.schema!==1||!sha(value.revision)||value.staff_revision!==null&&!sha(value.staff_revision)||!Array.isArray(value.content))throw Error('Invalid public revision metadata');return value;
}

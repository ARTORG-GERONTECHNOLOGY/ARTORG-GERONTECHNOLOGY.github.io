import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {editable,sha,blobSha,ContentError} from './content-policy.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function git(args,{allowFailure=false,maxBytes=1024*1024}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn('git',['-C',root,'--no-pager','--literal-pathspecs',...args],{shell:false,windowsHide:true});const chunks=[];let size=0;let failed=false;
    const unavailable=()=>new ContentError(503,'history_unavailable','Local revision history is unavailable.');
    const timer=setTimeout(()=>{failed=true;child.kill();reject(unavailable());},10000);
    child.on('error',()=>{clearTimeout(timer);reject(unavailable());});child.stderr.resume();
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){failed=true;child.kill();}else chunks.push(chunk);});
    child.on('close',code=>{clearTimeout(timer);if(failed||code!==0&&!allowFailure)return reject(unavailable());resolve({code,bytes:Buffer.concat(chunks)});});
  });
}
function record(commit,seconds,name,message,parents=[]){
  if(!sha(commit)||!/^\d+$/.test(seconds)||!Number.isFinite(new Date(Number(seconds)*1000).getTime()))throw new ContentError(503,'history_unavailable','Invalid revision metadata.');
  return {commit,time:new Date(Number(seconds)*1000).toISOString(),author:'Git author: '+name.slice(0,200)+' (staff identity not verified)',message:message.slice(0,300),parents};
}
export class LocalHistory {
  async head(){const value=(await git(['rev-parse','HEAD'])).bytes.toString('utf8').trim();if(!sha(value))throw new ContentError(503,'history_unavailable','Local history is unavailable.');return value;}
  async history(path,page,head){
    if(!editable(path)||!sha(head)||!Number.isInteger(page)||page<1||page>50)throw new ContentError(422,'invalid_revision','Choose an allowed content history.');
    const output=(await git(['log','--no-show-signature','--no-notes','-z','--format=%H%x00%ct%x00%an%x00%s','--max-count=20','--skip='+((page-1)*20),head,'--',path])).bytes.toString('utf8');
    const parts=output.split('\0');if(parts.at(-1)==='')parts.pop();if(parts.length%4)throw new ContentError(503,'history_unavailable','Invalid revision metadata.');
    const revisions=[];for(let i=0;i<parts.length;i+=4)revisions.push(record(...parts.slice(i,i+4)));
    return {revisions,hasMore:revisions.length===20};
  }
  async revision(path,commit,head){
    if(!editable(path)||!sha(commit)||!sha(head))throw new ContentError(422,'invalid_revision','Choose an allowed content revision.');
    if((await git(['merge-base','--is-ancestor',commit,head],{allowFailure:true})).code!==0)throw new ContentError(422,'invalid_revision','Choose a revision from the current content history.');
    const info=(await git(['show','--no-show-signature','--no-notes','-s','--format=%ct%x00%an%x00%s',commit])).bytes.toString('utf8').replace(/\r?\n$/,'').split('\0');
    if(info.length!==3)throw new ContentError(503,'history_unavailable','Invalid revision metadata.');
    const parents=(await git(['rev-list','--parents','-n','1',commit])).bytes.toString('utf8').trim().split(' ').slice(1);if(parents.some(value=>!sha(value)))throw new ContentError(503,'history_unavailable','Invalid revision parent.');
    const file=await this.fileAt(path,commit);const before=parents[0]?await this.fileAt(path,parents[0]):null;
    return {...record(commit,...info,parents),source:file?.source??null,fileSha:file?.sha??null,before:before?.source??null};
  }
  async fileAt(path,commit){
    const tree=(await git(['ls-tree','-z',commit,'--',path])).bytes.toString('utf8');if(!tree)return null;
    const match=/^100644 blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(tree);if(!match||match[2]!==path)throw new ContentError(422,'invalid_revision','Historical content must be an ordinary file.');
    const bytes=(await git(['cat-file','blob',match[1]],{maxBytes:131072})).bytes;
    if(blobSha(bytes)!==match[1])throw new ContentError(503,'history_unavailable','The historical blob could not be verified.');
    try{return {sha:match[1],source:decoder.decode(bytes)};}catch{throw new ContentError(422,'invalid_revision','Historical content must be UTF-8 text.');}
  }
}

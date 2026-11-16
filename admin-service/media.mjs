import {spawn} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {asset, policy, ContentError} from './content-policy.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
function processJSON(command,args,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,shell:false,windowsHide:true});let output='';let failed=false;
    const unavailable=()=>new ContentError(503,'media_unavailable','File inspection is unavailable. Your proposal has not been saved.');
    const timer=setTimeout(()=>{failed=true;child.kill();reject(unavailable());},20000);
    child.on('error',()=>{clearTimeout(timer);reject(unavailable());});child.stderr.resume();
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024*1024){failed=true;child.kill();}});
    child.on('close',code=>{clearTimeout(timer);try{if(failed||code!==0)throw Error();const value=JSON.parse(output);if(value.error)return reject(new ContentError(422,'invalid_media',value.error));resolve(value);}catch{reject(unavailable());}});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export const mediaInfo=payload=>processJSON(process.env.ADMIN_RUBY_EXECUTABLE||'ruby',['scripts/media-info.rb'],JSON.stringify(payload));
export async function inspectUpload(filename,mime,bytes,rules) {
  const signature=await mediaInfo({operation:'validate',filename,mime_type:mime,bytes:bytes.toString('base64')});
  const decoded=await processJSON(process.env.ADMIN_PYTHON_EXECUTABLE||process.env.PYTHON||'python',['scripts/inspect-upload.py',JSON.stringify(rules),mime],bytes);
  return {...signature,...decoded};
}
export class MediaStore {
  constructor(editor,content,{now=Date.now}={}) {this.editor=editor;this.content=content;this.now=now;this.entries=new Map();this.rulesPromise=null;this.busy=false;}
  rules(){return this.rulesPromise||=(mediaInfo({operation:'rules'}).catch(error=>{this.rulesPromise=null;throw error;}));}
  purge(active){for(const [id,item] of this.entries)if(item.session.expires<=this.now()||!active(item.session))this.entries.delete(id);}
  temporary(session){return [...this.entries.values()].filter(item=>item.session===session&&session.expires>this.now());}
  async list(session,authorize){
    const snapshot=await this.editor.snapshot();const rules=await this.rules();await authorize();
    return {rules,files:[...[...snapshot.files].filter(([path])=>asset(path)).map(([path,file])=>({url:'/'+path,title:path.split('/').at(-1),size:file.bytes.length,mime_type:rules.types['.'+path.split('.').at(-1).toLowerCase()],temporary:false})),...this.temporary(session).map(item=>this.describe(item))]};
  }
  describe(item){return {id:item.id,url:'/'+item.path,title:item.filename,size:item.bytes.length,mime_type:item.mime_type,width:item.width,height:item.height,pages:item.pages,temporary:true};}
  async upload(session,{filename,proposalId,mime,bytes},authorize){
    if(this.busy)throw new ContentError(429,'media_busy','Another file is being checked. Please try again shortly.');
    this.busy=true;
    try{
      const rules=await this.rules();await authorize();
      if(typeof proposalId!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proposalId)||proposalId.length>100||typeof filename!=='string'||filename.length>180||!bytes.length||bytes.length>rules.max_file_bytes)throw new ContentError(422,'invalid_media','Choose a valid proposal and file within the upload limit.');
      if(this.temporary(session).filter(item=>item.proposalId===proposalId).reduce((sum,item)=>sum+item.bytes.length,0)+bytes.length>rules.max_proposal_bytes)throw new ContentError(413,'upload_limit','Temporary files for this proposal exceed 25 MiB. Save selected files or sign out before uploading more.');
      if([...this.entries.values()].reduce((sum,item)=>sum+item.bytes.length,0)+bytes.length>128*1024*1024||this.entries.size>=200)throw new ContentError(429,'upload_capacity','Temporary upload storage is full. Please try again later.');
      const info=await inspectUpload(filename,mime,bytes,rules);await authorize();
      const extension='.'+filename.split('.').at(-1).toLowerCase();
      const stem=filename.slice(0,-extension.length).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'file';
      const hash=createHash('sha256').update(bytes).digest('hex');
      const path='assets/media/proposals/'+proposalId+'/'+stem+'-'+hash.slice(0,16)+extension;
      const existing=this.temporary(session).find(item=>item.path===path);if(existing)return this.describe(existing);
      const id=randomBytes(16).toString('hex');
      const item={id,path,proposalId,filename,bytes:Buffer.from(bytes),session,...info};this.entries.set(id,item);return this.describe(item);
    }finally{this.busy=false;}
  }
  async file(session,{id,path},authorize){
    await authorize();
    if(id){const item=this.entries.get(id);if(!item||item.session!==session||session.expires<=this.now())throw new ContentError(404,'media_missing','This temporary file has expired. Upload your original again.');return item;}
    if(!asset(path))throw new ContentError(422,'invalid_path','Choose an existing media file.');
    const snapshot=await this.editor.snapshot();await authorize();const file=snapshot.files.get(path);if(!file)throw new ContentError(404,'media_missing','The file is no longer available.');
    const rules=await this.rules();return {...file,filename:path.split('/').at(-1),mime_type:rules.types['.'+path.split('.').at(-1).toLowerCase()]};
  }
  async save(session,payload,authorize){
    if(!this.content)throw new ContentError(503,'saving_not_configured','GitHub saving is not configured. No save was made.');
    const {uploads=[],...content}=payload||{};
    if(!Array.isArray(uploads)||uploads.length>policy.maxChanges||new Set(uploads).size!==uploads.length)throw new ContentError(422,'invalid_media','Choose distinct temporary files.');
    const files=uploads.map(id=>this.entries.get(id));
    if(files.some(item=>!item||item.session!==session||session.expires<=this.now()))throw new ContentError(422,'media_missing','A selected upload expired. Upload the original again; your working copy is retained.');
    if(files.length){
      if(content.changes?.length!==1||!content.changes[0].path?.startsWith('_posts/'))throw new ContentError(422,'invalid_media','Save uploads with exactly one proposal.');
      const refs=await mediaInfo({operation:'references',source:content.changes[0].content});
      if(files.some(item=>item.proposalId!==refs.proposal_id||!refs.paths.includes('/'+item.path)))throw new ContentError(422,'invalid_media','Each uploaded file must be selected as a figure or attachment on this proposal.');
    }
    const saved=await this.content.save(content,authorize,{assets:files.map(item=>({path:item.path,bytes:item.bytes}))});
    for(const file of files)this.entries.delete(file.id);
    return saved;
  }
}

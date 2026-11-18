import {spawn} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {asset, policy, ContentError,uploadOwner} from './content-policy.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
function processJSON(command,args,input,maxOutput=1024*1024) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,shell:false,windowsHide:true});let output='';let failed=false;
    const unavailable=()=>new ContentError(503,'media_unavailable','File inspection is unavailable. Your proposal has not been saved.');
    const timer=setTimeout(()=>{failed=true;child.kill();reject(unavailable());},20000);
    child.on('error',()=>{clearTimeout(timer);reject(unavailable());});child.stderr.resume();
    child.stdout.on('data',chunk=>{
      if(failed)return;
      if(output.length+chunk.length>maxOutput){failed=true;child.kill();return;}
      output+=chunk;
    });
    child.on('close',code=>{clearTimeout(timer);try{if(failed||code!==0)throw Error();const value=JSON.parse(output);if(value.error)return reject(new ContentError(422,'invalid_media',value.error));resolve(value);}catch{reject(unavailable());}});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export const mediaInfo=payload=>processJSON(process.env.ADMIN_RUBY_EXECUTABLE||'ruby',['scripts/media-info.rb'],JSON.stringify(payload));
export async function inspectUpload(filename,mime,bytes,rules,{figure=false}={}) {
  const signature=await mediaInfo({operation:'validate',filename,mime_type:mime,bytes:bytes.toString('base64')});
  const args=['scripts/inspect-upload.py',JSON.stringify(rules),mime];
  if(figure)args.push('figure');
  const limit=figure ? Math.ceil(rules.max_file_bytes/3)*4+1024 : undefined;
  const decoded=await processJSON(process.env.ADMIN_PYTHON_EXECUTABLE||process.env.PYTHON||'python',args,bytes,limit);
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
  describe(item){return {id:item.id,url:'/'+item.path,title:item.filename,size:item.bytes.length,mime_type:item.mime_type,width:item.width,height:item.height,pages:item.pages,resized:item.resized,temporary:true,ownerPath:item.ownerPath};}
  async upload(session,{filename,proposalId,target,mime,bytes,purpose},authorize){
    if(this.busy)throw new ContentError(429,'media_busy','Another file is being checked. Please try again shortly.');
    this.busy=true;
    try{
      const rules=await this.rules();await authorize();
      const owner=uploadOwner(target,proposalId);
      const figure=purpose==='figure';
      if(purpose!=null && (!figure||owner.folder!=='proposals'||!mime.startsWith('image/'))){
        throw new ContentError(422,'invalid_media','Choose a PNG, JPEG or WebP proposal figure.');
      }
      if(owner.folder!=='proposals'&&!['image/png','image/jpeg','image/webp'].includes(mime))throw new ContentError(422,'invalid_media','Choose a PNG, JPEG or WebP image for this content.');
      if(typeof filename!=='string'||filename.length>180||!bytes.length||bytes.length>rules.max_file_bytes)throw new ContentError(422,'invalid_media','Choose a valid file within the upload limit.');
      const {replacement,...info}=await inspectUpload(filename,mime,bytes,rules,{figure});
      await authorize();
      const storedBytes=replacement ? Buffer.from(replacement,'base64') : Buffer.from(bytes);
      if(!storedBytes.length||storedBytes.length>rules.max_file_bytes)throw new ContentError(422,'invalid_media','The processed image exceeds the upload limit.');
      const extension='.'+filename.split('.').at(-1).toLowerCase();
      const stem=filename.slice(0,-extension.length).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'file';
      const hash=createHash('sha256').update(storedBytes).digest('hex');
      const path='assets/media/'+owner.folder+'/'+owner.id+'/'+stem+'-'+hash.slice(0,16)+extension;
      const existing=this.temporary(session).find(item=>item.path===path);if(existing)return this.describe(existing);
      if(this.temporary(session).filter(item=>item.ownerKey===owner.key).reduce((sum,item)=>sum+item.bytes.length,0)+storedBytes.length>rules.max_proposal_bytes)throw new ContentError(413,'upload_limit','Temporary files for this content exceed 25 MiB. Save the files you want to keep, or wait for the temporary files to expire before uploading more.');
      if([...this.entries.values()].reduce((sum,item)=>sum+item.bytes.length,0)+storedBytes.length>128*1024*1024||this.entries.size>=200)throw new ContentError(429,'upload_capacity','Temporary upload storage is full. Please try again later.');
      const id=randomBytes(16).toString('hex');
      const item={id,path,proposalId,ownerPath:owner.path,ownerKey:owner.key,filename,bytes:storedBytes,session,...info};this.entries.set(id,item);return this.describe(item);
    }finally{this.busy=false;}
  }
  async file(session,{id,path},authorize){
    await authorize();
    if(id){const item=this.entries.get(id);if(!item||item.session!==session||session.expires<=this.now())throw new ContentError(404,'media_missing','This temporary file has expired. Upload your original again.');return item;}
    if(!asset(path))throw new ContentError(422,'invalid_path','Choose an existing media file.');
    const temporary=this.temporary(session).find(item=>item.path===path);if(temporary)return temporary;
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
      if(content.changes?.length!==1)throw new ContentError(422,'invalid_media','Save uploads with exactly one content item.');
      const target=content.changes[0].path;const proposal=typeof target==='string'&&target.startsWith('_posts/');
      const refs=await mediaInfo({operation:'references',source:content.changes[0].content,...(!proposal?{path:target}:{})});
      if(files.some(item=>(proposal?item.proposalId!==refs.proposal_id:item.ownerPath!==target)||!refs.paths.includes('/'+item.path)))throw new ContentError(422,'invalid_media','Each uploaded file must be selected on its own content item.');
    }
    const saved=await this.content.save(content,authorize,{assets:files.map(item=>({path:item.path,bytes:item.bytes}))});
    for(const file of files)this.entries.delete(file.id);
    return saved;
  }
}

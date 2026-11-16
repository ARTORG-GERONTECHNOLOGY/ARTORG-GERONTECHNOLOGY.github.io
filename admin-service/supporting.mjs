import {editable,asset,blobSha,sha,ContentError} from './content-policy.mjs';
import {rubyEditor} from './editor.mjs';
import {validateContent} from './content.mjs';
import {staticMath} from './preview.mjs';
export const supportingPath=path=>typeof path==='string'&&editable(path)&&(/^_(team|news)\//.test(path)||['_data/home.yml','_data/about.yml'].includes(path));
function fieldErrors(errors,path,kind){
  const result={};for(const [file,messages] of Object.entries(errors||{}))for(const message of messages){
    const match=file===path?/^([a-zA-Z_][a-zA-Z0-9_.\[\]]*): (.+)$/.exec(message):null;
    let field=match?match[1].replace(/^(home|about)\./,''):file===path?'content':file;
    if(field.startsWith('image.'))field=({home:'hero_image',team:'portrait',news:'image'}[kind]||'image')+field.slice(5);
    (result[field]||=[]).push(match?match[2]:message);
  }return result;
}
export class SupportingEditor {
  constructor(editor){this.editor=editor;this.busy=false;}
  async snapshot(){return this.editor.snapshot();}
  files(snapshot){return Object.fromEntries([...snapshot.files].filter(([path])=>editable(path)).map(([path,file])=>[path,file.bytes.toString('utf8')]));}
  async bootstrap(authorize){const snapshot=await this.snapshot();const value=await rubyEditor({operation:'supporting',action:'bootstrap',files:this.files(snapshot)});await authorize();if(value.error)throw new ContentError(422,'invalid_supporting_content',value.message,{errors:value.errors});return {...value,baseCommit:snapshot.head,canPublish:Boolean(this.editor.content),items:value.items.map(item=>({...item,sha:snapshot.files.get(item.path).sha}))};}
  async prepare(payload,authorize,temporary=[]){
    if(this.busy)throw new ContentError(429,'preview_busy','Another content page is being prepared. Please try again shortly.');
    if(!payload||!['new','parse','compose','preview','publish','download'].includes(payload.operation))throw new ContentError(422,'invalid_action','Choose an editor action.');
    this.busy=true;
    try{
      const snapshot=await this.snapshot();await authorize();const files=new Map(snapshot.files);for(const file of temporary)files.set(file.path,{bytes:file.bytes,sha:blobSha(file.bytes)});
      if(payload.operation!=='new'&&(typeof payload.source!=='string'||Buffer.byteLength(payload.source)>131072))throw new ContentError(422,'invalid_content','Choose a content file below 128 KiB.');
      if(!['new','parse'].includes(payload.operation)&&!supportingPath(payload.path))throw new ContentError(422,'invalid_path','Choose supporting website content.');
      const result=await rubyEditor({...payload,operation:'supporting',action:payload.operation,files:this.files(snapshot)});
      if(result.error)throw new ContentError(422,'invalid_supporting_content',result.message,{errors:result.errors});
      if(result.isProposal){await authorize();return result;}
      if(!supportingPath(result.path)||typeof result.source!=='string'||Buffer.byteLength(result.source)>131072)throw new ContentError(422,'invalid_path','Choose a valid supporting content file.');
      const context=result.context||{};
      if(Object.keys(context).some(key=>!['kind','path','sha','baseCommit'].includes(key))||context.path&&context.path!==result.path||context.kind&&context.kind!==result.kind||context.sha!=null&&!sha(context.sha)||context.baseCommit!=null&&!sha(context.baseCommit))throw new ContentError(422,'invalid_draft','Draft revision information is invalid.');
      result.supporting=true;result.canPublish=Boolean(this.editor.content);
      if(['new','parse','download'].includes(payload.operation)){await authorize();return result;}
      files.set(result.path,{bytes:Buffer.from(result.source)});
      try{await validateContent(files,snapshot.files);result.ready=true;result.errors={};}
      catch(error){if(error.status!==422)throw error;result.ready=false;result.errors=fieldErrors(error.details.errors,result.path,result.kind);}
      if(result.ready&&payload.operation==='preview'){
        result.html=await this.render({files},result.path,result.source,authorize);
      }
      await authorize();return result;
    }finally{this.busy=false;}
  }
  async render(snapshot,path,source,authorize){
    const files=new Map(snapshot.files);files.set(path,{bytes:Buffer.from(source)});
    const built=await rubyEditor({operation:'supporting',action:'preview_build',path,files:this.files({files}),assets:[...files].filter(([path])=>asset(path)).map(([path,file])=>({path,bytes:file.bytes.toString('base64')}))});
    if(built.error)throw new ContentError(422,'preview_failed',built.message,{errors:built.errors});const html=await staticMath(built.html);await authorize();return html;
  }
}

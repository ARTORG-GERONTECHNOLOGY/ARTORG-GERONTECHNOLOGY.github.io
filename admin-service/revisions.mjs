import {editable,sha,ContentError} from './content-policy.mjs';
import {LocalHistory} from './local-history.mjs';
import {rubyEditor} from './editor.mjs';
import {validateContent} from './content.mjs';
import {createHash,randomBytes} from 'node:crypto';
const digest=source=>createHash('sha256').update(JSON.stringify(source)).digest('hex');
export class ContentRevisions {
  constructor(editor,{now=Date.now,supporting=null}={}){this.editor=editor;this.supporting=supporting;this.provider=editor.content?.provider||new LocalHistory();this.now=now;this.previews=new Map();}
  purge(active){for(const [id,record] of this.previews)if(record.expires<=this.now()||!active(record.session))this.previews.delete(id);}
  async records(snapshot){const result=await rubyEditor({operation:'removed_list',source:snapshot.files.get('_data/removed_proposals.yml')?.bytes.toString('utf8')||'[]'});if(result.error)throw new ContentError(422,'invalid_removed_records','Removed proposal records are invalid.');return result.records;}
  async context(path,authorize){
    if(!editable(path))throw new ContentError(422,'invalid_path','Choose an allowed content file.');
    const snapshot=await this.editor.snapshot();await authorize();
    const removed=snapshot.files.has(path)?null:(await this.records(snapshot)).find(record=>record.source_path===path);
    if(!snapshot.files.has(path)&&!removed)throw new ContentError(404,'content_missing','This content is no longer listed.');
    const head=this.editor.content?snapshot.head:await this.provider.head();
    return {snapshot,head,removed};
  }
  async deleted(authorize){const snapshot=await this.editor.snapshot();const records=await this.records(snapshot);await authorize();return {records,baseCommit:snapshot.head};}
  async list(path,page,authorize){
    if(!Number.isInteger(page)||page<1||page>50)throw new ContentError(422,'invalid_page','Choose a history page between 1 and 50.');
    const {snapshot,head}=await this.context(path,authorize);const result=await this.provider.history(path,page,head);await authorize();
    return {...result,path,baseCommit:snapshot.head,canRestore:Boolean(this.editor.content),mode:this.editor.content?'github':'local_review'};
  }
  async detail(path,commit,authorize){
    if(!sha(commit))throw new ContentError(422,'invalid_revision','Choose a valid revision.');
    const {snapshot,head}=await this.context(path,authorize);const revision=await this.provider.revision(path,commit,head);
    const diff=await rubyEditor({operation:'revision_diff',path,before:revision.before,after:revision.source});
    if(diff.error)throw new ContentError(422,'invalid_revision','This revision cannot be compared.');await authorize();
    return {...revision,diff,path,baseCommit:snapshot.head};
  }
  async candidate(payload,authorize,preparedAt){
    if(!payload||!sha(payload.commit))throw new ContentError(422,'invalid_revision','Choose a valid revision to restore.');
    const {snapshot,head,removed}=await this.context(payload.path,authorize);
    const current=snapshot.files.get(payload.path);
    if(payload.baseCommit!==snapshot.head||(current?.sha||null)!==payload.sha)throw new ContentError(409,'conflict','Newer changes exist. Reload and compare before preparing restoration again.');
    const selected=await this.provider.revision(payload.path,payload.commit,head);if(!selected.source)throw new ContentError(422,'revision_deleted','Choose a revision containing the proposal, rather than its deletion.');
    let baseline=current?.bytes.toString('utf8');
    if(removed){
      const history=await this.provider.history(payload.path,1,head);if(!history.revisions.length)throw new ContentError(422,'history_missing','The deleted proposal has no accessible history.');
      const last=await this.provider.revision(payload.path,history.revisions[0].commit,head);baseline=last.source||last.before;
      if(!baseline)throw new ContentError(422,'history_missing','The last saved proposal cannot be recovered.');
    }
    const proposal=payload.path.startsWith('_posts/');
    const restored=await rubyEditor(proposal?{operation:'restore_prepare',path:payload.path,current:current?.bytes.toString('utf8')||null,historical:selected.source,baseline,preparedAt,
      ...(removed?{removedSource:snapshot.files.get('_data/removed_proposals.yml').bytes.toString('utf8')}:{})}:{operation:'supporting',action:'restore',path:payload.path,source:selected.source,current:current.bytes.toString('utf8'),preparedAt});
    if(restored.error)throw new ContentError(422,'invalid_restoration',restored.message,{errors:restored.errors});
    if(!restored.changed)throw new ContentError(422,'no_changes','This revision has no restorable content/status differences; current ordering is kept.');
    const changes=[{path:payload.path,sha:current?.sha||null,content:restored.source}];
    if(removed)changes.push({path:'_data/removed_proposals.yml',sha:snapshot.files.get('_data/removed_proposals.yml').sha,content:restored.removedSource});
    const next=new Map(snapshot.files);for(const item of changes)next.set(item.path,{bytes:Buffer.from(item.content)});
    await validateContent(next,snapshot.files);await authorize();
    return {snapshot,selected,restored,changes,current,removed};
  }
  async preview(session,payload,authorize){
    if(typeof payload?.path!=='string'||!editable(payload.path)||!payload.path.startsWith('_posts/')&&(!this.supporting||!/^_news\/|^_data\/(?:home|about)\.yml$/.test(payload.path)))throw new ContentError(422,'invalid_restoration','Choose supported content to restore.');
    const preparedAt=new Date(this.now()).toISOString();const value=await this.candidate(payload,authorize,preparedAt);
    const rendered=payload.path.startsWith('_posts/')?await this.editor.prepare({operation:'preview',source:value.restored.source,context:{path:payload.path,baseCommit:payload.baseCommit,sha:payload.sha}},authorize):{html:await this.supporting.render(value.snapshot,payload.path,value.restored.source,authorize)};
    if(!rendered.html)throw new ContentError(422,'invalid_restoration','The restoration cannot be previewed.',{errors:rendered.previewErrors||rendered.errors});
    const diff=await rubyEditor({operation:'revision_diff',path:payload.path,before:value.current?.bytes.toString('utf8')||null,after:value.restored.source});
    const previewId=randomBytes(24).toString('hex');if(this.previews.size>=1000)throw new ContentError(429,'preview_capacity','Too many pending restoration confirmations.');
    this.previews.set(previewId,{session,payload:{path:payload.path,commit:payload.commit,baseCommit:payload.baseCommit,sha:payload.sha},preparedAt,digest:digest(value.changes),expires:Math.min(session.expires,this.now()+600000)});
    await authorize();return {previewId,html:rendered.html,diff,canRestore:Boolean(this.editor.content),deleted:Boolean(value.removed)};
  }
  async restore(session,payload,authorize){
    if(!this.editor.content)throw new ContentError(503,'saving_not_configured','GitHub saving is not configured. No restoration was saved.');
    const record=this.previews.get(payload?.previewId);
    if(!record||record.session!==session||record.expires<=this.now()||payload.confirmation!==record.payload.commit)throw new ContentError(422,'confirmation_needed','Preview and confirm this restoration again.');
    const value=await this.candidate(record.payload,authorize,record.preparedAt);
    if(digest(value.changes)!==record.digest)throw new ContentError(409,'preview_changed','The prepared restoration changed. Preview it again before confirming.');
    const saved=await this.editor.content.save({baseCommit:record.payload.baseCommit,changes:value.changes},authorize);this.previews.delete(payload.previewId);return saved;
  }
}

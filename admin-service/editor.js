'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let bootstrap, state, csrf, dirty = false, busy = false, leaving = false;
  const fields = new Map();
  const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Zurich'}).format(new Date(value)) : 'Not yet published';
  function node(tag, text, attributes = {}) { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; for (const [name,value] of Object.entries(attributes)) item.setAttribute(name,value); return item; }
  function message(text) { $('save-state').textContent = text; }
  async function api(path, body) {
    if(body) {
      const session=await fetch('/admin/api/session',{credentials:'same-origin'});
      if(!session.ok) throw new Error('Your session ended. Open the private link in another tab, then retry here.');
      csrf=(await session.json()).csrf;
    }
    const response = await fetch('/admin/api/editor/' + path, {credentials:'same-origin', ...(body ? {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)} : {})});
    const value = await response.json().catch(() => ({message:'Your session may have ended. Open the private link in another tab, then retry here.'}));
    if (!response.ok) { const error = new Error(value.message || 'The request failed. Your working copy is still in this tab.'); error.data=value; error.status=response.status; throw error; }
    return value;
  }
  function changed() { dirty=true; message('Unsaved changes — download a draft to keep unfinished work.'); $('preview-state').textContent='Preview is outdated. Refresh it to see your latest changes.'; }
  function field(parent, label, key, value, options={}) {
    const wrapper=node('div',undefined,{class:'field'}); const id='field-'+key.replace(/[^a-z0-9]/gi,'-');
    wrapper.append(node('label',label,{for:id})); let input;
    if(options.choices) { input=node('select'); if(!options.multiple) input.append(node('option','Choose…',{value:''})); for(const [v,t] of options.choices) { const option=node('option',t,{value:v}); option.selected=options.multiple ? (value||[]).includes(v) : value===v; input.append(option); } if(options.multiple) input.multiple=true; }
    else { input=node(options.area ? 'textarea':'input'); if(options.area) input.rows=options.rows||4; else input.type=options.type||'text'; if(input.type==='checkbox') input.checked=Boolean(value); else input.value=value ?? ''; }
    input.id=id; if(options.readonly) input.readOnly=true; if(options.step) input.step=options.step;
    const error=node('p','',{id:id+'-error',class:'field-error'}); input.setAttribute('aria-describedby',error.id); fields.set(key,{input,error});
    wrapper.append(input,error); if(options.help) wrapper.append(node('small',options.help)); parent.append(wrapper); return input;
  }
  function group(title) { const result=node('fieldset'); result.append(node('legend',title)); $('proposal-form').append(result); return result; }
  function rows(parent,title,key,values,columns) {
    const list=node('div'); parent.append(node('h4',title),list); const records=[];
    const add=value=>{ const row=node('div',undefined,{class:'repeated-row'}); const record={row,inputs:{}};
      for(const column of columns) { const wrap=node('label',column.label); const input=node(column.area?'textarea':'input'); input.type=column.type||'text'; if(column.type==='number') input.step='any'; input.value=value?.[column.key]??''; wrap.append(input); row.append(wrap); record.inputs[column.key]=input; }
      const remove=node('button','Remove',{type:'button',class:'secondary'}); remove.addEventListener('click',()=>{row.remove(); records.splice(records.indexOf(record),1); changed();}); row.append(remove); records.push(record); list.append(row); };
    for(const value of values||[]) add(value);
    const button=node('button','Add '+title.toLowerCase().replace(/s$/,''),{type:'button',class:'secondary'}); button.addEventListener('click',()=>{add({}); changed();}); parent.append(button);
    const error=node('p','',{class:'field-error',id:'field-'+key+'-error'}); parent.append(error);
    fields.set(key,{error,read:()=>records.map(record=>{ const value={}; for(const column of columns) { const raw=record.inputs[column.key].value; if(column.type==='number') {if(raw!=='')value[column.key]=Number(raw);} else if(raw!==''||column.required) value[column.key]=raw; } return value; })});
  }
  function populate(model, context) {
    fields.clear(); $('proposal-form').replaceChildren(); state={...model,context}; const m=model.metadata;
    let p=group('Proposal details'); field(p,'Title','title',m.title); field(p,'Short summary','summary',m.summary,{area:true});
    field(p,'Status','status',m.status,{choices:bootstrap.statuses.map(x=>[x,x[0].toUpperCase()+x.slice(1)])});
    field(p,'Student eligibility','student_eligibility',m.student_eligibility,{choices:Object.entries(bootstrap.eligibilities)});
    field(p,'Categories','categories',m.categories,{choices:bootstrap.categories.map(x=>[x.id,x.label]),multiple:true,help:'Choose from the shared list. Use Ctrl or Command to select more than one.'});
    field(p,'Language','language',m.language); field(p,'Priority','priority',m.priority,{type:'number',step:'1'}); field(p,'Featured on homepage','featured',m.featured,{type:'checkbox'});
    field(p,'Tags (one per line)','tags',(m.tags||[]).join('\n'),{area:true});
    p=group('Dates and stable identity'); for(const [key,label] of [['proposal_id','Proposal ID'],['permalink','Permanent address'],['created_at','Created'],['date','Initial publication'],['updated_at','Last saved content update']]) field(p,label,key,m[key],{readonly:true,help:key==='date'&&!m.date?'Assigned when first saved for publication.':''});
    p=group('Supervisors and institutes'); rows(p,'Supervisors','supervisors',m.supervisors,[{key:'name',label:'Name',required:true},{key:'team_id',label:'Optional team profile ID'}]); rows(p,'Institutes','institutes',m.institutes,[{key:'name',label:'Institute',required:true},{key:'url',label:'Optional institutional URL'}]);
    p=group('Nature of the thesis'); rows(p,'Activities','workload',m.workload,[{key:'activity',label:'Activity',required:true},{key:'percentage',label:'Percentage',type:'number'}]); p.append(node('p','Workload percentages must total 100% before publication.'));
    p=group('Contact and applications'); for(const [key,label] of [['name','Contact name'],['email','Public email'],['address','Address'],['phone','Phone']]) field(p,label,'contact.'+key,m.contact?.[key]);
    field(p,'Student application instructions','application_instructions',m.application_instructions,{area:true}); field(p,'Start date or arrangement','start_date_text',m.start_date_text); field(p,'Workplace','workplace',m.workplace,{area:true});
    p=group('Proposal text'); for(const name of ['Background','Aim','Materials and Methods','Requirements','References']) field(p,name+' (Markdown)','section.'+name,model.sections[name]||'',{area:true,rows:8,help:name==='Requirements'?'Use a Markdown bullet list for requirements.':'Lists, links, tables, code and mathematical notation are supported.'});
    const optional=node('details'); optional.append(node('summary','Optional figure, downloads and media')); $('proposal-form').append(optional);
    for(const [key,label] of [['src','Existing figure URL or /assets/ path'],['alt','Figure alternative text'],['caption','Figure caption']]) field(optional,label,'figure.'+key,m.figure?.[key]);
    rows(optional,'Attachments','attachments',m.attachments,[{key:'title',label:'Title',required:true},{key:'url',label:'Existing file URL',required:true},{key:'mime_type',label:'MIME type',required:true},{key:'size',label:'Bytes (required for external files)',type:'number'}]);
    optional.append(node('p','Media uploads and file selection arrive in the next step. Existing media metadata is preserved.'));
    dirty=false; $('editor').hidden=false; $('errors').hidden=true; $('reload').hidden=true; $('preview-frame').srcdoc=''; $('preview-state').textContent='Preview has not been generated.';
    $('save').disabled=!bootstrap.canPublish; $('save').title=bootstrap.canPublish?'':'GitHub saving is not connected in this local review.';
    message('No unsaved changes'); tabs('write'); $('editor-title').scrollIntoView({block:'start'});
  }
  function values() {
    const patch={}; const sections={};
    for(const [key,record] of fields) {
      if(record.read) { patch[key]=record.read(); continue; }
      if(record.input.readOnly) continue;
      let value=record.input.type==='checkbox'?record.input.checked:record.input.multiple?[...record.input.selectedOptions].map(x=>x.value):record.input.value;
      if(record.input.type==='number') value=value===''?null:Number(value);
      if(key.startsWith('section.')) { const name=key.slice(8); const original=state.sections[name]||''; sections[name]=value===original.replace(/\r\n/g,'\n')?original:value; }
      else if(key.startsWith('contact.')) { if(value!==''||Object.hasOwn(state.metadata.contact||{},key.slice(8))) (patch.contact||={})[key.slice(8)]=value; }
      else if(key.startsWith('figure.')) { (patch.figure||={})[key.slice(7)]=value; }
      else if(value!==''||Object.hasOwn(state.metadata,key)) patch[key]=key==='tags'?value.split('\n').filter(x=>x.trim()):value;
    }
    if(!patch.figure.src&&!patch.figure.alt&&!patch.figure.caption) patch.figure=null;
    return {source:state.source,context:state.context,patch,sections};
  }
  function errors(value) {
    $('error-list').replaceChildren(); for(const record of fields.values()) if(record.error) {record.error.textContent=''; record.input?.removeAttribute('aria-invalid');}
    const entries=Object.entries(value||{}); $('errors').hidden=!entries.length;
    for(const [key,messages] of entries) { const record=fields.get(key)||fields.get('section.'+key)||fields.get(key.split('[')[0]); const text=messages.join('; '); $('error-list').append(node('li',key+': '+text)); if(record?.error){record.error.textContent+=(record.error.textContent?' · ':'')+text;record.input?.setAttribute('aria-invalid','true');} }
  }
  function tabs(name) { for(const kind of ['write','preview']) {$(`${kind}-tab`).setAttribute('aria-selected',String(kind===name));$(`${kind}-panel`).hidden=kind!==name&&!$('split-view').checked;} $('editor-panels').classList.toggle('split', $('split-view').checked); }
  function clientErrors(patch) {
    const result={};
    for(const key of ['title','summary','status','student_eligibility']) if(!patch[key]?.trim()) result[key]=['Please fill in this field.'];
    if(!patch.categories.length)result.categories=['Choose at least one category.'];
    if(!patch.workload.length||patch.workload.some(row=>!Number.isFinite(row.percentage)||row.percentage<0||row.percentage>100)||Math.abs(patch.workload.reduce((sum,row)=>sum+(row.percentage||0),0)-100)>0.000001)result.workload=['Enter percentages from 0 to 100 totaling 100%.'];
    if(!patch.contact.email||!/^\S+@\S+\.\S+$/.test(patch.contact.email))result['contact.email']=['Enter a public email address.'];
    return result;
  }
  async function action(name) {
    if(!state||busy)return; busy=true; message(name==='preview'?'Preparing preview…':'Preparing proposal…');
    try {
      const payload={...values(),operation:name};
      if(['compose','publish'].includes(name)) {const problems=clientErrors(payload.patch); if(Object.keys(problems).length){errors(problems);message('Please correct the highlighted fields. Your working copy is unchanged.');return;}}
      const result=await api('prepare',payload); errors(result.previewErrors||result.errors);
      if(name==='preview') { if(result.html){$('preview-frame').srcdoc=result.html; $('preview-state').textContent=result.ready?'Preview is current.':'Draft preview — publication fields still need attention.';} else $('preview-state').textContent='Correct the highlighted fields before previewing.'; }
      if(name==='download') { const file=new Blob([result.source],{type:'text/markdown;charset=utf-8'}); const url=URL.createObjectURL(file); const link=node('a',undefined,{href:url,download:(result.metadata.proposal_id||'proposal')+'-draft.md'}); link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); message('Markdown draft downloaded. Keep this file to continue later.'); }
      else if(name==='publish') {
        if(!result.ready) {message('Please correct the highlighted fields. Your working copy is unchanged.'); return;}
        const path=state.context.path||result.metadata.date.slice(0,10)+'-project-'+result.metadata.proposal_id+'.md';
        const saved=await api('save',{baseCommit:state.context.baseCommit,changes:[{path:path.startsWith('_posts/')?path:'_posts/'+path,sha:state.context.sha??null,content:result.source}]});
        const savedPath=path.startsWith('_posts/')?path:'_posts/'+path;
        populate(result,{path:savedPath,baseCommit:saved.commit,sha:saved.files.find(file=>file.path===savedPath).sha});
        message('Committed; validation/build pending. This is not a live deployment confirmation.');
        try { bootstrap=await api('bootstrap'); renderList(); } catch { message('Committed; validation/build pending. The list could not refresh. Reload it before editing another proposal.'); }
      } else if(name!=='download') message(result.ready?'Proposal checks passed.':'Working copy retained — required publication fields need attention.');
    } catch(error) { errors(error.data?.errors||{});message(error.message+' Your working copy remains in this tab.');if(error.status===409)$('reload').hidden=false; }
    finally {busy=false;}
  }
  async function open(item) {if(dirty&&!confirm('Discard the current working copy? Download Markdown first if you want to keep it.'))return;populate(item,{path:item.path,sha:item.sha,baseCommit:bootstrap.baseCommit});}
  async function start() {
    try {
      const session=await fetch('/admin/api/session',{credentials:'same-origin'}).then(r=>r.json());csrf=session.csrf;
      bootstrap=await api('bootstrap'); $('connection').textContent=bootstrap.canPublish?'Connected to the staff content branch. Saves wait for validation.':'Local review — GitHub saving is not connected. You can edit, preview and download drafts.';
      renderList();
    } catch(error){$('connection').textContent=error.message;}
  }
  function renderList() {
    $('proposal-list').replaceChildren();
    for(const item of bootstrap.proposals){const tr=node('tr');const td=node('td');const button=node('button',item.metadata.title,{type:'button',class:'link-button'});button.addEventListener('click',()=>open(item));td.append(button);tr.append(td);for(const text of [item.metadata.status,item.metadata.priority,formatDate(item.metadata.created_at),formatDate(item.metadata.updated_at),'Committed source'])tr.append(node('td',String(text)));$('proposal-list').append(tr);}
  }
  $('proposal-form').addEventListener('input',changed); $('proposal-form').addEventListener('change',changed);
  $('new-proposal').addEventListener('click',async()=>{if(dirty&&!confirm('Discard the current working copy? Download Markdown first to keep it.'))return;try{const value=await api('prepare',{operation:'new'});populate(value,{baseCommit:bootstrap.baseCommit,sha:null});}catch(error){message(error.message);}});
  $('open-draft').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(file.size>131072){alert('Choose a Markdown file smaller than 128 KiB.');return;}if(dirty&&!confirm('Replace the current working copy?'))return;try{const value=await api('prepare',{operation:'parse',source:await file.text()});populate(value,{baseCommit:bootstrap.baseCommit,sha:null,...value.context});}catch(error){message(error.message);}event.target.value='';});
  $('write-tab').addEventListener('click',()=>tabs('write'));$('preview-tab').addEventListener('click',()=>{tabs('preview');action('preview');});$('split-view').addEventListener('change',()=>tabs($('preview-tab').getAttribute('aria-selected')==='true'?'preview':'write'));
  for(const tab of [$('write-tab'),$('preview-tab')])tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();(tab===$('write-tab')?$('preview-tab'):$('write-tab')).focus();}});
  $('refresh-preview').addEventListener('click',()=>action('preview'));$('validate').addEventListener('click',()=>action('compose'));$('download').addEventListener('click',()=>action('download'));$('save').addEventListener('click',()=>action('publish'));
  $('reload').addEventListener('click',()=>{if(confirm('Reload the latest source? Download your working Markdown first; reloading will discard it.')){leaving=true;location.reload();}});
  $('logout').addEventListener('submit',event=>{if(dirty&&!confirm('Sign out and discard this tab’s working copy? Download Markdown first to keep it.'))event.preventDefault();else leaving=true;});
  addEventListener('beforeunload',event=>{if(dirty&&!leaving){event.preventDefault();event.returnValue='';}});
  start();
})();

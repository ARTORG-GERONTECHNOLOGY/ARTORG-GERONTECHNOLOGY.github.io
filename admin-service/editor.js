'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let bootstrap, state, csrf, dirty = false, busy = false, leaving = false;
  const fields = new Map();
  let mediaFiles=[],mediaRules;
  let orderDirty=false,orderPaths=[],draggedPath,deleteTarget,listNeedsReload=false;
  let historyPath,historyPage=0,historyBusy=false;
  let supportingItems=[],supportingBase,qrDestination;
  const publicationReports=new Map();let publicationBusy=false,lastSaved;
  const listMessage=text=>{$('list-state').textContent=text;};
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
  function changed() { dirty=true; message('Unsaved changes — download a draft to keep unfinished work.'); $('preview-state').textContent='Preview is outdated. Refresh it to see your latest changes.'; paintPublication(); }
  function publicationSlot(parent,path,commit){const slot=node('div',undefined,{class:'publication-status','data-publication-path':path,'data-publication-commit':commit||''});parent.append(slot);return slot;}
  function paintPublication(){
    if(state?.deleted){const panel=$('editor-publication');if(panel.dataset.version!=='deleted'){panel.dataset.version='deleted';panel.replaceChildren(node('p','This proposal is deleted in the saved source. Review its history before recovery. Last saved change tracks a deletion made in this tab.'));}}
    else if(state){const panel=$('editor-publication');const key=state.context.sha?state.context.path+'@'+state.context.baseCommit:'unsaved';if(panel.dataset.version!==key){panel.dataset.version=key;panel.replaceChildren();if(state.context.sha)publicationSlot(panel,state.context.path,state.context.baseCommit);else panel.append(node('p','This working copy has not been saved.'));panel.append(node('p','Unsaved changes in this form are not included in the publication status.',{class:'publication-working'}));}panel.querySelector('.publication-working').hidden=!dirty;}
    for(const slot of document.querySelectorAll('[data-publication-path]')){
      const report=publicationReports.get(slot.dataset.publicationCommit);const entry=report?.entries.find(item=>item.path===slot.dataset.publicationPath);
      const focused=slot.contains(document.activeElement)?document.activeElement.getAttribute('href'):null;
      slot.replaceChildren();const missing=report?.mode==='github'&&!report.state&&!entry;const status=entry?.state||report?.state||(missing?'unavailable':'pending');const label=entry?.label||(status==='local_review'?'Local review':status==='unavailable'?'Status unavailable':'Checking saved version…');
      slot.append(node('strong',label,{class:'publication-badge','data-state':status}));
      if(entry?.message||report?.message)slot.append(node('small',entry?.message||report.message));
      if(missing)slot.append(node('small','No saved version at this address was found in the selected revision. Download and review your working copy before another save.'));
      if(report?.checkedAt)slot.append(node('small','Checked '+formatDate(report.checkedAt)+' (Europe/Zurich)'));
      for(const link of entry?.logs||[]){const anchor=node('a',link.label,{href:link.url,target:'_blank',rel:'noopener noreferrer'});slot.append(anchor);}
      if(focused)([...slot.querySelectorAll('a')].find(anchor=>anchor.getAttribute('href')===focused)||$('refresh-publication')).focus({preventScroll:true});
    }
  }
  function trackSaved(result){
    lastSaved={commit:result.commit,paths:result.files.filter(item=>/^_(posts|team|news)\/|^_data\//.test(item.path)).map(item=>item.path)};
    $('last-publication').hidden=false;$('last-publication-results').replaceChildren(node('p','Saved revision '+result.commit.slice(0,12)));
    for(const path of lastSaved.paths){const item=state?.context?.path===path?state:[...(bootstrap?.proposals||[]),...supportingItems].find(item=>item.path===path);const label=item?.metadata?.title||item?.metadata?.name||({'_data/home.yml':'Home','_data/about.yml':'About','_data/removed_proposals.yml':'Removed proposal addresses','_data/proposal_categories.yml':'Proposal categories'}[path])||'Saved content';const group=node('div');group.append(node('p',label));publicationSlot(group,path,result.commit);$('last-publication-results').append(group);}
    paintPublication();refreshPublication();
  }
  async function refreshPublication(announce=false){
    if(publicationBusy||!bootstrap)return;publicationBusy=true;$('refresh-publication').setAttribute('aria-disabled','true');$('refresh-publication').setAttribute('aria-busy','true');if(announce)$('publication-check').textContent='Refreshing publication reports…';
    const commits=[...new Set([bootstrap.baseCommit,supportingBase,state?.context?.baseCommit,lastSaved?.commit].filter(value=>/^[a-f0-9]{40}$/.test(value||'')))];
    try{for(const commit of commits){try{publicationReports.set(commit,await api('publication?'+new URLSearchParams({commit})));}catch{publicationReports.set(commit,{state:'unavailable',entries:[],message:'Status could not be refreshed. Your working copy is kept. Reopen the private link if your session ended, then refresh status.'});}}
      while(publicationReports.size>8)publicationReports.delete(publicationReports.keys().next().value);paintPublication();if(announce)$('publication-check').textContent=bootstrap.canPublish?'Publication reports checked. Form changes have been kept.':'Local review confirmed. GitHub publication tracking is disconnected; your form changes have been kept.';
    }finally{publicationBusy=false;$('refresh-publication').removeAttribute('aria-disabled');$('refresh-publication').removeAttribute('aria-busy');}
  }
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
    fields.set(key,{error,add,read:()=>records.map(record=>{ const value={}; for(const column of columns) { const raw=record.inputs[column.key].value; if(column.type==='number') {if(raw!=='')value[column.key]=Number(raw);} else if(raw!==''||column.required) value[column.key]=raw; } return value; })});
  }
  function populate(model, context) {
    if(model.supporting||model.kind){populateSupporting(model,context);return;}
    $('editor-title').textContent='Proposal editor';$('preview-panel').querySelector('h3').textContent='Proposal preview';
    $('write-tab').hidden=false;$('preview-tab').hidden=false;$('split-view').parentElement.hidden=false;$('publication-actions').hidden=false;
    fields.clear(); $('proposal-form').replaceChildren(); state={...model,context}; const m=model.metadata;
    let p=group('Proposal details'); field(p,'Title','title',m.title); field(p,'Short summary','summary',m.summary,{area:true});
    field(p,'Status','status',m.status,{choices:bootstrap.statuses.map(x=>[x,x[0].toUpperCase()+x.slice(1)])});
    field(p,'Categories','categories',m.categories,{choices:bootstrap.categories.map(x=>[x.id,x.label]),multiple:true,help:'Choose from the shared list. Use Ctrl or Command to select more than one.'});
    field(p,'Language','language',m.language); field(p,'Priority','priority',m.priority,{type:'number',step:'1'}); field(p,'Featured on homepage','featured',m.featured,{type:'checkbox'});
    field(p,'Tags (one per line)','tags',(m.tags||[]).join('\n'),{area:true});
    p=group('Dates and stable identity'); for(const [key,label] of [['proposal_id','Proposal ID'],['permalink','Permanent address'],['created_at','Created'],['date','Initial publication'],['updated_at','Last edited (content/status)']]) {const timestamp=['created_at','date','updated_at'].includes(key);field(p,label,key,timestamp&&m[key]?formatDate(m[key])+' (Europe/Zurich)':m[key],{readonly:true,help:key==='date'&&!m.date?'Assigned when first saved for publication.':timestamp&&m[key]?'Stored value: '+m[key]:''});}
    p=group('Supervisors and institutes'); rows(p,'Supervisors','supervisors',m.supervisors,[{key:'name',label:'Name',required:true},{key:'team_id',label:'Optional team profile ID'}]); rows(p,'Institutes','institutes',m.institutes,[{key:'name',label:'Institute',required:true},{key:'url',label:'Optional institutional URL'}]);
    p=group('Nature of the thesis'); rows(p,'Activities','workload',m.workload,[{key:'activity',label:'Activity',required:true},{key:'percentage',label:'Percentage',type:'number'}]); p.append(node('p','Workload percentages must total 100% before publication.'));
    p=group('Contact and applications'); for(const [key,label] of [['name','Contact name'],['email','Public email'],['address','Address'],['phone','Phone']]) field(p,label,'contact.'+key,m.contact?.[key]);
    field(p,'Student application instructions','application_instructions',m.application_instructions,{area:true}); field(p,'Start date or arrangement','start_date_text',m.start_date_text); field(p,'Workplace','workplace',m.workplace,{area:true});
    p=group('Proposal text'); for(const name of ['Background','Aim','Materials and Methods','Requirements','References']) field(p,name+' (Markdown)','section.'+name,model.sections[name]||'',{area:true,rows:8,help:name==='Requirements'?'Use a Markdown bullet list for requirements.':'Lists, links, tables, code and mathematical notation are supported.'});
    const optional=node('details'); optional.append(node('summary','Optional figure, downloads and media')); $('proposal-form').append(optional);
    for(const [key,label] of [['src','Existing figure URL or /assets/ path'],['alt','Figure alternative text'],['caption','Figure caption']]) field(optional,label,'figure.'+key,m.figure?.[key]);
    rows(optional,'Attachments','attachments',m.attachments,[{key:'title',label:'Title',required:true},{key:'url',label:'Existing file URL',required:true},{key:'mime_type',label:'MIME type',required:true},{key:'size',label:'Bytes (required for external files)',type:'number'}]);
    const picker=node('section',undefined,{id:'media-picker','aria-label':'Media files'});optional.prepend(picker);renderMedia();
    optional.append(node('p','Removing a figure or attachment link keeps its shared file. Temporary uploads expire at sign-out or session expiry. Download your Markdown and temporary files to continue later; upload the files again when reopening the draft. Existing embedded media metadata is preserved.'));
    dirty=false; $('editor').hidden=false; $('errors').hidden=true; $('reload').hidden=true; $('preview-frame').srcdoc=''; $('preview-state').textContent='Preview has not been generated.';
    historyPath=context.path;historyPage=0;$('history-list').replaceChildren();$('revision-detail').hidden=true;$('older-revisions').hidden=true;$('history-state').textContent='Open Revisions to load saved history.';
    $('save').disabled=!bootstrap.canPublish; $('save').title=bootstrap.canPublish?'':'GitHub saving is not connected in this local review.';
    message('No unsaved changes'); tabs('write'); paintPublication(); $('editor-title').scrollIntoView({block:'start'});
  }
  function values() {
    if(state.supporting)return supportingValues();
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
  function populateSupporting(model,context){
    fields.clear();$('proposal-form').replaceChildren();state={...model,supporting:true,context};const m=model.metadata;const kind=model.kind;
    $('write-tab').hidden=false;$('preview-tab').hidden=false;$('split-view').parentElement.hidden=false;$('publication-actions').hidden=false;
    $('editor-title').textContent={home:'Homepage editor',about:'About editor',team:'Team profile editor',news:'News editor'}[kind];$('preview-panel').querySelector('h3').textContent='Public page preview';
    let p=group('Content');
    if(kind==='home'){
      field(p,'Title','title',m.title);field(p,'Introduction','introduction',m.introduction,{area:true});
      for(const [key,label] of [['introduction','Show introduction'],['proposals','Show available proposals'],['news','Show news']])field(p,label,'sections.'+key,m.sections?.[key],{type:'checkbox'});
      field(p,'Maximum proposals on homepage','proposal_limit',m.proposal_limit,{type:'number',step:'1'});field(p,'Maximum news items on homepage','news_limit',m.news_limit,{type:'number',step:'1'});
      rows(p,'Links','links',m.links,[{key:'label',label:'Link text',required:true},{key:'url',label:'URL or site path',required:true}]);
    }else if(kind==='about'){
      const linkHelp='To link text in this paragraph, write [link text](https://example.org).';
      for(const [key,label] of [['title','Title'],['overview','Overview'],['group_text','About the group'],['program_text','Study program'],['corrections_text','Corrections and removal requests'],['corrections_email','Public corrections email']]){
        field(p,label,key,m[key],{area:!['title','corrections_email'].includes(key),help:['overview','group_text','program_text'].includes(key)?linkHelp:undefined});
      }
      field(p,'Application steps (one per line)','application_steps',(m.application_steps||[]).join('\n'),{area:true,rows:6});
      p.append(node('p','QR destination: '+qrDestination+' — derived from the website configuration.'));
    }else if(kind==='team'){
      field(p,'Stable profile ID','team_id',m.team_id,{readonly:true});field(p,'Name','name',m.name);field(p,'Role','role',m.role);field(p,'Public email (optional)','email',m.email);field(p,'Active — show in Team listing','active',m.active,{type:'checkbox'});field(p,'Display order','display_order',m.display_order,{type:'number',step:'1'});
      field(p,'Research interests (one per line)','interests',(m.interests||[]).join('\n'),{area:true});rows(p,'Links','links',m.links,[{key:'label',label:'Link text',required:true},{key:'url',label:'URL or site path',required:true}]);field(p,'Biography (Markdown)','body',model.body,{area:true,rows:10});
      p.append(node('p','Inactive members keep their profiles and proposal links. A changed profile name leaves names on existing proposals unchanged.'));
    }else{
      field(p,'Title','title',m.title);field(p,'Short summary','summary',m.summary,{area:true});field(p,'News text (Markdown)','body',model.body,{area:true,rows:12});
    }
    if(['team','news'].includes(kind)){
      p=group('Dates and address');field(p,'Permanent address','permalink',m.permalink||'/'+kind+'/'+model.path.split('/')[1].slice(0,-3)+'/',{readonly:true});
      for(const [key,label] of [['created_at','Created'],['date','Initial publication'],['updated_at','Last edited']]){if(key==='date'&&kind!=='news')continue;field(p,label,key,m[key]?formatDate(m[key])+' (Europe/Zurich)':key==='date'?'Assigned on first publication':'Not recorded; see Revisions',{readonly:true,help:m[key]?'Stored value: '+m[key]:''});}
    }
    if(kind!=='about'){
      const imageKey={home:'hero_image',team:'portrait',news:'image'}[kind];p=group('Optional image');const picker=node('section',undefined,{id:'media-picker','aria-label':'Media files'});p.append(picker);
      for(const [key,label] of [['src','Image URL or existing asset path'],['alt','Alternative text'],['caption','Optional caption']])field(p,label,imageKey+'.'+key,m[imageKey]?.[key]);renderMedia();
    }
    dirty=false;$('editor').hidden=false;$('errors').hidden=true;$('reload').hidden=true;$('preview-frame').srcdoc='';$('preview-state').textContent='Preview has not been generated.';
    historyPath=context.sha?model.path:undefined;historyPage=0;$('history-list').replaceChildren();$('revision-detail').hidden=true;$('older-revisions').hidden=true;$('history-state').textContent='Open Revisions to load saved history.';
    $('save').disabled=!bootstrap.canPublish;message('No unsaved changes');tabs('write');paintPublication();$('editor-title').scrollIntoView({block:'start'});
  }
  function supportingValues(){
    const patch={};let body;
    for(const [key,record] of fields){if(record.read){patch[key]=record.read();continue;}const input=record.input;if(input.readOnly)continue;
      let value=input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?null:Number(input.value)):input.value;
      if(key==='body'){body=value===(state.body||'').replace(/\r\n/g,'\n')?state.body:value;continue;}
      if(key.includes('.')){const [parent,child]=key.split('.');(patch[parent]||={})[child]=value;}
      else if(['interests','application_steps'].includes(key))patch[key]=value.split('\n').filter(line=>line.trim());
      else if(value!==''||Object.hasOwn(state.metadata,key))patch[key]=value;
    }
    const imageKey={home:'hero_image',team:'portrait',news:'image'}[state.kind];if(imageKey&&!patch[imageKey].src&&!patch[imageKey].alt&&!patch[imageKey].caption)patch[imageKey]=null;
    return {source:state.source,path:state.path,context:state.context,patch,...(body===undefined?{}:{body})};
  }
  async function loadSupporting(){
    const result=await api('supporting');supportingItems=result.items;supportingBase=result.baseCommit;qrDestination=result.qrDestination;$('supporting-list').replaceChildren();
    for(const item of supportingItems){const wrapper=node('div',undefined,{class:'supporting-item'});const button=node('button',item.kind==='home'?'Home':item.kind==='about'?'About':(item.kind==='team'?'Team: ':'News: ')+(item.metadata.name||item.metadata.title),{type:'button',class:'secondary'});button.addEventListener('click',()=>openSupporting(item));wrapper.append(button);publicationSlot(wrapper,item.path,supportingBase);$('supporting-list').append(wrapper);}paintPublication();
  }
  function openSupporting(item){if(busy||orderDirty){listMessage('Save or reset the proposed order first.');return;}if(dirty&&!confirm('Discard this working copy? Download it first to keep unfinished work.'))return;populateSupporting(item,{path:item.path,kind:item.kind,sha:item.sha,baseCommit:supportingBase});}
  function errors(value) {
    $('error-list').replaceChildren(); for(const record of fields.values()) if(record.error) {record.error.textContent=''; record.input?.removeAttribute('aria-invalid');}
    const entries=Object.entries(value||{}); $('errors').hidden=!entries.length;
    for(const [key,messages] of entries) { const record=fields.get(key)||fields.get('section.'+key)||fields.get(key.split(/[.\[]/)[0]); const text=messages.join('; '); $('error-list').append(node('li',key+': '+text)); if(record?.error){record.error.textContent+=(record.error.textContent?' · ':'')+text;record.input?.setAttribute('aria-invalid','true');} }
  }
  function tabs(name) { for(const kind of ['write','preview','revisions']) {$(`${kind}-tab`).setAttribute('aria-selected',String(kind===name));$(`${kind}-panel`).hidden=name==='revisions'?kind!=='revisions':kind==='revisions'||kind!==name&&!$('split-view').checked;} $('editor-panels').classList.toggle('split', $('split-view').checked&&name!=='revisions'); }
  async function loadHistory(more=false){
    if(historyBusy)return;if(!historyPath){$('history-state').textContent='History is available after this proposal has been saved.';return;}
    const requested=historyPath;historyBusy=true;$('history-state').textContent='Loading saved revisions…';
    try{
      const page=more?historyPage+1:1;const result=await api('history?'+new URLSearchParams({path:requested,page:String(page)}));if(historyPath!==requested)return;
      if(!more)$('history-list').replaceChildren();historyPage=page;
      for(const revision of result.revisions){const item=node('li');const button=node('button',formatDate(revision.time)+' — '+revision.message,{type:'button',class:'link-button'});button.addEventListener('click',()=>showRevision(requested,revision.commit));item.append(button,node('p',revision.author),node('small','Revision '+revision.commit.slice(0,12)));$('history-list').append(item);}
      $('older-revisions').hidden=!result.hasMore||page>=50;$('history-state').textContent=page>=50&&result.hasMore?'The latest 1,000 file revisions are shown. A maintainer can inspect older Git history.':result.revisions.length?'Select a revision to see its change summary and differences.':'No further revisions were found.';
    }catch(error){$('history-state').textContent=error.message;}finally{historyBusy=false;}
  }
  function diffView(parent,diff){
    parent.append(node('h4',diff.summary));if(diff.warning)parent.append(node('p',diff.warning));
    if(diff.metadata.length){const table=node('table');table.append(node('caption','Metadata changes'));const head=node('tr');for(const label of ['Field','Before','After'])head.append(node('th',label));table.append(head);
      for(const entry of diff.metadata){const row=node('tr');const labels={proposal_id:'Proposal ID',permalink:'Permanent address',date:'Initial publication',created_at:'Created',updated_at:'Last edited',priority:'Priority / order'};const label=labels[entry.field]||entry.field.replace(/_/g,' ').replace(/^./,letter=>letter.toUpperCase());row.append(node('th',label));for(const value of [entry.before,entry.after]){const cell=node('td');cell.append(node('pre',value===null?'Not set':JSON.stringify(value,null,2)));row.append(cell);}table.append(row);}const wrapper=node('div',undefined,{class:'table-wrap'});wrapper.append(table);parent.append(wrapper);}
    if(diff.narrative.length){parent.append(node('h4','Text changes (+ added, − removed)'));const code=node('pre',undefined,{class:'revision-diff',tabindex:'0'});for(const line of diff.narrative)code.append(node('span',line+'\n',{class:line.startsWith('+')?'diff-added':line.startsWith('-')?'diff-removed':'diff-context'}));parent.append(code);}
  }
  async function showRevision(path,commit){
    if(historyBusy)return;historyBusy=true;$('history-state').textContent='Comparing revision…';
    try{const value=await api('revision?'+new URLSearchParams({path,commit}));if(historyPath!==path)return;const panel=$('revision-detail');panel.replaceChildren(node('h4',formatDate(value.time)+' — '+value.message),node('p',value.author),node('small','Revision '+value.commit));diffView(panel,value.diff);
      const restoreCommit=value.source!==null?value.commit:value.before!==null?value.parents[0]:null;
      if(restoreCommit){const preview=node('button',value.source===null?'Preview recovery before deletion':'Preview restoration',{type:'button'});preview.addEventListener('click',()=>previewRestoration(path,restoreCommit,panel));panel.append(preview);}
      panel.hidden=false;$('history-state').textContent='Comparison shows what changed in this revision. Your form is unchanged.';}
    catch(error){$('history-state').textContent=error.message;}finally{historyBusy=false;}
  }
  async function previewRestoration(path,commit,panel){
    if(busy||!state||historyPath!==path)return;busy=true;$('history-state').textContent='Validating and preparing restoration preview…';
    try{
      const value=await api('restore-preview',{path,commit,baseCommit:state.context.baseCommit,sha:state.context.sha??null});if(historyPath!==path)return;
      panel.querySelector('.restoration-preview')?.remove();const result=node('section',undefined,{class:'restoration-preview'});result.append(node('h4',state.supporting?'Proposed restoration of saved page content. Profile order and original addresses/publication dates are retained.':value.deleted?'Proposed recovery: earlier content/status return, using its priority just before deletion.':'Proposed restoration: content and status return; current ordering is kept.'));diffView(result,value.diff);
      const frame=node('iframe',undefined,{title:'Restoration preview',sandbox:'allow-same-origin',referrerpolicy:'no-referrer',class:'restoration-frame'});frame.srcdoc=value.html;result.append(frame);
      const button=node('button',value.deleted?'Confirm recovery as a new revision':'Confirm restoration as a new revision',{type:'button'});button.disabled=!value.canRestore;
      if(!value.canRestore)result.append(node('p','Local review: this preview is available, but GitHub saving is not connected.'));
      button.addEventListener('click',async()=>{
        if(busy)return;if(dirty||orderDirty){$('history-state').textContent='Keep unfinished work: save/download and close the working proposal, or reset the proposed order, before restoring.';return;}
        if(!confirm('Restore this saved content as a new revision? Original identity/dates stay unchanged, and history will be retained.'))return;
        busy=true;try{const saved=await api('restore',{previewId:value.previewId,confirmation:commit});trackSaved(saved);button.disabled=true;listNeedsReload=true;
          try{await refreshAfterListSave();listMessage('Restoration committed; checks/build pending. Production publication is not yet confirmed.');}
          catch{listMessage('Restoration committed; checks/build pending. Reload the list to see the new revision.');}
        }catch(error){$('history-state').textContent=error.message+' Your working copy and selected revision are retained.';}finally{busy=false;}
      });result.append(button);panel.append(result);$('history-state').textContent='Review this preview, then confirm to create a new revision.';
    }catch(error){$('history-state').textContent=error.message;const errors=error.data?.errors;if(errors)for(const [field,messages] of Object.entries(errors))panel.append(node('p',field+': '+messages.join('; ')));}finally{busy=false;}
  }
  async function loadDeleted(){
    const value=await api('deleted');$('deleted-proposals').replaceChildren();
    if(!value.records.length){$('deleted-proposals').append(node('li','No deleted proposals.'));return;}
    for(const record of value.records){const item=node('li');const button=node('button',record.permalink,{type:'button',class:'link-button'});button.disabled=!record.source_path;
      button.addEventListener('click',()=>{if(!listActionAllowed())return;state={deleted:true,context:{path:record.source_path,sha:null,baseCommit:value.baseCommit}};dirty=false;historyPath=record.source_path;historyPage=0;
        $('editor').hidden=false;$('write-tab').hidden=true;$('preview-tab').hidden=true;$('split-view').parentElement.hidden=true;$('publication-actions').hidden=true;$('errors').hidden=true;$('revision-detail').hidden=true;$('history-list').replaceChildren();tabs('revisions');message('Deleted proposal — review history before recovery.');paintPublication();loadHistory();$('editor-title').scrollIntoView({block:'start'});});
      item.append(button,node('small',record.source_path?'Removed '+formatDate(record.removed_at):'Source filename is absent; ask a maintainer to locate its history.'));$('deleted-proposals').append(item);}
  }
  function clientErrors(patch) {
    const result={};
    for(const key of ['title','summary','status']) if(!patch[key]?.trim()) result[key]=['Please fill in this field.'];
    if(!patch.categories.length)result.categories=['Choose at least one category.'];
    if(!patch.workload.length||patch.workload.some(row=>!Number.isFinite(row.percentage)||row.percentage<0||row.percentage>100)||Math.abs(patch.workload.reduce((sum,row)=>sum+(row.percentage||0),0)-100)>0.000001)result.workload=['Enter percentages from 0 to 100 totaling 100%.'];
    if(!patch.contact.email||!/^\S+@\S+\.\S+$/.test(patch.contact.email))result['contact.email']=['Enter a public email address.'];
    return result;
  }
  async function action(name) {
    if(state?.deleted)return;
    if(name==='publish'&&orderDirty){message('Save or reset the proposed order before saving proposal edits. Your working copy is retained.');return;}
    if(!state||busy)return; busy=true; message(name==='preview'?'Preparing preview…':'Preparing proposal…');
    try {
      const payload={...values(),operation:name};
      if(!state.supporting&&['compose','publish'].includes(name)) {const problems=clientErrors(payload.patch); if(Object.keys(problems).length){errors(problems);message('Please correct the highlighted fields. Your working copy is unchanged.');return;}}
      const result=await api(state.supporting?'support-prepare':'prepare',payload); errors(result.previewErrors||result.errors);
      if(name==='preview') { if(result.html){$('preview-frame').srcdoc=result.html; $('preview-state').textContent=result.ready?'Preview is current.':'Draft preview — publication fields still need attention.';} else $('preview-state').textContent='Correct the highlighted fields before previewing.'; }
      if(name==='download') { const file=new Blob([result.source],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(file); const filename=state.supporting?state.path.split('/').at(-1).replace(/\.(md|yml)$/,'-draft.$1'):(result.metadata.proposal_id||'proposal')+'-draft.md';const link=node('a',undefined,{href:url,download:filename}); link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); message('Draft downloaded. Keep this file and any temporary images to continue later.'); }
      else if(name==='publish') {
        if(!result.ready) {message('Please correct the highlighted fields. Your working copy is unchanged.'); return;}
        if(state.supporting&&result.changed===false){message('There are no changes to save.');return;}
        const path=state.supporting?state.path:state.context.path||result.metadata.date.slice(0,10)+'-project-'+result.metadata.proposal_id+'.md';
        const selected=new Set(state.supporting?[payload.patch[{home:'hero_image',news:'image',team:'portrait'}[state.kind]]?.src]:[payload.patch.figure?.src,...payload.patch.attachments.map(file=>file.url)]);
        const uploads=mediaFiles.filter(file=>file.temporary&&selected.has(file.url)).map(file=>file.id);
        const savedPath=state.supporting?path:path.startsWith('_posts/')?path:'_posts/'+path;
        const saved=await api('save',{baseCommit:state.context.baseCommit,changes:[{path:savedPath,sha:state.context.sha??null,content:result.source}],uploads});
        populate(result,{path:savedPath,baseCommit:saved.commit,sha:saved.files.find(file=>file.path===savedPath).sha});
        trackSaved(saved);
        message('Committed; validation/build pending. This is not a live deployment confirmation.');
        try { bootstrap=await api('bootstrap'); await loadSupporting();await loadMedia();renderList();renderMedia(); } catch { message('Committed; validation/build pending. The list could not refresh. Reload it before editing more content.'); }
      } else if(name!=='download') message(result.ready?'Content checks passed.':'Working copy retained — required publication fields need attention.');
    } catch(error) { errors(error.data?.errors||{});message(error.message+' Your working copy remains in this tab.');if(error.status===409)$('reload').hidden=false; }
    finally {busy=false;}
  }
  async function open(item) {if(busy)return;if(orderDirty||listNeedsReload){listMessage('Save/reset the proposed order and reload a stale list before opening a proposal.');return;}if(dirty&&!confirm('Discard the current working copy? Download Markdown first if you want to keep it.'))return;populate(item,{path:item.path,sha:item.sha,baseCommit:bootstrap.baseCommit});}
  async function loadMedia() {
    const response=await fetch('/admin/api/media/list',{credentials:'same-origin'});if(!response.ok)throw new Error('The media list is unavailable. Please try again.');
    const value=await response.json();mediaFiles=value.files;mediaRules=value.rules;
    // Once committed, use the permanent file rather than the remaining private upload.
    const permanent=new Set(mediaFiles.filter(file=>!file.temporary).map(file=>file.url));
    mediaFiles=mediaFiles.filter(file=>!file.temporary||!permanent.has(file.url));
  }
  function renderMedia() {
    const panel=$('media-picker');if(!panel)return;panel.replaceChildren(node('h3','Choose or upload a file'));
    const status=node('p','',{role:'status'});
    const label=node('label',state.supporting?'Upload PNG, JPEG or WebP (up to 10 MiB)':'Upload PNG, JPEG, WebP or PDF (up to 10 MiB)');const input=node('input',undefined,{type:'file',accept:state.supporting?'.png,.jpg,.jpeg,.webp':'.png,.jpg,.jpeg,.webp,.pdf'});label.append(input);panel.append(label,status);
    input.addEventListener('change',async()=>{
      const file=input.files[0];if(!file||busy)return;
      if(file.size>(mediaRules?.max_file_bytes||10485760)){status.textContent='Choose a file no larger than 10 MiB.';input.value='';return;}
      busy=true;status.textContent='Checking and uploading file…';
      try{
        const session=await fetch('/admin/api/session',{credentials:'same-origin'});if(!session.ok)throw new Error('Your session ended. Open the private link in another tab, then retry.');
        const token=(await session.json()).csrf;const extension='.'+file.name.split('.').at(-1).toLowerCase();
        const response=await fetch('/admin/api/media/upload?'+new URLSearchParams({filename:file.name,...(state.supporting?{target:state.path}:{proposalId:state.metadata.proposal_id})}),{method:'POST',credentials:'same-origin',headers:{'Content-Type':mediaRules?.types[extension]||file.type||'application/octet-stream','X-CSRF-Token':token},body:file});
        const value=await response.json().catch(()=>({message:'The upload was rejected. Check its type and size.'}));if(!response.ok)throw new Error(value.message);
        dirty=true;
        await loadMedia();renderMedia();$('media-select').value=value.url;$('media-select').dispatchEvent(new Event('change'));
        message(state.supporting?'Image checked and uploaded privately. Choose “Use image” before saving.':'File checked and uploaded privately. Choose “Use as figure” or “Add as attachment” before saving.');
      }catch(error){status.textContent=error.message+' Your proposal remains unchanged.';}finally{busy=false;input.value='';}
    });
    const selectLabel=node('label','Existing and temporary files',{for:'media-select'});const select=node('select',undefined,{id:'media-select'});select.append(node('option','Choose a file…',{value:''}));
    const own=mediaFiles.filter(file=>(!state.supporting||file.mime_type.startsWith('image/'))&&(!file.temporary||(state.supporting?file.ownerPath===state.path:file.url.startsWith('/assets/media/proposals/'+state.metadata.proposal_id+'/'))));
    for(const file of own)select.append(node('option',(file.temporary?'Temporary · ':'')+file.title+' · '+file.mime_type+' · '+(file.size/1024).toFixed(1)+' KB',{value:file.url}));
    const buttons=node('div',undefined,{class:'actions'});const figure=node('button',state.supporting?'Use image':'Use as figure',{type:'button'});const attach=node('button','Add as attachment',{type:'button'});attach.hidden=Boolean(state.supporting);const download=node('a','Download selected file',{hidden:'',class:'media-download'});
    const chosen=()=>own.find(file=>file.url===select.value);
    select.addEventListener('change',()=>{const file=chosen();download.hidden=!file;if(file){download.href='/admin/api/media/file?'+new URLSearchParams(file.temporary?{id:file.id}:{path:file.url.slice(1)});download.textContent=file.temporary?'Download temporary file':'Download selected file';}});
    figure.addEventListener('click',()=>{const file=chosen();if(!file)return;if(!file.mime_type.startsWith('image/')){status.textContent='Choose an image for a figure. PDFs can be added as attachments.';return;}const key=state.supporting?{home:'hero_image',team:'portrait',news:'image'}[state.kind]:'figure';fields.get(key+'.src').input.value=file.url;fields.get(key+'.alt').input.focus();changed();status.textContent='Image selected. Add alternative text and an optional caption below.';});
    attach.addEventListener('click',()=>{const file=chosen();if(!file)return;fields.get('attachments').add({title:file.title,url:file.url,mime_type:file.mime_type,size:file.size});changed();status.textContent='Attachment added. You can edit its title below.';});
    buttons.append(figure,attach,download);panel.append(selectLabel,select,buttons);
  }
  async function start() {
    try {
      const session=await fetch('/admin/api/session',{credentials:'same-origin'}).then(r=>r.json());csrf=session.csrf;
      bootstrap=await api('bootstrap'); $('connection').textContent=bootstrap.canPublish?'Connected to the staff content branch. Saves wait for validation.':'Local review — GitHub saving is not connected. You can edit, preview and download drafts.';
      renderList();
      try{await loadSupporting();}catch(error){listMessage(error.message);}
      try{await loadDeleted();}catch(error){listMessage(error.message);}
      try{await loadMedia();}catch(error){$('connection').textContent+=' '+error.message;}
      await refreshPublication();
    } catch(error){$('connection').textContent=error.message;}
  }
  function renderList(focusPath,focusKind='handle') {
    if(!orderDirty)orderPaths=bootstrap.proposals.map(item=>item.path);
    $('proposal-list').replaceChildren();
    for(const [index,path] of orderPaths.entries()){
      const item=bootstrap.proposals.find(entry=>entry.path===path);const tr=node('tr');const td=node('td');const button=node('button',item.metadata.title,{type:'button',class:'link-button'});button.addEventListener('click',()=>open(item));td.append(button);tr.append(td);
      for(const text of [item.metadata.status,orderDirty?(index+1)*10:item.metadata.priority,formatDate(item.metadata.created_at),formatDate(item.metadata.updated_at)])tr.append(node('td',String(text)));
      const publication=node('td');publicationSlot(publication,item.path,bootstrap.baseCommit);if(orderDirty)publication.append(node('small','Proposed order not saved'));tr.append(publication);
      const actions=node('td');const toolbar=node('div',undefined,{class:'actions'});
      for(const status of (bootstrap.transitions?.[item.metadata.status]||[])){
        const action=node('button',status==='available'?'Reopen':status==='archived'?'Archive':'Mark taken',{type:'button',class:'secondary'});
        action.addEventListener('click',()=>lifecycleAction(item,'status',status));toolbar.append(action);
      }
      const up=node('button','↑ Move up',{type:'button','aria-label':'Move up: '+item.metadata.title});up.disabled=index===0;up.addEventListener('click',()=>moveOrder(path,index-1,'up'));
      const down=node('button','↓ Move down',{type:'button','aria-label':'Move down: '+item.metadata.title});down.disabled=index===orderPaths.length-1;down.addEventListener('click',()=>moveOrder(path,index+1,'down'));
      const handle=node('button','↕ Drag',{type:'button',draggable:'true','aria-label':'Drag to reorder: '+item.metadata.title});
      handle.addEventListener('dragstart',event=>{if(dirty||busy){event.preventDefault();listMessage('Save or download your working proposal before reordering.');return;}draggedPath=path;event.dataTransfer.setData('text/plain',path);event.dataTransfer.effectAllowed='move';});
      handle.addEventListener('dragend',()=>{draggedPath=null;});tr.addEventListener('dragover',event=>{if(draggedPath){event.preventDefault();event.dataTransfer.dropEffect='move';}});tr.addEventListener('drop',event=>{event.preventDefault();if(draggedPath)moveOrder(draggedPath,index);draggedPath=null;});
      const remove=node('button','Delete…',{type:'button',class:'secondary'});remove.addEventListener('click',()=>{
        if(!listActionAllowed())return;deleteTarget=item;$('delete-name').textContent=item.metadata.title;
        $('confirm-delete').disabled=!bootstrap.canPublish;$('archive-instead').disabled=!(bootstrap.transitions?.[item.metadata.status]||[]).includes('archived');
        $('delete-dialog').showModal();
      });toolbar.append(up,down,handle,remove);actions.append(toolbar);tr.append(actions);$('proposal-list').append(tr);
      if(focusPath===path){const target=focusKind==='up'?up:focusKind==='down'?down:handle;(target.disabled?handle:target).focus();}
    }
    $('save-order').disabled=!orderDirty||!bootstrap.canPublish||listNeedsReload;$('reset-order').disabled=!orderDirty;
    paintPublication();
  }
  function listActionAllowed(){if(busy)return false;if(listNeedsReload){listMessage('Reload the list to obtain its latest revision before another action.');return false;}if(dirty||orderDirty){listMessage('Keep your working copy: save or download proposal edits and close the editor; save or reset ordering before another list action.');return false;}return true;}
  function moveOrder(path,target,focusKind='handle'){if(busy||dirty||listNeedsReload){listMessage('Save or download your working proposal and reload a stale list before reordering.');return;}const index=orderPaths.indexOf(path);if(index<0||target<0||target>=orderPaths.length||index===target)return;orderPaths.splice(index,1);orderPaths.splice(target,0,path);orderDirty=true;renderList(path,focusKind);listMessage('Proposed order changed. Save order to commit it; content-update dates stay unchanged.');}
  async function lifecycleAction(item,action,status){
    if(!listActionAllowed())return;
    if(!bootstrap.canPublish&&action==='status'){populate(item,{path:item.path,sha:item.sha,baseCommit:bootstrap.baseCommit});fields.get('status').input.value=status;changed();message('Status staged for local preview. GitHub saving remains disabled.');return;}
    busy=true;listMessage('Saving proposal change…');
    try{
      const saved=await api('lifecycle',{action,path:item.path,sha:item.sha,baseCommit:bootstrap.baseCommit,...(status?{status}:{}),...(action==='delete'?{confirmation:item.metadata.proposal_id}:{})});trackSaved(saved);
      listNeedsReload=true;
      try{await refreshAfterListSave();listMessage('Committed; checks/build pending. Production publication is not yet confirmed.');}
      catch{listMessage('Committed; checks/build pending. The list could not refresh. Reload the list before another action.');}
    }catch(error){if(error.status===409)listNeedsReload=true;listMessage(error.message+' The working copy is retained. Reload the list after comparing any newer changes.');}finally{busy=false;}
  }
  async function refreshAfterListSave(){
    bootstrap=await api('bootstrap');await loadSupporting();orderDirty=false;listNeedsReload=false;renderList();
    if(state&&!dirty){const current=(state.supporting?supportingItems:bootstrap.proposals).find(item=>item.path===state.context.path);if(current)populate(current,{path:current.path,sha:current.sha,baseCommit:bootstrap.baseCommit});else{$('editor').hidden=true;state=null;dirty=false;}}
    await loadDeleted();
  }
  $('save-order').addEventListener('click',async()=>{if(busy||!orderDirty||listNeedsReload)return;if(dirty){listMessage('Reset the proposed order before saving proposal edits. Both working copies are retained.');return;}busy=true;try{const saved=await api('lifecycle',{action:'order',baseCommit:bootstrap.baseCommit,order:orderPaths});trackSaved(saved);orderDirty=false;listNeedsReload=true;try{await refreshAfterListSave();listMessage('Order committed; checks/build pending. Content-update dates were preserved.');}catch{renderList();listMessage('Order committed; checks/build pending. Reload the list before another action.');}}catch(error){if(error.status===409)listNeedsReload=true;listMessage(error.message+' The proposed order is retained; reset/reload only after comparing newer changes.');}finally{busy=false;}});
  $('reload-list').addEventListener('click',async()=>{if(busy)return;if(orderDirty&&!confirm('Discard the proposed order and load the latest list? Your proposal form will be kept.'))return;busy=true;try{bootstrap=await api('bootstrap');orderDirty=false;listNeedsReload=false;renderList();listMessage('Latest list loaded. Any working proposal retains its original revision so newer edits cannot be overwritten.');}catch(error){listMessage(error.message);}finally{busy=false;}});
  $('reset-order').addEventListener('click',()=>{if(busy)return;orderDirty=false;renderList();listMessage('The proposed order was reset.');});
  $('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
  $('archive-instead').addEventListener('click',()=>{const item=deleteTarget;$('delete-dialog').close();if(item)lifecycleAction(item,'status','archived');});
  $('confirm-delete').addEventListener('click',()=>{const item=deleteTarget;$('delete-dialog').close();if(item)lifecycleAction(item,'delete');});
  $('delete-dialog').addEventListener('close',()=>{deleteTarget=null;});
  $('proposal-form').addEventListener('input',changed); $('proposal-form').addEventListener('change',changed);
  $('close-editor').addEventListener('click',()=>{if(busy)return;if(dirty&&!confirm('Close and discard this working copy? Download the draft and temporary files first to keep unfinished work.'))return;$('editor').hidden=true;state=null;dirty=false;fields.clear();listMessage('Editor closed. Downloaded files are kept; temporary uploads remain available only while this session is active.');});
  for(const kind of ['news','team'])$('new-'+kind).addEventListener('click',async()=>{if(busy||orderDirty)return;if(dirty&&!confirm('Discard this working copy? Download it first to keep unfinished work.'))return;busy=true;try{const value=await api('support-prepare',{operation:'new',kind});populateSupporting(value,{path:value.path,kind,sha:null,baseCommit:supportingBase||bootstrap.baseCommit});}catch(error){listMessage(error.message);}finally{busy=false;}});
  $('new-proposal').addEventListener('click',async()=>{if(busy)return;if(orderDirty){listMessage('Save or reset the proposed order first.');return;}if(dirty&&!confirm('Discard the current working copy? Download Markdown first to keep it.'))return;try{const value=await api('prepare',{operation:'new'});populate(value,{baseCommit:bootstrap.baseCommit,sha:null});}catch(error){message(error.message);}});
  $('open-draft').addEventListener('change',async event=>{const file=event.target.files[0];if(!file||busy)return;if(orderDirty){listMessage('Save or reset the proposed order first.');event.target.value='';return;}if(file.size>131072){alert('Choose a draft file smaller than 128 KiB.');return;}if(dirty&&!confirm('Replace the current working copy?'))return;try{const source=await file.text();let value=await api('support-prepare',{operation:'parse',source});if(value.isProposal)value=await api('prepare',{operation:'parse',source});populate(value,{baseCommit:value.supporting?supportingBase:bootstrap.baseCommit,sha:null,...value.context,path:value.supporting?value.path:value.context?.path});}catch(error){message(error.message);}event.target.value='';});
  $('write-tab').addEventListener('click',()=>tabs('write'));$('preview-tab').addEventListener('click',()=>{tabs('preview');action('preview');});$('revisions-tab').addEventListener('click',()=>{tabs('revisions');if(!historyPage)loadHistory();});$('older-revisions').addEventListener('click',()=>loadHistory(true));$('split-view').addEventListener('change',()=>tabs($('revisions-tab').getAttribute('aria-selected')==='true'?'revisions':$('preview-tab').getAttribute('aria-selected')==='true'?'preview':'write'));
  const editorTabs=[$('write-tab'),$('preview-tab'),$('revisions-tab')];for(const tab of editorTabs)tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const visible=editorTabs.filter(item=>!item.hidden);const index=visible.indexOf(tab);visible[(index+(event.key==='ArrowRight'?1:visible.length-1))%visible.length].focus();}});
  $('refresh-preview').addEventListener('click',()=>action('preview'));$('validate').addEventListener('click',()=>action('compose'));$('download').addEventListener('click',()=>action('download'));$('save').addEventListener('click',()=>action('publish'));
  $('reload').addEventListener('click',()=>{if(confirm('Reload the latest source? Download your working Markdown first; reloading will discard it.')){leaving=true;location.reload();}});
  $('logout').addEventListener('submit',event=>{if((dirty||orderDirty)&&!confirm('Sign out and discard this tab’s working copy and proposed order? Download Markdown first to keep proposal edits.'))event.preventDefault();else leaving=true;});
  addEventListener('beforeunload',event=>{if((dirty||orderDirty)&&!leaving){event.preventDefault();event.returnValue='';}});
  $('refresh-publication').addEventListener('click',()=>refreshPublication(true));
  setInterval(()=>{if(!document.hidden)refreshPublication();},20000);
  start();
})();

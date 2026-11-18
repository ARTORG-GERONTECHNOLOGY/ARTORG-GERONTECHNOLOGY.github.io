import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, generateKeyPairSync, verify } from 'node:crypto';
import { GitHubContent } from '../github.mjs';
import { ContentStore, validateContent } from '../content.mjs';
import { policy, editable, asset, blobSha } from '../content-policy.mjs';
import { createAdministration } from '../service.mjs';
import { ProposalEditor } from '../editor.mjs';
import { ContentRevisions } from '../revisions.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = value => createHash('sha1').update(value).digest('hex');
async function fixture() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ger-github-'));
  const keys = generateKeyPairSync('rsa', {modulusLength: 2048});
  const keyFile = path.join(temporary, 'app.pem');
  await fs.writeFile(keyFile, keys.privateKey.export({type: 'pkcs8', format: 'pem'}));
  const files = new Map();
  async function collect(directory) {
    for (const item of await fs.readdir(path.join(root, directory), {withFileTypes: true})) {
      const name = directory + '/' + item.name;
      if (item.isDirectory()) await collect(name);
      else if (editable(name) || asset(name)) { const bytes = await fs.readFile(path.join(root, name)); files.set(name, {bytes, sha: blobSha(bytes)}); }
    }
  }
  for (const directory of ['_posts', '_news', '_data', 'assets/images']) await collect(directory);
  const fake = {head: hash('initial'), files, mutations: 0, mints: 0, race: false, fail: false, loseResponse: false};
  fake.revisions=new Map([[fake.head,{files:new Map(files),parents:[],paths:[...files.keys()],time:'2026-01-15T00:30:00Z'}]]);
  const label=commit=>({sha:commit,parents:fake.revisions.get(commit).parents.map(sha=>({sha})),author:{type:'Bot',login:'ger-admin[bot]'},commit:{committer:{date:fake.revisions.get(commit).time},author:{name:'Shared administration'},message:'Update staff content'}});
  const response = value => new Response(JSON.stringify(value), {status: 200});
  const config = {appId: 12, installationId: 34, repositoryId: 56, keyFile};
  const fetcher = async (address, options) => {
    assert.ok(address.startsWith('https://api.github.com/'));
    assert.ok(options.redirect === 'error');
    const route = address.slice('https://api.github.com'.length);
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (route === '/app/installations/34/access_tokens') {
      fake.mints++;
      assert.deepEqual(body.repository_ids, [56]);
      assert.deepEqual(body.permissions, {contents: 'write', checks: 'read', actions:'read', deployments:'read'});
      const jwt = options.headers.Authorization.slice(7).split('.');
      assert.ok(verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), keys.publicKey, Buffer.from(jwt[2], 'base64url')));
      const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
      assert.ok(claims.exp - claims.iat <= 600 && claims.iss === '12');
      return response({token: 'fixture-installation-token', expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {contents: 'write', checks: 'read', actions:'read', deployments:'read', metadata: 'read', ...(fake.excessPermissions ? {issues: 'write'} : {})}, repositories: [{id: 56}]});
    }
    assert.ok(options.headers.Authorization === 'Bearer fixture-installation-token');
    const prefix = '/repos/' + policy.repository;
    if (route === prefix) return response({id: 56, full_name: policy.repository});
    if (route.startsWith(prefix + '/git/ref/heads/')) {
      assert.ok(route === prefix + '/git/ref/heads/' + policy.contentBranch);
      return response({object: {sha: fake.head}});
    }
    if (route.startsWith(prefix+'/commits?')){const query=new URL('https://api.github.com'+route).searchParams;assert.equal(query.get('sha'),fake.head);const matches=[...fake.revisions.keys()].reverse().filter(commit=>fake.revisions.get(commit).paths.includes(query.get('path')));const offset=(Number(query.get('page'))-1)*20;return response(matches.slice(offset,offset+20).map(label));}
    if (route.startsWith(prefix+'/commits/')&&/^[a-f0-9]{40}$/.test(route.slice((prefix+'/commits/').length)))return response(label(route.split('/').at(-1)));
    if (route.startsWith(prefix+'/compare/')){const candidate=route.slice((prefix+'/compare/').length).split('...')[0];return response({status:fake.revisions.has(candidate)?'ahead':'diverged',merge_base_commit:{sha:fake.revisions.has(candidate)?candidate:fake.head}});}
    if (route.startsWith(prefix + '/git/commits/')) return response({tree: {sha: route.split('/').at(-1)}});
    if (route.startsWith(prefix + '/git/trees/')) {const revision=route.split('/').at(-1).split('?')[0];const treeFiles=revision===fake.head?fake.files:fake.revisions.get(revision)?.files;assert.ok(treeFiles);return response({truncated: false, tree: [...treeFiles].map(([path, file]) => ({path, type: 'blob', mode: '100644', sha: file.sha, size: file.bytes.length}))});}
    if (route.startsWith(prefix + '/git/blobs/')) {
      const item = [...fake.files.values(),...[...fake.revisions.values()].flatMap(record=>[...record.files.values()])].find(file => file.sha === route.split('/').at(-1)); assert.ok(item);
      return response({encoding: 'base64', content: item.bytes.toString('base64')});
    }
    if (route === '/graphql') {
      fake.mutations++;
      const input = body.variables.input;
      assert.equal(input.branch.repositoryNameWithOwner, policy.repository);
      assert.equal(input.branch.refName, 'refs/heads/' + policy.contentBranch);
      assert.equal(input.message.headline, 'Update staff content');
      assert.ok(!input.force);
      assert.ok((input.fileChanges.deletions||[]).every(item=>editable(item.path)&&item.path.startsWith('_posts/')));
      if (fake.race) { fake.head = hash('concurrent-change'); fake.race = false; }
      if (input.expectedHeadOid !== fake.head || fake.fail) return response({errors: [{type: 'STALE_DATA'}]});
      const next = new Map(fake.files);
      for(const deletion of input.fileChanges.deletions||[])next.delete(deletion.path);
      for (const addition of input.fileChanges.additions) {
        assert.ok(editable(addition.path)||asset(addition.path)); const bytes = Buffer.from(addition.contents, 'base64'); next.set(addition.path, {bytes, sha: blobSha(bytes)});
      }
      const parent=fake.head;fake.files = next; fake.head = hash(fake.head + JSON.stringify(input.fileChanges));
      fake.revisions.set(fake.head,{files:new Map(next),parents:[parent],paths:[...input.fileChanges.additions,...(input.fileChanges.deletions||[])].map(item=>item.path),time:'2026-07-15T00:30:00Z'});
      if (fake.loseResponse) throw Error('Simulated network loss after atomic commit');
      return response({data: {createCommitOnBranch: {commit: {oid: fake.head}}}});
    }
    if (route.includes('/check-runs?')) return response({total_count: 1, check_runs: fake.checkRuns || [{id: 1, name: policy.requiredCheck, app: {slug: 'github-actions'}, head_sha: fake.head, status: 'completed', conclusion: 'success'}]});
    throw Error('Unexpected API request');
  };
  const provider = new GitHubContent(config, {fetch: fetcher});
  return {temporary, fake, provider, close: () => fs.rm(temporary, {recursive: true, force: true})};
}
const authorize = async () => {};
function change(snapshot, file, priority) {
  return {path: file, sha: snapshot.files.get(file).sha, content: snapshot.files.get(file).bytes.toString('utf8').replace(/priority: \d+/, 'priority: ' + priority)};
}

test('real schemas and immutable metadata protect an atomic multi-file save', async () => {
  const f = await fixture();
  try {
    const store = new ContentStore(f.provider); const snapshot = await f.provider.snapshot();
    const paths = [...snapshot.files.keys()].filter(path => path.startsWith('_posts/')).slice(0, 2);
    const changes = paths.map((file, i) => change(snapshot, file, 20 + i));
    const result = await store.save({baseCommit: snapshot.head, changes}, authorize);
    assert.equal(result.state, 'committed_validation_pending'); assert.equal(result.live, false);
    assert.equal(f.fake.mutations, 1); assert.equal(f.fake.mints, 1);
    for (const item of changes) assert.equal(f.fake.files.get(item.path).bytes.toString('utf8'), item.content);
    await assert.rejects(store.save({baseCommit: snapshot.head, changes}, authorize), error => error.status === 409);
    assert.equal(f.fake.mutations, 1);
    const current = await f.provider.snapshot();
    const bad = change(current, paths[0], 99); bad.content = bad.content.replace(/proposal_id: .*/, 'proposal_id: changed-id');
    await assert.rejects(store.save({baseCommit: current.head, changes: [bad]}, authorize), error => error.status === 422 && error.code === 'invalid_content');
    assert.equal(f.fake.mutations, 1);
    const createBase = await f.provider.snapshot();
    const original = createBase.files.get(paths[0]).bytes.toString('utf8');
    const created = original.replace(/^proposal_id:.*$/m, 'proposal_id: ger-created-fixture')
      .replace(/^permalink:.*$/m, 'permalink: /projects/ger-created-fixture/')
      .replace(/categories:\r?\n(?:- [^\r\n]*\r?\n)+/, 'categories:\n- fixture-category\n');
    assert.ok(created.includes('- fixture-category'));
    const categories = '_data/proposal_categories.yml';
    const additions = [
      {path: '_posts/' + paths[0].slice(7, 17) + '-project-created-fixture.md', sha: null, content: created},
      {path: categories, sha: createBase.files.get(categories).sha, content: createBase.files.get(categories).bytes.toString('utf8') + '\n- id: fixture-category\n  label: Fixture category\n'}
    ];
    const added = await store.save({baseCommit: createBase.head, changes: additions}, authorize);
    assert.equal(added.live, false); assert.equal(f.fake.mutations, 2);
    const status = await f.provider.checks(f.fake.head); assert.equal(status.state, 'passed'); assert.equal(status.live, false);
    f.fake.checkRuns = [{id: 2, name: policy.requiredCheck, app: {slug: 'untrusted-check-app'}, head_sha: f.fake.head, status: 'completed', conclusion: 'success'}];
    assert.equal((await f.provider.checks(f.fake.head)).state, 'pending');
    f.fake.checkRuns[0].app.slug = 'github-actions'; f.fake.checkRuns[0].conclusion = 'skipped';
    assert.equal((await f.provider.checks(f.fake.head)).state, 'failed');
  } finally { await f.close(); }
});

test('invalid paths/preconditions/data and failed transactions never partially save', async () => {
  const f = await fixture();
  try {
    const store = new ContentStore(f.provider); const snapshot = await f.provider.snapshot();
    const path = [...snapshot.files.keys()].find(name => name.startsWith('_posts/'));
    const item = change(snapshot, path, 12);
    for (const invalid of ['../escape.md', '_config.yml', '.github/workflows/validate.yml', 'admin-service/config.mjs', '_posts/%2e%2e.md', '_posts/evil\\path.md']) {
      await assert.rejects(store.save({baseCommit: snapshot.head, changes: [{...item, path: invalid}]}, authorize), error => error.status === 422);
    }
    await assert.rejects(store.save({changes: [item]}, authorize), error => error.status === 428);
    await assert.rejects(store.save({baseCommit: snapshot.head, changes: [{...item, sha: null}]}, authorize), error => error.status === 409);
    const malformed = {...item, content: item.content.replace('status:', 'bad_yaml: [\nstatus:')};
    await assert.rejects(store.save({baseCommit: snapshot.head, changes: [item, {...malformed, path: '_news/bad.md', sha: null}]}, authorize), error => error.status === 422);
    assert.equal(f.fake.mutations, 0); assert.equal(f.fake.head, snapshot.head);
    f.fake.fail = true;
    await assert.rejects(store.save({baseCommit: snapshot.head, changes: [item]}, authorize), error => error.code === 'save_rejected');
    assert.equal(f.fake.head, snapshot.head); assert.equal(f.fake.mutations, 1);
    f.fake.fail = false; f.fake.race = true;
    await assert.rejects(store.save({baseCommit: snapshot.head, changes: [item]}, authorize), error => error.status === 409);
    assert.equal(f.fake.mutations, 2);
  } finally { await f.close(); }
});

test('two simultaneous sessions produce one commit and one conflict; ambiguous failures are not retried', async () => {
  const f = await fixture();
  try {
    const store = new ContentStore(f.provider); const snapshot = await f.provider.snapshot();
    const path = [...snapshot.files.keys()].find(name => name.startsWith('_posts/'));
    const results = await Promise.allSettled([21, 22].map(priority => store.save({baseCommit: snapshot.head, changes: [change(snapshot, path, priority)]}, authorize)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    const current = await f.provider.snapshot(); f.fake.loseResponse = true; const attempts = f.fake.mutations;
    await assert.rejects(store.save({baseCommit: current.head, changes: [change(current, path, 31)]}, authorize), error => error.code === 'save_outcome_unknown');
    assert.equal(f.fake.mutations, attempts + 1);
  } finally { await f.close(); }
});

test('candidate validation rejects publication hazards and validates supporting content with shared rules', async () => {
  const f = await fixture();
  try {
    const snapshot = await f.provider.snapshot(); const path = [...snapshot.files.keys()].find(name => name.startsWith('_posts/'));
    const rejected = async transform => {
      const files = new Map(snapshot.files); const text = files.get(path).bytes.toString('utf8'); files.set(path, {bytes: Buffer.from(transform(text))});
      await assert.rejects(validateContent(files, snapshot.files), error => error.status === 422);
    };
    await rejected(text => text.replace('layout: post', 'layout: default'));
    await rejected(text => text.replace('status:', 'published: false\nstatus:'));
    const files = new Map(snapshot.files); files.set('_data/home.yml', {bytes: Buffer.from('title: Missing required content')});
    await assert.rejects(validateContent(files, snapshot.files), error => error.status === 422);
    const categories = new Map(snapshot.files);
    const text = categories.get('_data/proposal_categories.yml').bytes.toString('utf8');
    categories.set('_data/proposal_categories.yml', {bytes: Buffer.from(text + '\n- id: decision-support\n  label: Duplicate\n')});
    await assert.rejects(validateContent(categories, snapshot.files), error => error.status === 422);
  } finally { await f.close(); }
});

test('content HTTP routes require session, Origin and CSRF and never expose App credentials', async () => {
  const f = await fixture(); const state = path.join(f.temporary, 'access.json'); const token = randomBytes(32).toString('hex');
  await fs.writeFile(state, JSON.stringify({generation: randomBytes(16).toString('hex'), revoked: false, digest: createHash('sha256').update(token).digest('hex')}));
  const config = {origin: 'http://localhost', local: true, accessFile: state, ttl: 7200}; const records = [];
  const store = new ContentStore(f.provider);
  const server = createAdministration(config, {content: store, publicationRecord:async()=>null, log: event => records.push(event)});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); config.origin = 'http://localhost:' + server.address().port;
  const request = (route, {method = 'GET', headers = {}, body, splitAt} = {}) => new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + server.address().port + route, {method, headers: {host: new URL(config.origin).host, ...headers}}, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, bytes:Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8')}));
    }); req.on('error', reject);
    if (splitAt) {
      const bytes = Buffer.from(body); req.write(bytes.subarray(0, splitAt));
      setTimeout(() => req.end(bytes.subarray(splitAt)), 10);
    } else req.end(body);
  });
  try {
    assert.equal((await request('/admin/api/content')).status, 401);
    const entered = await request('/admin/access?token=' + token); const cookie = entered.headers['set-cookie'][0].split(';')[0];
    const session = JSON.parse((await request('/admin/api/session', {headers: {cookie}})).text);
    const listed = await request('/admin/api/content', {headers: {cookie}}); assert.equal(listed.status, 200);
    const listing = JSON.parse(listed.text); assert.ok(listing.files.every(file => editable(file.path)));
    const snapshot = await f.provider.snapshot(); const path = listing.files.find(file => file.path.startsWith('_posts/')).path;
    f.provider.publicationFacts=async commit=>({head:snapshot.head,main:snapshot.head,paths:[path],selected:{[path]:snapshot.files.get(path).sha},current:{[path]:snapshot.files.get(path).sha},live:null});
    assert.equal((await request('/admin/api/editor/publication?commit=bad',{headers:{cookie}})).status,422);
    const publication=await request('/admin/api/editor/publication?commit='+snapshot.head,{headers:{cookie}});assert.equal(publication.status,200);assert.equal(JSON.parse(publication.text).entries[0].state,'pending');
    const read = await request('/admin/api/content/file?path=' + encodeURIComponent(path), {headers: {cookie}});
    assert.equal(read.status, 200); assert.equal(JSON.parse(read.text).content, snapshot.files.get(path).bytes.toString('utf8'));
    assert.equal((await request('/admin/api/content/file?path=_config.yml', {headers: {cookie}})).status, 422);
    const body = JSON.stringify({baseCommit: snapshot.head, changes: [change(snapshot, path, 55)]});
    const options = {method: 'POST', body, headers: {cookie, origin: config.origin, 'content-type': 'application/json', 'x-csrf-token': session.csrf}};
    assert.equal((await request('/admin/api/content/save', {...options, headers: {...options.headers, origin: 'https://wrong.example'}})).status, 403);
    assert.equal((await request('/admin/api/content/save', {...options, headers: {...options.headers, 'x-csrf-token': 'wrong'}})).status, 403);
    const firstUnicode = Buffer.from(body).findIndex(value => value >= 0xc2);
    assert.ok(firstUnicode > 0);
    const saved = await request('/admin/api/content/save', {...options, splitAt: firstUnicode + 1}); assert.equal(saved.status, 201);
    assert.equal(f.fake.files.get(path).bytes.toString('utf8'), JSON.parse(body).changes[0].content);
    assert.equal(JSON.parse(saved.text).live, false);
    assert.ok(!saved.text.includes('fixture-installation-token') && !saved.text.includes('PRIVATE KEY'));
    assert.equal((await request('/admin/api/content/save', options)).status, 409);
    assert.equal((await request('/admin/api/media/list')).status,401);
    assert.equal((await request('/admin/api/editor/supporting')).status,401);
    const supported=await request('/admin/api/editor/supporting',{headers:{cookie}});assert.equal(supported.status,200);const home=JSON.parse(supported.text).items.find(item=>item.kind==='home');
    const supportingEdit={...options,body:JSON.stringify({operation:'compose',path:home.path,source:home.source,patch:{title:'HTTP supporting content'}})};
    assert.equal((await request('/admin/api/editor/support-prepare',{...supportingEdit,headers:{...supportingEdit.headers,'x-csrf-token':'bad'}})).status,403);
    const supportingResult=await request('/admin/api/editor/support-prepare',supportingEdit);assert.equal(supportingResult.status,200);assert.equal(JSON.parse(supportingResult.text).ready,true);
    const mediaList=await request('/admin/api/media/list',{headers:{cookie}});assert.equal(mediaList.status,200);
    const image=await fs.readFile(new URL('../../assets/images/branding/bfh.png',import.meta.url));
    const proposalId=/^proposal_id:\s*["']?([a-z0-9-]+)/m.exec(f.fake.files.get(path).bytes.toString('utf8'))[1];
    const uploadRoute='/admin/api/media/upload?'+new URLSearchParams({filename:"HTTP figure's ü.png",proposalId});
    const uploadOptions={method:'POST',headers:{cookie,origin:config.origin,'content-type':'image/png','x-csrf-token':session.csrf},body:image};
    assert.equal((await request(uploadRoute,{...uploadOptions,headers:{...uploadOptions.headers,'x-csrf-token':'bad'}})).status,403);
    assert.equal((await request(uploadRoute,{...uploadOptions,headers:{...uploadOptions.headers,origin:'https://wrong.example'}})).status,403);
    const upload=await request(uploadRoute,uploadOptions);assert.equal(upload.status,201);const uploaded=JSON.parse(upload.text);
    const download=await request('/admin/api/media/file?id='+uploaded.id,{headers:{cookie}});assert.equal(download.status,200);assert.deepEqual(download.bytes,image);assert.equal(download.headers['content-type'],'image/png');assert.ok(download.headers['content-disposition'].startsWith('attachment;'));
    assert.equal((await request('/admin/api/media/image?id='+uploaded.id)).status,401);
    const inlineImage=await request('/admin/api/media/image?id='+uploaded.id,{headers:{cookie}});assert.equal(inlineImage.status,200);assert.equal(inlineImage.headers['content-disposition'],'inline');assert.deepEqual(inlineImage.bytes,image);
    assert.ok(download.headers['content-disposition'].includes("filename*=UTF-8''HTTP%20figure%27s%20%C3%BC.png"));
    const other=(await request('/admin/access?token='+token)).headers['set-cookie'][0].split(';')[0];
    assert.equal((await request('/admin/api/media/file?id='+uploaded.id,{headers:{cookie:other}})).status,404);
    assert.equal((await request('/admin/api/media/file?path=../access.json',{headers:{cookie}})).status,422);
    const current=await f.provider.snapshot();
    const prepared=await request('/admin/api/editor/prepare',{...options,body:JSON.stringify({operation:'publish',source:current.files.get(path).bytes.toString('utf8'),context:{path,sha:current.files.get(path).sha,baseCommit:current.head},patch:{figure:{src:uploaded.url,alt:'HTTP test figure',caption:'Atomic image save'}}})});
    assert.equal(prepared.status,200);const candidate=JSON.parse(prepared.text);assert.equal(candidate.ready,true);
    const withMedia=await request('/admin/api/editor/save',{...options,body:JSON.stringify({baseCommit:current.head,changes:[{path,sha:current.files.get(path).sha,content:candidate.source}],uploads:[uploaded.id]})});
    assert.equal(withMedia.status,201);assert.deepEqual(f.fake.files.get(uploaded.url.slice(1)).bytes,image);assert.equal(JSON.parse(withMedia.text).files.length,2);
    assert.ok(!JSON.stringify(records).includes(token) && !JSON.stringify(records).includes(session.csrf));
    const beforeRevocation = await f.provider.snapshot(); const attempts = f.fake.mutations;
    store.validate = async (files, previous) => {
      await validateContent(files, previous);
      await fs.writeFile(state, JSON.stringify({generation: randomBytes(16).toString('hex'), revoked: true}));
    };
    const revoked = await request('/admin/api/content/save', {...options, body: JSON.stringify({baseCommit: beforeRevocation.head, changes: [change(beforeRevocation, path, 66)]})});
    assert.equal(revoked.status, 401); assert.equal(f.fake.mutations, attempts);
    assert.equal((await request('/admin/api/media/file?id='+uploaded.id,{headers:{cookie}})).status,401);
    assert.equal((await request('/admin/api/editor/publication?commit='+snapshot.head,{headers:{cookie}})).status,401);
  } finally { await new Promise(resolve => server.close(resolve)); await f.close(); }
});

test('content history reads immutable revisions, labels shared authorship and rejects unrelated paths/commits',async()=>{
  const f=await fixture();
  try{
    const store=new ContentStore(f.provider);const editor=new ProposalEditor(store);const revisions=new ContentRevisions(editor);const snapshot=await f.provider.snapshot();const path=[...snapshot.files.keys()].find(path=>path.startsWith('_posts/'));
    await store.save({baseCommit:snapshot.head,changes:[change(snapshot,path,20)]},authorize);
    const history=await revisions.list(path,1,authorize);assert.equal(history.revisions.length,2);assert.equal(history.hasMore,false);
    assert.ok(history.revisions[0].author.includes('individual staff identity not verified'));assert.equal(history.revisions[0].time,'2026-07-15T00:30:00.000Z');
    const detail=await revisions.detail(path,history.revisions[0].commit,authorize);assert.equal(detail.diff.summary,'Order changed');assert.equal(detail.before,snapshot.files.get(path).bytes.toString('utf8'));
    assert.ok(detail.source.includes('priority: 20'));assert.equal(detail.diff.narrative.length,0);
    const old=await revisions.detail(path,history.revisions[1].commit,authorize);assert.equal(old.source,snapshot.files.get(path).bytes.toString('utf8'));assert.equal(old.time,'2026-01-15T00:30:00.000Z');
    await assert.rejects(revisions.detail(path,'0'.repeat(40),authorize),error=>error.status===422);
    await assert.rejects(revisions.list('_config.yml',1,authorize),error=>error.status===422);
    await assert.rejects(revisions.list(path,51,authorize),error=>error.status===422);
    assert.equal(f.fake.mutations,1,'history never writes to Git');
  }finally{await f.close();}
});

test('restoration previews validate content, preserve current order and require fresh session-bound confirmation',async()=>{
  const f=await fixture();
  try{
    const store=new ContentStore(f.provider);const editor=new ProposalEditor(store);const revisions=new ContentRevisions(editor);const initial=await f.provider.snapshot();const bootstrap=await editor.bootstrap(authorize);const original=bootstrap.proposals[0];
    const prepared=await editor.prepare({operation:'publish',source:original.source,context:{path:original.path,sha:original.sha,baseCommit:initial.head},patch:{title:'Changed title for restoration',status:bootstrap.statuses.find(status=>status!==original.metadata.status)}},authorize);
    await store.save({baseCommit:initial.head,changes:[{path:original.path,sha:original.sha,content:prepared.source}]},authorize);
    const edited=await f.provider.snapshot();await store.save({baseCommit:edited.head,changes:[change(edited,original.path,20)]},authorize);
    const base=await f.provider.snapshot();const session={expires:Date.now()+7200000};
    const payload={path:original.path,commit:initial.head,baseCommit:base.head,sha:base.files.get(original.path).sha};
    const preview=await revisions.preview(session,payload,authorize);assert.ok(preview.html);assert.ok(!preview.diff.metadata.some(field=>field.field==='priority'));
    await assert.rejects(revisions.restore({...session},{previewId:preview.previewId,confirmation:initial.head},authorize),error=>error.status===422);
    await assert.rejects(revisions.restore(session,{previewId:preview.previewId},authorize),error=>error.status===422);
    const saved=await revisions.restore(session,{previewId:preview.previewId,confirmation:initial.head},authorize);assert.equal(saved.live,false);assert.equal(f.fake.mutations,3);
    const restored=(await editor.bootstrap(authorize)).proposals.find(item=>item.path===original.path);assert.equal(restored.metadata.title,original.metadata.title);assert.equal(restored.metadata.status,original.metadata.status);assert.equal(restored.metadata.priority,20);
    for(const key of ['proposal_id','permalink','created_at','date'])assert.equal(restored.metadata[key],original.metadata[key]);assert.ok(new Date(restored.metadata.updated_at)>new Date(prepared.metadata.updated_at));
    await assert.rejects(revisions.restore(session,{previewId:preview.previewId,confirmation:initial.head},authorize),error=>error.status===422);
    const current=await f.provider.snapshot();const otherPreview=await revisions.preview(session,{path:original.path,commit:edited.head,baseCommit:current.head,sha:current.files.get(original.path).sha},authorize);
    await store.save({baseCommit:current.head,changes:[change(current,original.path,30)]},authorize);
    await assert.rejects(revisions.restore(session,{previewId:otherPreview.previewId,confirmation:edited.head},authorize),error=>error.status===409);assert.equal(f.fake.mutations,4);
    revisions.purge(()=>false);assert.equal(revisions.previews.size,0);
  }finally{await f.close();}
});

test('deleted proposals recover atomically at their former priority and keep original URLs/dates',async()=>{
  const f=await fixture();
  try{
    const store=new ContentStore(f.provider);const editor=new ProposalEditor(store);const revisions=new ContentRevisions(editor);const initial=await f.provider.snapshot();const original=(await editor.bootstrap(authorize)).proposals[0];
    const numbered=await store.save({baseCommit:initial.head,changes:[change(initial,original.path,170)]},authorize);const beforeDelete=await f.provider.snapshot();
    await editor.lifecycle({action:'delete',path:original.path,baseCommit:beforeDelete.head,sha:beforeDelete.files.get(original.path).sha,confirmation:original.metadata.proposal_id},authorize);
    const deleted=await revisions.deleted(authorize);assert.equal(deleted.records[0].source_path,original.path);
    const other=[...f.fake.files.keys()].find(path=>path.startsWith('_posts/'));const deletedSnapshot=await f.provider.snapshot();
    await store.save({baseCommit:deletedSnapshot.head,changes:[change(deletedSnapshot,other,10)]},authorize);
    const base=await f.provider.snapshot();const session={expires:Date.now()+7200000};
    const preview=await revisions.preview(session,{path:original.path,commit:initial.head,baseCommit:base.head,sha:null},authorize);assert.equal(preview.deleted,true);assert.ok(preview.html);
    const result=await revisions.restore(session,{previewId:preview.previewId,confirmation:initial.head},authorize);assert.equal(result.files.length,2);assert.equal(f.fake.mutations,4);
    const recovered=(await editor.bootstrap(authorize)).proposals.find(item=>item.path===original.path);assert.equal(recovered.metadata.priority,170);assert.equal(recovered.metadata.status,original.metadata.status);
    for(const key of ['proposal_id','created_at','date','permalink'])assert.equal(recovered.metadata[key],original.metadata[key]);
    assert.equal((await revisions.deleted(authorize)).records.length,0);assert.ok(numbered.commit!==result.commit);
  }finally{await f.close();}
});

test('invalid historical metadata cannot pass restoration validation',async()=>{
  const f=await fixture();
  try{
    const editor=new ProposalEditor(new ContentStore(f.provider));const revisions=new ContentRevisions(editor);const initial=await f.provider.snapshot();const path=[...initial.files.keys()].find(path=>path.startsWith('_posts/'));const source=initial.files.get(path).bytes.toString('utf8');
    const invalid=source.replace(/^  email:.*$/m,'  email: invalid-email');assert.ok(invalid.includes('email: invalid-email'));
    const bad=await f.provider.commit(initial.head,[{path,content:invalid}]);await f.provider.commit(bad,[{path,content:source}]);
    const current=await f.provider.snapshot();
    await assert.rejects(revisions.preview({expires:Date.now()+7200000},{path,commit:bad,baseCommit:current.head,sha:current.files.get(path).sha},authorize),error=>error.status===422&&error.code==='invalid_content');
    assert.equal(f.fake.mutations,2,'invalid restoration never commits');
  }finally{await f.close();}
});

test('GitHub commits delete a proposal and reserve its old URL in one atomic operation',async()=>{
  const f=await fixture();
  try{
    const editor=new ProposalEditor(new ContentStore(f.provider));const bootstrap=await editor.bootstrap(authorize);const proposal=bootstrap.proposals[0];
    const assets=[...f.fake.files].filter(([path])=>asset(path));
    const result=await editor.lifecycle({action:'delete',baseCommit:bootstrap.baseCommit,path:proposal.path,sha:proposal.sha,confirmation:proposal.metadata.proposal_id},authorize);
    assert.equal(f.fake.mutations,1);assert.equal(result.state,'committed_validation_pending');assert.equal(result.live,false);
    assert.ok(!f.fake.files.has(proposal.path));assert.ok(f.fake.files.get('_data/removed_proposals.yml').bytes.toString().includes(proposal.metadata.permalink));
    for(const [path,file] of assets)assert.deepEqual(f.fake.files.get(path).bytes,file.bytes);
  }finally{await f.close();}
});

test('excess App permissions are rejected and source byte order markers are preserved', async () => {
  const f = await fixture();
  try {
    f.fake.excessPermissions = true;
    await assert.rejects(f.provider.snapshot(), error => error.code === 'github_unavailable');
    const bytes = Buffer.from('\ufeff---\r\ntitle: UTF-8\r\n---\r\nBody');
    const provider = {snapshot: async () => ({head: hash('bom'), files: new Map([['_news/bom.md', {sha: blobSha(bytes), bytes}]])})};
    const read = await new ContentStore(provider).read('_news/bom.md', authorize);
    assert.ok(Buffer.from(read.content, 'utf8').equals(bytes));
  } finally { await f.close(); }
});

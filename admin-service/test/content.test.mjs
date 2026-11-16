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
  for (const directory of ['_posts', '_team', '_news', '_data', 'assets/images']) await collect(directory);
  const fake = {head: hash('initial'), files, mutations: 0, mints: 0, race: false, fail: false, loseResponse: false};
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
      assert.deepEqual(body.permissions, {contents: 'write', checks: 'read'});
      const jwt = options.headers.Authorization.slice(7).split('.');
      assert.ok(verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), keys.publicKey, Buffer.from(jwt[2], 'base64url')));
      const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
      assert.ok(claims.exp - claims.iat <= 600 && claims.iss === '12');
      return response({token: 'fixture-installation-token', expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {contents: 'write', checks: 'read', metadata: 'read', ...(fake.excessPermissions ? {issues: 'write'} : {})}, repositories: [{id: 56}]});
    }
    assert.ok(options.headers.Authorization === 'Bearer fixture-installation-token');
    const prefix = '/repos/' + policy.repository;
    if (route === prefix) return response({id: 56, full_name: policy.repository});
    if (route.startsWith(prefix + '/git/ref/heads/')) {
      assert.ok(route === prefix + '/git/ref/heads/' + policy.contentBranch);
      return response({object: {sha: fake.head}});
    }
    if (route.startsWith(prefix + '/git/commits/')) return response({tree: {sha: fake.head}});
    if (route.startsWith(prefix + '/git/trees/')) return response({truncated: false, tree: [...fake.files].map(([path, file]) => ({path, type: 'blob', mode: '100644', sha: file.sha, size: file.bytes.length}))});
    if (route.startsWith(prefix + '/git/blobs/')) {
      const item = [...fake.files.values()].find(file => file.sha === route.split('/').at(-1)); assert.ok(item);
      return response({encoding: 'base64', content: item.bytes.toString('base64')});
    }
    if (route === '/graphql') {
      fake.mutations++;
      const input = body.variables.input;
      assert.equal(input.branch.repositoryNameWithOwner, policy.repository);
      assert.equal(input.branch.refName, 'refs/heads/' + policy.contentBranch);
      assert.equal(input.message.headline, 'Update staff content');
      assert.ok(!input.force && !input.fileChanges.deletions);
      if (fake.race) { fake.head = hash('concurrent-change'); fake.race = false; }
      if (input.expectedHeadOid !== fake.head || fake.fail) return response({errors: [{type: 'STALE_DATA'}]});
      const next = new Map(fake.files);
      for (const addition of input.fileChanges.additions) {
        assert.ok(editable(addition.path)||asset(addition.path)); const bytes = Buffer.from(addition.contents, 'base64'); next.set(addition.path, {bytes, sha: blobSha(bytes)});
      }
      fake.files = next; fake.head = hash(fake.head + JSON.stringify(input.fileChanges));
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
  const server = createAdministration(config, {content: store, log: event => records.push(event)});
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
    const mediaList=await request('/admin/api/media/list',{headers:{cookie}});assert.equal(mediaList.status,200);
    const image=await fs.readFile(new URL('../../assets/images/branding/bfh.png',import.meta.url));
    const proposalId=/^proposal_id:\s*["']?([a-z0-9-]+)/m.exec(f.fake.files.get(path).bytes.toString('utf8'))[1];
    const uploadRoute='/admin/api/media/upload?'+new URLSearchParams({filename:"HTTP figure's ü.png",proposalId});
    const uploadOptions={method:'POST',headers:{cookie,origin:config.origin,'content-type':'image/png','x-csrf-token':session.csrf},body:image};
    assert.equal((await request(uploadRoute,{...uploadOptions,headers:{...uploadOptions.headers,'x-csrf-token':'bad'}})).status,403);
    assert.equal((await request(uploadRoute,{...uploadOptions,headers:{...uploadOptions.headers,origin:'https://wrong.example'}})).status,403);
    const upload=await request(uploadRoute,uploadOptions);assert.equal(upload.status,201);const uploaded=JSON.parse(upload.text);
    const download=await request('/admin/api/media/file?id='+uploaded.id,{headers:{cookie}});assert.equal(download.status,200);assert.deepEqual(download.bytes,image);assert.equal(download.headers['content-type'],'image/png');assert.ok(download.headers['content-disposition'].startsWith('attachment;'));
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
  } finally { await new Promise(resolve => server.close(resolve)); await f.close(); }
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

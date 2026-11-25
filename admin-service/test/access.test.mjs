import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createAdministration } from '../service.mjs';
import { configuration, outsideRepository } from '../config.mjs';

test('local sign-in verifies the provisioned team code without placing it in the URL', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ger-local-access-'));
  const accessFile = path.join(temporary, 'access.json');
  const token = randomBytes(32).toString('hex');
  const state = JSON.stringify({generation: randomBytes(16).toString('hex'), revoked: false,
    digest: createHash('sha256').update(token).digest('hex')});
  await fs.writeFile(accessFile, state);
  const config = {accessFile, ttl: 7200, local: true};
  const server = createAdministration(config);
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config.origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const signIn = await fetch(config.origin + '/admin/');
    assert.equal(signIn.status, 401);
    const html = await signIn.text();
    assert.match(html, /name="token" type="password"/);
    assert.ok(!html.includes(token));
    const submit = (origin, body) => fetch(config.origin + '/admin/access', {method: 'POST', redirect: 'manual', headers: {origin}, body});
    assert.equal((await submit('https://other.example', new URLSearchParams({token}))).status, 403);
    assert.equal((await submit(config.origin, new URLSearchParams({token: 'wrong'}))).status, 401);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(config.origin + '/admin/');
    await page.getByLabel('Team access code').fill(token);
    const [result] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/admin/access'),
      page.getByRole('button', {name: 'Sign in'}).click()
    ]);
    assert.equal(result.status(), 303);
    assert.equal(result.headers().location, '/admin/');
    await page.locator('#editor-title').waitFor({state: 'attached'});
    assert.equal(await fs.readFile(accessFile, 'utf8'), state);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, {recursive: true, force: true});
  }
});

test('shared-link sessions, failure cases, transport and logging', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ger-access-'));
  const state = path.join(temporary, 'access.json');
  const records = [];
  let time = Date.now();
  let token;
  const rotate = async revoked => {
    token = randomBytes(32).toString('hex');
    await fs.writeFile(state, JSON.stringify({generation: randomBytes(16).toString('hex'), revoked,
      digest: createHash('sha256').update(token).digest('hex')}));
  };
  await rotate(false);
  const config = {origin: 'https://admin.example.test', accessFile: state, ttl: 7200, local: false, trustProxy: true};
  const server = createAdministration(config, {now: () => time, log: item => records.push(item)});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (url, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + url, {...options, headers: {
      host: 'admin.example.test', 'x-forwarded-proto': 'https', ...options.headers}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: res.statusCode, headers: res.headers})));
    });
    req.on('error', reject); req.end(options.body);
  });
  const enter = async () => {
    const result = await request('/admin/access?token=' + token);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/admin/');
    const raw = result.headers.get('set-cookie');
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=7200']) assert.ok(raw.includes(attribute));
    assert.ok(raw.startsWith('__Host-ger_admin='));
    return raw.split(';')[0];
  };
  try {
    assert.equal((await request('/admin/')).status, 401);
    assert.equal((await request('/admin/api/editor/publication?commit='+'a'.repeat(40))).status,401);
    for (const value of ['', 'bad', randomBytes(32).toString('hex')]) assert.equal((await request('/admin/access?token=' + value)).status, 401);
    assert.equal((await request('/admin/access?token=' + token + '&token=' + token)).status, 401);
    assert.equal((await request('/admin/access?token=' + token, {method: 'HEAD'})).status, 405);
    const cookie = await enter();
    const second = await enter();
    assert.notEqual(cookie, second);
    let result = await request('/admin/', {headers: {cookie}});
    assert.equal(result.status, 200);
    const html = await result.text();
    assert.ok(html.includes('Proposal editor'));
    assert.ok(!html.includes(token));
    assert.ok(html.includes('<script defer src="/admin/editor.js"></script>'));
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(result.headers.get('content-security-policy').includes("default-src 'none'"));
    const session = await (await request('/admin/api/session', {headers: {cookie}})).json();
    const publication=await request('/admin/api/editor/publication?commit='+'a'.repeat(40),{headers:{cookie}});assert.equal(publication.status,200);assert.equal((await publication.json()).state,'local_review');
    assert.ok(/^[a-f0-9]{64}$/.test(session.csrf));
    const post = (headers = {}, body = 'csrf=' + session.csrf) => request('/admin/logout', {method: 'POST', body,
      headers: {cookie, origin: config.origin, 'content-type': 'application/x-www-form-urlencoded', ...headers}});
    assert.equal((await post({origin: 'https://other.example'})).status, 403);
    assert.equal((await post({origin: ''})).status, 403);
    assert.equal((await post({}, 'csrf=wrong')).status, 403);
    assert.equal((await post({'content-type': 'application/json'})).status, 415);
    assert.equal((await request('/admin/logout', {headers: {cookie}})).status, 404);
    assert.equal((await request('/admin/api/session', {headers: {cookie}})).status, 200);
    assert.equal((await post({}, 'csrf=' + 'a'.repeat(9000))).status, 413);
    result = await post(); assert.equal(result.status, 303);
    assert.ok(result.headers.get('set-cookie').includes('Max-Age=0'));
    assert.equal((await request('/admin/api/session', {headers: {cookie}})).status, 401);
    assert.equal((await request('/admin/', {headers: {cookie: cookie + '; ' + cookie}})).status, 401);
    time += 7200 * 1000;
    assert.equal((await request('/admin/', {headers: {cookie: second}})).status, 401);
    const before = await enter();
    const old = token;
    await rotate(false);
    assert.equal((await request('/admin/', {headers: {cookie: before}})).status, 401);
    assert.equal((await request('/admin/access?token=' + old)).status, 401);
    const current = await enter();
    await rotate(true);
    assert.equal((await request('/admin/', {headers: {cookie: current}})).status, 401);
    assert.equal((await request('/admin/access?token=' + token)).status, 401);
    await fs.writeFile(state, 'malformed');
    assert.equal((await request('/admin/')).status, 503);
    assert.equal((await request('/admin/', {headers: {host: 'other.example'}})).status, 400);
    assert.equal((await request('/admin/', {headers: {'x-forwarded-proto': 'http'}})).status, 400);
    await rotate(false);
    time += 600 * 1000;
    for (let i = 0; i < 20; i++) assert.equal((await request('/admin/access?token=bad')).status, 401);
    assert.equal((await request('/admin/access?token=' + token)).status, 429);
    time += 600 * 1000;
    const limitedCookie = await enter();
    const limitedSession = await (await request('/admin/api/session', {headers: {cookie: limitedCookie}})).json();
    for (let i = 0; i < 60; i++) {
      assert.equal((await request('/admin/logout', {method: 'POST', body: 'csrf=bad', headers: {cookie: limitedCookie, origin: config.origin, 'content-type': 'application/x-www-form-urlencoded'}})).status, 403);
    }
    assert.equal((await request('/admin/logout', {method: 'POST', body: 'csrf=' + limitedSession.csrf, headers: {cookie: limitedCookie, origin: config.origin, 'content-type': 'application/x-www-form-urlencoded'}})).status, 429);
    const logged = JSON.stringify(records);
    assert.ok(!logged.includes(token) && !logged.includes(old) && !logged.includes(session.csrf) && !logged.includes(cookie));
    assert.ok(!logged.includes('?') && !logged.includes('digest'));
  } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(temporary, {recursive: true, force: true}); }
});

test('configuration fails closed; local development still uses secure cookies', () => {
  const file = path.join(os.tmpdir(), 'private-ger-access.json');
  assert.throws(() => configuration({ADMIN_ORIGIN: 'http://example.org', ADMIN_ACCESS_FILE: file}));
  assert.throws(() => configuration({ADMIN_ORIGIN: 'http://localhost:4100', ADMIN_ACCESS_FILE: file, ADMIN_ALLOW_LOCAL_HTTP: '1', NODE_ENV: 'production'}));
  assert.throws(() => outsideRepository(fileURLToPath(new URL('../../_site/secret.json', import.meta.url))));
  assert.throws(() => outsideRepository(fileURLToPath(new URL('../../../.local/site/secret.json', import.meta.url))));
  const config = configuration({ADMIN_ORIGIN: 'http://localhost:4100', ADMIN_ACCESS_FILE: file, ADMIN_ALLOW_LOCAL_HTTP: '1'});
  assert.equal(config.ttl, 7200);
});

test('operator tools generate secrets privately and revoke without logging them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ger-operator-'));
  try {
    const state = path.join(directory, 'access.json'); const link = path.join(directory, 'link.txt');
    const tool = fileURLToPath(new URL('../manage-access.mjs', import.meta.url));
    let result = spawnSync(process.execPath, [tool, 'rotate', '--state-file', state, '--link-file', link, '--origin', 'https://admin.example.test'], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const url = new URL((await fs.readFile(link, 'utf8')).trim());
    const token = url.searchParams.get('token');
    const saved = JSON.parse(await fs.readFile(state, 'utf8'));
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(saved.digest, createHash('sha256').update(token).digest('hex'));
    assert.ok(!JSON.stringify(saved).includes(token));
    assert.ok(!result.stdout.includes(token) && !result.stdout.includes(saved.digest));
    result = spawnSync(process.execPath, [tool, 'revoke', '--state-file', state], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await fs.readFile(state, 'utf8')).revoked, true);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import { readAccess } from './config.mjs';

const cookieName = '__Host-ger_admin';
const digest = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const equal = (left, right) => timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function page(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    + escape(title) + ' · GER administration</title><link rel="stylesheet" href="/admin/style.css"></head><body><main><p class="brand">ARTORG · Gerontechnology and Rehabilitation</p><h1>'
    + escape(title) + '</h1>' + body + '</main></body></html>';
}

export function createAdministration(config, {now = Date.now, log = () => {}} = {}) {
  const sessions = new Map();
  const limits = new Map();
  let generation;
  // Fixed-window limits have bounded storage; unknown new clients fail closed at capacity.
  function limited(key, count, seconds) {
    const time = now();
    for (const [name, item] of limits) if (item.until <= time) limits.delete(name);
    let item = limits.get(key);
    if (!item) {
      if (limits.size >= 5000) return true;
      item = {count: 0, until: time + seconds * 1000}; limits.set(key, item);
    }
    return ++item.count > count;
  }
  const clearCookie = `${cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
  const server = http.createServer(async (req, res) => {
    let route = 'invalid';
    const send = (status, content, type = 'text/html; charset=utf-8', extra = {}) => {
      res.writeHead(status, {...headers, ...(!config.local ? {'Strict-Transport-Security': 'max-age=31536000'} : {}), 'Content-Type': type, ...extra});
      res.end(content);
      // No URLs, query strings, cookies, headers, verifier digests or exception values.
      log({event: 'admin_request', route, status});
    };
    const denied = (status = 401, extra = {}) => send(status, page('Access needed', '<p>Open the private administration link provided by your maintainer.</p>'), undefined, extra);
    try {
      const host = new URL(config.origin).host;
      const remote = req.socket.remoteAddress || '';
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
      const trusted = config.trustProxy && loopback;
      if (req.headers.host !== host || !(config.local && loopback || req.socket.encrypted || trusted && req.headers['x-forwarded-proto'] === 'https')) {
        return denied(400);
      }
      if ((req.url || '').length > 2048) return denied(400);
      const url = new URL(req.url, config.origin);
      if (url.origin !== config.origin) return denied(400);
      route = new Set(['/admin/access', '/admin/', '/admin/api/session', '/admin/logout', '/admin/style.css']).has(url.pathname) ? url.pathname : 'not_found';
      const forwarded = req.headers['x-forwarded-for'];
      const ip = trusted && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : remote;
      if (limited('global', 2000, 60)) return denied(429, {'Retry-After': '60'});
      if (route === '/admin/style.css' && req.method === 'GET') {
        return send(200, await fs.readFile(new URL('./style.css', import.meta.url), 'utf8'), 'text/css; charset=utf-8');
      }
      if (route === '/admin/access' && req.method !== 'GET') return denied(405, {'Allow': 'GET'});
      if (route === '/admin/access' && limited('access:' + ip, 20, 600)) return denied(429, {'Retry-After': '600'});
      if (!['GET', 'HEAD'].includes(req.method) && limited('write:' + ip, 60, 60)) return denied(429, {'Retry-After': '60'});
      const access = await readAccess(config.accessFile);
      const fingerprint = digest(JSON.stringify(access));
      if (generation !== fingerprint) { sessions.clear(); generation = fingerprint; }
      const time = now();
      for (const [id, session] of sessions) if (session.expires <= time) sessions.delete(id);
      if (access.revoked) return denied(401, {'Set-Cookie': clearCookie});
      if (route === '/admin/access') {
        const tokens = url.searchParams.getAll('token');
        const valid = tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0]);
        // Compare fixed-length digests even when the candidate is malformed.
        const candidate = digest(valid ? tokens[0] : 'invalid');
        if (!equal(candidate, access.digest) || !valid) return denied();
        if (sessions.size >= 1000) return denied(503);
        const id = random();
        sessions.set(digest(id), {csrf: random(), expires: time + config.ttl * 1000});
        return send(303, '', undefined, {'Location': '/admin/', 'Set-Cookie': `${cookieName}=${id}; Path=/; Max-Age=${config.ttl}; Secure; HttpOnly; SameSite=Strict`});
      }
      const cookies = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(cookieName + '='));
      const id = cookies.length === 1 ? cookies[0].slice(cookieName.length + 1) : '';
      const session = /^[a-f0-9]{64}$/.test(id) ? sessions.get(digest(id)) : undefined;
      if (!session) return denied(401, {'Set-Cookie': clearCookie});
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.method !== 'POST' || req.headers.origin !== config.origin) return denied(403);
        const contentType = req.headers['content-type']?.split(';')[0];
        if (contentType !== 'application/x-www-form-urlencoded') return denied(415);
        let data = '';
        for await (const chunk of req) {
          data += chunk.toString('utf8');
          if (Buffer.byteLength(data) > 8192) return denied(413);
        }
        const csrf = new URLSearchParams(data).getAll('csrf');
        if (csrf.length !== 1 || !/^[a-f0-9]{64}$/.test(csrf[0]) || !equal(csrf[0], session.csrf)) return denied(403);
        // Re-read after an asynchronous request body: rotation/expiry wins races.
        if (digest(JSON.stringify(await readAccess(config.accessFile))) !== generation || session.expires <= now() || !sessions.has(digest(id))) {
          sessions.clear(); return denied(401, {'Set-Cookie': clearCookie});
        }
        if (route === '/admin/logout') {
          sessions.delete(digest(id));
          return send(303, '', undefined, {'Location': '/admin/', 'Set-Cookie': clearCookie});
        }
        return send(404, page('Page unavailable', '<p>This administration page is unavailable.</p>'));
      }
      if (req.method === 'HEAD') return denied(405, {'Allow': 'GET'});
      if (route === '/admin/api/session') return send(200, JSON.stringify({authenticated: true, csrf: session.csrf, expiresAt: new Date(session.expires).toISOString()}), 'application/json');
      if (route === '/admin/') {
        return send(200, page('Administration', '<p class="status">Your administration session is active.</p><p>Proposal editing is not available yet.</p><p>Access ends at <time>'
          + escape(new Date(session.expires).toISOString()) + '</time>. Anyone with the shared link can enter this area.</p><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="'
          + session.csrf + '"><button type="submit">Sign out</button></form>'));
      }
      return send(404, page('Page unavailable', '<p>This administration page is unavailable.</p>'));
    } catch {
      sessions.clear();
      return send(503, page('Temporarily unavailable', '<p>Administration access is temporarily unavailable. Please contact the maintainer.</p>'));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  server.on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return server;
}

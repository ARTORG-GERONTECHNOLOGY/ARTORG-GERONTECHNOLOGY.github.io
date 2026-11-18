import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import { readAccess } from './config.mjs';
import { ContentError } from './content-policy.mjs';
import { ProposalEditor } from './editor.mjs';
import { MediaStore } from './media.mjs';
import { ContentRevisions } from './revisions.mjs';
import { SupportingEditor } from './supporting.mjs';
import { PublicationStatus } from './publication-status.mjs';

const cookieName = '__Host-ger_admin';
const digest = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const equal = (left, right) => timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src data:; connect-src 'self'; frame-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function page(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    + escape(title) + ' · GER administration</title><link rel="stylesheet" href="/admin/style.css"></head><body><main><p class="brand">ARTORG · Gerontechnology and Rehabilitation</p><h1>'
    + escape(title) + '</h1>' + body + '</main></body></html>';
}

export function createAdministration(config, {now = Date.now, log = () => {}, content = null, publicationRecord} = {}) {
  const editor = new ProposalEditor(content);
  const supporting = new SupportingEditor(editor);
  const media = new MediaStore(editor,content,{now});
  const revisions = new ContentRevisions(editor,{now,supporting});
  const publication = new PublicationStatus(content,{now,...(publicationRecord?{publicRecord:publicationRecord}:{})});
  const sessions = new Map();
  const purgeUploads = () => {const active=new Set(sessions.values());media.purge(session=>active.has(session));revisions.purge(session=>active.has(session));};
  const cleanup = setInterval(purgeUploads, 30000); cleanup.unref();
  const limits = new Map();
  let generation;
  let receivingUploads = 0;
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
    let receivingUpload = false;
    let route = 'invalid';
    const send = (status, content, type = 'text/html; charset=utf-8', extra = {}) => {
      res.writeHead(status, {...headers, ...(route === '/admin/access' ? {'Content-Security-Policy': "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"} : {}), ...(!config.local ? {'Strict-Transport-Security': 'max-age=31536000'} : {}), 'Content-Type': type, ...extra});
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
      route = url.pathname.startsWith('/admin/api/media') ? 'media' : url.pathname.startsWith('/admin/api/editor') ? 'editor' : url.pathname === '/admin/editor.js' ? 'editor_script' : url.pathname.startsWith('/admin/api/content') ? 'content' : new Set(['/admin/access', '/admin/', '/admin/api/session', '/admin/logout', '/admin/style.css']).has(url.pathname) ? url.pathname : 'not_found';
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
      purgeUploads();
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
      const authorize = async () => {
        if (digest(JSON.stringify(await readAccess(config.accessFile))) !== generation || session.expires <= now() || !sessions.has(digest(id))) {
          sessions.clear(); purgeUploads(); throw new ContentError(401, 'session_expired', 'Your session has ended. Open the private access link again.');
        }
      };
      const json = (status, value) => send(status, JSON.stringify(value), 'application/json');
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.method !== 'POST' || req.headers.origin !== config.origin) return denied(403);
        const contentType = req.headers['content-type']?.split(';')[0];
        const apiSave = route === 'content' && url.pathname === '/admin/api/content/save';
        const jsonRequest = apiSave || route === 'editor';
        const uploadRequest = route === 'media' && url.pathname === '/admin/api/media/upload';
        const uploadRules = uploadRequest ? await media.rules() : null;
        if (uploadRequest ? !Object.values(uploadRules.types).includes(contentType) : contentType !== (jsonRequest ? 'application/json' : 'application/x-www-form-urlencoded')) return denied(415);
        if ((jsonRequest || uploadRequest) && (typeof req.headers['x-csrf-token'] !== 'string' || !/^[a-f0-9]{64}$/.test(req.headers['x-csrf-token']) || !equal(req.headers['x-csrf-token'],session.csrf))) return denied(403);
        if (uploadRequest) {if(receivingUploads>=2)return denied(429);receivingUploads++;receivingUpload=true;}
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > (uploadRequest ? uploadRules.max_file_bytes : jsonRequest ? 1024 * 1024 : 8192)) return denied(413);
          chunks.push(chunk);
        }
        let data;
        try { data = uploadRequest ? Buffer.concat(chunks) : new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)); }
        catch { return denied(400); }
        const csrf = jsonRequest || uploadRequest ? [req.headers['x-csrf-token']] : new URLSearchParams(data).getAll('csrf');
        if (csrf.length !== 1 || !/^[a-f0-9]{64}$/.test(csrf[0]) || !equal(csrf[0], session.csrf)) return denied(403);
        // Re-read after an asynchronous request body: rotation/expiry wins races.
        await authorize();
        if (uploadRequest) return json(201, await media.upload(session,{filename:url.searchParams.get('filename'),proposalId:url.searchParams.get('proposalId'),target:url.searchParams.get('target'),purpose:url.searchParams.get('purpose'),mime:contentType,bytes:data},authorize));
        if (route === '/admin/logout') {
          sessions.delete(digest(id));
          purgeUploads();
          return send(303, '', undefined, {'Location': '/admin/', 'Set-Cookie': clearCookie});
        }
        if (route === 'editor' && url.pathname === '/admin/api/editor/prepare') {
          let payload;
          try { payload = JSON.parse(data); } catch { throw new ContentError(400, 'invalid_json', 'The editor request is not valid JSON.'); }
          return json(200, await editor.prepare(payload, authorize, media.temporary(session)));
        }
        if(route==='editor'&&url.pathname==='/admin/api/editor/support-prepare'){
          let payload;try{payload=JSON.parse(data);}catch{throw new ContentError(400,'invalid_json','The content request is not valid JSON.');}
          return json(200,await supporting.prepare(payload,authorize,media.temporary(session)));
        }
        if (route === 'editor' && url.pathname === '/admin/api/editor/lifecycle') {
          let payload;try{payload=JSON.parse(data);}catch{throw new ContentError(400,'invalid_json','The proposal action is not valid JSON.');}
          return json(201,await editor.lifecycle(payload,authorize));
        }
        if(route==='editor'&&['/admin/api/editor/restore-preview','/admin/api/editor/restore'].includes(url.pathname)){
          let payload;try{payload=JSON.parse(data);}catch{throw new ContentError(400,'invalid_json','The restoration request is not valid JSON.');}
          return json(url.pathname.endsWith('/restore')?201:200,await (url.pathname.endsWith('/restore')?revisions.restore(session,payload,authorize):revisions.preview(session,payload,authorize)));
        }
        if (apiSave || route === 'editor' && url.pathname === '/admin/api/editor/save') {
          if (!content) throw new ContentError(503, 'saving_not_configured', 'GitHub saving is not configured. No save was made.');
          let payload;
          try { payload = JSON.parse(data); } catch { throw new ContentError(400, 'invalid_json', 'The save request is not valid JSON.'); }
          return json(201, await (apiSave ? content.save(payload, authorize) : media.save(session,payload,authorize)));
        }
        return send(404, page('Page unavailable', '<p>This administration page is unavailable.</p>'));
      }
      if (req.method === 'HEAD') return denied(405, {'Allow': 'GET'});
      if(route==='editor'&&url.pathname==='/admin/api/editor/publication'){
        if(limited('publication:'+ip,30,60))return denied(429,{'Retry-After':'60'});
        return json(200,await publication.get(url.searchParams.get('commit'),authorize));
      }
      if (route==='editor'&&url.pathname==='/admin/api/editor/supporting') return json(200,await supporting.bootstrap(authorize));
      if (route === 'editor' && url.pathname === '/admin/api/editor/deleted') return json(200,await revisions.deleted(authorize));
      if (route === 'editor' && url.pathname === '/admin/api/editor/history') return json(200,await revisions.list(url.searchParams.get('path'),Number(url.searchParams.get('page')||1),authorize));
      if (route === 'editor' && url.pathname === '/admin/api/editor/revision') return json(200,await revisions.detail(url.searchParams.get('path'),url.searchParams.get('commit'),authorize));
      if (route === 'media' && url.pathname === '/admin/api/media/list') return json(200,await media.list(session,authorize));
      if (route === 'media' && ['/admin/api/media/file','/admin/api/media/image'].includes(url.pathname)) {
        const file=await media.file(session,{id:url.searchParams.get('id'),path:url.searchParams.get('path')},authorize);
        if(url.pathname.endsWith('/image')){
          if(!file.mime_type?.startsWith('image/'))throw new ContentError(422,'invalid_image','Only validated images can be previewed.');
          return send(200,file.bytes,file.mime_type,{'Content-Disposition':'inline'});
        }
        const filename=encodeURIComponent(file.filename).replace(/['()*]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase());
        return send(200,file.bytes,file.mime_type,{'Content-Disposition':"attachment; filename=\"download" + (file.mime_type==='application/pdf'?'.pdf':'.'+file.mime_type.split('/')[1]) + "\"; filename*=UTF-8''"+filename});
      }
      if (route === 'editor_script') return send(200, await fs.readFile(new URL('./editor.js', import.meta.url), 'utf8'), 'text/javascript; charset=utf-8');
      if (route === 'editor' && url.pathname === '/admin/api/editor/bootstrap') return json(200, await editor.bootstrap(authorize));
      if (route === '/admin/api/session') return send(200, JSON.stringify({authenticated: true, csrf: session.csrf, expiresAt: new Date(session.expires).toISOString()}), 'application/json');
      if (route === 'content') {
        if (!content) throw new ContentError(503, 'saving_not_configured', 'GitHub saving is not configured.');
        if (url.pathname === '/admin/api/content') return json(200, await content.list(authorize));
        if (url.pathname === '/admin/api/content/file') return json(200, await content.read(url.searchParams.get('path'), authorize));
        if (url.pathname === '/admin/api/content/checks') {
          const checks = await content.provider.checks(url.searchParams.get('commit')); await authorize(); return json(200, checks);
        }
      }
      if (route === '/admin/') {
        return send(200, await fs.readFile(new URL('./editor.html', import.meta.url), 'utf8'));
      }
      return send(404, page('Page unavailable', '<p>This administration page is unavailable.</p>'));
    } catch (error) {
      if (error instanceof ContentError) return send(error.status, JSON.stringify({error: error.code, message: error.message, ...error.details}), 'application/json', error.status === 401 ? {'Set-Cookie': clearCookie} : {});
      sessions.clear();
      return send(503, page('Temporarily unavailable', '<p>Administration access is temporarily unavailable. Please contact the maintainer.</p>'));
    } finally {
      if (receivingUpload) receivingUploads--;
    }
  });
  server.requestTimeout = 15000;
  server.on('close',()=>{clearInterval(cleanup);sessions.clear();purgeUploads();});
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  server.on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return server;
}

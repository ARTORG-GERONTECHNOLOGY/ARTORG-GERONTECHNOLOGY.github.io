import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export function outsideRepository(candidate) {
  const publicRoots = [repository, ...['site', 'ci-site', 'pdf-fixture'].map(name => path.resolve(repository, '../.local', name))];
  for (const root of publicRoots) {
    const relative = path.relative(root, path.resolve(candidate));
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
      throw Error('Administration secrets must be stored outside the public repository and preview output.');
    }
  }
  return path.resolve(candidate);
}

export async function readAccess(file) {
  const real = outsideRepository(await fs.realpath(outsideRepository(file)));
  if ((await fs.stat(real)).size > 4096) throw Error('Invalid access configuration.');
  const data = JSON.parse(await fs.readFile(real, 'utf8'));
  if (Object.keys(data).some(key => !['generation', 'revoked', 'digest'].includes(key))
      || !/^[a-f0-9]{32}$/.test(data.generation) || typeof data.revoked !== 'boolean'
      || (!data.revoked && !/^[a-f0-9]{64}$/.test(data.digest))) throw Error('Invalid access configuration.');
  return data;
}

export function configuration(env = process.env) {
  const origin = new URL(env.ADMIN_ORIGIN || '');
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error('Set ADMIN_ORIGIN to an origin only.');
  const local = env.ADMIN_ALLOW_LOCAL_HTTP === '1';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (local && (env.NODE_ENV === 'production' || !loopback || origin.protocol !== 'http:')) throw Error('Local HTTP is restricted to loopback development.');
  if (origin.protocol !== 'https:' && !(local && loopback && origin.protocol === 'http:' && env.NODE_ENV !== 'production')) {
    throw Error('Administration requires HTTPS; local HTTP is an explicit loopback-only development option.');
  }
  const ttl = Number(env.ADMIN_SESSION_SECONDS || 7200);
  const port = Number(env.ADMIN_PORT || 4100);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400 || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid session lifetime or port.');
  if (!env.ADMIN_ACCESS_FILE) throw Error('Set a private access file.');
  return {origin: origin.origin, accessFile: outsideRepository(env.ADMIN_ACCESS_FILE), ttl,
    port, host: '127.0.0.1', local, trustProxy: env.ADMIN_TRUST_LOOPBACK_PROXY === '1'};
}

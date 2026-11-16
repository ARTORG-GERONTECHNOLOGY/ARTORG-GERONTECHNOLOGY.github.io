import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { outsideRepository } from './config.mjs';

const args = process.argv.slice(2);
const operation = args.shift();
const values = new Map();
for (let i = 0; i < args.length; i += 2) values.set(args[i], args[i + 1]);

async function privateFile(candidate, value) {
  const destination = outsideRepository(candidate);
  await fs.mkdir(path.dirname(destination), {recursive: true, mode: 0o700});
  outsideRepository(await fs.realpath(path.dirname(destination)));
  const temporary = destination + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await fs.writeFile(temporary, value, {mode: 0o600, flag: 'wx'});
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, {force: true}); }
}

try {
  if (!['rotate', 'revoke'].includes(operation) || !values.get('--state-file')) throw Error();
  const state = values.get('--state-file');
  const generation = randomBytes(16).toString('hex');
  if (operation === 'revoke') {
    await privateFile(state, JSON.stringify({generation, revoked: true}));
    console.log('Shared access revoked. Existing sessions will be rejected on their next request.');
  } else {
    if (!values.get('--link-file') || !values.get('--origin')) throw Error();
    const origin = new URL(values.get('--origin'));
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error();
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw Error();
    if (path.resolve(state) === path.resolve(values.get('--link-file'))) throw Error();
    const token = randomBytes(32).toString('hex');
    const digest = createHash('sha256').update(token).digest('hex');
    await privateFile(values.get('--link-file'), origin.origin + '/admin/access?token=' + token + '\n');
    await privateFile(state, JSON.stringify({generation, revoked: false, digest}));
    console.log('Shared access replaced. Open the private link file to distribute access; no token was printed.');
  }
} catch {
  console.error('Access management failed. Use rotate --state-file PRIVATE_PATH --link-file PRIVATE_PATH --origin HTTPS_ORIGIN, or revoke --state-file PRIVATE_PATH.');
  process.exitCode = 1;
}

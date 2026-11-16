import fs from 'node:fs/promises';
import { sign } from 'node:crypto';
import { outsideRepository } from './config.mjs';
import { policy, editable, asset, blobSha, sha, conflict, ContentError } from './content-policy.mjs';

const endpoint = 'https://api.github.com';
const prefix = '/repos/' + policy.repository;
const safeFailure = () => new ContentError(503, 'github_unavailable', 'GitHub is unavailable or its configuration needs attention. Your changes have not been retried.');
export class GitHubContent {
  #config; #fetch; #now; #token; #minting;
  constructor(config, {fetch: fetcher = fetch, now = Date.now} = {}) { this.#config = config; this.#fetch = fetcher; this.#now = now; }
  async #request(method, route, token, body) {
    try {
      const response = await this.#fetch(endpoint + route, {method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
        Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GER-administration', 'Content-Type': 'application/json'
      }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      if (!response.ok) throw safeFailure();
      const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.length; if (length > 16 * 1024 * 1024) throw safeFailure(); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw safeFailure(); }
  }
  async #installationToken() {
    if (this.#token && this.#token.expires > this.#now() + 60000) return this.#token.value;
    if (!this.#minting) this.#minting = (async () => {
      try {
        const file = outsideRepository(await fs.realpath(outsideRepository(this.#config.keyFile)));
        if ((await fs.stat(file)).size > 32768) throw safeFailure();
        const key = await fs.readFile(file);
        const time = Math.floor(this.#now() / 1000);
        const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
        const unsigned = encode({alg: 'RS256', typ: 'JWT'}) + '.' + encode({iat: time - 60, exp: time + 540, iss: String(this.#config.appId)});
        const jwt = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
        const result = await this.#request('POST', '/app/installations/' + this.#config.installationId + '/access_tokens', jwt,
          {repository_ids: [this.#config.repositoryId], permissions: {contents: 'write', checks: 'read'}});
        const expires = Date.parse(result.expires_at);
        if (!result.token || !Number.isFinite(expires) || expires <= this.#now() + 60000 || expires > this.#now() + 3660000
            || result.permissions?.contents !== 'write' || result.permissions?.checks !== 'read'
            || result.permissions.metadata && result.permissions.metadata !== 'read' || result.repository_selection === 'all'
            || Object.keys(result.permissions).some(key => !['contents', 'checks', 'metadata'].includes(key))
            || result.repositories && (result.repositories.length !== 1 || result.repositories[0].id !== this.#config.repositoryId)) throw safeFailure();
        this.#token = {value: result.token, expires};
        return result.token;
      } catch { throw safeFailure(); }
    })().finally(() => { this.#minting = undefined; });
    return this.#minting;
  }
  async #api(method, route, body) { return this.#request(method, route, await this.#installationToken(), body); }
  async head() {
    const ref = await this.#api('GET', prefix + '/git/ref/heads/' + policy.contentBranch);
    if (!sha(ref.object?.sha)) throw safeFailure();
    return ref.object.sha;
  }
  async snapshot() {
    const repo = await this.#api('GET', prefix);
    if (repo.id !== this.#config.repositoryId || repo.full_name !== policy.repository) throw safeFailure();
    const head = await this.head();
    const commit = await this.#api('GET', prefix + '/git/commits/' + head);
    if (!sha(commit.tree?.sha)) throw safeFailure();
    const tree = await this.#api('GET', prefix + '/git/trees/' + commit.tree.sha + '?recursive=1');
    if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 10000) throw safeFailure();
    const files = new Map(); let total = 0;
    for (const entry of tree.tree) {
      if (!editable(entry.path) && !asset(entry.path)) continue;
      if (entry.mode !== '100644' || entry.type !== 'blob' || !sha(entry.sha) || entry.size > 10 * 1024 * 1024 || files.has(entry.path)) throw safeFailure();
      const blob = await this.#api('GET', prefix + '/git/blobs/' + entry.sha);
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw safeFailure();
      const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
      total += bytes.length;
      if (bytes.length !== entry.size || bytes.length > 10 * 1024 * 1024 || editable(entry.path) && bytes.length > policy.maxTextBytes || blobSha(bytes) !== entry.sha || total > policy.maxSnapshotBytes) throw safeFailure();
      files.set(entry.path, {sha: entry.sha, bytes});
    }
    if (new Set([...files.keys()].map(file => file.toLowerCase())).size !== files.size) throw safeFailure();
    return {head, files};
  }
  async commit(expectedHead, changes) {
    // GitHub creates the Git tree/commit and conditionally advances the branch
    // together. expectedHeadOid is an atomic compare-and-swap, with no force push
    // or check-then-update gap. Never retry this mutation after an ambiguous failure.
    let result;
    try {
      result = await this.#api('POST', '/graphql', {
        query: 'mutation SaveContent($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',
        variables: {input: {branch: {repositoryNameWithOwner: policy.repository, refName: 'refs/heads/' + policy.contentBranch},
          expectedHeadOid: expectedHead, message: {headline: 'Update staff content'},
          fileChanges: {additions: changes.filter(item=>!item.delete).map(item => ({path: item.path, contents: (item.bytes || Buffer.from(item.content, 'utf8')).toString('base64')})),
            ...(changes.some(item=>item.delete)?{deletions:changes.filter(item=>item.delete).map(item=>({path:item.path}))}:{})}}}
      });
    } catch { throw new ContentError(502, 'save_outcome_unknown', 'The save outcome could not be confirmed. Reload and compare before trying again.'); }
    if (result.errors?.length) {
      const current = await this.head();
      if (current !== expectedHead) throw conflict(current);
      throw new ContentError(502, 'save_rejected', 'GitHub rejected the save. No automatic retry was made.');
    }
    const committed = result.data?.createCommitOnBranch?.commit?.oid;
    if (!sha(committed)) throw new ContentError(502, 'save_outcome_unknown', 'The save outcome could not be confirmed. Reload and compare before trying again.');
    return committed;
  }
  async checks(commit) {
    if (!sha(commit)) throw new ContentError(422, 'invalid_revision', 'Use a valid commit revision.');
    const result = await this.#api('GET', prefix + '/commits/' + commit + '/check-runs?per_page=100');
    const checks = result.check_runs?.filter(check => check.name === policy.requiredCheck && check.app?.slug === 'github-actions' && check.head_sha === commit);
    if (!checks || result.total_count > 100) return {state: 'unknown', live: false};
    checks.sort((a, b) => b.id - a.id);
    const latest = checks[0];
    return {state: !latest || latest.status !== 'completed' ? 'pending' : latest.conclusion === 'success' ? 'passed' : 'failed', live: false};
  }
}

export function githubConfiguration(env = process.env) {
  if (env.ADMIN_GITHUB_ENABLED !== '1') return null;
  const config = {appId: Number(env.ADMIN_GITHUB_APP_ID), installationId: Number(env.ADMIN_GITHUB_INSTALLATION_ID),
    repositoryId: Number(env.ADMIN_GITHUB_REPOSITORY_ID), keyFile: outsideRepository(env.ADMIN_GITHUB_PRIVATE_KEY_FILE || '')};
  if (![config.appId, config.installationId, config.repositoryId].every(value => Number.isSafeInteger(value) && value > 0)) throw safeFailure();
  return config;
}

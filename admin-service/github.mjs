import fs from 'node:fs/promises';
import { sign } from 'node:crypto';
import { outsideRepository } from './config.mjs';
import { policy, editable, asset, blobSha, sha, conflict, ContentError } from './content-policy.mjs';
import {readPublicationFacts} from './publication-status.mjs';

const endpoint = 'https://api.github.com';
const prefix = '/repos/' + policy.repository;
const staffRef = prefix + '/git/ref/heads/' + policy.contentBranch;
const safeFailure = () => new ContentError(503, 'github_unavailable', 'GitHub is unavailable or its configuration needs attention. Your changes have not been retried.');
export class GitHubContent {
  #config; #fetch; #now; #token; #minting; #publicationReads=new Map();
  constructor(config, {fetch: fetcher = fetch, now = Date.now} = {}) { this.#config = config; this.#fetch = fetcher; this.#now = now; }
  async #request(method, route, token, body) {
    try {
      const response = await this.#fetch(endpoint + route, {method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
        Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GER-administration', 'Content-Type': 'application/json'
      }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      if (method === 'GET' && route === staffRef && response.status === 404) {
        throw new ContentError(503, 'staff_branch_missing', `The ${policy.contentBranch} branch is missing or inaccessible on GitHub. Check that it exists and your account can access it.`);
      }
      if (!response.ok) throw safeFailure();
      if (response.status === 204) return;
      const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.length; if (length > 16 * 1024 * 1024) throw safeFailure(); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof ContentError) throw error;
      throw safeFailure();
    }
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
          {repository_ids: [this.#config.repositoryId], permissions: {contents: 'write', checks: 'read', actions:'read', deployments:'read'}});
        const expires = Date.parse(result.expires_at);
        if (!result.token || !Number.isFinite(expires) || expires <= this.#now() + 60000 || expires > this.#now() + 3660000
            || result.permissions?.contents !== 'write' || result.permissions?.checks !== 'read' || result.permissions?.actions!=='read' || result.permissions?.deployments!=='read'
            || result.permissions.metadata && result.permissions.metadata !== 'read' || result.repository_selection === 'all'
            || Object.keys(result.permissions).some(key => !['contents', 'checks', 'actions', 'deployments', 'metadata'].includes(key))
            || result.repositories && (result.repositories.length !== 1 || result.repositories[0].id !== this.#config.repositoryId)) throw safeFailure();
        this.#token = {value: result.token, expires};
        return result.token;
      } catch { throw safeFailure(); }
    })().finally(() => { this.#minting = undefined; });
    return this.#minting;
  }
  async #api(method, route, body) { return this.#request(method, route, this.#config.userToken ?? await this.#installationToken(), body); }
  async #staffBranch() {
    const ref = await this.#api('GET', staffRef);
    if (!sha(ref.object?.sha)) throw safeFailure();
    return ref;
  }
  async head() { return (await this.#staffBranch()).object.sha; }
  async snapshot() {
    const repo = await this.#api('GET', prefix);
    if (repo.full_name !== policy.repository || (!this.#config.userToken && repo.id !== this.#config.repositoryId)) throw safeFailure();
    if (this.#config.userToken && repo.permissions?.push !== true) throw new ContentError(403, 'github_write_required', 'The signed-in GitHub account needs write access to the website repository.');
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
    const branch = await this.#staffBranch();
    if (branch.object.sha !== expectedHead) throw conflict(branch.object.sha);
    if (typeof branch.node_id !== 'string' || !branch.node_id) throw safeFailure();
    let result;
    try {
      result = await this.#api('POST', '/graphql', {
        query: 'mutation SaveContent($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',
        variables: {input: {branch: {id: branch.node_id},
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
  async requestValidation(revision) {
    if (!sha(revision)) throw safeFailure();
    const workflow = await this.#api('GET', prefix + '/actions/workflows/validate-staff-upload.yml');
    if (workflow.state !== 'active') throw safeFailure();
    await this.#api('POST', prefix + '/dispatches', {event_type: 'staff-content-uploaded', client_payload: {revision}});
  }
  async history(path,page,head){
    if(!editable(path)||!sha(head)||!Number.isInteger(page)||page<1||page>50)throw new ContentError(422,'invalid_revision','Choose an allowed content history.');
    const values=await this.#api('GET',prefix+'/commits?'+new URLSearchParams({sha:head,path,per_page:'20',page:String(page)}));
    if(!Array.isArray(values)||values.length>20)throw safeFailure();
    return {revisions:values.map(value=>this.#revisionLabel(value)),hasMore:values.length===20};
  }
  #revisionLabel(value){
    if(!value||typeof value!=='object'||!Array.isArray(value.parents))throw safeFailure();
    const time=value.commit?.committer?.date;const name=value.commit?.author?.name;const parents=value.parents?.map(parent=>parent.sha)||[];
    if(!sha(value.sha)||!Number.isFinite(Date.parse(time))||typeof name!=='string'||typeof value.commit?.message!=='string'||parents.some(parent=>!sha(parent)))throw safeFailure();
    const login=typeof value.author?.login==='string'?value.author.login.slice(0,200):name.slice(0,200);
    const bot=value.author?.type==='Bot'||login.endsWith('[bot]');
    return {commit:value.sha,time:new Date(time).toISOString(),author:bot?'Recorded GitHub App/bot: '+login+' (individual staff identity not verified)':'Git author: '+name.slice(0,200)+' (staff identity not verified)',message:value.commit.message.split('\n')[0].slice(0,300),parents};
  }
  async revision(path,commit,head){
    if(!editable(path)||!sha(commit)||!sha(head))throw new ContentError(422,'invalid_revision','Choose an allowed content revision.');
    if(commit!==head){const comparison=await this.#api('GET',prefix+'/compare/'+commit+'...'+head+'?per_page=1');if(!['ahead','identical'].includes(comparison.status)||comparison.merge_base_commit?.sha!==commit)throw new ContentError(422,'invalid_revision','Choose a revision from the current content history.');}
    const label=this.#revisionLabel(await this.#api('GET',prefix+'/commits/'+commit));
    const current=await this.#fileAt(path,commit);const before=label.parents[0]?await this.#fileAt(path,label.parents[0]):null;
    return {...label,source:current?.source??null,fileSha:current?.sha??null,before:before?.source??null};
  }
  async #fileAt(path,commit){
    const info=await this.#api('GET',prefix+'/git/commits/'+commit);if(!sha(info.tree?.sha))throw safeFailure();
    const tree=await this.#api('GET',prefix+'/git/trees/'+info.tree.sha+'?recursive=1');if(tree.truncated||!Array.isArray(tree.tree)||tree.tree.length>10000)throw safeFailure();
    const entry=tree.tree.find(entry=>entry.path===path);if(!entry)return null;
    if(entry.mode!=='100644'||entry.type!=='blob'||!sha(entry.sha)||entry.size>policy.maxTextBytes)throw new ContentError(422,'invalid_revision','Historical content must be an ordinary bounded text file.');
    const blob=await this.#api('GET',prefix+'/git/blobs/'+entry.sha);if(blob.encoding!=='base64'||typeof blob.content!=='string')throw safeFailure();const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64');
    if(bytes.length!==entry.size||bytes.length>policy.maxTextBytes||blobSha(bytes)!==entry.sha)throw safeFailure();
    try{return {sha:entry.sha,source:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)};}catch{throw new ContentError(422,'invalid_revision','Historical content must be UTF-8 text.');}
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
  async publicationFacts(commit,publicRecord){
    return readPublicationFacts((method,route)=>{
      if(method!=='GET')throw safeFailure();
      for(const [key,item] of this.#publicationReads)if(item.until<=this.#now())this.#publicationReads.delete(key);
      if(!this.#publicationReads.has(route)){
        const value=this.#api('GET',prefix+route).catch(error=>{this.#publicationReads.delete(route);throw error;});this.#publicationReads.set(route,{value,until:this.#now()+10000});
        while(this.#publicationReads.size>64)this.#publicationReads.delete(this.#publicationReads.keys().next().value);
      }return this.#publicationReads.get(route).value;
    },commit,publicRecord);
  }
}

export function githubConfiguration(env = process.env, userToken) {
  if (userToken !== undefined) {
    if (!/^[!-~]{1,1024}$/.test(userToken)) throw safeFailure();
    return {userToken};
  }
  if (env.ADMIN_GITHUB_ENABLED !== '1') return null;
  const config = {appId: Number(env.ADMIN_GITHUB_APP_ID), installationId: Number(env.ADMIN_GITHUB_INSTALLATION_ID),
    repositoryId: Number(env.ADMIN_GITHUB_REPOSITORY_ID), keyFile: outsideRepository(env.ADMIN_GITHUB_PRIVATE_KEY_FILE || '')};
  if (![config.appId, config.installationId, config.repositoryId].every(value => Number.isSafeInteger(value) && value > 0)) throw safeFailure();
  return config;
}

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { policy, editable, asset, sha, blobSha, conflict, ContentError } from './content-policy.mjs';

// Treat a BOM as source text so read/edit/save preserves the original bytes.
const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
export function validateContent(files, previous) {
  const payload = {files: {}, previous: {}, assets: []};
  for (const [path, file] of files) {
    if (editable(path)) payload.files[path] = decoder.decode(file.bytes);
    else if (asset(path)) payload.assets.push({path, bytes: file.bytes.toString('base64')});
  }
  for (const [path, file] of previous) if (editable(path)) payload.previous[path] = decoder.decode(file.bytes);
  return new Promise((resolve, reject) => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const child = spawn(process.env.ADMIN_RUBY_EXECUTABLE || 'ruby', ['scripts/validate-admin-content.rb'], {cwd: root, shell: false, windowsHide: true});
    let output = ''; let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); reject(new ContentError(503, 'validation_unavailable', 'Content validation timed out. No save was made.')); }, 20000);
    child.on('error', () => { clearTimeout(timer); reject(new ContentError(503, 'validation_unavailable', 'Content validation is unavailable. No save was made.')); });
    child.stderr.resume();
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 1024 * 1024) { failed = true; child.kill(); } });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if (failed || code !== 0) throw Error();
        const result = JSON.parse(output);
        if (result.valid !== true) return reject(new ContentError(422, 'invalid_content', 'Correct the content errors before saving.', {errors: result.errors}));
        resolve();
      } catch { reject(new ContentError(503, 'validation_unavailable', 'Content validation is unavailable. No save was made.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

export class ContentStore {
  constructor(provider, {validate = validateContent} = {}) { this.provider = provider; this.validate = validate; }
  async list(authorize) {
    const snapshot = await this.provider.snapshot(); await authorize();
    return {baseCommit: snapshot.head, branch: policy.contentBranch, live: false,
      files: [...snapshot.files].filter(([path]) => editable(path)).map(([path, file]) => ({path, sha: file.sha}))};
  }
  async read(path, authorize) {
    if (!editable(path)) throw new ContentError(422, 'invalid_path', 'This content path cannot be edited.');
    const snapshot = await this.provider.snapshot(); await authorize();
    const file = snapshot.files.get(path);
    if (!file) throw new ContentError(404, 'not_found', 'The content was not found.');
    return {baseCommit: snapshot.head, path, sha: file.sha, content: decoder.decode(file.bytes), live: false};
  }
  async save(payload, authorize, {assets = [], deletions = [], limit = policy.maxChanges} = {}) {
    if (!payload || Object.keys(payload).some(key => !['baseCommit', 'changes'].includes(key)) || !sha(payload.baseCommit)) throw new ContentError(428, 'revision_required', 'Reload the content to obtain its current revision before saving.');
    if (!Array.isArray(payload.changes) || !payload.changes.length || payload.changes.length > limit) throw new ContentError(422, 'invalid_changes', 'Provide a bounded set of content changes.');
    const paths = new Set();
    for (const item of payload.changes) {
      if (!item || Object.keys(item).some(key => !['path', 'sha', 'content'].includes(key)) || !editable(item.path) || typeof item.content !== 'string'
          || !item.content.isWellFormed() || Buffer.byteLength(item.content) > policy.maxTextBytes || !(item.sha === null || sha(item.sha)) || paths.has(item.path.toLowerCase())) throw new ContentError(422, 'invalid_changes', 'Use distinct allowed content paths, UTF-8 text and last-read file revisions.');
      paths.add(item.path.toLowerCase());
    }
    const snapshot = await this.provider.snapshot();
    if (snapshot.head !== payload.baseCommit) throw conflict(snapshot.head, payload.changes.map(item => item.path));
    const next = new Map(snapshot.files);
    const changes = [...payload.changes];
    for (const item of deletions) {
      if (!editable(item.path) || !item.path.startsWith('_posts/') || paths.has(item.path.toLowerCase())) throw new ContentError(422,'invalid_deletion','Only current proposals can be deleted.');
      if (!snapshot.files.has(item.path) || snapshot.files.get(item.path).sha !== item.sha) throw conflict(snapshot.head,[item.path]);
      paths.add(item.path.toLowerCase()); next.delete(item.path); changes.push({...item,delete:true});
    }
    for (const item of assets) {
      if (!asset(item.path) || !/^assets\/media\/proposals\/[a-z0-9-]+\/[a-z0-9-]+-[a-f0-9]{16}\.(png|jpe?g|webp|pdf)$/.test(item.path) || !Buffer.isBuffer(item.bytes) || paths.has(item.path.toLowerCase())) throw new ContentError(422, 'invalid_media', 'Use a validated proposal upload.');
      paths.add(item.path.toLowerCase());
      const old = snapshot.files.get(item.path);
      if (old && !old.bytes.equals(item.bytes)) throw new ContentError(409, 'media_conflict', 'An existing file cannot be overwritten. Upload under a new name.');
      if (!old) { next.set(item.path, {bytes: item.bytes}); changes.push(item); }
    }
    let changed = changes.length > payload.changes.length;
    for (const item of payload.changes) {
      const old = snapshot.files.get(item.path);
      if ((old?.sha || null) !== item.sha) throw conflict(snapshot.head, [item.path]);
      const bytes = Buffer.from(item.content, 'utf8');
      if (!old || !bytes.equals(old.bytes)) changed = true;
      next.set(item.path, {bytes});
    }
    if (new Set([...next.keys()].map(path => path.toLowerCase())).size !== next.size) throw new ContentError(422, 'invalid_path', 'Filenames must be unique without case differences.');
    if (changes.length > limit || [...next.values()].reduce((sum,file)=>sum+file.bytes.length,0) > policy.maxSnapshotBytes) throw new ContentError(413, 'save_limit', 'The save exceeds the file count or repository inspection limit.');
    if (!changed) throw new ContentError(422, 'no_changes', 'There are no changes to save.');
    await this.validate(next, snapshot.files);
    await authorize();
    const committed = await this.provider.commit(snapshot.head, changes);
    return {commit: committed, files: changes.map(item => ({path: item.path, sha: item.delete ? null : blobSha(item.bytes || Buffer.from(item.content, 'utf8'))})), branch: policy.contentBranch, state: 'committed_validation_pending', live: false, requiredCheck: policy.requiredCheck,
      publication: policy.publication};
  }
}

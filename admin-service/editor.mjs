import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { policy, editable, asset, blobSha, ContentError } from './content-policy.mjs';
import { staticMath } from './preview.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));

export async function localSnapshot() {
  const files = new Map();
  async function collect(directory) {
    const entries = await fs.readdir(path.join(root, directory), {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
      const name = directory + '/' + entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await collect(name);
      else if (editable(name) || asset(name)) { const bytes = await fs.readFile(path.join(root, name)); files.set(name, {bytes, sha: blobSha(bytes)}); }
    }
  }
  for (const directory of ['_posts', '_team', '_news', '_data', 'assets/images', 'assets/media', 'assets/attachments']) await collect(directory);
  return {head: blobSha(Buffer.from([...files].map(([name, file]) => name + file.sha).sort().join('\n'))), files};
}

function rubyEditor(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ADMIN_RUBY_EXECUTABLE || 'ruby', ['scripts/editor-proposal.rb'], {cwd: root, shell: false, windowsHide: true});
    const chunks = []; let length = 0;
    const timer = setTimeout(() => { child.kill(); reject(new ContentError(503, 'preview_unavailable', 'Preparing the proposal timed out. Your working copy remains in this tab.')); }, 30000);
    child.on('error', () => { clearTimeout(timer); reject(new ContentError(503, 'editor_unavailable', 'The proposal editor is temporarily unavailable.')); });
    child.stderr.resume();
    child.stdout.on('data', chunk => { length += chunk.length; if (length > 8 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
    child.on('close', code => {
      clearTimeout(timer);
      try { if (code !== 0) throw Error(); const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(result); }
      catch { reject(new ContentError(503, 'editor_unavailable', 'The proposal could not be prepared. Your working copy remains in this tab.')); }
    });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(payload));
  });
}

export class ProposalEditor {
  constructor(content = null) { this.content = content; this.busy = false; }
  async snapshot() { return this.content ? this.content.provider.snapshot() : localSnapshot(); }
  async prepare(payload, authorize) {
    if (this.busy) throw new ContentError(429, 'preview_busy', 'Another proposal is being prepared. Please try again shortly.');
    if (!payload || !['new', 'parse', 'compose', 'download', 'preview', 'publish'].includes(payload.operation)) throw new ContentError(422, 'invalid_editor_request', 'Choose a valid editor action.');
    if (payload.source && (typeof payload.source !== 'string' || Buffer.byteLength(payload.source) > policy.maxTextBytes)) throw new ContentError(422, 'invalid_editor_request', 'The Markdown file is too large.');
    this.busy = true;
    try {
      const snapshot = await this.snapshot(); await authorize();
      const source = payload.operation === 'new' ? await fs.readFile(path.join(root, 'templates/proposal.md'), 'utf8') : payload.source;
      const context = payload.context || {};
      if (context.path && (!editable(context.path) || !context.path.startsWith('_posts/'))) throw new ContentError(422, 'invalid_path', 'Choose a proposal path.');
      const originalSource = context.path && snapshot.files.get(context.path)?.bytes.toString('utf8');
      const result = await rubyEditor({source, originalSource, operation: payload.operation, patch: payload.patch || {}, sections: payload.sections || {}, context,
        categories: snapshot.files.get('_data/proposal_categories.yml').bytes.toString('utf8'),
        team: Object.fromEntries([...snapshot.files].filter(([file]) => file.startsWith('_team/')).map(([file, value]) => [file, value.bytes.toString('utf8')])),
        assetSizes: Object.fromEntries([...snapshot.files].filter(([file]) => asset(file)).map(([file,value])=>[file,value.bytes.length]))});
      if (result.error) throw new ContentError(422, result.error, result.message, {errors: result.errors});
      if (result.context.path && (!editable(result.context.path) || !result.context.path.startsWith('_posts/'))) throw new ContentError(422, 'invalid_path', 'Choose a proposal path.');
      if (Buffer.byteLength(result.source) > policy.maxTextBytes) throw new ContentError(422, 'invalid_editor_request', 'Keep the proposal Markdown below 128 KiB. Your working copy remains in this tab.');
      if (result.html) {
        const bootstrap = await fs.readFile(path.join(root, 'assets/vendor/bootstrap/css/bootstrap.min.css'), 'utf8').catch(() => '');
        result.html = result.html.replace('</head>', '<style>' + bootstrap.replace(/<\/style/gi, '') + result.css.replace(/<\/style/gi, '') + ' body{margin:0}.single.proposal-page{padding:1rem}.article{margin:0}.MathJax_SVG_Display{max-width:100%;overflow:auto}</style></head>');
        result.html = result.html.replace(/src="(\/assets\/[^"<>]+)"/g, (match, url) => {
          const file = snapshot.files.get(url.slice(1));
          if (!file) return 'src=""';
          const mime = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
          return 'src="data:' + mime + ';base64,' + file.bytes.toString('base64') + '"';
        });
        result.html = await staticMath(result.html); delete result.css;
      }
      await authorize();
      return {...result, canPublish: Boolean(this.content), mode: this.content ? 'github' : 'local_review'};
    } finally { this.busy = false; }
  }
  async bootstrap(authorize) {
    const snapshot = await this.snapshot(); await authorize();
    // One trusted parse process prepares list metadata and shared choices below.
    const proposals = [...snapshot.files].filter(([file]) => file.startsWith('_posts/')).map(([path, file]) => ({path, sha: file.sha, source: file.bytes.toString('utf8')}));
    const result = await rubyEditor({operation: 'bootstrap', proposals, categories: snapshot.files.get('_data/proposal_categories.yml').bytes.toString('utf8')});
    await authorize();
    return {...result, baseCommit: snapshot.head, canPublish: Boolean(this.content), mode: this.content ? 'github' : 'local_review'};
  }
}

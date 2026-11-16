import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const policy = Object.freeze(JSON.parse(fs.readFileSync(new URL('./content-policy.json', import.meta.url), 'utf8')));
export class ContentError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function editable(file) {
  return typeof file === 'string' && file.length <= 240 && !/[\x00-\x20\x7f\\%]/.test(file)
    && policy.editablePatterns.some(pattern => new RegExp(pattern).test(file));
}
export function asset(file) {
  return typeof file === 'string' && !/[\x00-\x20\x7f\\%]/.test(file) && !file.split('/').some(part => part === '.' || part === '..')
    && new RegExp(policy.assetPattern).test(file);
}
export function blobSha(bytes) { return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'); }
export const conflict = (currentCommit, paths = []) => new ContentError(409, 'conflict', 'Newer changes exist. Reload and compare before saving again.', {currentCommit, paths});
export function uploadOwner(target,proposalId){
  if(target==='_data/home.yml')return {folder:'home',id:'homepage',path:target,key:target};
  if(typeof target==='string'&&editable(target)&&/^_(team|news)\//.test(target)){const folder=target.startsWith('_team/')?'team':'news';return {folder,id:target.split('/')[1].slice(0,-3),path:target,key:target};}
  if(!target&&typeof proposalId==='string'&&proposalId.length<=100&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proposalId))return {folder:'proposals',id:proposalId,path:null,key:'proposal:'+proposalId};
  throw new ContentError(422,'invalid_media','Choose a proposal, Home, team profile or news item for uploads.');
}

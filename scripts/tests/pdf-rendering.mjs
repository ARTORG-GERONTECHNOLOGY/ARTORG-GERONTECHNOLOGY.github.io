// Temporary figure/math/long-content fixture: never added to public proposals.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = path.resolve(process.argv[2] || '../.local/site');
const target = path.resolve(process.argv[3] || '../.local/pdf-fixture');
const manifest = JSON.parse(await fs.readFile(path.join(source,'pdf-manifest.json'),'utf8'));
const entry = {id:'pdf-rendering-fixture', title:'Print verification fixture', revision:'2026-11-12T00:00:00Z', print_url:'/print/proposals/pdf-rendering-fixture/', page_url:'/fixture/', pdf:'/assets/pdf/pdf-rendering-fixture.pdf'};
await fs.mkdir(path.join(target,'print/proposals',entry.id),{recursive:true});
await fs.mkdir(path.join(target,'fixture'),{recursive:true});
await fs.cp(path.join(source,'assets'),path.join(target,'assets'),{recursive:true});
await fs.cp(path.join(source,'css'),path.join(target,'css'),{recursive:true});
manifest.baseurl=''; manifest.proposals=[entry];
await fs.writeFile(path.join(target,'pdf-manifest.json'),JSON.stringify(manifest));
await fs.writeFile(path.join(target,'fixture/index.html'),'<!-- proposal-pdf-download -->');
const short = '<h2>Short example</h2><p>A short proposal paragraph with accents: Möri, Müller, Parkinson’s disease.</p>';
const figure = '<figure><img src="/assets/images/site-qr.png" alt="QR fixture"><figcaption>Fixture figure caption: a locally generated QR image, not proposal data.</figcaption></figure>';
const math = '<h2>Mathematical example</h2><p>Energy: \\(E=mc^2\\). Integral: \\(\\int_0^1 x^2\\,dx=\\frac{1}{3}\\).</p>';
const long = Array.from({length:35},(_,i)=>'<h2>Long section '+(i+1)+'</h2><p>'+('Long-content pagination fixture: readable text should wrap and continue without clipping. '.repeat(6))+'</p>').join('');
const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/proposal-print.css"></head><body data-revision="'+entry.revision+'"><h1>'+entry.title+'</h1>'+short+figure+math+long+'</body></html>';
const file=path.join(target,'print/proposals',entry.id,'index.html');
await fs.writeFile(file,html);
const run=()=>spawnSync(process.execPath,['scripts/generate-proposal-pdfs.mjs',target],{encoding:'utf8'});
let result=run(); if(result.status!==0) throw Error(result.stderr);
// Missing local assets must fail rather than silently produce incomplete PDFs.
await fs.writeFile(file,html.replace('/assets/images/site-qr.png','/missing-figure.png'));
result=run(); if(result.status===0 || !result.stderr.includes('Missing image')) throw Error('Missing image did not fail PDF generation');
await fs.writeFile(file,html);
console.log('Long/figure/math fixture generated at '+target+'; missing-image failure verified.');

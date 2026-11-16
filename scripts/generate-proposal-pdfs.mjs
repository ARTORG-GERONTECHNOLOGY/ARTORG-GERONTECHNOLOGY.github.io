import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { typesetMath } from './lib/browser-math.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const output = path.resolve(args[0] || '_site');
const manifestPath = path.join(output, 'pdf-manifest.json');
const snapshot = await fs.readFile(manifestPath, 'utf8');
const manifest = JSON.parse(snapshot);
const entries = manifest.proposals;
if (!Array.isArray(entries)) throw Error('Build Jekyll before generating proposal PDFs.');
if(entries.some(entry=>!entry||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||entry.pdf!=='/assets/pdf/'+entry.id+'.pdf')||new Set(entries.map(entry=>entry.id)).size!==entries.length)throw Error('Invalid PDF manifest inventory.');
const safePath = relative => {
  const target = path.resolve(output, '.' + relative);
  if (!target.startsWith(output + path.sep)) throw Error('Output path escapes build directory.');
  return target;
};
// Only the generated PDF inventory is cleaned; shared source media is retained.
const pdfDirectory=safePath('/assets/pdf');
await fs.mkdir(pdfDirectory,{recursive:true});
const realOutput=await fs.realpath(output);
if(await fs.realpath(pdfDirectory)!==path.join(realOutput,'assets','pdf'))throw Error('PDF directory must stay inside the real build output.');
const expectedPDFs=new Set(entries.map(entry=>entry.id+'.pdf'));
for(const name of await fs.readdir(pdfDirectory))if(/^[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/.test(name)&&!expectedPDFs.has(name))await fs.unlink(path.join(pdfDirectory,name));
for(const name of expectedPDFs)if(await fs.lstat(path.join(pdfDirectory,name)).then(info=>info.isSymbolicLink(),()=>false))throw Error('PDF destinations cannot be symbolic links.');
const htmlSnapshots = new Map();
for (const entry of entries) {
  for (const url of [entry.page_url, entry.print_url.slice(manifest.baseurl.length)]) {
    const file = safePath(url.endsWith('/') ? url + 'index.html' : url);
    htmlSnapshots.set(file, await fs.readFile(file, 'utf8'));
  }
}
const mathRoot = path.dirname(require.resolve('mathjax/package.json'));
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'};
const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file;
    if (pathname.startsWith('/__pdf_mathjax/')) {
      file = path.resolve(mathRoot, '.' + pathname.slice('/__pdf_mathjax'.length));
      if (!file.startsWith(mathRoot + path.sep)) throw Error('Invalid math path');
    } else {
      if (manifest.baseurl && pathname.startsWith(manifest.baseurl + '/')) pathname = pathname.slice(manifest.baseurl.length);
      file = safePath(pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    }
    const bytes = await fs.readFile(file);
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'}); res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
let browser;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const brands = await Promise.all(manifest.branding.map(async brand => {
  const bytes = await fs.readFile(safePath(brand.asset));
  return '<img style="height:14mm;width:auto" alt="'+escape(brand.name)+'" src="data:image/png;base64,'+bytes.toString('base64')+'">';
}));
const footerTemplate = '<div style="width:100%;padding:0 18mm;font:9px Arial;color:#333">'
  + '<div style="display:flex;align-items:center;justify-content:space-between">'+brands[0]
  + '<span>'+escape(manifest.program)+'</span>'+brands[1]+'</div>'
  + '<div style="text-align:center;margin-top:2mm"><span class="pageNumber"></span> / <span class="totalPages"></span></div></div>';
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext({serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === 'data:') return route.continue();
    return route.abort('blockedbyclient');
  });
  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) throw Error('Invalid proposal ID');
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const response = await page.goto(origin + entry.print_url, {waitUntil: 'load'});
    if (!response.ok()) throw Error('Missing print page: ' + entry.id);
    if (await page.locator('script,iframe,object,embed').count()) throw Error('Executable content in print page: ' + entry.id);
    await page.evaluate(() => { document.querySelectorAll('img').forEach(img => img.loading = 'eager'); });
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (Array.from(document.images).some(image => !image.naturalWidth)) throw Error('Missing image');
    });
    await typesetMath(page, origin + '/__pdf_mathjax/MathJax.js');
    await page.evaluate(({publicUrl, baseurl, pageUrl}) => {
      const publicPage = new URL(pageUrl.replace(/^\//, ''), publicUrl);
      for (const link of document.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        if (href.startsWith('/') && !href.startsWith('//')) {
          const relative = baseurl && href.startsWith(baseurl + '/') ? href.slice(baseurl.length) : href;
          link.href = new URL(relative.replace(/^\//, ''), publicUrl).href;
        } else if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//')) {
          link.href = new URL(href, publicPage).href;
        }
      }
    }, {publicUrl: manifest.public_url, baseurl: manifest.baseurl, pageUrl: entry.page_url});
    await page.evaluate(() => document.fonts.ready);
    const revision = await page.locator('body').getAttribute('data-revision');
    if (revision !== entry.revision) throw Error('Print revision differs from build manifest');
    const destination = safePath(entry.pdf);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await page.pdf({path: destination, format:'A4', preferCSSPageSize:true, printBackground:true, displayHeaderFooter:true, headerTemplate:'<span></span>', footerTemplate});
    if ((await fs.stat(destination)).size < 1000) throw Error('Empty PDF');
    await page.close();
  }
  if (await fs.readFile(manifestPath,'utf8') !== snapshot) throw Error('Site rebuilt during PDF generation; retry.');
  for (const [file, html] of htmlSnapshots) {
    if (await fs.readFile(file, 'utf8') !== html) throw Error('Proposal HTML changed during PDF generation; rebuild and retry.');
  }
  for (const entry of entries) {
    const htmlPath = safePath(entry.page_url.endsWith('/') ? entry.page_url+'index.html' : entry.page_url);
    const html = await fs.readFile(htmlPath,'utf8');
    const link = '<p class="proposal-pdf-download"><a href="'+escape(manifest.baseurl+entry.pdf)+'" download>Download proposal PDF</a> <small>Revision '+escape(entry.revision)+'</small></p>';
    const marker = '<!-- proposal-pdf-download -->';
    const existing = /<p class="proposal-pdf-download">[\s\S]*?<\/p>/;
    if (!html.includes(marker) && !existing.test(html)) throw Error('Missing PDF download position: ' + entry.id);
    await fs.writeFile(htmlPath, html.includes(marker) ? html.replace(marker,link) : html.replace(existing,link));
  }
  console.log('Generated '+entries.length+' proposal PDFs and matching revision-labelled download links.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

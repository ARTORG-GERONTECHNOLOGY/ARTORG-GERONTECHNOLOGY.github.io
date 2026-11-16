import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { typesetMath } from '../scripts/lib/browser-math.mjs';
const require = createRequire(import.meta.url);
const mathRoot = path.dirname(require.resolve('mathjax/package.json'));

export async function staticMath(html) {
  const server = http.createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(mathRoot, '.' + relative);
      if (!file.startsWith(mathRoot + path.sep)) throw Error();
      res.writeHead(200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'});
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({headless: true});
    const context = await browser.newContext({serviceWorkers: 'block'});
    await context.route('**/*', route => new URL(route.request().url()).origin === origin || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.setContent(html, {waitUntil: 'domcontentloaded'});
    if (await page.locator('script,iframe,object,embed,[onerror],[onclick]').count()) throw Error('Executable content in preview');
    await typesetMath(page, origin + '/MathJax.js', true);
    await page.evaluate(() => {
      document.querySelectorAll('script,#MathJax_Message').forEach(node => node.remove());
      const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'";
      document.head.prepend(policy);
      const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer'; document.head.prepend(referrer);
    });
    return await page.content();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

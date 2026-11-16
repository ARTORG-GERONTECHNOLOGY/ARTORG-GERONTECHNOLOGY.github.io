// Only trusted local MathJax code is loaded. Author HTML is sanitized upstream.
export async function typesetMath(page, mathUrl, svg = false) {
  await page.evaluate(svg => {
    window.MathJax = {messageStyle: 'none', showMathMenu: false, extensions: ['Safe.js'],
      SVG: {useGlobalCache: false}, Safe: {safeProtocols: {http: true, https: true, file: false, javascript: false}}};
  }, svg);
  await page.addScriptTag({url: mathUrl + '?config=' + (svg ? 'TeX-AMS-MML_SVG' : 'TeX-AMS-MML_HTMLorMML')});
  await page.waitForFunction(() => window.MathJax && window.MathJax.isReady && window.MathJax.Extension.Safe);
  await page.evaluate(() => Promise.race([
    new Promise(resolve => MathJax.Hub.Queue(resolve)),
    new Promise((_, reject) => setTimeout(() => reject(Error('Math rendering timed out')), 30000))
  ]));
}

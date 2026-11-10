/* Run: node tests/check_river_performance.cjs (Playwright Chrome + Firefox installed).
 * RIVER_HEADED=1 also checks the visible GPU/compositor path, not just headless.
 * Measure real frame cadence without screenshots/readbacks, which stall Canvas.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE.');
(async () => {
  for (const name of process.env.RIVER_BROWSER ? [process.env.RIVER_BROWSER] : ['chromium', 'firefox']) {
    const browser = await playwright[name].launch({ headless: process.env.RIVER_HEADED !== '1', ...(name === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 300 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.setContent('<style>body{margin:0}canvas{display:block;width:1440px;height:240px}</style><canvas id="river-canvas"></canvas>');
      await page.addScriptTag({ path: path.resolve(__dirname, '../assets/js/river.js') });
      await page.waitForFunction(() => document.querySelector('canvas').river.running);
      if (process.env.RIVER_HEADED === '1') await page.bringToFront();
      const cadence = await page.locator('canvas').evaluate(c => new Promise(resolve => {
        let last = performance.now(), previous = c.river.particles[10].x, repeats = 0;
        const gaps = [];
        function sample(time) {
          if (gaps.length >= 30 && c.river.particles[10].x === previous) repeats++;
          previous = c.river.particles[10].x;
          gaps.push(time - last); last = time;
          if (gaps.length < 110) requestAnimationFrame(sample);
          else {
            const sorted = gaps.slice(30).sort((a, b) => a - b);
            resolve({ meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
              p95ms: sorted[Math.floor(sorted.length * 0.95)], repeats, width: c.width });
          }
        }
        requestAnimationFrame(sample);
      }));
      console.log(name, browser.version(), cadence);
      assert(cadence.meanMs < 25, `${name}: canvas must sustain at least 40fps, not stall on pen strokes`);
      assert(cadence.p95ms < 40, `${name}: long render stalls must not dominate frame pacing`);
      assert.equal(cadence.repeats, 0, `${name}: tracers advance every rendered frame`);
      assert.deepEqual(errors, []);
      console.log('PASS', name, 'Retina canvas frame budget');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

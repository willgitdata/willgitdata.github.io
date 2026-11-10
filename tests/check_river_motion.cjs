/* Run: node tests/check_river_motion.cjs — deterministic real-canvas motion checks. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE.');
(async () => {
  const name = process.env.RIVER_BROWSER || 'chromium';
  const browser = await playwright[name].launch(name === 'chromium' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 300 } });
    await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-10T12:00:01Z'));
    await page.setContent('<style>body{margin:0}canvas{display:block;width:1440px;height:240px}</style><canvas id="river-canvas" width="1440" height="240"></canvas><button class="river-pause">Pause motion</button>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../assets/js/river.js') });
    await page.waitForFunction(() => document.querySelector('canvas').river.running, null, { polling: 10 });
    let previous = '', repeats = 0;
    for (let n = 0; n < 24; n++) {
      await page.clock.runFor(16);
      const pixels = await page.locator('canvas').evaluate(c => c.toDataURL());
      if (pixels === previous) repeats++;
      previous = pixels;
    }
    console.log({ frames: 24, repeatedFrames: repeats });
    assert.equal(repeats, 0, 'Water must move on every display frame, including between 30Hz solver steps');
    console.log('PASS continuous rendered motion between physics updates');
    await page.locator('canvas').evaluate(c => {
      const f = c.river.fluid, control = new f.constructor();
      control.u.set(f.u); control.v.set(f.v); control.steps = f.steps;
      const step = f.step;
      f.step = function () { control.step(); step.call(this); };
      c.control = control;
    });
    // Cross the canvas between physics ticks: the middle must feel the sweep too.
    await page.mouse.move(1440 * 0.2, 120);
    await page.mouse.move(1440 * 0.8, 120);
    await page.clock.runFor(48);
    const response = await page.locator('canvas').evaluate(c => {
      const f = c.river.fluid, control = c.control;
      let sum = 0;
      for (let y = 16; y <= 24; y++) for (let x = 105; x <= 115; x++) {
        const i = f.index(x, y);
        sum += Math.hypot(f.u[i] - control.u[i], f.v[i] - control.v[i]);
      }
      return { sweptPath: sum / 99, divergence: f.divergence() };
    });
    console.log(response);
    assert(response.sweptPath > 0.15, 'A fast cursor sweep must stir its entire path, not only the endpoint');
    assert(response.divergence < 0.02, 'Swept input remains approximately incompressible');
    console.log('PASS cursor path feeds the actual fluid velocity');
    await page.mouse.move(0, 280);
    await page.clock.runFor(48);
    await page.locator('canvas').evaluate(c => {
      c.stirs = 0;
      const stir = c.river.fluid.stir;
      c.river.fluid.stir = function (...args) { c.stirs++; stir.apply(this, args); };
    });
    await page.mouse.move(300, 120);
    await page.clock.runFor(48);
    assert.equal(await page.locator('canvas').evaluate(c => c.stirs), 0, 'Re-entry must not join a stroke across the page');
    await page.mouse.move(420, 120);
    await page.mouse.move(420, 280);
    await page.clock.runFor(48);
    assert(await page.locator('canvas').evaluate(c => c.stirs > 0), 'Leaving must preserve the last cursor sweep');
    await page.locator('.river-pause').click();
    const paused = await page.locator('canvas').evaluate(c => c.toDataURL());
    await page.mouse.move(400, 100);
    await page.mouse.move(600, 120);
    await page.clock.runFor(100);
    assert.equal(await page.locator('canvas').evaluate(c => c.toDataURL()), paused, 'Pause must stop per-frame advection as well as the solver');
    console.log('PASS pointer exit/re-entry and paused ink remain correct');
    await page.locator('canvas').evaluate(c => {
      const particles = c.river.particles;
      particles.splice(1);
      Object.assign(particles[0], { x: 12, y: 20, age: 20, life: 1000, tail: null, trail: [[10, 20], [11, 20]] });
      const ctx = c.getContext('2d'), moveTo = ctx.moveTo;
      c.tails = [];
      ctx.moveTo = function (x, y) { c.tails.push(x); moveTo.call(this, x, y); };
    });
    await page.locator('.river-pause').click();
    await page.clock.runFor(160);
    const tails = await page.locator('canvas').evaluate(c => c.tails);
    console.log({ shortTrailTails: tails });
    assert(tails.length >= 8 && tails.every(x => Math.abs(x - 60) < 0.001), 'Growing trails must keep their tail anchored across physics ticks');
    console.log('PASS short trail tails do not jitter backward');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Run: node tests/check_portfolio.cjs
 * Uses Playwright from the project or PLAYWRIGHT_MODULE and installed Chrome.
 * Starts its own static server, so no separate preview process is required.
 * Optional: AXE_PATH=/path/to/axe.min.js for WCAG 2.1 AA checks.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to its module path.');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.QA_ARTIFACTS || '/tmp/portfolio-qa';
fs.mkdirSync(artifacts, { recursive: true });
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS', name); }
const mime = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  res.writeHead(range ? 206 : 200, {
    'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file, { start, end }).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright.chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const errors = [], failed = [], mediaCancellations = [], httpErrors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('requestfailed', request => {
      const error = request.failure().errorText;
      // Chrome cancels the metadata-only video fetch before issuing a new range.
      // This is not a failed asset: decoding and currentTime are asserted below.
      if (request.resourceType() === 'media' && error === 'net::ERR_ABORTED') {
        mediaCancellations.push(request.url());
      } else failed.push(`${request.url()} ${error}`);
    });
    page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    check('All six original sections and navigation links retained', (await page.locator('section[id]').count()) === 6 && (await page.locator('.topbar nav a').count()) === 6);
    check('Headline and description readable without JavaScript animation', (await page.locator('h1').textContent()) === 'William Humphrey' && (await page.locator('.lede').textContent()).includes('predictive models for healthcare'));
    check('Daily mountain loads with the full landscape aspect', await page.locator('.hero-art img').evaluate(img => img.complete && img.naturalWidth >= 1300 && Math.abs(img.naturalWidth / img.naturalHeight - 16 / 9) < 0.01));
    check('Requested caption and disclaimer removed', !(await page.locator('body').textContent()).includes('A study in blue ink') && !(await page.locator('body').textContent()).includes('Details are generalized.'));
    check('Royal blue accent and plain paper background', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() === '#2b46d6' && getComputedStyle(document.body).backgroundImage === 'none'));
    check('Both chosen font families loaded', await page.evaluate(() => document.fonts.check('400 60px "Source Serif 4"') && document.fonts.check('400 16px Inter')));
    const localLinks = await page.locator('[href], [src], [poster]').evaluateAll(elements => [...new Set(elements.flatMap(el => ['href', 'src', 'poster'].map(attr => el.getAttribute(attr))).filter(value => value && !value.startsWith('#') && !/^(https?:|mailto:|data:)/.test(value)))]);
    for (const href of localLinks) {
      const response = await page.request.get(new URL(href, url).href);
      check(`Local reference resolves: ${href}`, response.ok());
    }
    // Content comparisons use a parsed copy of the previous version, not handpicked claims.
    const previous = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
    const contentDiff = await page.evaluate(old => {
      const parsed = new DOMParser().parseFromString(old, 'text/html');
      const normalize = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
      return ['work', 'data-science', 'projects', 'research', 'skills'].filter(id => {
        const before = parsed.getElementById(id).cloneNode(true);
        const after = document.getElementById(id).cloneNode(true);
        for (const section of [before, after]) section.querySelectorAll('.label, .case-note').forEach(el => el.remove());
        return normalize(before.textContent.replace(/engagement20%/, 'engagement · 20%')) !== normalize(after.textContent);
      });
    }, previous);
    check('Original content preserved apart from requested disclaimer removal', contentDiff.length === 0);
    await page.keyboard.press('Tab');
    check('Keyboard skip link is first and visible on focus', await page.locator('.skip-link').evaluate(el => el === document.activeElement && el.getBoundingClientRect().top >= 0));
    await page.keyboard.press('Enter');
    check('Skip link targets main content', (await page.evaluate(() => location.hash)) === '#main');
    for (const width of [320, 390, 560, 768, 800, 820, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const nav = [...document.querySelectorAll('.topbar nav a')].map(rect);
        const image = document.querySelector('.hero-art img');
        const imageRect = rect(image);
        const heading = rect(document.querySelector('h1'));
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          navVisible: nav.every(r => r.x >= 0 && r.right <= innerWidth && r.height >= 44),
          heroSeparated: imageRect.x >= heading.right || imageRect.y >= heading.bottom,
          uncropped: Math.abs(imageRect.width / imageRect.height - image.naturalWidth / image.naturalHeight) < 0.01,
          cardsVisible: [...document.querySelectorAll('.card')].every(el => { const r = rect(el); return r.x >= 0 && r.right <= innerWidth && r.width > 150; })
        };
      });
      check(`${width}px: no horizontal overflow`, !geometry.overflow);
      check(`${width}px: all six navigation targets visible, at least 44px high`, geometry.navVisible);
      check(`${width}px: full mountain aspect retained; artwork never overlaps heading`, geometry.uncropped && geometry.heroSeparated);
      check(`${width}px: content columns stay inside viewport`, geometry.cardsVisible);
      if ([390, 768, 1440].includes(width)) {
        await page.screenshot({ path: path.join(artifacts, `hero-${width}.png`) });
        await page.screenshot({ path: path.join(artifacts, `full-${width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['work', 'data-science', 'projects', 'research', 'skills', 'hero']) {
      await page.locator(`.topbar nav a[href="#${id}"]`).click();
      await page.waitForTimeout(180);
      const result = await page.evaluate(id => {
        const section = document.getElementById(id).getBoundingClientRect();
        const header = document.querySelector('.topbar').getBoundingClientRect();
        return { visible: section.top >= header.bottom - 1 && section.top < innerHeight, current: document.querySelector('.topbar [aria-current="location"]').getAttribute('href') };
      }, id);
      check(`Mobile nav reaches ${id} below sticky header and updates active state`, result.visible && result.current === `#${id}`);
    }
    check('River pauses offscreen and never overlays content', await page.locator('#river-canvas').evaluate(canvas => canvas.river && !canvas.river.running && getComputedStyle(canvas.parentElement).position !== 'fixed'));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(`${width}px: complete river canvas stays below footer without cropping`, await page.locator('#river-canvas').evaluate(canvas => {
        const box = canvas.getBoundingClientRect();
        return box.top >= document.querySelector('footer').getBoundingClientRect().bottom - 1 && Math.abs(box.width / box.height - 6) < 0.02 && box.right <= innerWidth;
      }));
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => document.getElementById('river-canvas').river.running);
    const riverBefore = await page.locator('#river-canvas').evaluate(canvas => ({ steps: canvas.river.fluid.steps, pixels: canvas.toDataURL() }));
    await page.waitForFunction(steps => document.getElementById('river-canvas').river.fluid.steps > steps + 8, riverBefore.steps);
    check('Live Navier–Stokes solver advances and rendered water pixels change', await page.locator('#river-canvas').evaluate((canvas, before) => canvas.toDataURL() !== before && canvas.river.fluid.divergence() < 0.01, riverBefore.pixels));
    check('River has no rock obstacles and no video playback', await page.locator('#river-canvas').evaluate(canvas => {
      const fluid = canvas.river.fluid;
      return Array.from({ length: fluid.nx }, (_, x) => fluid.isWater(x + 0.5, 1.5) && fluid.isWater(x + 0.5, fluid.ny - 1.5)).every(Boolean) && !document.querySelector('.river video');
    }));
    check('Abstract flow has clockwise and counterclockwise velocity curls', await page.locator('#river-canvas').evaluate(canvas => {
      const f = canvas.river.fluid;
      let low = Infinity, high = -Infinity;
      for (let y = 2; y < f.ny - 2; y++) for (let x = 1; x < f.nx - 1; x++) {
        const curl = (f.v[f.index(x + 1, y)] - f.v[f.index(x - 1, y)] - f.u[f.index(x, y + 1)] + f.u[f.index(x, y - 1)]) / 2;
        low = Math.min(low, curl); high = Math.max(high, curl);
      }
      return low < -0.05 && high > 0.05;
    }));
    await page.locator('.river-pause').click();
    const manualSteps = await page.locator('#river-canvas').evaluate(canvas => canvas.river.fluid.steps);
    await page.waitForTimeout(150);
    check('Keyboard-accessible pause control stops the actual solver', await page.locator('#river-canvas').evaluate((canvas, steps) => !canvas.river.running && canvas.river.fluid.steps === steps, manualSteps));
    await page.locator('.river-pause').click();
    await page.waitForFunction(() => document.getElementById('river-canvas').river.running);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.mouse.move(0, 0);
      await page.locator('#river-canvas').evaluate(canvas => {
        const f = canvas.river.fluid, control = new f.constructor();
        control.u.set(f.u); control.v.set(f.v); control.steps = f.steps;
        const step = f.step;
        f.step = function () { control.step(); step.call(this); };
        canvas.mouseCheck = { control, step };
      });
      const box = await page.locator('#river-canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.65, { steps: 12 });
      await page.waitForTimeout(100);
      check(`${width}px: real mouse hover alters simulated velocities, not just elapsed animation`, await page.locator('#river-canvas').evaluate(canvas => {
        const f = canvas.river.fluid, { control, step } = canvas.mouseCheck;
        const changed = f.u.some((value, i) => Math.abs(value - control.u[i]) > 0.01);
        f.step = step; delete canvas.mouseCheck;
        return changed && f.divergence() < 0.01;
      }));
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const pausedSteps = await page.locator('#river-canvas').evaluate(canvas => canvas.river.fluid.steps);
    const pausedPixels = await page.locator('#river-canvas').evaluate(canvas => canvas.toDataURL());
    const reducedBox = await page.locator('#river-canvas').boundingBox();
    await page.mouse.move(reducedBox.x + reducedBox.width * 0.3, reducedBox.y + reducedBox.height * 0.4);
    await page.mouse.move(reducedBox.x + reducedBox.width * 0.6, reducedBox.y + reducedBox.height * 0.6, { steps: 8 });
    await page.waitForTimeout(150);
    check('Reduced motion stops the physics, not just the picture', await page.locator('#river-canvas').evaluate((canvas, steps) => !canvas.river.running && canvas.river.fluid.steps === steps, pausedSteps));
    check('Mouse movement respects reduced motion', await page.locator('#river-canvas').evaluate((canvas, pixels) => canvas.toDataURL() === pixels, pausedPixels));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(100);
    check('Changing reduced-motion preference resumes visible river', await page.locator('#river-canvas').evaluate(canvas => canvas.river.running));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !document.getElementById('river-canvas').river.running);
    const offscreenSteps = await page.locator('#river-canvas').evaluate(canvas => canvas.river.fluid.steps);
    await page.waitForTimeout(150);
    check('Offscreen river consumes no continuing physics steps', await page.locator('#river-canvas').evaluate((canvas, steps) => canvas.river.fluid.steps === steps, offscreenSteps));
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJs.newPage();
    await staticPage.goto(url, { waitUntil: 'networkidle' });
    check('No-JavaScript fallback keeps headline, art, content and links', (await staticPage.locator('h1').isVisible()) && (await staticPage.locator('.hero-art img').isVisible()) && (await staticPage.locator('#projects a').count()) === 3);
    check('No-JavaScript fallback shows preserved river art without dead controls', await staticPage.locator('.river img').isVisible() && !(await staticPage.locator('.river-pause').isVisible()));
    await noJs.close();
    const daily = await browser.newPage({ timezoneId: 'America/Los_Angeles' });
    await daily.clock.install({ time: new Date('2026-11-09T12:00:00-08:00') });
    await daily.goto(url, { waitUntil: 'networkidle' });
    const seen = [];
    for (let day = 0; day <= 30; day++) {
      await daily.clock.setSystemTime(new Date(Date.parse('2026-11-09T20:00:00Z') + day * 86400000));
      await daily.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await daily.waitForFunction(previous => document.querySelector('.hero-art img').dataset.mountain && document.querySelector('.hero-art img').dataset.mountain !== previous, seen.at(-1) || '');
      const mountain = await daily.locator('.hero-art img').evaluate(img => ({ slug: img.dataset.mountain, loaded: img.complete && img.naturalWidth >= 1300, alt: img.alt }));
      check(`Day ${day + 1}: distinct daily artwork loads and caption matches`, mountain.loaded && (await daily.locator('#mountain-name').textContent()).split(' · ')[0] === mountain.alt.replace('Blue-pen-style illustration of ', '').slice(0, -1));
      seen.push(mountain.slug);
    }
    check('Exactly 30 unique mountains, then cycle repeats Denali', new Set(seen.slice(0, 30)).size === 30 && seen[0] === 'denali' && seen[30] === seen[0]);
    await daily.clock.setSystemTime(new Date('2026-11-09T23:59:59-08:00'));
    await daily.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await daily.waitForFunction(() => document.querySelector('.hero-art img').dataset.mountain === 'denali');
    await daily.clock.fastForward(2000);
    await daily.waitForFunction(() => document.querySelector('.hero-art img').dataset.mountain === 'fuji');
    check('Open page changes mountain at local midnight', (await daily.locator('#mountain-name').textContent()).startsWith('Mount Fuji'));
    for (const dates of [['2027-03-13T12:00:00-08:00', '2027-03-14T12:00:00-07:00'], ['2027-11-06T12:00:00-07:00', '2027-11-07T12:00:00-08:00']]) {
      const slugs = [];
      for (const date of dates) {
        await daily.clock.setSystemTime(new Date(date));
        await daily.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        const day = Math.round((Date.parse(date.slice(0, 10)) - Date.parse('2026-11-09')) / 86400000);
        // A cached Image.onload is still async; networkidle can precede the DOM update.
        await daily.waitForFunction(slug => document.querySelector('.hero-art img').dataset.mountain === slug, seen[((day % 30) + 30) % 30]);
        slugs.push(await daily.locator('.hero-art img').getAttribute('data-mountain'));
      }
      check('DST boundary advances exactly one mountain: ' + dates[1], (seen.indexOf(slugs[1]) - seen.indexOf(slugs[0]) + 30) % 30 === 1);
    }
    await daily.close();
    for (const report of ['nous-model-eval', 'nous-safety-eval']) {
      const research = await browser.newPage();
      const reportErrors = [];
      research.on('pageerror', error => reportErrors.push(String(error)));
      await research.goto(url + 'research/' + report + '.html', { waitUntil: 'networkidle' });
      for (const width of [390, 1440]) {
        await research.setViewportSize({ width, height: 1000 });
        check(`${report} ${width}px: blue accent, paper background, no overflow`, await research.evaluate(() => getComputedStyle(document.querySelector('a')).color === 'rgb(43, 70, 214)' && getComputedStyle(document.body).backgroundColor === 'rgb(252, 252, 250)' && document.documentElement.scrollWidth <= innerWidth));
        await research.screenshot({ path: path.join(artifacts, `${report}-${width}.png`) });
      }
      if (report === 'nous-model-eval') {
        await research.locator('[data-axis="latency"]').click();
        check('Blue research plot still switches axes', await research.locator('#log-scale').isDisabled());
        await research.locator('#search').fill('not-a-real-model');
        check('Blue research table still filters', (await research.locator('#board tbody').textContent()).includes('No matching models'));
        await research.locator('#search').fill('');
        await research.locator('#heat .heat-cell').first().click();
        check('Blue research evidence dialog opens', await research.locator('#evidence').isVisible());
      } else {
        check('Safety pass cells use blue text and pale-blue background', await research.locator('.ok').first().evaluate(el => getComputedStyle(el).color === 'rgb(32, 53, 170)' && getComputedStyle(el).backgroundColor === 'rgb(238, 241, 255)'));
      }
      check(report + ': no JavaScript errors', reportErrors.length === 0);
      await research.close();
    }
    if (process.env.AXE_PATH) {
      await page.addScriptTag({ path: process.env.AXE_PATH });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations);
        fs.writeFileSync(path.join(artifacts, `axe-${width}.json`), JSON.stringify(violations, null, 2));
        check(`${width}px: axe WCAG 2.1 AA scan has no violations`, violations.length === 0);
      }
    }
    check('No JavaScript errors', errors.length === 0);
    if (failed.length) console.error('Failed requests:', failed);
    check('No failed asset requests or HTTP errors', failed.length === 0 && httpErrors.length === 0);
    console.log(`INFO Browser media cancellations: ${mediaCancellations.length}; river is live canvas physics`);
    console.log(`\n${checks} checks passed. Screenshots: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

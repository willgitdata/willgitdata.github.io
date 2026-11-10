/* Blue-pen fluid study. 2D incompressible Navier–Stokes on a staggered (MAC) grid.
 * Semi-Lagrangian velocity advection, explicit viscosity, body force, then
 * pressure projection. Tracers only DRAW the computed velocity; they don't
 * generate it. No libraries, videos, texture scrolling or prescribed waves.
 */
(function () {
  'use strict';

  class RiverFluid {
    constructor(nx = 240, ny = 40) {
      this.nx = nx; this.ny = ny; this.stride = nx + 1;

      const size = (nx + 1) * (ny + 1);
      for (const key of ['u', 'v', 'oldU', 'oldV', 'pressure', 'forceU', 'forceV']) this[key] = new Float32Array(size);
      this.fluid = new Uint8Array(size);
      // Alternating localized torque sources stir the fluid. Advection and
      // pressure projection evolve their interactions, rather than drawing
      // particles along a prescribed decorative curl field.
      const vortices = [[0.12, 0.50, 0.25, 1], [0.31, 0.57, 0.36, -1],
        [0.50, 0.43, 0.23, 1], [0.68, 0.54, 0.34, -1], [0.88, 0.46, 0.27, 1]];
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const i = this.index(x, y);
        this.fluid[i] = y > 0 && y < ny - 1 ? 1 : 0;
        for (const [cx, cy, radius, direction] of vortices) {
          const r = radius * ny, dx = (x - cx * nx) / r, dy = (y - cy * ny) / r;
          const falloff = Math.exp(-(dx * dx + dy * dy) * 1.7) * direction * 0.095;
          this.forceU[i] -= dy * falloff; this.forceV[i] += dx * falloff;
        }
        this.u[i] = 0.12 + this.forceU[i] * 38;
        this.v[i] = this.forceV[i] * 38;
      }
      this.boundaries();
      this.project(80);
      this.steps = 0;
    }
    index(x, y) { return x + this.stride * y; }
    isWater(x, y) {
      if (y < 0 || y >= this.ny) return false;
      const ix = ((Math.floor(x) % this.nx) + this.nx) % this.nx;
      return !!this.fluid[this.index(ix, Math.floor(y))];
    }
    boundaries() {
      const { nx, ny, stride: s, u, v, fluid: f } = this;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = this.index(x, y), left = this.index((x + nx - 1) % nx, y);
          if (!f[i] || !f[left]) u[i] = 0;
          if (y === 0 || !f[i] || !f[i - s]) v[i] = 0;
        }
        u[this.index(nx, y)] = u[this.index(0, y)];
      }
    }
    sample(field, x, y, horizontal) {
      // Sample face-centered components at arbitrary cell-space positions.
      x -= horizontal ? 0 : 0.5;
      y -= horizontal ? 0.5 : 0;
      x = ((x % this.nx) + this.nx) % this.nx;
      y = Math.max(0, Math.min(this.ny - 1.001, y));
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const right = (ix + 1) % this.nx;
      return (field[this.index(ix, iy)] * (1 - fx) + field[this.index(right, iy)] * fx) * (1 - fy)
        + (field[this.index(ix, iy + 1)] * (1 - fx) + field[this.index(right, iy + 1)] * fx) * fy;
    }
    velocity(x, y) { return [this.sample(this.u, x, y, true), this.sample(this.v, x, y, false)]; }
    stir(x, y, dx, dy) {
      if (![x, y, dx, dy].every(Number.isFinite) || !this.isWater(x, y)) return;
      const radius = 13, scale = 3.8 / Math.max(1, Math.hypot(dx, dy));
      // Blend toward a bounded velocity; fast sweeps cannot explode the solver.
      for (let row = Math.max(1, Math.floor(y - radius)); row < Math.min(this.ny - 1, y + radius); row++) {
        for (let col = Math.max(0, Math.floor(x - radius)); col < Math.min(this.nx, x + radius); col++) {
          const distance = ((col - x) ** 2 + (row - y) ** 2) / (radius * radius);
          if (distance >= 1) continue;
          const weight = (1 - distance) ** 2 * 0.9, i = this.index(col, row);
          this.u[i] += (dx * scale - this.u[i]) * weight;
          this.v[i] += (dy * scale - this.v[i]) * weight;
        }
      }
      this.boundaries();
    }
    project(iterations = 32) {
      const { nx, ny, stride: s, u, v, fluid: f, pressure } = this;
      pressure.fill(0);
      // Gauss-Seidel pressure projection: div(u)=0, with no normal flux into
      // solid outer cells; x is periodic so the flow has no visible side walls.
      for (let k = 0; k < iterations; k++) {
        for (let y = 1; y < ny - 1; y++) for (let x = 0; x < nx; x++) {
          const i = this.index(x, y);
          if (!f[i]) continue;
          const left = this.index((x + nx - 1) % nx, y), right = this.index((x + 1) % nx, y);
          const a = f[left], b = f[right], c = f[i - s], d = f[i + s], count = a + b + c + d;
          if (!count) continue;
          const correction = -1.75 * (u[right] - u[i] + v[i + s] - v[i]) / count;
          pressure[i] += correction;
          u[i] -= a * correction; u[right] += b * correction;
          v[i] -= c * correction; v[i + s] += d * correction;
        }
      }
      this.boundaries();
    }
    divergence() {
      let total = 0, count = 0;
      for (let y = 1; y < this.ny - 1; y++) for (let x = 0; x < this.nx; x++) {
        const i = this.index(x, y);
        if (!this.fluid[i]) continue;
        const div = this.u[this.index((x + 1) % this.nx, y)] - this.u[i] + this.v[i + this.stride] - this.v[i];
        total += div * div; count++;
      }
      return Math.sqrt(total / Math.max(count, 1));
    }
    step() {
      const { nx, ny, stride: s, u, v, oldU, oldV, fluid: f, forceU, forceV } = this;
      const stirring = 0.85 + 0.15 * Math.sin(this.steps * 0.006);
      oldU.set(u); oldV.set(v);
      for (let y = 1; y < ny - 1; y++) for (let x = 0; x < nx; x++) {
        const i = this.index(x, y);
        if (!f[i]) continue;
        const left = this.index((x + nx - 1) % nx, y), right = this.index((x + 1) % nx, y);
        const ux = oldU[i], uy = this.sample(oldV, x, y + 0.5, false);
        const vx = this.sample(oldU, x + 0.5, y, true), vy = oldV[i];
        // nu=0.012 cell²/step, dt=1. Viscosity bound is safely below 1/4.
        u[i] = (this.sample(oldU, x - ux, y + 0.5 - uy, true)
          + 0.012 * (oldU[left] + oldU[right] + oldU[i - s] + oldU[i + s] - 4 * ux) + forceU[i] * stirring + 0.0004) * 0.996;
        v[i] = (this.sample(oldV, x + 0.5 - vx, y - vy, false)
          + 0.012 * (oldV[left] + oldV[right] + oldV[i - s] + oldV[i + s] - 4 * vy) + forceV[i] * stirring) * 0.996;
      }
      this.boundaries();
      this.project();
      this.steps++;
    }
    move(point, dt) {
      const [u, v] = this.velocity(point.x, point.y);
      const [mu, mv] = this.velocity(point.x + u * dt * 0.5, point.y + v * dt * 0.5);
      const x = point.x + mu * dt, y = point.y + mv * dt;
      // Midpoint sampling + segment checks keep tracers inside the simulation.
      for (let n = 1; n <= 3; n++) if (!this.isWater(point.x + (x - point.x) * n / 3, point.y + (y - point.y) * n / 3)) return false;
      point.x = ((x % this.nx) + this.nx) % this.nx; point.y = y;
      return true;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { RiverFluid };
  if (typeof document === 'undefined') return;

  const canvas = document.getElementById('river-canvas');
  if (!canvas) return;
  // Firefox's accelerated per-stroke path stalls visible frames; CPU rendering avoids it.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const fluid = new RiverFluid();
  const INK = '#2b46d6', PAPER = '#fcfcfa';
  let randomState = 2749;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const W = 1440, H = 240;
  let pixelRatio = Math.min(devicePixelRatio || 1, 2), slowFrames = 0;
  const px = x => x / fluid.nx * W, py = y => y / fluid.ny * H;
  // Each moving mark is a tiny material line with a finite fading lifetime.
  // Its path comes only from RK2 integration of the pressure-projected field.
  const particles = Array.from({ length: 3000 }, () => ({ x: 0, y: 0, age: 100, life: 1, trail: [] }));
  const pointer = { previous: null, strokes: [] };
  function reset(p) {
    do { p.x = random() * fluid.nx; p.y = random() * fluid.ny; } while (!fluid.isWater(p.x, p.y));
    p.age = 0; p.life = 100 + random() * 160; p.weight = 0.4 + random() * 0.65;
    p.opacity = 0.15 + random() * 0.45; p.trail.length = 0; p.tail = null;
  }
  function advance() {
    const stirred = pointer.strokes.length > 0;
    for (const { x, y, dx, dy, vx, vy } of pointer.strokes) {
      const samples = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
      for (let n = 1; n <= samples; n++) {
        fluid.stir(x - dx + dx * n / samples, y - dy + dy * n / samples, vx, vy);
      }
    }
    pointer.strokes.length = 0;
    fluid.step();
    // A full swept stroke affects more cells than a single dab.
    if (stirred) fluid.project();
  }
  function advect(dt, record) {
    for (const p of particles) {
      p.age += dt;
      if (p.age > p.life || !fluid.move(p, 0.55 * dt)) reset(p);
      const last = p.trail[p.trail.length - 1];
      if (last && Math.abs(p.x - last[0]) > fluid.nx / 2) { p.trail.length = 0; p.tail = null; }
      if (record) {
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 70) p.tail = p.trail.shift();
      }
    }
  }
  function draw(alpha = 0) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = INK; ctx.lineCap = 'round';
    for (const p of particles) {
      if (p.trail.length < 2) continue;
      const fade = Math.min(1, p.age / 20, (p.life - p.age) / 30);
      const margin = Math.min(1, p.y / 6, (fluid.ny - p.y) / 6, p.x / 6, (fluid.nx - p.x) / 6);
      ctx.globalAlpha = Math.max(0, fade * margin) * p.opacity;
      ctx.lineWidth = p.weight; ctx.beginPath();
      // Only slide a discarded sample; growing trails keep their original anchor.
      const first = p.tail || p.trail[0], second = p.trail[0];
      ctx.moveTo(px(first[0] + (second[0] - first[0]) * alpha), py(first[1] + (second[1] - first[1]) * alpha));
      // Omit subpixel bends: Firefox's stroker is costly with 70 tiny joins per mark.
      let ax = first[0], ay = first[1];
      for (let i = 0; i < p.trail.length - 1; i++) {
        const b = p.trail[i], c = p.trail[i + 1], dx = c[0] - ax, dy = c[1] - ay;
        if (Math.abs((b[0] - ax) * dy - (b[1] - ay) * dx) < 0.06 * Math.hypot(dx, dy)) continue;
        ctx.lineTo(px(b[0]), py(b[1])); ax = b[0]; ay = b[1];
      }
      const end = p.trail[p.trail.length - 1]; ctx.lineTo(px(end[0]), py(end[1]));
      ctx.lineTo(px(p.x), py(p.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function resize() {
    const width = canvas.getBoundingClientRect().width;
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(width * H / W * pixelRatio); draw();
  }
  for (let n = 0; n < 100; n++) { advance(); advect(1, true); }
  new ResizeObserver(resize).observe(canvas); resize();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, running = false, paused = false, request = 0, lastTime = 0, accumulator = 0;
  function resetPointer() { pointer.previous = null; pointer.strokes.length = 0; }
  canvas.addEventListener('pointermove', event => {
    if (!running || !event.isPrimary) { resetPointer(); return; }
    const box = canvas.getBoundingClientRect();
    const events = event.getCoalescedEvents?.();
    for (const sample of events?.length ? events : [event]) {
      const x = (sample.clientX - box.left) / box.width * fluid.nx;
      const y = (sample.clientY - box.top) / box.height * fluid.ny;
      if (pointer.previous) {
        const dx = x - pointer.previous.x, dy = y - pointer.previous.y;
        const dt = Math.max(8, sample.timeStamp - pointer.previous.time);
        if (dx || dy) pointer.strokes.push({ x, y, dx, dy, vx: dx * 33.333 / dt, vy: dy * 33.333 / dt });
      }
      pointer.previous = { x, y, time: sample.timeStamp };
    }
  }, { passive: true });
  // Keep the final swept path until the next tick, but never join across re-entry.
  canvas.addEventListener('pointerleave', () => { pointer.previous = null; });
  canvas.addEventListener('pointercancel', resetPointer);
  function animate(time) {
    if (!running) return;
    const elapsed = Math.min((time - lastTime) / 1000, 0.05); lastTime = time;
    // Keep Retina detail when fast; fall back to CSS-pixel resolution on slow renderers.
    slowFrames = elapsed > 1 / 35 ? slowFrames + 1 : 0;
    if (slowFrames >= 12 && pixelRatio > 1) { pixelRatio = 1; resize(); }
    accumulator += elapsed;
    // Fixed 30Hz physics, at most two steps after a slow frame. Never catch up
    // an entire hidden-tab interval or create a second animation loop.
    let steps = 0;
    while (accumulator >= 1 / 30 && steps++ < 2) { advance(); accumulator -= 1 / 30; }
    // The pressure solve stays at 30Hz; ink follows its velocity every display frame.
    advect(elapsed * 30, steps > 0);
    draw(accumulator * 30); request = requestAnimationFrame(animate);
  }
  function playback() {
    const next = visible && !document.hidden && !motion.matches && !paused;
    if (next === running) return;
    running = next;
    if (running) { lastTime = performance.now(); accumulator = 0; slowFrames = 0; request = requestAnimationFrame(animate); }
    else { cancelAnimationFrame(request); resetPointer(); }
  }
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; playback(); }).observe(canvas);
  motion.addEventListener('change', playback);
  document.addEventListener('visibilitychange', playback);
  const pauseButton = document.querySelector('.river-pause');
  if (pauseButton) pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    pauseButton.setAttribute('aria-pressed', String(paused)); playback();
  });
  // Small inspectable handle for numerical/browser regression checks.
  canvas.river = { fluid, particles, get running() { return running; } };
})();

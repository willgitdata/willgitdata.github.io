/* Run: node tests/check_river.cjs — real solver, no browser or dependencies. */
const assert = require('node:assert/strict');
const { RiverFluid } = require('../assets/js/river.js');
const fluid = new RiverFluid();
for (let x = 0; x < fluid.nx; x++) {
  for (let y = 1; y < fluid.ny - 1; y++) {
    assert(fluid.isWater(x + 0.5, y + 0.5), 'Abstract flow has no river banks or obstacles');
  }
}
for (let n = 0; n < 120; n++) fluid.step();
let minCurl = Infinity, maxCurl = -Infinity;
for (let y = 2; y < fluid.ny - 2; y++) for (let x = 1; x < fluid.nx - 1; x++) {
  const curl = (fluid.v[fluid.index(x + 1, y)] - fluid.v[fluid.index(x - 1, y)]
    - fluid.u[fluid.index(x, y + 1)] + fluid.u[fluid.index(x, y - 1)]) / 2;
  minCurl = Math.min(minCurl, curl); maxCurl = Math.max(maxCurl, curl);
}
assert(minCurl < -0.05 && maxCurl > 0.05, 'Flow must contain clockwise AND counterclockwise swirls');
const before = fluid.divergence();
// Disturb the velocity: pressure projection must remove, not hide, divergence.
for (let y = 1; y < fluid.ny - 1; y++) {
  for (let x = 1; x < fluid.nx; x++) {
    const i = fluid.index(x, y);
    if (fluid.fluid[i] && fluid.fluid[i - 1]) fluid.u[i] += Math.sin(x * 0.4 + y * 0.7) * 0.25;
  }
}
const disturbed = fluid.divergence();
fluid.project(160);
const projected = fluid.divergence();
assert(disturbed > before * 3, 'The test must introduce measurable divergence');
assert(projected < disturbed * 0.18, 'Pressure projection must substantially reduce divergence');
let solidFlux = 0;
for (let y = 0; y < fluid.ny; y++) {
  for (let x = 1; x < fluid.nx; x++) {
    const i = fluid.index(x, y);
    if (!fluid.fluid[i] || !fluid.fluid[i - 1]) solidFlux = Math.max(solidFlux, Math.abs(fluid.u[i]));
  }
}
for (let y = 1; y < fluid.ny; y++) {
  for (let x = 0; x < fluid.nx; x++) {
    const i = fluid.index(x, y);
    if (!fluid.fluid[i] || !fluid.fluid[i - fluid.stride]) solidFlux = Math.max(solidFlux, Math.abs(fluid.v[i]));
  }
}
assert.equal(solidFlux, 0, 'No flow through outer simulation boundaries');
const initial = Float32Array.from(fluid.u);
for (let n = 0; n < 120; n++) fluid.step();
assert([...fluid.u, ...fluid.v].every(Number.isFinite), 'Velocities stay finite');
assert(fluid.u.some((value, i) => Math.abs(value - initial[i]) > 0.001), 'Currents evolve rather than replay a fixed field');
assert(fluid.v.some(value => value > 0.15) && fluid.v.some(value => value < -0.15), 'Flow must swirl in both vertical directions');
const p = { x: fluid.nx * 0.12, y: fluid.ny * 0.3 };
const start = { ...p };
for (let n = 0; n < 60; n++) fluid.move(p, 0.35);
const tracerDistance = Math.hypot(p.x - start.x, p.y - start.y);
assert(tracerDistance > 2 && fluid.isWater(p.x, p.y), 'A tracer must move through the simulated swirls');
console.log(JSON.stringify({ projection: { disturbed, projected, ratio: projected / disturbed }, solidFlux, steadyDivergence: fluid.divergence(), tracerDistance, minCurl, maxCurl }, null, 2));
const untouched = new RiverFluid(), stirred = new RiverFluid();
stirred.stir(120, 20, 2, -1);
assert(stirred.u[stirred.index(120, 20)] > untouched.u[untouched.index(120, 20)], 'Mouse sweep pushes fluid in its horizontal direction');
assert(stirred.v[stirred.index(120, 20)] < untouched.v[untouched.index(120, 20)], 'Mouse sweep pushes fluid in its vertical direction');
assert.equal(stirred.u[stirred.index(20, 20)], untouched.u[untouched.index(20, 20)], 'Mouse impulse stays local');
let response = 0, samples = 0;
for (let y = 12; y <= 28; y++) for (let x = 112; x <= 128; x++) {
  const i = stirred.index(x, y);
  response += Math.hypot(stirred.u[i] - untouched.u[i], stirred.v[i] - untouched.v[i]); samples++;
}
assert(response / samples > 0.6, 'Mouse sweep must disturb a broad visible area, not just a few cells');
for (let n = 0; n < 12; n++) { untouched.step(); stirred.step(); }
assert(stirred.u.some((value, i) => Math.abs(value - untouched.u[i]) > 0.01), 'Mouse influence survives advection and pressure projection');
assert(stirred.divergence() < 0.01, 'Mouse stirring preserves approximate incompressibility');
stirred.stir(120, 20, 1000000, -1000000);
const valid = Float32Array.from(stirred.u);
stirred.stir(NaN, 20, 1, 1); stirred.stir(120, 20, Infinity, 1);
assert.deepEqual(stirred.u, valid, 'Invalid pointer input is ignored');
assert([...stirred.u, ...stirred.v].every(value => Number.isFinite(value) && Math.abs(value) < 5), 'Fast pointer motion is bounded');
console.log('PASS projection, boundaries, swirls, tracer motion, local mouse impulses and bounded input');

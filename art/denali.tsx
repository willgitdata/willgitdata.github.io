/**
 * Denali — a blue-pen landscape for willgitdata.github.io, rendered with raea.
 *
 *   raea render art/denali.tsx -o assets/ink/denali.png --frame 0 --alpha
 *
 * The mark-making follows a ballpoint sketch rather than a woodcut: one kind of
 * short stroke, repeated, clustered and layered until value comes out of density.
 * Strokes are batched into a handful of paths by weight, so 20k marks cost six.
 * Seeded throughout — the same frame draws the same picture.
 */
import { AbsoluteFill, Composition, registerRoot } from "raea";

type P = [number, number];

const INK = "#2b46d6"; // royal blue
const INK_DEEP = "#1a2f9e";

const W = 2400;
const H = 900;

function hash(i: number, s: number): number {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function noise(x: number, s: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, s) * (1 - u) + hash(i + 1, s) * u;
}
function fbm(x: number, s: number, oct = 3): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * noise(x * f, s + i * 13);
    f *= 2.3;
    a *= 0.5;
  }
  return v;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* --------------------------------------------------------------- the massif */

// Denali from the south: long west shoulder, two summits, a steep east face
const ANCHORS: P[] = [
  [40, 884], [300, 826], [560, 786], [760, 730], [900, 676], [1010, 610],
  [1100, 540], [1180, 474], [1252, 414], [1320, 364], [1380, 326], [1430, 304],
  [1470, 318], [1500, 344], [1534, 324], [1568, 296], [1604, 278], [1640, 304],
  [1682, 360], [1726, 428], [1772, 498], [1820, 570], [1872, 644], [1930, 712],
  [1996, 774], [2070, 828], [2160, 872], [2280, 902],
];

function ridgeAt(x: number): number {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1];
    const [x1, y1] = ANCHORS[i];
    if (x <= x1) return lerp(y0, y1, Math.max(0, Math.min(1, (x - x0) / (x1 - x0))));
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

const BASE = 900;

// the cap: paper left bare from the summit down, thinning along the flanks
const capLine = (x: number) =>
  Math.max(ridgeAt(x) + 46, 478 - Math.abs(x - 1592) * 0.44 + (fbm(x / 80, 4) - 0.5) * 40);

/* ------------------------------------------------------------------- marks */

type Bucket = { w: number; o: number; d: string };

/** the pen: one short stroke, batched by weight so the sheet is a few paths */
function makePen() {
  const buckets: Bucket[] = [
    { w: 0.75, o: 0.55, d: "" },
    { w: 1.15, o: 0.75, d: "" },
    { w: 1.7, o: 0.85, d: "" },
    { w: 2.4, o: 0.95, d: "" },
  ];
  let count = 0;
  return {
    stroke(x1: number, y1: number, x2: number, y2: number, w: number, o: number, bow = 2) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const c = (hash(x1 * 0.13 + y1 * 0.07, 3) - 0.5) * 2 * bow;
      const b = buckets[Math.min(3, Math.max(0, Math.round((w - 0.75) / 0.55)))];
      b.d += `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + (-dy / len) * c).toFixed(1)} ${(my + (dx / len) * c).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      b.o = Math.max(b.o, o);
      count++;
    },
    count: () => count,
    paths: () =>
      buckets
        .filter((b) => b.d)
        .map((b, i) => (
          <path
            key={`pen${i}`}
            d={b.d}
            fill="none"
            stroke={i === 3 ? INK_DEEP : INK}
            strokeWidth={b.w}
            opacity={b.o}
            strokeLinecap="round"
          />
        )),
  };
}

/** a cluster of marks: what makes the reference read as pen rather than hatching */
function scribble(
  pen: ReturnType<typeof makePen>,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  tone: number,
  seed: number,
) {
  const n = 2 + Math.floor(tone * 6 + hash(seed, 1) * 2);
  for (let i = 0; i < n; i++) {
    const a = angle + (hash(seed + i, 2) - 0.5) * (0.5 + tone * 0.9);
    const len = radius * (0.9 + hash(seed + i, 3) * 1.5);
    const ox = cx + (hash(seed + i, 4) - 0.5) * radius;
    const oy = cy + (hash(seed + i, 5) - 0.5) * radius;
    pen.stroke(
      ox,
      oy,
      ox + Math.cos(a) * len,
      oy + Math.sin(a) * len,
      0.7 + hash(seed + i, 6) * (1.1 + tone * 1.4),
      0.3 + tone * 0.62 + hash(seed + i, 7) * 0.12,
      2.6,
    );
  }
}

/* --------------------------------------------------------------- the massif */

/** how heavy the pen is at a point: shadow side, depth, and clumps of rock */
function toneAt(x: number, y: number): number {
  const top = ridgeAt(x);
  const d = Math.max(0, Math.min(1, (y - top) / Math.max(60, BASE - top)));
  const shadow = x < 1610 ? 1 : 0.45;
  const clump = fbm(x / 170, 21) * 0.55 + fbm(y / 130, 22) * 0.45;
  const edge = 0.35 + 0.5 * Math.exp(-Math.pow((x - 1610) / 900, 2) * -1);
  return Math.max(0, Math.min(1, (0.22 + clump * 0.9) * shadow * (0.55 + d * 0.85) * edge));
}

function Massif() {
  const pen = makePen();

  // the body: zones of stroke direction, denser and darker toward the base
  for (let i = 0; i < 5200; i++) {
    const x = 30 + hash(i, 31) * (W - 60);
    const top = ridgeAt(x);
    const cap = capLine(x);
    const y = top + hash(i, 32) * (BASE - top);
    if (y < cap + 12) continue; // the cap is bare paper
    const p = toneAt(x, y);
    if (hash(i, 33) > p * 0.85 + 0.08) continue;
    const d = (y - top) / Math.max(60, BASE - top);
    // direction: contour-high on the upper slopes, spilled downhill below
    const zone = d < 0.35 ? 0.16 : d < 0.7 ? 0.85 : 1.25;
    const a = zone + (hash(i, 34) - 0.5) * 0.55;
    scribble(pen, x, y, 5 + hash(i, 35) * 9, a, Math.min(1, p * 1.25), i * 7 + 11);
  }

  // contour hatching: long light strokes across the whole face, following the slope
  for (let i = 0; i < 2200; i++) {
    const x = 40 + hash(i, 91) * (W - 80);
    const top = ridgeAt(x);
    const y = top + 16 + hash(i, 92) * (BASE - top);
    if (y < capLine(x) + 14) continue;
    const p = toneAt(x, y);
    if (hash(i, 93) > 0.35 + p * 0.5) continue;
    const len = 14 + hash(i, 94) * 46;
    const a = 0.1 + (hash(i, 95) - 0.5) * 0.35;
    pen.stroke(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.45, 0.8 + hash(i, 96) * 0.8, 0.22 + p * 0.2, 2.2);
  }

  // rock steps: near-solid clusters where the face breaks
  for (let i = 0; i < 260; i++) {
    const x = 120 + hash(i, 41) * (W - 240);
    const top = ridgeAt(x);
    const y = top + 40 + hash(i, 42) * (BASE - top) * 0.8;
    if (y < capLine(x) + 30) continue;
    const p = toneAt(x, y);
    if (p < 0.45) continue;
    scribble(pen, x, y, 4 + p * 10, 1.1 + (hash(i, 43) - 0.5), 1, i * 13 + 5);
  }

  const marks = pen.paths();

  // the ridge: firm where the slope is steep, scarcely there across the crests
  const crest: JSX.Element[] = [];
  for (let x = 40; x < W - 40; x += 6) {
    const y0 = ridgeAt(x);
    const y1 = ridgeAt(x + 6);
    const slope = Math.abs(y1 - y0) / 6;
    const firm = Math.min(1, slope * 3.2);
    if (hash(x, 51) > 0.35 + firm * 0.75) continue;
    crest.push(
      <path
        key={`c${x}`}
        d={`M ${x} ${y0.toFixed(1)} Q ${x + 3} ${((y0 + y1) / 2 + (hash(x, 52) - 0.5) * 3).toFixed(1)} ${x + 6} ${y1.toFixed(1)}`}
        fill="none"
        stroke={INK_DEEP}
        strokeWidth={0.9 + firm * 1.8}
        opacity={0.35 + firm * 0.55}
        strokeLinecap="round"
      />,
    );
  }

  // the cap's lip: a short firm stroke, then the storm of marks underneath
  const lip: JSX.Element[] = [];
  for (let x = 980; x < 2080; x += 4) {
    if (hash(x, 61) < 0.5) continue;
    const y = capLine(x);
    lip.push(
      <path
        key={`l${x}`}
        d={`M ${x} ${y.toFixed(1)} l ${(4 + hash(x, 62) * 10).toFixed(1)} ${((hash(x, 63) - 0.5) * 4).toFixed(1)}`}
        fill="none"
        stroke={INK}
        strokeWidth={1 + hash(x, 64) * 1.4}
        opacity={0.4 + hash(x, 65) * 0.4}
        strokeLinecap="round"
      />,
    );
  }

  return (
    <g>
      {marks}
      {crest}
      {lip}
    </g>
  );
}

/* -------------------------------------------------------------- foreground */

/** a pine: trunk, then needles radiating from branch ends */
function Pine({ x, y, h, seed, tone }: { x: number; y: number; h: number; seed: number; tone: number }) {
  const pen = makePen();
  pen.stroke(x, y, x + (hash(seed, 1) - 0.5) * 5, y - h, 1.35, 0.82, 4);
  const tiers = 4 + Math.floor(hash(seed, 2) * 3);
  for (let t = 0; t < tiers; t++) {
    const ty = y - h * (0.3 + (t / tiers) * 0.66);
    const side = t % 2 === 0 ? 1 : -1;
    const spread = h * 0.34 * (1 - t / (tiers + 1));
    const tipX = x + side * spread;
    pen.stroke(x, ty, tipX, ty + (hash(seed + t, 4) - 0.5) * spread * 0.4, 1.1, 0.8, 2);
    const needles = 5 + Math.floor(hash(seed + t, 5) * 5);
    for (let k = 0; k < needles; k++) {
      const a = (side > 0 ? -1.1 : -1.9) + (k / needles) * 1.5 + (hash(seed + t * 9 + k, 6) - 0.5) * 0.4;
      const len = spread * (0.35 + hash(seed + k, 7) * 0.85);
      pen.stroke(tipX, ty, tipX + Math.cos(a) * len, ty + Math.sin(a) * len * (0.5 + hash(seed + k, 8) * 0.6), 0.8, 0.45 + tone * 0.3, 3);
    }
    // the foliage itself: a scribbled mass hung on the branch end
    scribble(pen, tipX, ty - spread * 0.1, spread * 0.55, side > 0 ? -0.7 : -2.4, tone, seed + t * 41);
  }
  return <g key={`pine${seed}`}>{pen.paths()}</g>;
}

function Foreground() {
  const pen = makePen();

  // bushes and low growth across the foot, heaviest at the corners
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, 71) * W;
    const edge = Math.min(1, Math.min(x, W - x) / 700);
    const height = 26 + edge * 96;
    const y = BASE - hash(i, 72) * height;
    const p = (0.22 + edge * 0.42) * (0.55 + hash(i, 73) * 0.65);
    if (hash(i, 74) > p) continue;
    scribble(pen, x, y, 6 + hash(i, 75) * 12, 1.4 + (hash(i, 76) - 0.5) * 0.9, Math.min(0.85, p + 0.1), i * 17 + 3);
  }

  const bushes = pen.paths();
  const pines: JSX.Element[] = [];
  const spots: P[] = [
    [96, 838, 150], [214, 862, 108], [356, 848, 84], [520, 872, 62],
    [1830, 856, 92], [1968, 838, 130], [2118, 866, 104], [2262, 848, 146],
  ];
  spots.forEach(([x, y, h], i) => pines.push(<Pine key={i} x={x} y={y} h={h} seed={900 + i * 37} tone={0.8} />));

  return (
    <g>
      {bushes}
      {pines}
    </g>
  );
}

/* ------------------------------------------------------------ far distance */

function Range({ y, amp, freq, seed, o }: { y: number; amp: number; freq: number; seed: number; o: number }) {
  const pen = makePen();
  for (let i = 0; i < 900; i++) {
    const x = hash(i, seed) * W;
    const top = y - amp * (0.3 + fbm(x / freq, seed, 3));
    if (hash(i, seed + 1) > 0.45) continue;
    const len = 8 + hash(i, seed + 2) * 22;
    scribble(pen, x, top + 4 + hash(i, seed + 3) * amp * 0.5, 3 + hash(i, seed + 4) * 5, 0.12, 0.4, i * 5 + seed);
  }
  // the crest itself, in pieces
  const crest: JSX.Element[] = [];
  for (let x = 20; x < W - 20; x += 7) {
    const y0 = y - amp * (0.3 + fbm(x / freq, seed, 3));
    const y1 = y - amp * (0.3 + fbm((x + 7) / freq, seed, 3));
    if (hash(x + seed, 81) > 0.55) continue;
    crest.push(
      <path
        key={`r${x}`}
        d={`M ${x} ${y0.toFixed(1)} L ${x + 7} ${y1.toFixed(1)}`}
        stroke={INK}
        strokeWidth={0.9 + hash(x, 82) * 1.1}
        opacity={o * (0.5 + hash(x, 83) * 0.6)}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <g opacity={o}>
      {pen.paths()}
      {crest}
    </g>
  );
}

function Scene() {
  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <Range y={452} amp={120} freq={430} seed={3} o={0.42} />
        <Range y={540} amp={160} freq={300} seed={9} o={0.55} />
        <Range y={640} amp={130} freq={210} seed={17} o={0.7} />
        <Massif />
        <Foreground />
      </svg>
    </AbsoluteFill>
  );
}

registerRoot(() => (
  <Composition id="denali" width={W} height={H} fps={30} durationInFrames={30} component={Scene} />
));

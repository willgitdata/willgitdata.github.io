/**
 * The river — a seamless ink loop, cut for the shallow band at the foot of
 * willgitdata.github.io and played back with its rate driven by scroll.
 *
 *   raea render art/river.tsx -o assets/ink/river.mp4 --kbps 650
 *
 * The canvas is a band (1600 x 170, about 9.4:1) so it fits the page's strip
 * without cropping. Every motion is periodic in the loop (240 frames), so the
 * last frame meets the first and the video loops without a seam.
 */
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "raea";

type Pt = [number, number];

const INK = "#2b46d6"; // royal blue
const INK_DEEP = "#1e33a8";
const PAPER = "#fcfcfa";

const W = 1600;
const H = 170;
const FPS = 30;
const LOOP = 240; // 8 seconds

function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const jitter = (seed: number, amp: number) => (rnd(seed) - 0.5) * 2 * amp;

function ridge(pts: Pt[], seed = 1, amp = 3): string {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1];
    const [x1, y1] = pts[k];
    d += ` Q ${((x0 + x1) / 2 + jitter(seed + k * 3.1, amp)).toFixed(1)} ${((y0 + y1) / 2 + jitter(seed + k * 7.7, amp)).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

const wrap = (x: number) => {
  const span = W + 260;
  let v = x % span;
  if (v < 0) v += span;
  return v - 130;
};

/** long water lines, drifting whole cycles per loop so the seam is invisible */
function flow(f: number, count: number, fromY: number, toY: number, seed: number, opacity: number) {
  const t = f / LOOP;
  return Array.from({ length: count }, (_, i) => {
    const s = seed + i * 7;
    const y = fromY + ((toY - fromY) * i) / Math.max(1, count - 1) + jitter(s, 5);
    const amp = 4 + rnd(s + 1) * 9;
    const lam = 130 + rnd(s + 2) * 220;
    const drift = (i % 3) + 1;
    const phase = t * Math.PI * 2 * drift * (i % 2 === 0 ? 1 : -1) + rnd(s + 3) * 6.28;
    const pts: Pt[] = [];
    for (let x = -40; x <= W + 40; x += 16) {
      pts.push([x, y + Math.sin(x / lam + phase) * amp + Math.sin(x / (lam * 0.34) - phase * 1.4) * amp * 0.45]);
    }
    return {
      d: ridge(pts, s, 1.5),
      o: opacity * (0.5 + rnd(s + 5) * 0.7),
      w: 1 + rnd(s + 6) * 1.6,
    };
  });
}

function River() {
  const f = useCurrentFrame();
  const t = f / LOOP;

  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {/* the far bank: a wash, a broken edge, grass and a leaning branch */}
        <path d={`M 0 0 L ${W} 0 L ${W} 16 Q ${W * 0.7} 24 ${W * 0.5} 16 Q ${W * 0.26} 8 0 18 Z`} fill={INK} opacity={0.07} stroke="none" />
        <path
          d={ridge(
            Array.from({ length: 30 }, (_, i) => [i * 56 - 20, 16 + Math.sin(i * 0.62) * 4 + jitter(i * 1.7, 2.2)] as Pt),
            71,
            2.2,
          )}
          fill="none"
          stroke={INK_DEEP}
          strokeWidth={2.6}
          opacity={0.6}
          strokeLinecap="round"
        />
        {Array.from({ length: 22 }, (_, i) => {
          const x = 10 + i * 74 + jitter(i * 2.1, 22);
          const h = 10 + rnd(i * 3.3) * 22;
          const bend = jitter(i * 4.7, 7);
          return (
            <path
              key={`grass${i}`}
              d={`M ${x.toFixed(1)} 18 q ${(bend * 0.4).toFixed(1)} ${(-h * 0.55).toFixed(1)} ${bend.toFixed(1)} ${(-h).toFixed(1)}`}
              fill="none"
              stroke={INK}
              strokeWidth={1.4}
              opacity={0.38}
              strokeLinecap="round"
            />
          );
        })}
        <path d="M 96 18 q 22 -12 46 -20 q 30 -8 56 -2" fill="none" stroke={INK_DEEP} strokeWidth={2.6} opacity={0.45} strokeLinecap="round" />
        <path d="M 132 8 q 12 -14 6 -24 M 154 2 q 14 -8 18 -20" fill="none" stroke={INK} strokeWidth={1.5} opacity={0.32} strokeLinecap="round" />

        {/* water, far side */}
        {flow(f, 4, 40, 84, 3, 0.42).map((l, i) => (
          <path key={`wA${i}`} d={l.d} fill="none" stroke={INK} strokeWidth={l.w} opacity={l.o} strokeLinecap="round" />
        ))}


        {/* water, near side */}
        {flow(f, 5, 96, 168, 61, 0.4).map((l, i) => (
          <path key={`wB${i}`} d={l.d} fill="none" stroke={INK} strokeWidth={l.w} opacity={l.o} strokeLinecap="round" />
        ))}
        {flow(f, 3, 60, 150, 129, 0.14).map((l, i) => (
          <path key={`wC${i}`} d={l.d} fill="none" stroke={INK_DEEP} strokeWidth={l.w * 0.7} opacity={l.o * 0.55} strokeLinecap="round" />
        ))}

        {/* stones on the bed */}
        {[
          [402, 166, 16],
          [992, 170, 12],
          [1272, 164, 9],
        ].map(([x, y, r], i) => (
          <path
            key={`stone${i}`}
            d={`M ${x - r} ${y} q ${r * 0.16} ${-r * 0.66} ${r * 0.86} ${-r * 0.6} q ${r * 0.72} ${r * 0.06} ${r * 0.62} ${r * 0.64} q ${-r * 0.86} ${r * 0.26} ${-r * 1.48} ${-r * 0.04} Z`}
            fill={INK}
            opacity={0.1}
            stroke={INK}
            strokeWidth={1.3}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
}

registerRoot(() => (
  <Composition id="river" width={W} height={H} fps={FPS} durationInFrames={LOOP} component={River} />
));

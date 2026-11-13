# Portfolio artwork

## Mountain of the day

`assets/js/mountain-of-the-day.js` chooses one of 30 mountains from the visitor's
local calendar date, in a continuous cycle anchored on 9 November 2026 (Denali).
It updates at local midnight and when a hidden tab becomes visible. Local date
fields with UTC arithmetic avoid daylight-saving changes skipping a mountain.
There is no server, scheduled build, runtime API, or library. The page loads
today's image and the approved Denali fallback, not the whole collection.

The other 29 drawings use the approved Denali source as their image-generation
style reference, with a subject-specific geographic brief for each mountain.
These are artistic interpretations, not exact topographic records. Unmodified
sources are retained in `assets/ink/mountains/sources/`; the delivery WebPs are
single royal-blue ink with transparent paper, padded (not cropped or stretched)
to the same 16:9 aspect ratio. Rebuild them with:

```sh
python3 art/prepare_denali.py --mountains
```

## Current Denali illustration

The hero uses `assets/ink/denali-sketch.webp` (2048×1152). It is a generated
ballpoint-style illustration, **not a physical hand drawing or a raea render**.
The previous procedural drawing was replaced because random texture did not
describe convincing mountain anatomy.

The visual brief was informed by a Denali National Park photograph of the
massif from Wonder Lake and the supplied blue-ballpoint sketch reference:

- Geographic reference: [Wonder Lake and Denali](https://commons.wikimedia.org/wiki/File:Wonder_Lake_and_Denali.jpg),
  Denali National Park and Preserve / NPS; public domain in the US, also listed
  under [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/).
- The image-generation editing endpoint could not download the references.
  The final image was generated from a written brief after inspecting them,
  not traced from the photograph. It is an artistic interpretation, not a
  topographically exact rendering.
- Brief: a broad asymmetrical double-summit Denali massif, interlocking rock
  buttresses, large bare-paper snowfields, descending glaciers, irregular fine
  crosshatching, royal-blue ink, and a plain paper background. No notebook,
  pagoda, decorative sun/birds, or lettering.

`assets/ink/denali-sketch-source.png` is the unmodified model output. Preserve
it. `art/prepare_denali.py` derives the delivery asset by converting luminance
to the opacity of a single royal-blue ink (`#2b46d6`), removing the incidental
paper tint and the model's spurious signature. The WebP encoding is lossless.
Regenerate the derived file from the repository root with:

```sh
python3 art/prepare_denali.py  # requires Pillow
```

The source PNG and the older `denali.tsx`, `denali.png`, and `denali.webp` are
retained, not overwritten. The current page does not claim the new sketch was
rendered by raea.

## Live blue-ink fluid study

The footer now uses `assets/js/river.js`, not a video or a translated image.
It solves the **2D incompressible Navier–Stokes velocity equations** in cell
units on a 240×40 staggered MAC grid: semi-Lagrangian advection, viscosity
`nu=0.012`, five alternating localized torque sources, and 32 Gauss–Seidel/SOR pressure-projection
sweeps per step. A small linear drag balances the forcing. Fixed 30Hz updates,
periodic left/right boundaries and solid outer top/bottom cells contain the
abstract flow. No banks, rocks or landscape are drawn. The pressure
solve is iterative, so incompressibility is approximate, checked numerically.

3,000 fading pen marks are advected by elapsed-time RK2 integration on every
display frame, independently of the fixed 30Hz pressure solve. Trail tails
interpolate between saved samples, avoiding duplicate frames and 30Hz cutoffs.
Longer trails reveal clockwise/counterclockwise swirls and connecting
flows. Torque is an external stirring force, not a replacement for velocity
advection and pressure projection. Fine strokes fade into the paper margins,
in `#2b46d6` on `#fcfcfa`, matching the mountain palette. Rendering is responsive,
capped at 2× pixel density, with a slim 6:1 aspect ratio below the contact copy.
Subpixel bends are omitted from drawn paths to reduce Canvas stroke joins.
The context requests `willReadFrequently: true` to favor CPU-backed rendering:
Firefox's visible accelerated canvas path can stall even when headless tests
and JavaScript draw timings look fast. Verify visible-window cadence too.
After 12 consecutive frames slower than 35fps, rendering drops to 1× density
for the rest of the page visit; physics, particle count and interaction stay
unchanged. Fast renderers retain Retina detail, without browser sniffing.
`fluid-study-poster.png` preserves the same abstract layout without JavaScript.
Moving the mouse across the canvas stirs the actual velocity field without
clicking. Timestamped pointer samples (including browser-coalesced events)
stir along the entire swept path, not just its endpoint, with bounded velocity.
The path is consumed before each physics step, with an extra pressure pass
after stirring. Leaving the canvas keeps the final stroke but breaks the next
connection; pausing clears input. Passive pointer events preserve touch scrolling.
Physics and pointer stirring pause offscreen, in hidden tabs, under reduced
motion, and with the Pause button.
Hovering or focusing that Pause button reveals a **Navier-Stokes params** panel
with four live controls, bounded to stable ranges: viscosity `0–0.05`,
pressure sweeps `8–64`, vortex force `0.2–2`, cursor stir `0.5–8`. They write
`fluid.params`, so viscosity changes the diffusion term, sweeps change the
projection iteration count, and force/stir scale the body force and cursor
impulse. Defaults are unchanged; the panel is CSS-only (`:hover`/`:focus-within`),
keyboard reachable by tabbing into the sliders, and hidden from axe when closed.
This is a stylized top-down 2D effect, **not** a calibrated 3D
free-surface river model, and it does not simulate waterfalls or surface height.

```sh
node tests/check_river.cjs      # projection, impermeable solids, real advection
node tests/check_river_motion.cjs # every-frame motion and fast cursor paths
RIVER_BROWSER=firefox node tests/check_river_motion.cjs # same checks in Firefox
node tests/check_river_performance.cjs # Chrome + Firefox real-time frame budget
RIVER_HEADED=1 node tests/check_river_performance.cjs # visible compositor path
node tests/check_portfolio.cjs # live pixel motion, pause, reduced motion, layout
```

Reference: Jos Stam, [Real-Time Fluid Dynamics for Games](https://graphics.cs.cmu.edu/nsp/course/15-464/Fall09/papers/StamFluidforGames.pdf).
The implementation uses staggered face velocities rather than his collocated
grid. It needs no runtime library, build, API, server computation or dependency.
All earlier sources, videos and artwork remain preserved.

## Archived animated river sketch

The previous footer used `river-sketch.mp4` and `river-sketch-poster.png`. The unmodified
`river-sketch-source.png` was image-generated using the approved Denali as the
style reference: fine blue-pen crosshatching, white-paper water highlights,
rocky banks and grasses, not photorealistic or painted water.

`art/animate_river.py` maps the source to the same royal-blue ink and warm-white
paper as the mountains. Two crossfaded drifting layers create a subtle current
inside a feathered water-channel mask; the banks stay still. This is local
image animation, not AI-generated video or a raea render. That version displayed
the full scene uncropped, capped at 900px wide, below the contact text.

```sh
python3 art/animate_river.py  # existing Pillow, NumPy and ffmpeg
```

The script asserts motion, stationary banks and exact source-loop closure.
Previous `river.mp4`, `river-flow.mp4`, posters and `art/river.tsx` remain intact.

## Preserved raea artwork

The previous mountain and the retained water loop were rendered with
[raea](https://raea.io), the Render Anything Engine: these compositions are
TypeScript/React files that draw frames on the GPU. Their rendered assets are
kept in the repository, so the site stays static on GitHub Pages.

| Source | Rendered to | Used by |
| --- | --- | --- |
| `denali.tsx` | `assets/ink/denali.png` → `denali.webp` (2400×900, alpha) | previous hero, retained as an archive |
| `river.tsx` | `assets/ink/river-flow.mp4` (1600×170, 8s loop) + `river-flow-poster.png` | previous footer line animation, retained with original `river.mp4` and poster |

## Re-rendering

```sh
# once
curl -fsSL https://raea.io/install | sh

# the mountain (a still, transparent so the page's graph paper shows through)
raea render art/denali.tsx -o assets/ink/denali.png --frame 0 --alpha
# the page loads a lossless WebP of it: same pixels, half the bytes
python3 -c "from PIL import Image; Image.open('assets/ink/denali.png').save('assets/ink/denali.webp','WEBP',lossless=True,method=6)"

# the river (a seamless 8s loop, sized for the band)
raea render art/river.tsx -o assets/ink/river-flow.mp4 --kbps 650
ffmpeg -i assets/ink/river-flow.mp4 -frames:v 1 assets/ink/river-flow-poster.png
```

The mountain is drawn the way a ballpoint sketch is drawn: one short stroke,
repeated. Clusters of them build the tone — sparse on the upper face, dense and
near-solid where the rock and the trees are heavy — and the snow cap is bare
paper with a drawn lip. The ridge comes from LingDong-'s {Shan, Shui}* (MIT)
approach of modelling the profile from noise rather than tracing an outline.
Strokes batch into a handful of paths by weight, so ~20k marks cost six paths.

Both compositions are deterministic — every hash is seeded from constants — so a
re-render reproduces the same drawing. The river's motion is periodic in the
240-frame loop, so the last frame meets the first.

The current river plays only while visible and the tab is active, and pauses
for reduced-motion preferences. It is in document flow, below the copy.
The archived line loop uses whole-cycle phase frequencies (the original 1.4
multiplier jumped at the seam); its source and both old videos are retained.

## Page checks

```sh
node tests/check_portfolio.cjs
# Optional WCAG 2.1 AA scan with a locally downloaded axe-core script:
AXE_PATH=/path/to/axe.min.js node tests/check_portfolio.cjs
```

The test needs Playwright and installed Google Chrome. It checks the actual
page in a local HTTP server, verifies links and preserved copy, measures ten
viewport widths, clicks mobile navigation, tests media and reduced motion,
and saves screenshots. `PLAYWRIGHT_MODULE` can point to an existing Playwright
installation; no production JS framework or build step is introduced.

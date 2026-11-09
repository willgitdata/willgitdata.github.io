# The ink artwork

The drawings on the front page are rendered with [raea](https://raea.io), the
Render Anything Engine: the compositions below are TypeScript/React files that
draw frames on the GPU, and the renders beside them are committed so the site
stays a static page on GitHub Pages.

| Source | Rendered to | Used by |
| --- | --- | --- |
| `denali.tsx` | `assets/ink/denali.png` → `denali.webp` (2400×900, alpha) | the hero, under the headline |
| `river.tsx` | `assets/ink/river.mp4` (1600×170, 8s loop) + `river-poster.png` | the band fixed at the foot of the page |

## Re-rendering

```sh
# once
curl -fsSL https://raea.io/install | sh

# the mountain (a still, transparent so the page's graph paper shows through)
raea render art/denali.tsx -o assets/ink/denali.png --frame 0 --alpha
# the page loads a lossless WebP of it: same pixels, half the bytes
python3 -c "from PIL import Image; Image.open('assets/ink/denali.png').save('assets/ink/denali.webp','WEBP',lossless=True,method=6)"

# the river (a seamless 8s loop, sized for the band)
raea render art/river.tsx -o assets/ink/river.mp4 --kbps 620
raea render art/river.tsx -o assets/ink/river-poster.png --frame 0
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

The page drives the river's `playbackRate` from scroll velocity in `index.html`,
which is why it runs faster the faster you scroll.

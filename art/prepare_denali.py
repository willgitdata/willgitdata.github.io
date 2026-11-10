"""Prepare the generated Denali sketch without changing the source artwork.

Requires Pillow. Run from the repository root:
    python3 art/prepare_denali.py

The original model output and the previous raea drawing are retained separately.
"""
from pathlib import Path
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/ink/denali-sketch-source.png"
OUTPUT = ROOT / "assets/ink/denali-sketch.webp"
INK = (43, 70, 214)


def prepare(source=SOURCE, output=OUTPUT):
    original = Image.open(source).convert("RGB")
    # Remove incidental paper tint; retain the source's fine stroke-density values.
    # A single ink color with variable alpha reads as blue pen on the page's paper.
    luminance = ImageOps.grayscale(original)
    alpha = luminance.point([
        round(255 * max(0, min(1, (245 - value) / 218)) ** 0.9)
        for value in range(256)
    ])
    if source == SOURCE or source.stem == 'eiger':
        # Incidental signatures confirmed in these sources; preserve raw files.
        width, height = original.size
        mask = Image.new("L", original.size, 255)
        if source == SOURCE:
            ImageDraw.Draw(mask).ellipse(
                (round(width * 0.91), round(height * 0.91), round(width * 0.95), round(height * 0.98)), fill=0
            )
        else:
            ImageDraw.Draw(mask).rounded_rectangle(
                (round(width * 0.91), round(height * 0.90), round(width * 0.965), round(height * 0.98)), radius=8, fill=0
            )
        alpha = ImageChops.multiply(alpha, mask.filter(ImageFilter.GaussianBlur(3)))
    result = Image.new("RGBA", original.size, INK + (0,))
    result.putalpha(alpha)
    # Match Denali's aspect ratio without stretching or cropping a summit.
    if source != SOURCE:
        result = ImageOps.pad(result, (1536, 864), color=INK + (0,))
    # The source is preserved at full resolution; delivery uses lossless WebP.
    result.save(output, "WEBP", lossless=True, method=6)
    print(f"Prepared {output.relative_to(ROOT)}: {result.width}×{result.height}, {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    if "--mountains" in sys.argv:
        for source in sorted((ROOT / "assets/ink/mountains/sources").glob("*.png")):
            prepare(source, source.parent.parent / (source.stem + ".webp"))
    else:
        prepare()

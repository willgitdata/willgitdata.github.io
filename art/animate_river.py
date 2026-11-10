"""Render the river's pen marks as a looping current; banks remain still.

Uses the existing Pillow/NumPy installation and ffmpeg. Run from the repo root:
    python3 art/animate_river.py
The generated source and every previous river version are preserved.
"""
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets/ink"
FPS, SECONDS = 30, 8
INK = np.array([43, 70, 214], dtype=np.float32)
PAPER = np.array([252, 252, 250], dtype=np.float32)


def scene():
    source = Image.open(ASSETS / "river-sketch-source.png").convert("RGB")
    gray = np.asarray(ImageOps.grayscale(source), dtype=np.float32)
    alpha = np.clip((245 - gray) / 218, 0, 1) ** 0.9
    pixels = PAPER + alpha[..., None] * (INK - PAPER)
    width, height = source.size
    mask = Image.new("L", source.size)
    # Stay inside the open channel, away from the boulders and vegetation.
    channel = [(0.420, 0.740), (0.505, 0.720), (0.560, 0.700), (0.640, 0.720),
               (0.665, 0.775), (0.650, 0.850), (0.540, 0.865), (0.425, 0.830)]
    ImageDraw.Draw(mask).polygon([(round(x * width), round(y * height)) for x, y in channel], fill=255)
    mask = np.asarray(mask.filter(ImageFilter.GaussianBlur(12)), dtype=np.float32) / 255
    return pixels, mask


def frame(pixels, mask, phase):
    height, width = mask.shape
    y, x = np.mgrid[:height, :width].astype(np.float32)
    depth = y / height

    def drift(progress):
        sx = np.clip(x - (4 + 10 * depth) * progress, 0, width - 1.001)
        sy = np.clip(y - (6 + 18 * depth) * progress, 0, height - 1.001)
        ix, iy = sx.astype(int), sy.astype(int)
        fx, fy = (sx - ix)[..., None], (sy - iy)[..., None]
        return ((pixels[iy, ix] * (1 - fx) + pixels[iy, ix + 1] * fx) * (1 - fy)
                + (pixels[iy + 1, ix] * (1 - fx) + pixels[iy + 1, ix + 1] * fx) * fy)

    # Each layer resets only while invisible: continuous downstream flow, no jump.
    phase %= 1
    weight = (1 - np.cos(2 * np.pi * phase)) / 2
    water = drift(phase) * weight + drift((phase + 0.5) % 1) * (1 - weight)
    return np.clip(pixels + (water - pixels) * mask[..., None], 0, 255).astype(np.uint8)


def render():
    pixels, mask = scene()
    first = frame(pixels, mask, 0)
    assert np.array_equal(first, frame(pixels, mask, 1)), "Loop seam must close exactly"
    later = frame(pixels, mask, 0.25)
    assert np.any(first != later), "The current must move"
    assert np.array_equal(first[mask == 0], later[mask == 0]), "Banks must stay still"
    Image.fromarray(first).save(ASSETS / "river-sketch-poster.png")
    height, width = mask.shape
    command = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{width}x{height}", "-r", str(FPS), "-i", "-", "-an",
               "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", str(ASSETS / "river-sketch.mp4")]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for index in range(FPS * SECONDS):
            process.stdin.write(frame(pixels, mask, index / (FPS * SECONDS)).tobytes())
    finally:
        process.stdin.close()
    if process.wait():
        raise RuntimeError("ffmpeg failed to encode the river")
    print(f"Rendered {width}×{height}, {SECONDS}s; moving water, stationary banks, exact source loop.")


if __name__ == "__main__":
    render()

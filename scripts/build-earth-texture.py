#!/usr/bin/env python3
"""Build the Earth textures for the orbital ("Where Is My Spaceship?") view.

At <=500 km altitude only a ~22deg-radius cap of the globe is ever visible, so instead
of texturing the whole sphere we slice the FULL-resolution (500m) NASA Blue Marble into
a grid of 45deg tiles and, at runtime, load only the handful of tiles under the current
sub-point. This keeps full 500m detail in view without wasting texture memory on the
far side.

Outputs:
  data/textures/earth-bmng-2048.jpg        -- full globe, low-res base (instant first paint)
  data/textures/earth-cap-c{col}-r{row}.jpg -- 8x4 grid of 45deg tiles, 10800x10800 each,
                                               full 500m res (col 0..7 W->E, row 0..3 N->S)

`build_half()` (two 16384 hemispheres) is kept below for reference / as an alternative
approach but is not built by default.

Sources (public-domain NASA Blue Marble Next Generation, June):
  - low-res from the single 21600x10800 composite
  - cap tiles from the eight 21600x21600 500m tiles (A1..D2), sliced 2x2 (no resampling)

Run from the repo root:  python scripts/build-earth-texture.py
Sources are cached in the scratch/temp dir, so re-runs are cheap.
"""
import os
import sys
import urllib.request

from PIL import Image

# 21600x10800 = 233 MP and 21600x21600 tiles = 466 MP each — past Pillow's guard.
Image.MAX_IMAGE_PIXELS = None

BASE = ("https://assets.science.nasa.gov/content/dam/science/esd/eo/images/"
        "bmng/bmng-base/june/")
SINGLE_URL = BASE + "world.200406.3x21600x10800.jpg"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "data", "textures")
CACHE_DIR = os.environ.get("TEMP", "/tmp")

HALF = 16384          # px per hemisphere texture (== browser MAX_TEXTURE_SIZE)
CELL = HALF // 2      # each 90x90 tile downscales to CELL x CELL

# The eight 500m tiles, columns A(-180..-90) B(-90..0) C(0..90) D(90..180),
# rows 1 (north, lat 0..90) and 2 (south, lat -90..0). (col, row) -> paste offset.
LEFT_TILES = {"A1": (0, 0), "B1": (CELL, 0), "A2": (0, CELL), "B2": (CELL, CELL)}
RIGHT_TILES = {"C1": (0, 0), "D1": (CELL, 0), "C2": (0, CELL), "D2": (CELL, CELL)}

# --- 45deg cap-tile grid (8 cols x 4 rows) ---
TILE_PX = 10800  # 45deg at 500m/px (a 90deg source tile is exactly 2x2 of these)
# Each 90deg source tile -> the (col,row) of its top-left 45deg cell in the 8x4 grid.
SOURCE_BLOCK = {
    "A1": (0, 0), "B1": (2, 0), "C1": (4, 0), "D1": (6, 0),
    "A2": (0, 2), "B2": (2, 2), "C2": (4, 2), "D2": (6, 2),
}


def download(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        print(f"  cached: {os.path.basename(path)} ({os.path.getsize(path)/1e6:.1f} MB)")
        return
    print(f"  downloading {os.path.basename(path)} ...")
    urllib.request.urlretrieve(url, path)
    print(f"    saved ({os.path.getsize(path)/1e6:.1f} MB)")


def build_low():
    src_path = os.path.join(CACHE_DIR, "world.200406.3x21600x10800.jpg")
    download(SINGLE_URL, src_path)
    out = os.path.join(OUT_DIR, "earth-bmng-2048.jpg")
    print("Building low-res 2048x1024 ...")
    img = Image.open(src_path).convert("RGB").resize((2048, 1024), Image.LANCZOS)
    img.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"  wrote {out} ({os.path.getsize(out)/1e6:.1f} MB)")


def build_half(name, tiles):
    out = os.path.join(OUT_DIR, f"earth-bmng-16384-{name}.jpg")
    print(f"Building hemisphere {name} ({HALF}x{HALF}) ...")
    canvas = Image.new("RGB", (HALF, HALF))
    for tile, (ox, oy) in tiles.items():
        tpath = os.path.join(CACHE_DIR, f"world.200406.3x21600x21600.{tile}.jpg")
        download(BASE + f"world.200406.3x21600x21600.{tile}.jpg", tpath)
        print(f"  scaling tile {tile} -> {CELL}x{CELL}")
        cell = Image.open(tpath).convert("RGB").resize((CELL, CELL), Image.LANCZOS)
        canvas.paste(cell, (ox, oy))
        cell.close()
    canvas.save(out, "JPEG", quality=92, optimize=True, progressive=True)
    print(f"  wrote {out} ({os.path.getsize(out)/1e6:.1f} MB)")


def build_cap_tiles():
    """Slice each 90deg source tile 2x2 into full-res 45deg cap tiles (no resampling)."""
    for tile, (bc, br) in SOURCE_BLOCK.items():
        tpath = os.path.join(CACHE_DIR, f"world.200406.3x21600x21600.{tile}.jpg")
        download(BASE + f"world.200406.3x21600x21600.{tile}.jpg", tpath)
        print(f"Slicing {tile} into four 45deg cap tiles ...")
        img = Image.open(tpath).convert("RGB")  # 21600 x 21600
        for dy in (0, 1):
            for dx in (0, 1):
                col, row = bc + dx, br + dy
                box = (dx * TILE_PX, dy * TILE_PX, (dx + 1) * TILE_PX, (dy + 1) * TILE_PX)
                out = os.path.join(OUT_DIR, f"earth-cap-c{col}-r{row}.jpg")
                img.crop(box).save(out, "JPEG", quality=90, optimize=True, progressive=True)
                print(f"  wrote {os.path.basename(out)} ({os.path.getsize(out)/1e6:.1f} MB)")
        img.close()


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        build_low()
        build_cap_tiles()
        # build_half("L", LEFT_TILES); build_half("R", RIGHT_TILES)  # kept as an alternative
    except Exception as exc:  # noqa: BLE001 - surface a clean message to the CLI
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    print("Done.")

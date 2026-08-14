#!/usr/bin/env python3
"""Fetch NASA's Black Marble (Earth at Night) and shrink it to the size Sun & Moon wants.

The night side of the sunrise-line pane works without this: the twilight caps drawn over the
Blue Marble already make a day/night picture, which is what that pane is about. What this adds
is CITY LIGHTS on the dark half, which is a different and better thing to look at — the
terminator stops being a shading boundary and becomes the edge of the lit world.

    python scripts/build-earth-night.py

Writes data/textures/earth-night-2048.jpg. The file is gitignored, exactly as the 500m cap
tiles are, because it is large and derived; game.js probes for it and simply does without it
when it is not there.

Source: NASA Earth Observatory, Earth at Night 2016 (public domain).
https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
"""

import os
import sys
import urllib.request

# The 13500x6750 "Black Marble" composite. Big, and downscaled immediately.
SRC = ("https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/"
       "BlackMarble_2016_01deg.jpg")
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "data", "textures")
OUT = os.path.join(OUT_DIR, "earth-night-2048.jpg")
SIZE = (2048, 1024)


def main():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow is needed: pip install pillow")

    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = OUT + ".download"
    print("fetching %s" % SRC)
    with urllib.request.urlopen(SRC) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            sys.stdout.write(".")
            sys.stdout.flush()
    print()

    # Pillow refuses very large images by default, on the grounds that they are usually a
    # decompression bomb. This one is a known 91 megapixel photograph of the earth.
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(tmp).convert("RGB")
    print("source %dx%d -> %dx%d" % (im.width, im.height, SIZE[0], SIZE[1]))
    im.resize(SIZE, Image.LANCZOS).save(OUT, quality=88, optimize=True)
    os.remove(tmp)
    print("wrote %s (%.1f MB)" % (OUT, os.path.getsize(OUT) / 1e6))


if __name__ == "__main__":
    main()

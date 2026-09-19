#!/usr/bin/env python3
"""
Recolor Capacitor's default Android icon/splash assets to MeowSynth's brand
palette (background #060607, accent #FF2F4E).

Run this AFTER `npx cap add android` (or `npx cap sync android`) has
(re)generated the default blue-on-white assets under
android/app/src/main/res/, and BEFORE building the APK.

Usage:
    python3 scripts/recolor_icons.py [path/to/android/app/src/main/res]

Defaults to android/app/src/main/res relative to the current directory.
"""

import glob
import os
import sys

from PIL import Image

BG = (0x06, 0x06, 0x07)       # #060607
ACCENT = (0xFF, 0x2F, 0x4E)   # #FF2F4E


def recolor_foreground(path):
    """Keep the shape's alpha channel, repaint the RGB to the accent color."""
    im = Image.open(path).convert("RGBA")
    r, g, b, a = im.split()
    solid = Image.new("RGBA", im.size, ACCENT + (255,))
    solid.putalpha(a)
    solid.save(path)


def recolor_legacy_icon(path, round_variant=False):
    """Composite the (already-recolored) foreground onto a solid background."""
    im = Image.open(path).convert("RGBA")
    out = Image.new("RGBA", im.size, BG + (255,))
    out.alpha_composite(im)
    if round_variant:
        mask = Image.new("L", im.size, 0)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(mask)
        draw.ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
        out.putalpha(mask)
    out.save(path)


def make_splash(foreground_path, splash_path):
    """Solid brand background, centered accent-colored glyph from the
    foreground's alpha bounding box, scaled to ~30% of the shorter side."""
    fg = Image.open(foreground_path).convert("RGBA")
    bbox = fg.split()[3].getbbox()
    if bbox is None:
        glyph = fg
    else:
        glyph = fg.crop(bbox)

    splash = Image.open(splash_path).convert("RGBA")
    w, h = splash.size
    target = int(min(w, h) * 0.30)
    gw, gh = glyph.size
    scale = target / max(gw, gh)
    glyph = glyph.resize((max(1, int(gw * scale)), max(1, int(gh * scale))), Image.LANCZOS)

    out = Image.new("RGBA", (w, h), BG + (255,))
    gx = (w - glyph.size[0]) // 2
    gy = (h - glyph.size[1]) // 2
    out.alpha_composite(glyph, (gx, gy))
    out.save(splash_path)


def main():
    res_dir = sys.argv[1] if len(sys.argv) > 1 else "android/app/src/main/res"
    if not os.path.isdir(res_dir):
        print(f"error: res dir not found: {res_dir}", file=sys.stderr)
        sys.exit(1)

    # 1) Foreground layers: recolor RGB, keep alpha (the actual shape).
    foregrounds = sorted(glob.glob(os.path.join(res_dir, "mipmap-*", "ic_launcher_foreground.png")))
    for f in foregrounds:
        recolor_foreground(f)
        print("recolored foreground:", f)

    # 2) Legacy combined icons: composite the recolored foreground onto
    #    a solid brand background (square + round-masked).
    for f in sorted(glob.glob(os.path.join(res_dir, "mipmap-*", "ic_launcher.png"))):
        recolor_legacy_icon(f, round_variant=False)
        print("recomposited icon:", f)
    for f in sorted(glob.glob(os.path.join(res_dir, "mipmap-*", "ic_launcher_round.png"))):
        recolor_legacy_icon(f, round_variant=True)
        print("recomposited round icon:", f)

    # 3) Splash screens: solid background + centered glyph. Use the
    #    largest available foreground as the glyph source.
    if foregrounds:
        glyph_source = max(foregrounds, key=lambda p: Image.open(p).size[0])
    else:
        glyph_source = None

    if glyph_source:
        for f in sorted(glob.glob(os.path.join(res_dir, "drawable*", "splash.png"))):
            make_splash(glyph_source, f)
            print("regenerated splash:", f)
    else:
        print("warning: no ic_launcher_foreground.png found, skipping splash regen", file=sys.stderr)

    # 4) Adaptive icon background color (mipmap-anydpi-v26 references this).
    bg_xml = os.path.join(res_dir, "values", "ic_launcher_background.xml")
    if os.path.isfile(bg_xml):
        with open(bg_xml, "w") as fh:
            fh.write(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                "<resources>\n"
                '    <color name="ic_launcher_background">#060607</color>\n'
                "</resources>\n"
            )
        print("wrote:", bg_xml)

    print("done.")


if __name__ == "__main__":
    main()

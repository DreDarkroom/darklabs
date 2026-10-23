#!/usr/bin/env python3
"""Build a spray-paint graffiti piece for a new word, using by-dredarkroom/ as the template.

    python3 graffiti/build_word.py            # writes graffiti/labdrop/tag.svg and tag.css

What is reused unchanged from the template: the paint layer stack (halo, shadow, halftone, outline, chrome, gap,
fill, shade, highlights), every filter and gradient, and the spray robot. What is rebuilt for the new word: the
letter strokes, the drips, the glints, the specks, the swoosh, and the robot's route and timing.

Each letter is one centre-line stroke (a "skeleton"); every paint layer just draws that stroke at a different width.
To add a letter, write a function like `glyph_o` below and add it to GLYPHS. Standard library only.
"""
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE_SVG = (HERE / "by-dredarkroom" / "tag.svg").read_text(encoding="utf-8")
TEMPLATE_CSS = (HERE / "by-dredarkroom" / "tag.css").read_text(encoding="utf-8")

H = 410            # canvas height (the template's)
BASE = 206         # baseline of the lettering
CAP = 66           # top of capitals
ASC = 62           # top of ascenders (b, d, h ...)
XH = 98            # top of lower-case bodies
SKEW = 0.1405      # tan(8 deg): the whole word is sheared by skewX(-8)
GAP = 56           # space between neighbouring skeletons (the paint is ~44 wide, so letters just kiss)
PER_LETTER = 0.165  # seconds the robot spends on each letter (matches the template)


def f(*nums):
    return " ".join(("%.1f" % n) for n in nums)


# --- glyphs: (path_d, width, drip_x or None, drip_length) for a skeleton starting at x ------------------------------
def bowl(x):
    """The round part shared by a b and a p: opens onto a stem at its left."""
    return ("M %s C %s %s %s C %s %s %s C %s %s %s" % (
        f(x, 140), f(x + 6, 112), f(x + 22, 98), f(x + 32, 98),
        f(x + 48, 98), f(x + 56, 124), f(x + 56, 152),
        f(x + 56, 182), f(x + 46, 206), f(x + 28, 206)) +
        " C %s %s %s" % (f(x + 12, 206), f(x + 2, 190), f(x, 176)))


def glyph_L(x):
    return ("M %s L %s L %s" % (f(x, CAP), f(x, BASE), f(x + 62, BASE)), 62, x, 92)


def glyph_a(x):
    d = ("M %s L %s M %s C %s %s %s C %s %s %s C %s %s %s" % (
        f(x + 56, 100), f(x + 56, BASE), f(x + 56, 140),
        f(x + 50, 112), f(x + 34, 98), f(x + 24, 98),
        f(x + 8, 98), f(x, 124), f(x, 152),
        f(x, 182), f(x + 10, 206), f(x + 28, 206)) +
        " C %s %s %s" % (f(x + 44, 206), f(x + 54, 190), f(x + 56, 176)))
    return d, 56, x + 56, 44


def glyph_b(x):
    return "M %s L %s %s" % (f(x, ASC), f(x, BASE), bowl(x)), 56, x, 66


def glyph_D(x):
    d = ("M %s L %s M %s C %s %s %s C %s %s %s" % (
        f(x, CAP), f(x, BASE), f(x, CAP),
        f(x + 72, 62), f(x + 84, 100), f(x + 84, 136),
        f(x + 84, 172), f(x + 68, 206), f(x, 206)))
    return d, 84, x, 118


def glyph_r(x):
    d = "M %s L %s M %s C %s %s %s" % (f(x, 100), f(x, BASE), f(x, 146), f(x + 4, 112), f(x + 28, 98), f(x + 48, 108))
    return d, 48, x, 52


def glyph_o(x):
    d = ("M %s C %s %s %s C %s %s %s C %s %s %s C %s %s %s" % (
        f(x + 32, 98), f(x + 10, 98), f(x, 124), f(x, 152),
        f(x, 182), f(x + 12, 206), f(x + 32, 206),
        f(x + 54, 206), f(x + 64, 182), f(x + 64, 152),
        f(x + 64, 124), f(x + 54, 98), f(x + 32, 98)))
    return d, 64, x + 32, 84


def glyph_p(x):
    """A p: the stem drops below the baseline, so its drip starts lower down (see DRIP_FROM)."""
    return "M %s L %s %s" % (f(x, 100), f(x, 262), bowl(x)), 56, x, 48


GLYPHS = {"L": glyph_L, "a": glyph_a, "b": glyph_b, "D": glyph_D, "r": glyph_r, "o": glyph_o, "p": glyph_p}


# --- build ------------------------------------------------------------------------------------------------------------
def build(word, out_dir):
    out_dir.mkdir(exist_ok=True)
    n = len(word)
    glyphs = [GLYPHS[c] for c in word]
    total = sum(g(0)[1] for g in glyphs) + GAP * (n - 1)
    width = int(round(total + 160))                       # canvas width: the word plus room for the robot's exit
    start = (width - total) / 2 + SKEW * 150              # centre the word *after* the shear moves it left
    x = start
    paths, drips, centres, tops = [], [], [], []
    for i, g in enumerate(glyphs):
        d, w, dx, dlen = g(x)
        paths.append('<path id="p%d" pathLength="1" d="%s"/>' % (i, d))
        centres.append(x + w / 2)
        tops.append((x + w / 2, ASC if word[i] in "bdhkl" else (CAP if word[i].isupper() else XH)))
        y0 = 264 if word[i] == "p" else 208               # a p's stem is in the way of a drip from the baseline
        drips.append((dx, y0, dlen))
        x += w + GAP
    end = x - GAP

    defs = "".join(paths)
    d_defs = "".join(
        '<g id="d%d" style="--len:%d"><ellipse cx="%.1f" cy="%d" rx="6.5" ry="1.4"/>'
        '<path class="stem" pathLength="1" fill="none" d="M%.1f %d L%.1f %d"/>'
        '<circle class="bulb" cx="%.1f" cy="%d" r="4.2"/></g>' % (k, ln, dx, y0, dx, y0, dx, y0 + ln, dx, y0 + ln)
        for k, (dx, y0, ln) in enumerate(drips))
    h_defs = "".join(
        '<g id="h%d" style="--len:%d"><path class="stem" pathLength="1" fill="none" d="M%.1f %d L%.1f %d"/>'
        '<circle class="bulb" cx="%.1f" cy="%.1f" r="1.3"/></g>' % (
            k, ln, dx - 2.4, y0 + 4, dx - 2.4, y0 + ln - 2, dx - 2.6, y0 + ln + 0.5 - 2)
        for k, (dx, y0, ln) in enumerate(drips))

    s = TEMPLATE_SVG
    # the small "by" is not part of this word
    s = re.sub(r'<g class="(?:chrome by-ring|fill by-fill)"[^>]*>(?:<use[^>]*/>)+</g>\n?', "", s)
    # drop the old lettering and drips from <defs>, put the new ones in
    s = re.sub(r'<path id="p\d+" pathLength="1" d="[^"]*"/>', "", s)
    s = re.sub(r'<g id="[dh]\d+"[^>]*>.*?</g>', "", s, flags=re.S)
    marker = "<!-- the lettering and drips are defined once and reused by every paint layer -->"
    s = s.replace(marker, marker + "\n" + defs + "\n" + d_defs + h_defs)

    # every paint layer: redraw the whole new word / all the new drips, keeping each layer's own class
    def letters(m):
        cls = re.search(r'class="([^"]*)"', m.group(1)).group(1)
        attr = "i" if cls.startswith("l") else "k"
        return "".join('<use href="#p%d" class="%s" style="--%s:%d"/>' % (i, cls, attr, i) for i in range(n))
    s = re.sub(r'((?:<use href="#p\d+"[^>]*/>)+)', letters, s)

    def runs(m):
        kind = re.search(r'href="#([dh])', m.group(1)).group(1)
        return "".join('<use href="#%s%d" class="dr" style="--k:%d"/>' % (kind, k, k) for k in range(len(drips)))
    s = re.sub(r'((?:<use href="#[dh]\d+"[^>]*/>)+)', runs, s)

    s = s.replace('viewBox="0 0 1400 410"', 'viewBox="0 0 %d %d"' % (width, H))
    s = s.replace("by DreDarkroom, sprayed on the wall by a small robot", "%s, sprayed on the wall by a small robot" % word)
    s = re.sub(r'(<linearGradient id="g-fill"[^>]*?) x1="[\d.]+" y1="52" x2="[\d.]+" y2="250"',
               lambda m: '%s x1="%.1f" y1="52" x2="%.1f" y2="250"' % (m.group(1), start, end + 40), s)
    s = s.replace('width="1400" height="260"', 'width="%d" height="260"' % width)
    s = s.replace('width="1400" height="410"', 'width="%d" height="%d"' % (width, H))

    # specks of overspray, spread along the word and timed to land when the robot passes
    rnd = random.Random(7)
    span = n * PER_LETTER
    cols = ["#e0262b", "#8b3dff", "#ff6a8a", "#cfd3df", "#ffffff"]
    specks = []
    for _ in range(90):
        sx = rnd.uniform(start - 25, end + 30)
        specks.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" style="--d:%.2f"/>' % (
            sx, rnd.uniform(44, 262), rnd.choice([0.8, 1.0, 1.3, 1.7, 2.3, 3.0]), rnd.choice(cols),
            0.3 + (sx - start) / (end - start) * span + rnd.uniform(0, 0.25)))
    s = re.sub(r'<g class="specks">.*?</g>', '<g class="specks">' + "".join(specks) + "</g>", s, flags=re.S)

    # glints on the tops of the letters
    sizes = [24, 20, 15, 18, 14, 16, 17]
    sparks = []
    for k, (gx, gy) in enumerate(tops):
        z = sizes[k % len(sizes)]; e = z * 0.2
        sparks.append('<g transform="translate(%.1f %.1f)"><path class="spark" style="--k:%d" '
                      'd="M0 -%d L%.1f -%.1f L%d 0 L%.1f %.1f L0 %d L-%.1f %.1f L-%d 0 L-%.1f -%.1f Z" '
                      'fill="#fff" stroke="#cfd3df" stroke-width="1.4"/></g>' % (
                          gx, gy + 4, k, z, e, e, z, e, e, z, e, e, z, e, e))
    s = re.sub(r'(<g transform="skewX\(-8\)" class="glints">).*?</g></g>\n',
               lambda m: m.group(1) + "".join(sparks) + "</g>\n", s, flags=re.S)

    # the underline swoosh
    a, b = start - 56, end + 50
    L = b - a
    s = s.replace('d="M44 346 C404 322 940.3 372 1350.3 336"',
                  'd="M%.1f 346 C%.1f 322 %.1f 372 %.1f 336"' % (a, a + .276 * L, a + .686 * L, b))
    s = s.replace('d="M50 342 C410 318 946.3 368 1344.3 332"',
                  'd="M%.1f 342 C%.1f 318 %.1f 368 %.1f 332"' % (a + 6, a + .276 * L + 6, a + .686 * L + 6, b - 6))
    (out_dir / "tag.svg").write_text(s, encoding="utf-8")

    # ---- timing and the robot's route (CSS) ---------------------------------------------------------------------------
    t0, t_last = 0.30, 0.30 + (n - 1) * PER_LETTER
    pause = t_last + 0.30
    total_t = pause + 0.65
    drip_base = 0.22 + n * PER_LETTER + 0.315
    pct = lambda t: "%.2f%%" % (t / total_t * 100)
    frames = ["  0% { transform: translate(-240px, 130px); opacity: 0; }",
              "  %s { opacity: 1; }" % pct(0.06)]
    for i, cx in enumerate(centres):
        frames.append("  %s { transform: translate(%.1fpx, %dpx); opacity: 1; }" % (pct(t0 + i * PER_LETTER), cx - 22, 142 if i % 2 == 0 else 164))
    frames.append("  %s { transform: translate(%.1fpx, 146px); opacity: 1; }" % (pct(pause), centres[-1] - 10))
    frames.append("  100%% { transform: translate(%dpx, 70px); opacity: 0; }" % (width + 220))
    c = TEMPLATE_CSS
    c = re.sub(r"@keyframes g-bot \{.*?\n\}", "@keyframes g-bot {\n" + "\n".join(frames) + "\n}", c, flags=re.S)
    c = c.replace("g-bot 3.23s linear both", "g-bot %.2fs linear both" % total_t)
    c = c.replace("2.6799999999999997s", "%.2fs" % drip_base)
    c = c.replace("2.6299999999999994s", "%.2fs" % (drip_base - 0.05))
    c = c.replace("2.9799999999999995s", "%.2fs" % (drip_base + 0.30))
    c = c.replace("g-wob .16s ease-in-out 14 alternate", "g-wob .16s ease-in-out %d alternate" % -(-int((t_last - t0 + 0.3) * 100) // 16))
    c = c.replace("g-puff .24s ease-out 9 both", "g-puff .24s ease-out %d both" % -(-int((t_last - t0 + 0.3) * 100) // 24))
    c = c.replace("g-flick .14s ease-in-out 23 alternate", "g-flick .14s ease-in-out %d alternate" % -(-int(total_t * 100) // 14))
    c = c.replace("the finished piece \"by DreDarkroom\". Moved here from the HD Labs\n   site so the artwork is its own project.",
                  "the finished piece \"%s\". Built by graffiti/build_word.py\n   from the by-dredarkroom template." % word)
    (out_dir / "tag.css").write_text(c, encoding="utf-8")
    gloss_ms = int((drip_base + 1.3 + 0.15 * (len(drips) - 1) + 0.4) * 1000)
    print("%s: canvas %dx%d, %d letters, %d drips, robot %.2fs, gloss after %d ms" % (word, width, H, n, len(drips), total_t, gloss_ms))
    return gloss_ms


if __name__ == "__main__":
    build("LabDrop", HERE / "labdrop")

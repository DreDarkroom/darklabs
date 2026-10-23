# Graffiti

Animated spray-paint lettering in plain SVG and CSS. A small robot flies in, paints a word on a wall
stroke by stroke, drips run, and the paint dries with a wet gloss. No libraries, no build step to view it.

| Piece | Page |
|---|---|
| **LabDrop** | [`labdrop/`](labdrop/index.html) |
| **by DreDarkroom** (the original) | [`by-dredarkroom/`](by-dredarkroom/index.html) |

The original piece was moved here from the HD Labs site so the artwork is its own project.

## How a piece works

Each piece folder has `tag.svg` (the artwork) and `tag.css` (the animation), and its page loads them with
`../graffiti.js`.

- **Each letter is one centre-line stroke.** Every paint layer (halo, shadow, halftone, outline, chrome, fill, shade,
  highlights) draws the *same* strokes at a different width and colour. They are defined once in `<defs>` and reused
  with `<use>`.
- **Drips** are a flare, a runnel and a bulb, merged by a gooey SVG filter so they flow like liquid.
- **The finished piece is the base CSS.** It is completely static. The animation (`.is-spraying`) only plays the
  build-up once, then `.is-finished` adds a one-off wet gloss. Reduced motion never starts the animation.
- `graffiti.js` fetches the CSS and SVG, injects the SVG into `#stage`, and has a Replay button.

## Make a new word

`build_word.py` rebuilds everything that depends on the letters (strokes, drips, glints, specks, swoosh, the robot's
route and all timings) from the `by-dredarkroom` template.

```bash
python3 graffiti/build_word.py     # rebuilds graffiti/labdrop/tag.svg and tag.css
```

To add a letter, write a function like `glyph_o` in `build_word.py` and add it to `GLYPHS`. Available now:
`L a b D r o p`. To make another word, call `build("YourWord", HERE / "folder")` and copy a piece's `index.html`.

Notes: viewing needs a web server (`python3 -m http.server`) because the page uses `fetch`. Put one piece per page,
since the SVGs share element ids.

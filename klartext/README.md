# KlartextKit

A small, modular toolkit for learning the German that gamers use: strategy chat (C&C: Rivals and similar), VR team-shooter callouts (Hyper Dash // Hero Drop and similar), and heist talk (a nod to open-world crime games like GTA 5 and the sequel everyone is waiting for). Plain static files, no framework, no build step, no account, nothing uploaded.

Live at <https://dredarkroom.github.io/darklabs/klartext/>. Open it in the Meta Quest Browser and it switches to a big-button VR layout by itself.

## What is in it

| Tool | What it does |
|---|---|
| **Funk** (callouts) | 150+ phrases as big colour-coded buttons. Tap to hear the German (the device's own speech voice). Star favourites. |
| **Karten** (flashcards) | Spaced repetition (Leitner boxes). Keys: Space show, 1/2/3 rate, S say it. |
| **Quiz** | Ten questions, four ways: read, pick the German, listen, type. No timer. |
| **Szenen** | A teammate says something; pick the reply that fits; the page says why. |
| **Lexikon** | Search phrases, words (with der/die/das and plurals) and ten short grammar rules. |
| **Bauen** | Snap a callout together from parts (and see where / where-to grammar), and a conjugator that turns English game verbs into German (pushen → ich pushe, du pushst, ich habe gepusht). |
| **Spiele** | The three kinds of talk, with honest notes and disclaimers. |
| **Zeit** | Countdowns that call out in German (Zehn Sekunden… Drei, Zwei, Eins, Zeit ist um!) and a stopwatch. |
| **Los** | Coin, dice, name picker, team splitter (unbiased crypto randomness). |
| **Pause** | A VR break guard: calm at first, unmissable when it is time; keeps the screen awake. |
| **Notiz** | A notepad that stays on the device. |
| **Bruchlabor** | The stress lab (below). |
| **VR-Raum** | Experimental: flashcards on a big panel in an immersive headset session. |
| **Info** | Settings, backup and restore, what the device supports, corrections. |

## Honest status

- **The German is AI-written and not yet checked by a native speaker.** Every phrase is original (nothing copied from any game or chat). Entries get `ok: true` only after a native speaker confirms them. Corrections can be sent from the Info page, or edit `data/phrases.js`.
- Tested: pure logic and content (`tests/klartext.test.mjs`, run with `node --test tests/klartext.test.mjs`), every module opened and used in a browser, the twelve stress loads, the crash-recovery path, the VR panel hit-testing in a desktop preview, and layouts at phone size and at the Quest Browser's default 1280×670 panel (with a Quest user-agent).
- **Not tested:** a real headset session (the VR Room's immersive mode), a real Quest, a real German voice (the test machine had none), iOS Safari, or real-device frame rates. The stress lab's numbers are only meaningful on the device you care about.

## How it is built (and why it stays light)

```
index.html          the page, the icon sprite, nothing else
kk.css              one stylesheet, ~17 KB, no web fonts
brand.json          white-label settings (see below)
core/               the shell and small services; this is all the first page runs
  app.js            header, home, hash routing (#/comms?game=rts), lazy-loads a module on demand
  registry.js       the list of tools. Add a tool = one line here + one file in modules/
  attend.js         the attention system (below)      vr.js      Quest detection and layout
  perf.js           frame meter and live readout      srs.js     spaced repetition
  store.js          safe, namespaced localStorage     tts.js     speech
  brand.js color.js progress.js prefs.js select.js german.js dom.js
data/               cats.js (small, always loaded); phrases.js terms.js grammar.js scenes.js build.js (loaded only by the tools that need them)
modules/            one file per tool, each `export default { mount(root, ctx) { …; return cleanup } }`
```

- First page: about 60 KB uncompressed, about 21 KB gzipped (HTML + CSS + core). Each tool loads only when opened (dynamic `import()`), so a phone never pays for tools it does not use. A test fails if the first load passes 70 KB or any tool passes 30 KB.
- No third-party code at runtime. The VR Room uses three.js (MIT), already vendored in `../chunguscello/vendor/`, and only loads it when you open the room. Nothing is fetched from another site; the only thing the kit ever sends is the correction text you choose to send from Info.
- Works offline once opened (`sw.js`: network first, cache fallback; each tool cached the first time it is used).

### Adding a tool

1. Create `modules/mytool.js`: `export default { mount(root, ctx) { …; return () => cleanup; } }`. `ctx` carries `store`, `tts`, `attend`, `vr`, `progress`, `params` (from the hash), `go(id, params)` and `say(msg)` (screen-reader announcement). Use `put(el, …)` / `fill(el, …)` from `core/dom.js` to add children (they skip `null`; the native `append` would print the word "null").
2. Add a line to `core/registry.js`.
3. `node --test tests/klartext.test.mjs` checks it exists, has a valid colour/shape, parses, and stays under its size budget.

### White-labelling

Edit `brand.json` (no code changes). Missing or wrong-typed values are ignored, so a bad file cannot break the app:

```json
{ "name": "Clan Coach", "tagline": "Talk like the team", "logo": "my-logo.png", "accent": "#00b7ff",
  "modules": ["comms", "cards", "timers"], "footer": "Made for the Clan", "credit": false, "feedbackUrl": "" }
```

`modules` picks and orders the tools. `feedbackUrl` is where corrections go (a public ntfy topic by default; set `""` or `"feedback": false` to switch the box off). `logo` must be a local file in this folder. For different content, replace the files in `data/` (the shapes are documented at the top of each). The MIT licence only asks that the licence text stays with the code.

## Design decisions, with sources

**Colour is never the only signal.** Seven categories, each with its own colour, its own shape and its own word (attack ▲ red, defend ■ blue, spot ◉ yellow, help ✚ green, build ⬢ orange, chat ★ purple, heist ◆ teal). Text on every colour is chosen by contrast maths (black or white, whichever is higher) and tested to 4.5:1. ([WCAG 1.4.1, Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html))

**VR layout.** Meta's guidance for browser panels and pointer input: hit targets at least 48 dp, and 60×60 px for primary controls so they work with hand tracking; web content panels resize between 500 and 2000 px wide (default 1280×670); the centre of the view is the easiest place to hit. So: controls are 60 px and up (76 px in VR mode), pure black background (kind to OLED), no hover-only controls, and on a short panel the explanations hide so the first row of buttons is visible without scrolling. ([Meta: browser specs](https://developers.meta.com/vr/documentation/web/browser-specs/), [Meta: eyes best practices](https://developers.meta.com/horizon/design/eyes-best-practices/), [Meta: panel sizing](https://developers.meta.com/horizon/essentials/horizon-os-panel-sizing/)). Features are tested at the moment they are needed, never guessed from the user-agent (Meta says the same); the user-agent is only used to pick the default layout.

**Motion: still until something needs you, then loud on purpose.** Three levels the user chooses: **Off** (nothing moves; state shown by colour, shape and words), **Gentle** (one short glow), **Wild** (edge glow, shake, confetti, loud alarms). It starts on Off when the device asks for reduced motion. Nothing flashes more than about twice a second at any level. Calm-by-default matters for people with ADHD, vestibular problems or migraine; alarms (a timer finished, a break is due) are exactly when attention is wanted, so those are the moments that get the strongest cue. ([WCAG 2.3.3, Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [web.dev: motion](https://web.dev/learn/accessibility/motion))

**Learning design.** No timers on quizzes, nothing auto-advances, a miss is shown as information (the card comes back sooner), rude phrases are marked "understand it, do not say it" and there are no slurs in the list. German UI with English beside it.

**Performance.** One frame loop only while something needs it; one interval only while a timer runs; events delegated on parents; long lists use `content-visibility: auto`; nothing is rendered that is not on the current tool; the readout and the lab use the browser's own Long Animation Frames and Long Tasks observers where they exist (Chromium-based browsers; the Quest Browser is Chromium-based, but I have not confirmed which of these it exposes, and elsewhere those counters just show 0). ([Chrome: Long Animation Frames API](https://developer.chrome.com/articles/long-animation-frames))

## The stress lab (Bruchlabor)

Twelve load generators that really slow pages and headsets down: DOM nodes, CSS animations, layout-heavy animations, 2D canvas particles, canvas fill-rate, WebGL points, JavaScript work, audio voices (silent), memory, event floods, storage writes, forced layout. Each ramps up in steps (about ×1.5); after every step the live frame rate decides: still smooth, or broken (below your line of 30/45/60/72 fps, or a frame over 700 ms, or nearly no frames at all). The last smooth step is the **limit**; 60% of it is the suggested **budget**.

- **Crashes are recorded.** Before every step a marker is saved. If the tab freezes or dies and you close it, the marker is still there next time and the run is logged as "ended abruptly" with the exact level. *Danger mode* removes the upper limits on purpose.
- **Results** persist, with the device details, and export as JSON, so two devices can be compared.
- **"Das Kit selbst wiegen"** loads every tool silently and shows its size, load time, build time and DOM nodes: the list to read when deciding what to strip back. First readings: the Lexikon (~1,950 nodes) and Funk (~1,130 nodes) are the heaviest to build; everything else is under 200 nodes.
- A hidden or software-rendered browser reports meaningless frame rates. Measure on the real device.

## Provenance and licences

Code: MIT (repo licence). Text and phrases: written for this kit by an AI assistant (Claude), then tested; not yet native-checked. The logo is DreDarkroom's own. three.js (VR Room only): MIT, see `../chunguscello/vendor/THREE-LICENSE.txt`. No images, fonts, sounds or data from any game. C&C, Command & Conquer, Rivals, Hyper Dash, Hero Drop, GTA and Grand Theft Auto belong to their owners; this kit is not made, endorsed or approved by their owners, and links only to official pages.

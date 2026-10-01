# GlowGrain

A sunlit felt piano that blooms into the rest of the room. Part of Dre Darklabs.
Live at **dredarkroom.github.io/darklabs/glowgrain/**.

Static files, no samples, no frameworks, no build step, **no AudioWorklet**. Needs `https://` or
`http://localhost`.

## The idea

Open it and you have one soft felt piano. Turn **Bloom** up and the instrument wakes layer by layer:
a drifting pad, a warm bass, a marimba figure, light hand percussion, a voice, and finally a
self-playing piano figure that mutates slowly, the way a minimalist piece does. Every layer can be
pinned on or muted. You play over the top with touch, mouse, computer keys or a MIDI keyboard.

## How it sounds (all synthesised)

- `js/dsp.js` bakes notes into buffers the first time a pitch is used (~20-60 ms each, in the
  background after start). **Felt piano**: ~14-30 stretched partials, each a pair of detuned strings
  with a two-stage decay, a felt-hammer rolloff, a strike-point comb, a thump and a puff of noise.
  **Marimba**: modes at 1 : 4 : 10 plus a resonator tube. Hand percussion: shaker, wood tick, conga.
  Brightness follows velocity through a lowpass at play time (soft touch = muffled felt).
- `js/engine.js`: native-node voices with per-instrument voice caps and quietest-released-first
  stealing. Pad = triangle + detuned saw into a breathing lowpass and a two-line chorus. Bass = sine +
  triangle + sub. Voice = detuned saws into three shared formant bands (paraphonic), with one shared
  drifting vibrato. Buses feed a procedural-IR reverb and a ping-pong echo, then **tape** (saturation,
  tone, a whisper of wow/flutter), a soft clip and a glue compressor.
- Everything is native Web Audio nodes, so the same graph renders offline for export.

## Playing (and getting started)

- **Guide** (on by default): the keys that fit the current chord glow, everything else dims, the key is
  locked, and a coach line says what to do next. Four beat dots pulse with the groove (1 = the big one).
- **Pads**: eight big pads (root / 3rd / 5th / 7th, then the same up an octave) that only ever play
  notes of the current chord, so nothing can sound wrong. Made for tapping rhythms like on a kit.
- **Beat snap**: nudges a hit that's a hair early (< 45 ms) onto the 16th grid, and tightens everything
  recorded in a loop onto the grid. Never delays a hit by a whole step.
- **Sustain** affects piano and marimba only, caps held notes, replaces a re-struck pitch, and lets go
  by itself at each new chord when Guide is on.
- A "How to play" panel opens on first visit.


- Touch/mouse: slide across keys for glissando; press lower on a key to play louder.
- Computer keys: `A`..`'` (white and black rows), `Z`/`X` octave, `Space` sustain.
- Web MIDI (Chrome/Edge/Android; not Safari): notes + velocity, CC64 sustain, CC1 mod wheel = Bloom,
  CC123 all-notes-off. SysEx is never requested.
- **Harmony** (octave / triad in key / open voicing) and **Key lock** make single fingers sound good.
- **Loop**: one button (record -> play -> overdub), 2/4/8 bars, undo/clear. Loops store note events,
  so they are tempo-exact and cost nothing in memory.
- **Record take** -> **Save WAV** (offline render of everything that sounded, 16-bit dithered, reverb
  tail included) or **Save MIDI**.

## Files

`index.html`, `style.css`, `js/` (ES modules: `app` UI + wiring, `engine` samples/graph/voices,
`conductor` transport + Bloom ensemble + loop station, `dsp` pure sound generation, `theory`,
`visuals`, `midi`, `export`, `wav`), `sw.js` + `manifest.webmanifest` (offline install), `icon.svg`.

Reused ideas from other Darklabs instruments (copied, not imported, so each app deploys alone):
the Worker-timer lookahead scheduler (CircuitStomp), the Web MIDI layer and `theory.js`
(ChungusCello), the WAV writer with dither (Sonic Smithy), the MIDI writer and service-worker pattern
(BlueHeronBass), procedural impulse responses (ChungusCello `fx.js`).

## Notes for maintainers

- Bump `CACHE` in `sw.js` whenever a file in `CORE` changes.
- Memory: ~20-25 MB of baked audio once the whole keyboard is warmed. Reverb IR is 2.6 s (1.8 s on
  devices reporting <= 4 cores).
- Not yet device-tested: iOS Safari (silent switch, interruptions), Meta Quest Browser, hardware
  MIDI controllers. Desktop Chromium is the tested path.

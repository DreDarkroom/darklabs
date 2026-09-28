# ChungusCello

A physically-modelled cello for the browser — part of Dre Darklabs.
Live at **[dredarkroom.github.io/darklabs/chunguscello](https://dredarkroom.github.io/darklabs/chunguscello/)**.

No samples, no frameworks, no build step. Static files; open `index.html` from
any static server (it needs `http://localhost` or `https://` for the
AudioWorklet, microphone and WebXR).

## How the sound works

- `js/cello-worklet.js` — every note is a **digital waveguide string**: two
  delay lines (bow→nut, bow→bridge) with a lossy bridge reflection and a
  nonlinear **stick–slip friction junction** where the bow meets the string
  (McIntyre, Schumacher & Woodhouse 1983; the same family as Perry Cook's STK
  "Bowed"). Friction is normalised to bow speed (Schelleng's bow-force window)
  so "pressure" behaves the same at any dynamic, and the loop is tuning-
  compensated (±3 cents across the range in offline tests). Plucks and strikes
  excite the same string. Four sympathetic open strings ring along.
- `js/fx.js` — the cello **body** is an impulse response synthesised from
  damped resonant modes (air mode ~100 Hz, main wood modes ~190–220 Hz, a
  "bridge hill"), plus procedural reverbs and the Chungus amp's clipper curve.
- `js/engine.js` — articulations, sections, double stops, mono legato, the
  tempo-locked chug repeater, transport/metronome, drone and capture taps.

## Features

Nine articulations · fretless multi-touch fingerboard (soft pitch snapping that
keeps vibrato) · on-screen and computer keys · bow pad with **hand bow**
(stroke to bow) · players 1/2/4/8 · double stops · tunings incl. Bach Suite V
scordatura, Kodály and a "Chungus drop" · loop station (free or bar-locked,
count-in, overdub, undo, reverse, half-speed, tempo-from-loop, latency
compensation) · performance recorder (WAV + MIDI) · loop stems + Reaper `.rpp`
· tuner · sing-to-play · the **Chungus sampler** (record/load/borrow any sound;
auto pitch + seamless loop) · MIDI/MPE in and out · phrases (Bach, Pachelbel,
Beethoven + originals) · presets, share links · offline PWA · WebXR on Meta
Quest 2/3 (real-size cello, left hand stops the string by real string physics,
right hand bows) and an inline 3D view.

## Adding real Chungus recordings

Open **Voice & mic → Chungus sampler** and load the files into a slot (or
record straight from the mic). Pitch and loop points are found automatically.

## Files

`index.html`, `style.css`, `js/*.js` (ES modules), `sw.js` + `manifest.webmanifest`
(offline/install), `icon*.{svg,png}`, and `vendor/three*.min.js` — three.js r180
(MIT, see `vendor/THREE-LICENSE.txt`), loaded only for the 3D view and VR.

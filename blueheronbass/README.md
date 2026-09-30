# BlueHeronBass

A five-string bass for the browser with a blue heron in its voice — part of Dre Darklabs.
Live at **dredarkroom.github.io/darklabs/blueheronbass/** (unlisted on the hub for now).

Static files, no samples, no frameworks, no build step. Needs `https://` or `http://localhost`
(AudioWorklet).

## How it sounds

- `js/bass-worklet.js` — every string is a **Karplus–Strong loop** (delay line + one-pole lowpass,
  tuning-compensated) running in an AudioWorklet. Articulations are just different excitations and
  loop brightness/decay: finger, pick, slap (thumb knock + click), pop, tap (legato slides),
  dead notes, natural harmonics (the burst is tiled so only every h-th partial rings) and
  **Heron** — the string is excited by a slice of a croak instead of noise. An envelope-following
  resonant filter (the "squelch") sits after the strings.
- `js/heron.js` — five synthesised heron calls (croak, squawk, rattle, shriek, bill clack): a jittery
  pulsed source with noise, three sweeping formant filters and soft clipping. They play as pads, grow
  out of every note (Heron growl), and pad 1 is the string exciter.
- `js/app.js` — amp chain (compressor → blended fuzz where the lows stay clean → 3-band EQ → cab
  lowpass), fretboard, loop station, take recorder, MIDI, exports.

## Features

5/4/6-string tunings · fretboard with slides, multi-touch, scale overlay and harmonic markers ·
computer-key piano · one-button loop station (free or bar-locked, count-in, overdub, undo) ·
metronome · take recorder → WAV + MIDI · loop → per-layer stems + mix + Reaper `.rpp` (same export
format as ChungusCello) · Web MIDI in/out (CC1 = growl, CC74 = env filter) · offline PWA.

## Real heron recordings

Put audio files in `samples/` and list them in `samples/manifest.json` (up to five, in pad order:
croak, squawk, rattle, shriek, clack):

```json
{ "slots": ["croak.wav", "squawk.wav", "rattle.wav", "shriek.wav", "clack.wav"] }
```

Slot 1 also becomes the string exciter and the growl layer. You can also load a file into any pad from
the page (not remembered between visits).

## VR

There is deliberately no dedicated VR mode. It is a plain touch/pointer page, so in the Quest browser
you can point-and-click the strings (use **Let ring** with a single laser pointer). Roadmap: every
instrument gets the same treatment, with a WebXR mode only where it earns its cost (ChungusCello has one).

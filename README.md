# Dre DarkLabs

Browser-based music and sound instruments. No frameworks, no build step, no
backend for the instruments themselves — static pages running on the Web
Audio API, live at **[dredarkroom.github.io/darklabs](https://dredarkroom.github.io/darklabs/)**.

```
    /\_/\
   ( o.o )   D R E   D A R K L A B S
    > ^ <
```

## Live

- **ChungusCello** — a physically-modelled cello. Every note is a bowed-string
  simulation (a digital waveguide with a stick–slip bow, after McIntyre,
  Schumacher & Woodhouse and Smith) running in an AudioWorklet, through a
  synthesised cello body and four sympathetic open strings. Nine
  articulations (arco, spiccato, pizz, tremolo, **chug** through the Chungus
  amp, harmonics, col legno, ponticello, sul tasto), a fretless multi-touch
  fingerboard, a bow pad you can stroke to bow, sections of up to eight
  players, double stops, a loop station, sing-to-play, a tuner, a
  MeowSynth-style sampler for any sound, MIDI/MPE in and out, WAV/MIDI/stems +
  Reaper exports, share links, offline install, and a WebXR mode for playing a
  life-size cello on Meta Quest 2/3. See [`chunguscello/`](chunguscello/).
- **MeowSynth** — a chromatic synth built entirely from two human "meow"
  voice memos, sliced into one-shots and pitch-shifted across a typing-piano
  layout, plus seven one-shot mood pads.
- **MonkeyBeat** — a 16-step drum machine, 8 patterns with song chain, built
  from slices of a monkey-impression recording.
- **DarkDeck** — a modelled acoustic drum kit with a 16-step sequencer,
  a two-deck DJ mixer (EQ, filter, loops, hot cues, sync, crossfader), an
  8-pad sampler (files, mic, resample), a master FX rack and an SFX maker
  that exports WAV. Everything is synthesised; bring your own audio to DJ.
- **Both Together** — MeowSynth and MonkeyBeat side by side on one page.

## Work in progress

- **CircuitStomp** — a drum & bass machine made entirely of synthesised
  robot voices, no samples anywhere. Full sequencer with pitch/chance per
  step, live play, MIDI in and out, and exports (stems, MIDI, a ready-made
  Reaper project). Built, tested, the most finished thing in this section.
- **Darklabs Radio** — a cleared-for-use station with a TTS presenter
  between tracks, built to be hosted or broadcast.
- **ThroatTapper** — percussion from throat taps and a chromatic hum across
  the QWERTY row. Works, not yet promoted or styled to match the rest.
- **Sonic Smithy** — the SFX counterpart to CrateCall: audition and
  auto-rate CC0 sound packs (with a live in-app fetcher for more), layer and
  slice/loop them, generate new sci-fi SFX from scratch (Pistol Lab, Rail
  Lab), then export a Godot-ready folder with a manifest and autoload script.

## Coming soon

- **Contact Sheet** — live now, its own repo: a pipeline that pulls VR
  headset clips and stills, renames them, and preps them for publishing.
- **Safelight // Slow Future** — preview: a futuristic turntable homepage
  that runs on analogue time. Playable, scratchable record with synthesised
  vinyl crackle and a crate of mix sleeves. Side A is Safelight (calm,
  melodic, strings), side B is SquidgySqueegee (bouncy, electroswing).
- **Dre Darkroom // Obscura** — preview: an experimental take on the Dre
  Darkroom homepage. Camera obscura hero (drop a timelapse at
  `obscura/hero.mp4` and it replaces the drawn scene), four developer trays,
  a crimson safelight switch, a print-developing timing game, two micro games
  (Silver Rush, Light Dash) and a roll of 24 hidden frames to find.
- **Earshot** and **Crate Capture** — not live yet, placeholders on the hub
  for now.

## Running any of it locally

Static files — any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Credits

Built by [Dre](https://github.com/DreDarkroom).


## Names, robots and plain words

Darklabs has little robots on its home page, named with **portmanteaus**: two simple words joined into one, with a capital letter in the middle (ClankCog, WobbleWire, SparkSprocket, PixelPatch, GlitchGizmo, BeepBolt). The **Word Lab** (`learn/`) explains what a portmanteau is, has a name maker, and defines the words used across the labs in plain English with read-aloud and easy-reading settings.
`learn/README.md` explains the idea and how the words are written. `kit/prefs.js` holds the shared reading and motion settings (Calm, Easy reading, High contrast, text size); `kit/ctx.js` is the Darklabs right-click menu (Shift + right-click always gives the browser's own). The home page's build script is `tools/hub/`.

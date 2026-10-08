# Darkroom kit

The shared building blocks behind the Dre Darkroom home page, lifted straight out of the instruments so that
one copy of each idea can power many faces.

| file | what it is |
|---|---|
| `dsp.js` | pure sound generation (no Web Audio): felt piano, marimba, hand percussion, snap, cowbell, the seamless Shepard-Risset staircase loop, procedural reverb IR, tape + soft-clip curves |
| `engine.js` | the signal graph (sample bank, buses, ducking, reverb, echo, tape, glue) and the voices (piano, marimba, pad, bass, one-shots, swell, impact) |
| `conductor.js` | the transport and **the arc**: one number, *ascent* (0..1), wakes the layers, drives the build, the drop and the key-lifting loop |
| `visuals.js` | the seamless infinite-zoom ring tunnel and the arc map |
| `fm.js` | the synthesised electronic engine (drums, reese and neuro bass, FM bells, granular clouds) and `Journey`, the ten-minute composer behind the homepage: gritty dark ambience climbing from 64 to 174 BPM into a heavy drum & bass crescendo (Max Cooper meets Noisia). Same file as `fm/fm.js` (the radio). |
| `theory.js` | scales, chords, voice leading, Euclid, seeded PRNG |
| `midi.js` | Web MIDI input |

Used by `home/` (the main website: scroll position is the ascent). The instruments still carry their own copies
for now (each deploys alone); migrating them to import from here is a later, optional step.

## groove/ (the lean engine behind the home page, the mixing desk and MixingMagic)

| file | what it is |
|---|---|
| `groove/arrange.js` | pure: what plays bar by bar for a page position `p` (0..1). Tempo 84 to 174 BPM, the kit built up one piece at a time, then bass, cello, meows, all in A minor. Tested exactly. |
| `groove/bank.js` | every sound rendered **once**, offline: DarkDeck's drum recipes, the BlueHeronBass and ChungusCello worklets, the MeowSynth recordings |
| `groove/engine.js` | `Sequencer` (look-ahead on the audio clock, voice budget), `Groove` (the live player, volume, visibility) and `renderOffline` (the same engine into a buffer, for measuring and export) |
| `groove/scene.js` | the canvas drummer: two-bone arms, camera that eases toward what is about to play |
| `groove/desk.js` | the small mixing desk (level, mute, solo, kit pieces, tempo) |

The home page repo carries its own copy (it must start fast and cannot depend on another site): run `python tools/sync_groove.py` after changing anything here.
The old `fm.js`, `conductor.js`, `engine.js`, `visuals.js` are no longer used by the home page; `fm.js` still powers Darklabs FM.

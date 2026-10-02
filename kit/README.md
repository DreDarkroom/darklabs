# Darkroom kit

The shared building blocks behind the Dre Darkroom home page, lifted straight out of the instruments so that
one copy of each idea can power many faces.

| file | what it is |
|---|---|
| `dsp.js` | pure sound generation (no Web Audio): felt piano, marimba, hand percussion, snap, cowbell, the seamless Shepard-Risset staircase loop, procedural reverb IR, tape + soft-clip curves |
| `engine.js` | the signal graph (sample bank, buses, ducking, reverb, echo, tape, glue) and the voices (piano, marimba, pad, bass, one-shots, swell, impact) |
| `conductor.js` | the transport and **the arc**: one number, *ascent* (0..1), wakes the layers, drives the build, the drop and the key-lifting loop |
| `visuals.js` | the seamless infinite-zoom ring tunnel and the arc map |
| `fm.js` | the synthesised electronic engine (drums, reese and neuro bass, FM bells, granular clouds) and `Ascent`, the scroll-driven composer behind the homepage: Max Cooper at the top, Noisia at the bottom. Same file as `fm/fm.js` (the radio). |
| `theory.js` | scales, chords, voice leading, Euclid, seeded PRNG |
| `midi.js` | Web MIDI input |

Used by `home/` (the main website: scroll position is the ascent). The instruments still carry their own copies
for now (each deploys alone); migrating them to import from here is a later, optional step.

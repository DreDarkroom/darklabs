# Darkroom kit

The shared building blocks behind the Dre Darkroom home page, lifted straight out of the instruments so that
one copy of each idea can power many faces.

| file | what it is |
|---|---|
| `dsp.js` | pure sound generation (no Web Audio): felt piano, marimba, hand percussion, snap, cowbell, the seamless Shepard-Risset staircase loop, procedural reverb IR, tape + soft-clip curves |
| `engine.js` | the signal graph (sample bank, buses, ducking, reverb, echo, tape, glue) and the voices (piano, marimba, pad, bass, one-shots, swell, impact) |
| `conductor.js` | the transport and **the arc**: one number, *ascent* (0..1), wakes the layers, drives the build, the drop and the key-lifting loop |
| `visuals.js` | the seamless infinite-zoom ring tunnel and the arc map |
| `theory.js` | scales, chords, voice leading, Euclid, seeded PRNG |
| `midi.js` | Web MIDI input |

Used by `home/` (the main website: scroll position is the ascent). The instruments still carry their own copies
for now (each deploys alone); migrating them to import from here is a later, optional step.

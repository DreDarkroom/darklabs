# Penrose

An infinite staircase of sound. Part of Dre Darklabs. Live at **dredarkroom.github.io/darklabs/penrose/**.

Static files, no samples, no frameworks, no build step, no AudioWorklet. Needs `https://` or `http://localhost`.

## The idea

A felt piano (Frahm) climbs through a build and a drop (Cooper), falls back to the piano, and the key lifts a
whole step so the next lap is the same music one step higher. Six laps and you are back where you began: the
audio version of a Penrose staircase. One number, **Ascent** (0..1), runs everything.

- **Intro** a felt piano alone. **Climb** a pad, a circling figure, bass, hats and kick, the filter opening.
  **Build** a riser, a snare roll, the kick drops out. **Peak** the drop. **Release** it falls back to the piano.
- **Climb** runs the arc by itself; touching the **Ascent** slider holds it where you put it.
- Your last 2-5 notes become the figure the piano and arpeggio circle (it drifts against the bar).
- **Guide** glows the chord tones; **Pads** gives eight pads that only play notes of the chord.
- A Shepard-Risset glissando (octave-spaced sines under a fixed window) slides up forever during the climb.
- Visuals: fifteen rings at `R * 0.78^(i + phase)`; advancing `phase` 0 -> 1 slides each ring into the next one's
  place, so the zoom has no seam. Additive blending, no shadows; a quality scaler sheds detail on slow devices.

## Files

`index.html`, `style.css`, `js/` (`app` UI, `engine` samples/graph/voices, `conductor` transport + arc,
`dsp` sound generation, `theory`, `visuals`, `midi`), `sw.js` + `manifest.webmanifest`, `icon.svg`.
The felt piano and reverb generators share lineage with GlowGrain; files are copied, not imported.

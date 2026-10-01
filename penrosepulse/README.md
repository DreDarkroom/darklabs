# PenrosePulse

An infinite staircase of sound. Part of Dre Darklabs. (Formerly just "Penrose", after the impossible Penrose staircase: every step goes up, yet it loops back to the start. The *Pulse* is the build.) Live at **dredarkroom.github.io/darklabs/penrosepulse/**.

Static files, no samples, no frameworks, no build step, no AudioWorklet. Needs `https://` or `http://localhost`.

## The idea

A felt piano (Frahm) climbs through a build and a drop (Cooper), falls back to the piano, and the key lifts a
whole step so the next lap is the same music one step higher. Six laps and you are back where you began: the
audio version of a Penrose staircase. One number, **Ascent** (0..1), runs everything.

- **Intro** a felt piano alone. **Climb** a pad, a marimba figure circling your phrase, bass, a shuffling shaker,
  a wooden clave and a soft tom heartbeat, the filter opening. **Build** the chord swells in and the shaker rolls
  faster, the marimba stops. **Peak** the drop (two low toms). **Release** it falls back to the piano.
- **There is no kit.** SafeLight is a drummer on a break, so the pulse is hand percussion (shaker, tick, tom, snap)
  with a swing on the off-16ths. **More cowbell** is a joke slider, off by default.
- **The staircase** (Tone > Staircase): a Shepard-Risset glissando pre-rendered as a seamless 20 s loop of eight
  octave-spaced sines under a fixed window centred near 300 Hz (87% of its energy at 150-600 Hz, none above 1.5 kHz),
  so it can never run away or whistle. It swells through the build, thins at the peak and is gone by the release.
  From mid-climb the marimba plays a Shepard SCALE too: each note in several octaves under a window that slides up
  one octave every eight bars, so the line seems to rise forever.
- **Climb** runs the arc by itself; touching the **Ascent** slider holds it where you put it.
- Your last 2-5 notes become the figure the piano and the marimba circle (it drifts against the bar).
- **Guide** glows the chord tones; **Pads** gives eight pads that only play notes of the chord.
- Visuals: fifteen rings at `R * 0.78^(i + phase)`; advancing `phase` 0 -> 1 slides each ring into the next one's
  place, so the zoom has no seam. Additive blending, no shadows. **Eco mode** (automatic on machines reporting 4 cores or
  fewer, or when frames run slow) renders at 1x, half the frames, fewer rings.

## Files

`index.html`, `style.css`, `js/` (`app` UI, `engine` samples/graph/voices, `conductor` transport + arc,
`dsp` sound generation, `theory`, `visuals`, `midi`), `sw.js` + `manifest.webmanifest`, `icon.svg`.
The felt piano and reverb generators share lineage with GlowGrain; files are copied, not imported.

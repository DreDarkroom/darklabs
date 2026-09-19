# MeowSynth 🐱

A tiny browser synth built entirely out of human "meow" impressions. No frameworks, no build step, no backend — one HTML page and the Web Audio API. First page live in [Dre Darklabs](https://github.com/DreDarkroom/darklabs).

**Play it:** https://dredarkroom.github.io/darklabs/

```
    /\_/\
   ( o.o )   MEOWSYNTH
    > ^ <
```

## What it is

Two voice-memo recordings of someone meowing were sliced into individual one-shot samples, trimmed, faded and normalized. One clean "meow" became the source for a full chromatic keyboard (pitch-shifted semitone by semitone across the standard "typing piano" key layout: `A W S E D F T G Y H U J K O L P ; '`). Seven more distinct meows — a chirp, a yowl, a grumble, a shriek and friends — became one-shot mood pads on keys `1`–`7`.

Everything runs through a shared signal chain — filter → reverb send → master gain → limiter — so the whole thing behaves like a small, cheap-but-honest sampler instrument rather than a pile of sound-effect buttons:

```
voice(sample -> envelope) -> lowpass filter -> dry ----------> master gain -> limiter -> speakers
                                             \-> reverb send -^
```

- **Envelope** — a short click-free attack, and a Release knob that controls how much of each meow's natural tail plays out (short = a clipped comedic "meep", long = the full recorded meow).
- **Filter / Reverb / Volume** — shared across every voice, so twisting a knob shapes the whole instrument at once.
- **Limiter** — a `DynamicsCompressor` on the master bus so stacking notes or chords doesn't clip.
- **Octave shift** — `Z` / `X` (or the on-screen buttons) move the chromatic keyboard up/down in full octaves.

No sample libraries, no synthesis plugins — just two recordings, sliced with a bit of signal-processing (silence-based segmentation, fade-in/out, peak normalization, pitch estimation to tune the chromatic base) and played back with the browser's native audio engine.

## How to use it

1. Open the page and click/tap **"click / tap to wake the cat"** (browsers block audio until you interact once — that's a browser rule, not a bug).
2. Play the chromatic row (`A` → `'`) like a keyboard, or click/tap the on-screen keys.
3. Hit `1`–`7` for the mood pads.
4. `Z` / `X` shift octaves. The four sliders shape the sound.

Works on desktop and touchscreens. No install, no account, no tracking.

## Running it locally

It's a static site — any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Credits

- Built by [Dre](https://github.com/) using two human vocal recordings of cat meows as the entire sound source.
- Runs on the browser's built-in [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — no external audio libraries.

## License

MIT — see [LICENSE](LICENSE).

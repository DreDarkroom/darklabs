# Crackshot

A small workshop for finding, slicing, measuring and shaping real gunshot recordings into a crisp, crunchy, game-ready
pistol set. Real, openly licensed recordings only. No AI-generated audio. Open `index.html` through any static server.

Not listed on the Darklabs hub on purpose, and marked `noindex`.

## What's here

| | |
|---|---|
| `index.html` | The workshop page: fire the round-robin set, browse and compare every shot, play with crisp / crunch / weight, read how it's judged, see the credits. |
| `audio/raw/` | Every single shot sliced from the sources (24-bit, 48 kHz mono, peak-normalised to -1 dBFS). 53 shots. |
| `audio/pack/crisp`, `crunch`, `arc` | Processed variants of the 14 best shots (16-bit, 48 kHz mono). |
| `audio/pack/roundrobin/pistol_01..08.wav` | Eight different guns, level-matched (within about 2.5 dB), for round-robin playback. |
| `audio/index.json` | All measurements and scores the page reads. |
| `tools/` | The Python that made it: `gunlab.py` (slice + measure + score), `process.py` (the shaping chain), `build_candidates.py`, `make_pack.py`, `viz.py` (spectrogram pictures), `match_reference.py`. |
| `LICENSES.txt` | Credits and licences. Read it before reusing anything. |

## Measuring, in plain English

* **Crisp**: bright, fast, clean. Strong 2-6 kHz crack, attack under ~1.6 ms, short tail.
* **Crunchy**: gritty and dense. A squashed peak (low crest factor and kurtosis) and a flat, busy 1-8 kHz spectrum.
* **Suitability (0-100)**: a weighted checklist: attack, tail, dryness, clipping, noise floor, crack, body, weight, brightness. The weights and target ranges are in `tools/gunlab.py` (`TARGET`, `WEIGHTS`). They describe a punchy, bright, dry, short game pistol, and they are an approximation: replace them with your own taste.

## Rebuild it

Needs Python with numpy, scipy and soundfile, and the source recordings (see `LICENSES.txt` for where to get them).

```
python tools/build_candidates.py   # slice + score every shot -> out/raw, out/candidates.json
python tools/make_pack.py          # shape the best into crisp / crunch / arc -> out/pack
python tools/match_reference.py my_clip.wav   # which shots are nearest to a sound you like (runs locally)
```

The paths at the top of `build_candidates.py` and `make_pack.py` point at where the sources were unpacked while this was made; edit them for your machine.

## Honest notes

* I can measure a sound, but I can't hear it. The scoring is a tool to narrow 53 shots to a few, then your ears decide.
* The "weight" comes from a short sine thump computed by code. Real recordings of small guns rarely contain much true sub-bass.
* The "arc" sweetener is a very quiet, high-passed whisper of a Kenney CC0 laser, there for flavour.
* The browser sliders on the page are a quick live sketch. The downloadable files were made by the offline chain, which also controls the tail and the attack.

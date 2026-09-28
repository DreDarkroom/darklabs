# Sonic Smithy

Sci-fi SFX forge for Godot — audition CC0 sounds, layer them, slice/loop them, generate new
ones from scratch, and export game-ready files with a Godot manifest. Local-only tool
(private branch `feature/sonic-smithy`).

```
python server.py            # http://127.0.0.1:8765
python tools/fetch_cc0.py   # (once) pull the CC0 packs into library/cc0 + build index.json
node tools/selftest.mjs     # generate one of everything, print scores, write WAVs
node tools/fuzz.mjs         # NaN / silence fuzz over 40 seeds
```

The app also works from any static server; without `server.py` you still get WAV + zip export.
`server.py` adds OGG Vorbis / MP3 / FLAC encoding and "write to ./exports/". Needs `numpy` and `soundfile`.

## Modules (alt+1…7)

| | |
|---|---|
| **Audition** | 365 Kenney CC0 sounds, auto-scored. ↑↓ browse, space replay, 1–5 stars, B basket, E edit, L layer. Drop/import your own files. |
| **Layer** | One job per layer (transient / crack / body / sub / sweetener / tail / air), each band-limited, offset, pitched; auto-fill from the library by spectral role; glue → soft-clip → brickwall. |
| **Slice · Loop** | Trim, cut, fades, gain, pitch, reverse, mono, sub-cut, undo; transient/grid slicing → library; loop points, best-loop-end search, baked equal-power crossfade. |
| **Generate** | 15 procedural types with pitch / length / brightness / grit / sci-fi / space; 8 round-robin variations or best-of-24 by score. |
| **Pistol Lab** | 6 pistol types built from 8 stacked layers (mute/solo/gain/offset/re-roll per layer), swap any layer for a library sound, best-of-24, keep an 8-variant set. |
| **Rail Lab** | Pleasant rail grind loops (slow/med/fast) + land/leave one-shots; harshness meter; seamless loop. |
| **Export** | Basket → WAV 16/24/32f, OGG, MP3, FLAC, or *match source*; Godot manifest + `sfx_bank.gd` + LICENSES.txt. |

## Rating

`js/analyze.js` scores 0–100 against per-category norms **calibrated on the Kenney library**
(length, −40 dB tail, headroom / true peak, K-weighted loudness, clean start/end/loop seam,
attack, spectral centre, Godot format) → grade S/A/B/C/D and a "ship-ready" flag. Your ★ rating
blends in (60 % machine / 40 % human). Tune `PROFILES` and `weightsFor()`.

## Quality matching

* Untouched library sounds are copied **byte-for-byte** (no re-encode).
* Edited/generated sounds keep the source's format: OGG → OGG at the source's quality setting
  (Vorbis VBR quality mapped from the source's nominal bitrate), MP3 → MP3 at the same CBR, WAV → same bit depth,
  generated → 16-bit WAV. OGG/MP3 need `server.py`; otherwise it falls back to 24-bit WAV.

## Godot

Copy the exported folder to `res://audio/sfx/`, add `sfx_bank.gd` as an autoload named `SfxBank`, make an `SFX` bus.

```gdscript
SfxBank.play("pistol_sidearm")                      # random variant, pitch/volume variation from manifest
var g := SfxBank.loop("rail_grind_med"); SfxBank.set_grind_speed(g, speed)
```

## Sources & licences

Kenney *Sci-Fi Sounds*, *Impact Sounds*, *Digital Audio*, *Interface Sounds* — CC0 1.0 (kenney.nl).
Provenance is stored per sound in `library/cc0/index.json` and written to `LICENSES.txt` on export.

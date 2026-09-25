# CrateCall — ready for the darklabs repo

This folder is a self-contained drop-in for `github.com/DreDarkroom/darklabs`, alongside the `radio/` folder from the Darklabs Radio work.

## What's here

- `index.html` — the whole tool (same as the live claude.ai version)
- `audio/` — the 12 baked-in music preview MP3s the page plays

## To add it to the repo

1. Copy this whole folder into the repo as `cratecall/` (so the page ends up at `cratecall/index.html`, next to `radio/`).
2. Commit and push. GitHub Pages will serve it at `https://dredarkroom.github.io/darklabs/cratecall/` (or whatever path your Pages config uses).
3. Add a card for it under the hub site's WIP section, linking to that path. I haven't touched the hub page itself since I haven't read its markup in this session — whoever does this commit should match its existing card style.

## Two things that behave differently here than on claude.ai

- **Loop export (WAV/MP3)**: on claude.ai this uses a special browser permission the platform grants. On a normal website it falls back automatically to a plain browser download — it should just work, but it's worth a quick test after the push.
- **Mailto links** ("Send selections", "Suggest a track"): these are more reliable on a real website than inside the claude.ai sandbox, since there's no iframe restriction here.

## Keeping it in sync

This is a point-in-time export from 25 Sept 2026. If the claude.ai version gets updated later (new tracks, fixes), this copy won't update itself — whoever maintains the repo should re-export from the claude.ai artifact (or ask a Claude session to do it) when that happens.

# Crate Capture

Find CC0 and public domain music, check the licence properly, keep the proof, and hand it over cleanly. Live at https://dredarkroom.github.io/darklabs/crate/

- **Guide:** a short version and nine short chapters: what CC0 does and does not mean, the six checks, searching wide and far, downloading safely, documenting, choosing, preparing files, handing over, and what to do when something is wrong.
- **Sources:** 16 places to look (`sources.js`), each marked *sure by design*, *check every item*, *public domain by age* or *you make it*, with how to search it and what to watch for. Plus a list of things that look free but are not CC0.
- **My finds:** a log kept only in the browser. Each find has its source, licence, the evidence (where exactly you saw it), six checks, a SHA-256 fingerprint of the downloaded file (computed in the tab, never uploaded), a first-listen player, a rating (Love / Keep / Maybe / Drop) and notes. A find is **Ready** only when everything needed is present. Export `provenance.csv`, `LICENSES.txt`, `ATTRIBUTION.md` and a JSON backup.
- **Tools:** how it fits with Earshot, DarkDesk and the Word Lab, plus commands to run yourself (fingerprints, loudness measuring, tagging, and search recipes for Freesound, Openverse and the Internet Archive).

The page never downloads music, never contacts a source, and never runs a command: the commands are instructions for you. A file you pick is read in the tab only.

```
node --test crate/tests/log.test.mjs
```

Files: `index.html`, `crate.css`, `app.js` (screens), `log.js` (the data, readiness and exports; testable), `sources.js` (the list), `ROADMAP.md` (next steps and the Crate Club plan).

Not legal advice. Sources were checked on 5 October 2026; sites change.

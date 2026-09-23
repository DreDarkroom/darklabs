# Darklabs Radio — pipeline & add-a-track guide

## Add a track (30 seconds, no build step)

Open `manifest.json` and add a block to the `tracks` array:

```json
{
  "id": "unique-short-id",
  "title": "Track Title",
  "artist": "Artist Name",
  "url": "https://direct-link-to-audio-file",
  "source_page": "https://page-where-you-found-it",
  "licence": "CC0",
  "risk": "none",
  "notes": "one line on provenance"
}
```

Save. Refresh the radio page. Done — no rebuild, no redeploy step beyond
the normal git push, because the page reads the manifest at load time.

**`url` must be a direct link to the audio file itself** (ends in .mp3/.ogg/.wav),
not a page. `risk` and `notes` aren't shown to listeners — they're there so
future-you (or the sound-tracking sheet) can see at a glance which tracks
carry the "built from a commercial loop pack" caveat documented in the CC0
licence audit.

## Running the CC0 acquisition protocol on new tracks

This radio pulls from the same sourcing discipline as the rest of Darklabs —
see the project's `cc0-acquisition-protocol.md`. Short version for anything
new going in here:

1. Confirm the licence text on the item page itself says CC0 / CC0 1.0 /
   Creative Commons Zero / Public Domain Dedication.
2. Check the description for "loops", "samples", "presets", "AI-generated" —
   if present, the uploader may not own what they're dedicating. Still fine
   for a background-music radio station; flag it in `notes` and `risk` the
   same way the current 10 loop-pack-derived tracks are flagged.
3. Screenshot + select-all-copy the licence page per the protocol if you want
   it to reach VERIFIED status, and add a row to the master audio sheet.
4. Never add anything CC BY (needs credit — different licence, different
   folder) or anything with a trademarked name/character in the title or
   description.

## What's live right now

12 tracks, all sourced from OpenGameArt.org, all marked CC0 on their source
pages (audit: `cc0-music-licence-audit-21sep2026.md`). 2 are clean with no
caveats (ld47, bassline2). 10 are CC0-dedicated by the uploader but built
from commercial loop packs (GarageBand Loops, one MAGIX Music Maker JAM) —
fine as broadcast/background music, not something to claim ownership of.
One track's shipped filename referenced a Nintendo game; it's retitled here
to the source page's own title, per the audit's recommendation.

## What got skipped for this v1, and why

| Feature asked for | Status | Why |
|---|---|---|
| Dedicated live-broadcast server (Icecast/Shoutcast-style stream) | **Skipped** | No infrastructure to host a persistent audio-streaming server from this environment. What's built instead: a client-side looping station — identical listening experience, but each listener's browser drives its own playback rather than tuning into one shared live stream. If you want a real always-on stream later, options are a hosted Icecast provider (e.g. Radio.co, AutoDJ, or a small VPS running Icecast + Liquidsoap) — happy to spec that out. |
| Presenter voice | **Built, downgraded** | Real TTS between tracks using the browser's built-in SpeechSynthesis API — free, instant, no server, no API key. Quality is robotic (system voice, whatever the listener's OS provides) rather than a produced radio voice. Upgrading to a natural-sounding voice needs a paid TTS API (ElevenLabs, etc.) — skipped for v1 since it needs a key and a server round-trip. |
| Community voice pops | **Not built** | This needs you to actually collect audio from people — nothing to build yet. When you're ready: drop files in `voice-pops/`, and the presenter logic can be extended to occasionally play a pop instead of/alongside the TTS ident. Flagging so it's not forgotten, not doing it silently. |
| Instrument-generated tracks (Vital/Reaper originals) | **Not built** | You flagged this as the hard one yourself. Nothing autonomous exists to compose and render new tracks — this still needs you playing/rendering in Reaper or Vital, same as the rest of the audio pipeline. The manifest is ready to take those the moment you export one. |
| "Any game can add this easily" | **Built** | `radio-widget.js` — one script tag + one function call, no dependencies, reads the same manifest. |
| Auto-add tracks with zero input from you | **Partially not possible** | I can't autonomously browse-and-decide "this track is good and legally clean" without licence review — that's exactly the judgement call your CC0 audit protocol exists to catch (Pixabay's fake-CC0, undisclosed loop packs, etc.). What's built is the fastest possible manual step: paste a URL into a JSON array.

## Honest gaps

- No real-time "shared listening" — two people listening right now are not
  necessarily hearing the same second of the same track, since there's no
  central stream. If that matters (e.g. for a synced community listen-along),
  that's the case for building real Icecast infra.
- TTS idents are not saved as audio files, so nothing to review before it
  "airs" — it's generated live in-browser each time. Fine for a prototype,
  not fine if you want to vet exact wording in advance.
- The widget assumes the embedding page allows audio autoplay-after-gesture
  and doesn't block third-party script loads — should be fine on GitHub
  Pages/itch.io/Godot HTML export, worth testing on the actual Quest browser
  if that's a target.

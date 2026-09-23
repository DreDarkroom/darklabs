# Darklabs Radio — pipeline notes

## What's live right now

12 tracks, cleared for use, sourced from OpenGameArt.org. 2 are clean with no
caveats (ld47, bassline2). 10 are dedicated by the uploader but built from
commercial loop packs (GarageBand Loops, one MAGIX Music Maker JAM) — fine as
broadcast/background music, not something to claim ownership of. One track's
shipped filename referenced a Nintendo game; it's retitled here to the source
page's own title.

## What got skipped for this v1, and why

| Feature asked for | Status | Why |
|---|---|---|
| Dedicated live-broadcast server (Icecast/Shoutcast-style stream) | **Skipped** | No infrastructure to host a persistent audio-streaming server from this environment. What's built instead: a client-side looping station — identical listening experience, but each listener's browser drives its own playback rather than tuning into one shared live stream. If you want a real always-on stream later, options are a hosted Icecast provider (e.g. Radio.co, AutoDJ, or a small VPS running Icecast + Liquidsoap) — happy to spec that out. |
| Presenter voice | **Built, downgraded** | Real TTS between tracks using the browser's built-in SpeechSynthesis API — free, instant, no server, no API key. Quality is robotic (system voice, whatever the listener's OS provides) rather than a produced radio voice. Upgrading to a natural-sounding voice needs a paid TTS API (ElevenLabs, etc.) — skipped for v1 since it needs a key and a server round-trip. |
| Community voice pops | **Not built** | This needs you to actually collect audio from people — nothing to build yet. When you're ready: drop files in `voice-pops/`, and the presenter logic can be extended to occasionally play a pop instead of/alongside the TTS ident. Flagging so it's not forgotten, not doing it silently. |
| Instrument-generated tracks (Vital/Reaper originals) | **Not built** | You flagged this as the hard one yourself. Nothing autonomous exists to compose and render new tracks — this still needs you playing/rendering in Reaper or Vital, same as the rest of the audio pipeline. The manifest is ready to take those the moment you export one. |
| Auto-add tracks with zero input from you | **Partially not possible** | Track review needs a licence-clearance judgement call before anything ships — that's exactly what the sourcing protocol exists to catch. What's built is the fastest possible manual step: paste a URL into a JSON array. |

## Honest gaps

- No real-time "shared listening" — two people listening right now are not
  necessarily hearing the same second of the same track, since there's no
  central stream. If that matters (e.g. for a synced community listen-along),
  that's the case for building real Icecast infra.
- TTS idents are not saved as audio files, so nothing to review before it
  "airs" — it's generated live in-browser each time. Fine for a prototype,
  not fine if you want to vet exact wording in advance.

# Dre DarkLabs

Browser-based music and sound instruments. No frameworks, no build step, no
backend for the instruments themselves — static pages running on the Web
Audio API, live at **[dredarkroom.github.io/darklabs](https://dredarkroom.github.io/darklabs/)**.

```
    /\_/\
   ( o.o )   D R E   D A R K L A B S
    > ^ <
```

## Live

- **MeowSynth** — a chromatic synth built entirely from two human "meow"
  voice memos, sliced into one-shots and pitch-shifted across a typing-piano
  layout, plus seven one-shot mood pads.
- **MonkeyBeat** — a 16-step drum machine, 8 patterns with song chain, built
  from slices of a monkey-impression recording.
- **Both Together** — MeowSynth and MonkeyBeat side by side on one page.

## Work in progress

- **CircuitStomp** — a drum & bass machine made entirely of synthesised
  robot voices, no samples anywhere. Full sequencer with pitch/chance per
  step, live play, MIDI in and out, and exports (stems, MIDI, a ready-made
  Reaper project). Built, tested, the most finished thing in this section.
- **Darklabs Radio** — a cleared-for-use station with a TTS presenter
  between tracks, built to be hosted or broadcast.
- **ThroatTapper** — percussion from throat taps and a chromatic hum across
  the QWERTY row. Works, not yet promoted or styled to match the rest.

## Coming soon

- **Contact Sheet** — live now, its own repo: a pipeline that pulls VR
  headset clips and stills, renames them, and preps them for publishing.
- **Earshot** and **Crate Capture** — not live yet, placeholders on the hub
  for now.

## Running any of it locally

Static files — any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Credits

Built by [Dre](https://github.com/DreDarkroom).

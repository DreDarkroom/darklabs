# Earshot API Documentation

This document outlines the internal architecture and browser APIs utilised within the Earshot platform. As Earshot is a serverless, client-side application, the "API" refers to the Web Audio API wrappers, React component architectures, and data structures used for audio manipulation.

## Core Technologies

*   **Web Audio API:** Used for all audio routing, buffering, and playback.
*   **Canvas 2D API:** Used for real-time waveform rendering.
*   **Pointer Events API:** Crucial for the `/admin` tier to differentiate between touch, mouse, and stylus (`pointerType === 'pen'`).

## Data Structures

### `AudioTrack` Object

The standard representation of a CC0 audio asset within the app state.

```javascript
{
  id: "track-001",
  title: "Ambient Drone",
  type: "music", // or 'sfx'
  url: "path/to/audio.mp3",
  bpm: 120, // (Mocked data)
  key: "C Min", // (Mocked data)
  tags: ["dark", "synth", "loop"],
  buffer: null // Holds the AudioBuffer once decoded
}
```

### `EditState` Object

Maintains the non-destructive editing parameters for an `AudioTrack`.

```javascript
{
  startTime: 0.5, // Playback start offset in seconds
  endTime: 4.2,   // Playback end offset in seconds
  loop: false,    // Boolean toggle
  gain: 1.0       // Volume multiplier
}
```

## Audio Engine Functions (`audio-engine.js` concept)

While heavily integrated into React components, the core audio functions follow these patterns:

### `loadAudioBuffer(url)`
Fetches an audio file via the Fetch API and decodes it using `AudioContext.decodeAudioData()`.
*   **Returns:** A Promise that resolves to an `AudioBuffer`.

### `drawWaveform(canvasContext, audioBuffer, width, height)`
Parses the channel data from an `AudioBuffer` and renders a visual representation onto an HTML5 Canvas.

### `playBuffer(audioContext, buffer, editState)`
Constructs the audio graph:
`AudioBufferSourceNode` -> `GainNode` -> `AudioContext.destination`
Applies the `startTime`, `endTime`, and `gain` values from the `EditState`.

## Pointer Events Handling (Admin Tier)

The Admin tier relies heavily on identifying stylus input.

```javascript
function handlePointerDown(e) {
  if (e.pointerType === 'pen') {
    // Enable high-precision slicing mode
    enableSlicer(e.clientX);
  } else {
    // Standard touch/mouse behaviour (e.g. scrolling)
    handleStandardTouch(e);
  }
}
```

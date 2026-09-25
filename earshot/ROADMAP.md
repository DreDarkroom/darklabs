# Earshot // Product Roadmap & Vision

*Earshot is currently in its initial prototyping phase. This document outlines the ambitious, long-term vision for the platform.*

## The Vision

Earshot aims to be the definitive browser-based workspace for discovering, auditioning, and preparing CC0 audio assets. By bypassing heavy DAWs for initial track prep, Earshot offers a lightweight, instantly responsive, and highly tactical environment.

We believe that finding the right sound shouldn't involve fighting with latency, downloading hundreds of megabytes of unwanted zip files, or waiting for clunky interfaces to load. Earshot is built for speed, precision, and focus.

## Phase 1: The Foundation (Current)

*   **Zero-Latency Auditioning:** Core Web Audio API implementation for instant playback.
*   **Visual Confidence:** Real-time waveform rendering to "see" the sound before hitting play.
*   **Tactile Tagging:** Colour-coded, immediate visual sorting (Love, Keep, Maybe, Drop).
*   **Multi-Tier Architecture:** Establishing the Community, Pro, and stylus-optimised Admin layers.

## Phase 2: Advanced Editing & Analysis

*   **In-Browser Normalisation & Fades:** Apply non-destructive exponential fades and LUFS-based normalisation directly in the browser.
*   **Pitch & Time Independence:** Implement advanced algorithms (like Phase Vocoder concepts or modern Web Audio worklets) to decouple pitch from playback speed.
*   **Transient Detection:** Automatic slicing based on transient peaks, perfect for drum loop deconstruction.
*   **BPM & Key Estimation:** Moving beyond mocked data to integrate lightweight WebAssembly libraries for actual real-time key and tempo detection of dropped audio files.

## Phase 3: The Commercial Ecosystem (Pro Tier Expansion)

*   **Crate Management:** Persistent local storage (IndexedDB) for saving specific slices and arrangements across sessions.
*   **Collaborative Sessions:** WebRTC-based integration allowing remote producers to listen in on an auditioning session with synced transport controls.
*   **Stem Separation Hooks:** Placeholders for connecting to backend API services (e.g., Spleeter) for on-demand stem splitting, managed via the clean progressive disclosure UI.
*   **Export Pipelines:** One-click export of chopped stems into standard DAW formats (Ableton Project files, Reaper `.rpp`).

## Phase 4: Hardware Deep Integration (Admin Tier)

*   **Advanced Stylus Gestures:** Expanding S Pen integration beyond simple slicing. Pressure-sensitive volume automation drawing directly onto the waveform.
*   **MIDI Web API Integration:** Map specific physical MIDI controllers to Earshot's internal transport and slicing tools for a hardware-hybrid auditioning workflow.

---

*This roadmap is subject to change as the Dre DarkLabs ecosystem evolves. We prioritise speed, stability, and aesthetic purity above feature bloat.*

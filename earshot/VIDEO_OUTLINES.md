# Earshot // Video Tutorial Outlines

This document outlines the planned video tutorial series for the Earshot platform.

## Video 1: The Community Edition - Fast Audio Auditioning

**Target Audience:** General users, indie game developers, content creators looking for CC0 audio.
**Tone:** Fast-paced, highly visual, clean.

*   **0:00 - The Hook:** Show a chaotic folder of downloaded audio files vs. the clean, instant interface of Earshot. "Stop downloading ZIP files to find one good kick drum."
*   **0:30 - The Interface:** Tour the high-contrast UI. Highlight the Dre Darkroom aesthetics (`#690000` accents). Demonstrate how progressive disclosure keeps the screen clean.
*   **1:15 - Instant Auditioning:** Demonstrate clicking a waveform and hearing instant playback. Emphasise the lack of AI generation—this is about *curating* real audio.
*   **2:00 - Tagging & Sorting:** Show the colour-coded tagging system in action. Sorting a list of 20 sounds into 'Keep' and 'Drop' in under a minute.
*   **3:00 - The Export:** Show how easily the selected tracks (or chopped segments) can be gathered.
*   **3:30 - Outro:** Call to action. Link to the Dre DarkLabs GitHub.

## Video 2: Earshot Pro - Bulk Processing and Workflow Integration

**Target Audience:** Professional producers, sound designers, audio teams.
**Tone:** Technical, workflow-focused, professional.

*   **0:00 - The Problem:** Handling massive sample packs. "When you have 5,000 files, auditioning one by one is a bottleneck."
*   **0:45 - The Pro Workspace:** Introduce the Pro tier UI. Highlight the bulk-processing panes and team collaboration placeholders.
*   **1:30 - Metadata & Analysis:** Show the mock Key and BPM detection features. Explain how visualizing metadata speeds up the pairing process.
*   **2:30 - Non-Destructive Editing:** Deep dive into the Web Audio API capabilities. Show setting loop points, applying fades, and normalising without touching the source file.
*   **3:45 - The Handoff:** Demonstrate the mocked export pipelines (e.g., prepping a package for Ableton).
*   **4:30 - Outro:** Discuss the roadmap for future commercial features.

## Video 3: Behind the Scenes - Building the Admin S-Pen Interface

**Target Audience:** Developers, UI/UX designers, hardcore workflow nerds.
**Tone:** Experimental, behind-the-scenes, technical deep dive.

*   **0:00 - The Device:** Show the Samsung Galaxy S24 Ultra. "DAWs on mobile usually suck because they treat fingers like mice. We built this for the stylus."
*   **1:00 - The Pointer Events API:** Screen recording of the code, showing the `pointerType === 'pen'` logic. Explain why this distinction matters.
*   **2:00 - High-Precision Slicing:** Side-by-side view: screen recording of the waveform + camera view of the S Pen hovering and slicing. Highlight the hover states that are impossible with standard touch.
*   **3:30 - The No-Build Stack:** Briefly explain the technical constraints of the project (React, Tailwind CDN, Import Maps) and why avoiding a build step makes deployment so fast.
*   **4:30 - Outro:** Final thoughts on tactile interfaces for audio software.

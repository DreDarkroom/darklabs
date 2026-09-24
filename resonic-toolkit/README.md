# Resonic CLI Toolkit

**A command-line generator for Resonic Player, built for Dre Darkroom.**

This standalone toolkit provides a fast, visual way to generate command-line arguments for [Resonic Player/Pro](https://resonic.at). It's designed specifically for musicians and sound designers who want to launch audio files with specific playback states directly from their DAW, scripts, or stream decks, without having to memorize the CLI syntax.

## Design & Code Process

*   **Architecture:** Built using a "no-build" stack (React + Babel standalone + Tailwind CSS v4 via CDN). This ensures that the toolkit remains lightweight, portable, and immediately deployable to GitHub Pages without complex CI/CD build steps.
*   **Aesthetics:** The UI strictly adheres to the Dark Cinema Lab design guidelines. It utilizes `#690000` (Dre Darkroom Red) as the primary accent, a `neutral-950` base, and custom CSS to match the atmospheric, analogue grain aesthetic found across the rest of the DarkLabs ecosystem.
*   **Functionality:**
    *   State management is handled cleanly via React `useState` and `useEffect` to build the command string in real-time as parameters are tweaked.
    *   One-click copy functionality ensures friction-free usage.
    *   Built-in CC0 (Public Domain) demo presets allow users to quickly test string generation using standard, royalty-free audio paths.

## Testing Report: Resonic Free vs. Pro

During the development and testing of this toolkit against the available command-line documentation, a crucial distinction between Resonic Player (Free) and Resonic Pro was verified:

*   **Core Functions (Working in Free):** Basic transport commands (`--stopped`, `--paused`), window activation (`--no-activate`), fractional starting points (`--start-fract`), and fade-ins (`--start-ramp-duration`) all function correctly in the free version.
*   **Pro-Exclusive Limitations:** Any parameter related to Loop Selection (`--loop-start`, `--loop-end`, `--loop-length`, `--loop-all`) is strictly walled off behind **Resonic Pro (v0.9+)**. Passing these commands to the free player will result in them being ignored.

To prevent user frustration, the UI explicitly isolates these features in a "PRO ONLY" visual container with a clear warning.

## Integration Guide

To add this toolkit to the main DarkLabs index (`/index.html`), simply insert the following card HTML into the `<main class="instruments">` section (or into the `<section class="soon">` if it's considered a preview).

Ensure you **do not** modify the root `index.html` directly in this PR; follow standard Dre Darkroom deployment procedures.

```html
<!-- Resonic CLI Toolkit -->
<section class="card" id="resonic-toolkit">
  <div class="card-icon">&#x1F5A5;&#xFE0F;</div>
  <h2>Resonic CLI</h2>
  <p>A visual command-line generator for Resonic Player. Launch tracks with custom states, fades, and loop selections directly from your scripts.</p>
  <a class="btn" href="/darklabs/resonic-toolkit/">Open Generator</a>
</section>
```

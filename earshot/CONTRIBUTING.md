# Contributing to Earshot

Thank you for your interest in contributing to Earshot! As a project within the Dre DarkLabs ecosystem, we follow specific architectural constraints and design philosophies. Please read these guidelines before submitting a pull request.

## Core Rules

1.  **No Build Step:** The most critical rule. Earshot uses a pure browser environment. Do not introduce Webpack, Vite, Node.js dependencies, or `package.json`. We rely entirely on Import Maps, Babel standalone, and CDNs.
2.  **Zero AI Generation:** Earshot is for processing *existing* CC0 audio. Pull requests introducing generative AI models for audio creation will be rejected immediately.
3.  **Strict Styling:** All UI elements must adhere to the Dre Darkroom design language.
    *   Primary Accent: `#690000` (Dre Darkroom Red)
    *   Backgrounds: `bg-neutral-950`
    *   Text: High contrast, sans-serif or monospace.
    *   Use UK English spelling for all user-facing copy (e.g., 'visualiser', 'colour'), but maintain standard US English for Tailwind classes.

## Development Setup

No installation is required. Simply serve the directory locally:

```bash
python3 -m http.server 8000
```

## Pull Request Process

1.  **Iterative Critic Loop:** Before opening a PR, evaluate your changes against our core tenets (Performance, Accessibility, Zero-Latency Audio, Styling). Self-assess out of 10. Do not submit if you score yourself below an 8.
2.  **Code Quality:** Ensure your React logic in `app.js` is robust. Do not mock UI functionality unless it's explicitly documented as a placeholder for the Pro tier. Write actual Tailwind classes.
3.  **Documentation:** If you add a new feature, update the relevant `README.md` or `API.md`.

*By contributing to this repository, you agree that your contributions will be licensed under its standard open-source license.*

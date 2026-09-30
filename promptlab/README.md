# Darklabs Prompt Lab

## What is Darklabs Prompt Lab?
A small public web application for experimenting with, comparing, and evaluating AI prompts. It serves as a browser-based experimental laboratory to structure prompt engineering tasks.

## Why does it exist?
The purpose is NOT to build another ChatGPT clone. The purpose is to demonstrate practical AI engineering concepts, showing that AI engineering involves more than just writing prompts. Prompts are artefacts that can be versioned, tested, and evaluated against formalised criteria to ensure measurable improvements and regression testing.

## Features
- **Dashboard:** List and manage experiments.
- **Experiment Creator:** Create experiments comparing Prompt A and Prompt B.
- **Test Case Editor:** Define multiple test cases (e.g., straight-forward client, vague client).
- **Evaluation Criteria:** Create weighted criteria (accuracy, clarity, etc.).
- **Results & Comparison:** Record scores and display side-by-side results.
- **Overall Score:** Calculate a weighted score to identify the winning prompt.
- **Local Storage:** Experiments are saved locally in the browser.

## Architecture
The project uses a no-build stack consisting of React, Babel standalone, and Tailwind v4 CDN via Import Maps, all running in a single `index.html` file. State is managed entirely client-side using `localStorage`, avoiding unnecessary backend infrastructure.

## How evaluation works
Users define criteria and assign weights. Each prompt (A and B) is scored against these criteria (e.g., 0-10). The final score for each prompt is the sum of (Score * Weight) for all criteria, divided by the total possible maximum score, resulting in a clean overall rating to objectively determine the better prompt.

## Example experiment
**Freelance Client Research Prompt**
- **Prompt A:** A basic prompt asking for client info.
- **Prompt B:** An improved prompt specifying output format and key extraction points.
- **Test Cases:** Straightforward client, vague client, price-sensitive client.
- **Criteria:** Accuracy (Weight 5), Completeness (Weight 4), Actionability (Weight 3).
- **Result:** Prompt B scores higher due to better actionability.

## Future possibilities
- **V1:** Manual prompt evaluation (Current)
- **V2:** Model API integration via clean provider interfaces
- **V3:** Automated graders
- **V4:** Prompt regression testing
- **V5:** Multiple model comparison

## Running locally
Use any static file server:
```bash
python3 -m http.server 8000
# then open http://localhost:8000/promptlab/
```

## Technology used
- React 18
- Tailwind CSS v4
- Babel Standalone
- HTML5 / CSS3

## Lessons demonstrated
- Prompts are artefacts
- Prompts can be versioned and tested
- Outputs can be evaluated formally
- AI systems need regression testing
- "Better prompt" means measurable improvement

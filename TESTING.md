# Testing

This repository uses the built-in Node 22 test runner (`node:test`) for dependency-free testing of its logic and content.

## Running the tests

To run all data logic tests:

```bash
node --test desk/tests/desk.test.mjs crate/tests/log.test.mjs
```

To test the data integrity of the repository's content (such as the Word Lab glossary and the projects list):

```bash
node --test tests/content.test.mjs
```

To run all tests together:

```bash
node --test desk/tests/desk.test.mjs crate/tests/log.test.mjs tests/content.test.mjs
```

## Link checking

To check that all relative links and imports within the HTML and JS files are valid:

```bash
node tools/linkcheck.mjs
```

Any known broken links that cannot be fixed (e.g., links to external assets that are handled separately) are listed in `tools/linkcheck.allow.json`.

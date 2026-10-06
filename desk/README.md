# DarkDesk

A private desk for remembering and organising the Darklabs projects, red on dark, built for a phone held in one hand. **It only reminds. It cannot publish, upload, commit, deploy or change any project.** Links just open the project's page.

Open `desk/` (for example https://dredarkroom.github.io/darklabs/desk/). It is not linked from the home page and asks search engines not to list it, but the address is public: it holds no private information. Your notes live only in your own browser.

## What it does

- **Today:** the assistant (TidyTick) says the one thing that most needs you, from rules over what you wrote down: something due, something waiting on someone, an in-progress project with no next step or untouched for too long, notes to sort, a weekly review. *Today's three* picks where to look first. *Where was I?* lists what you touched last and its last log line.
- **Projects:** every project from the home page (40, generated from `tools/hub/hub_data.py` into `projects.js`) plus your own private ones. List or board, filter by status, search notes, sort. Each has a status, priority, next step, "waiting on", a reminder date, tags, steps, notes and a dated log. A heat bar shows how recently it was touched.
- **Capture (+):** a note, idea, to-do or reminder in two taps, into the inbox or straight into a project's log.
- **Review:** steps through the in-progress projects one at a time: still going, pause, done, skip, and what is the next step.
- **Reminders** can be saved as a calendar file (`.ics`) that you open yourself.
- **Vault:** passcode, backup, settings (Calm, Easy reading, High contrast live here too).

## How it keeps things safe

- No network requests of its own, and a Content-Security-Policy that forbids loading anything from elsewhere. No analytics, no fonts or scripts from other sites.
- Notes are put on the page as text, never as HTML, and a backup file is checked field by field before it is used (`logic.js`, `sanitize`).
- With a passcode, everything is encrypted before it is stored: PBKDF2-SHA-256 (600 000 rounds, random salt) makes the key, AES-GCM seals the data with a fresh random number each save, and a wrong passcode or a changed file simply fails to open. The key exists only in memory while unlocked. It locks itself after a quiet while (default 2 minutes) and when you leave the page for more than a minute. Wrong passcodes slow down further tries.
- **Limits, honestly:** there is no way to recover a forgotten passcode (that is the point; keep a backup). The tries slow-down is in the page, so it stops a person picking up the phone, not someone who copies the stored data off the device and guesses offline: choose a few words, not a short word. Without a passcode the notes are stored in plain text and the Vault says so. A phone that is already compromised cannot be protected by a web page. Clearing the browser's site data erases the desk.
- The desk is a plain web page: do not put anything in it that must never exist on a device you do not control.

## Files

`index.html`, `desk.css`, `app.js` (screens), `logic.js` (data, the assistant, calendar files, validation; no browser needed), `vault.js` (encryption), `projects.js` (generated), `sw.js` and `manifest.webmanifest` (installable, works offline), `tests/desk.test.mjs`.

```
node --test desk/tests/desk.test.mjs
python tools/hub/build_hub.py        # regenerates projects.js along with the home page
```

## Not done yet (on purpose or for later)

A sync between your devices (it would need a server or a file you carry), notifications when the page is closed (a web page cannot do that reliably), reading the live state of each project (that would mean network calls), and the Hero Drop / client items you may want to keep here: add them as your own private projects, which stay on the device and are encrypted with the rest.

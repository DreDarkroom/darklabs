# Crate Capture and Crate Club: roadmap

## Where it is now (0.1)

A guide to finding and checking CC0 and public domain music, a map of 15 sources, and a local-only finds log: six checks, evidence, a file fingerprint (SHA-256), a first-listen player, ratings, and exports (provenance sheet, LICENSES.txt, ATTRIBUTION.md, a JSON backup). No accounts, no uploads, no network calls.
Not verified yet: use on a real phone (picking a file, long fingerprints), and the exports opened in a real spreadsheet.

## Next, without a server

- **Load your own files into Earshot** (the audition tool) so Love / Keep / Maybe / Drop tagging works on real downloads, and write the verdict back into the log.
- **A "searched" list:** remember the searches that worked, with the date, so nothing is repeated.
- **A saved copy of the evidence:** attach a screenshot or a saved page to a find (kept on the device only).
- **Loudness and peak readout** from the picked file in the browser (so the prepare step needs no command line).
- **More sources and better recipes,** each one checked at its own site, with a "last checked" date and a way to say "this changed".
- **A suggestions box** that goes to the owner's phone (the same way the feedback in Glass Groove does) so people can say "you missed this source".
- **A weekly review in DarkDesk** that nudges "three finds are still unchecked".

## Crate Club: the social side

The idea: a small, kind community that helps each other find music that is genuinely free to use, and makes the proof visible.

### What it would be (and not be)

- **Links and proof, never audio.** The club would store a find's page address, licence, evidence and fingerprint, not the music itself. That avoids hosting other people's work and keeps takedowns simple.
- **Many hands check.** A find shows who has checked it and what they checked. Two independent people ticking the same six checks lifts it to "verified by the club". A flag ("the file says CC BY") puts it in review at once.
- **Curators, not an algorithm.** Follow a person whose finds you trust. Collections ("dark ambient loops", "1925 jazz, US public domain") with notes.
- **Safe by design.** Nicknames only, nothing else collected. No private messages at first. Every find has a plain "report a problem" button. A short, human code of conduct.

### What it needs, honestly

Accounts, a database, moderation, a privacy notice and a way to remove people's content. A static page cannot do any of that, so it waits for a small server.

| Layer | Option | Notes |
|---|---|---|
| Zero-database start | GitHub Discussions on the repository | Free and moderated by GitHub's tools, but needs a GitHub account and shows that handle. Good for a first trial with a few people. |
| Server | A small worker with a database (for example Cloudflare Workers + D1) | Cheap and light. **Do not use `*.workers.dev` addresses for anything on the alias side: they carry the account name.** Use a `pages.dev` address or a custom domain. |
| Sign-in | A passkey, or a one-time link sent to an email address, with a chosen nickname | No passwords to store. Keep the nickname separate from any real name. |
| Data | users (nickname, created), finds (url, licence, evidence, fingerprint, creator, source), checks (who ticked what), flags, collections, follows | A find's proof fields are the same as the local log, so a local log can be shared with one tap. |
| Abuse | Rate limits, new-account limits, one report path, and a person who looks at reports | The part people forget. Budget time for it before building. |
| Law | Terms, privacy notice, takedown contact, delete-my-data | Needed before any public launch. Not legal advice: get it looked over. |

### Order of work

1. Run a **small trial on GitHub Discussions** with five to ten trusted people. Learn what they actually want to share.
2. Build **share links**: a find (without notes) as a link that opens as a read-only card, with no server.
3. Add the **server and accounts** only if the trial shows people want more than that.
4. Add **verification and flags**, then **collections and follows**.
5. Only then, think about anything bigger (a public index, an open API for the finds).

## Principles

- Nothing here is legal advice: it helps people check and keep proof.
- When in doubt, leave it out.
- A claim is not evidence: the evidence is where you saw it.
- Nothing leaves your device unless you send it.

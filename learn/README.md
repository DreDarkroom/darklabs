# Word Lab: how the words are written

The Word Lab (`learn/index.html`) explains the words used across Darklabs in plain English. It is for people who find technical words hard, who find reading or screens harder, and who do not speak English as a first language. The word list is in `terms.js`; the page is `index.html` and `learn.js`.

## What is a portmanteau?

A **portmanteau** (say: port-MAN-toh) is a new word made by joining two words, keeping parts of both. *Brunch* is *breakfast* + *lunch*. *Smog* is *smoke* + *fog*. The word comes from French and once meant a travel bag with two sides, which is why it is a good name for a word with two halves.

## How Darklabs uses them

The little robots on the home page are named with two whole words, written as one word, with a capital letter where the second word begins: **ClankCog**, **WobbleWire**, **SparkSprocket**, **PixelPatch**, **GlitchGizmo**, **BeepBolt**.
That way of writing is called **CamelCase** (the capitals look like humps). Both words start with the same sound, which is **alliteration**. The Word Lab has a maker that builds a name from any two words.

Rule for new names: two short, concrete, everyday words that begin with the same letter, one capital in the middle, no spaces, no numbers. A name should say what the thing does (a cog that clanks, wires that wobble).

## Writing a word for the list

- One idea in each meaning. Two short sentences at most.
- Use everyday words. If you need a harder word, put it in the list too and use it only after it has been explained.
- Present tense, active voice. No jokes that depend on idioms or slang ("it's a piece of cake").
- Give one real example. Say it the way you would say it out loud.
- Add `say`: how to pronounce it, with the stressed part in capitals (`port-MAN-toh`).
- Use the same word for the same thing every time (always "browser", never also "web client").
- Do not use colour or an emoji as the only way to carry meaning. An emoji is decoration (it is hidden from screen readers).
- Add `see` only when there is a real place to try the idea.

## Easy reading, calm, contrast, size

Settings on the Word Lab page (and in the footer of the home page, and in the right-click menu) are kept on the device only:

| Setting | What it does |
|---|---|
| Easy reading | Plainer letters (Verdana-style), wider spacing, more line height, left-aligned lines of a comfortable length, no italics or capital-letter styling |
| High contrast | Brighter text and a little more contrast, links underlined |
| Calm | Stops the glitching, the robots' movement, the scan lines and the build-in animation. On automatically if the device asks for reduced motion |
| Text size | Normal, bigger, biggest |

The glitch effects are short, low in brightness and rare, and never flash more than three times a second. If anything is uncomfortable, Calm turns it all off.

## Reading in another language

The page uses short sentences and plain words so that the browser's own translation works well (in Chrome: menu, then *Translate*). A set of human-checked translations of the main explanations would be better than machine translation; they are on the roadmap, to be written or checked by speakers of each language. Machine translations will not be added as if they were checked.

## The right-click menu

Pages that load `kit/ctx.js` (the home page, this page, the VR Lab) replace the browser's right-click menu with a Darklabs-styled one that does the same things where a web page is allowed to (back, forward, reload, print, select all, copy, cut, paste, open and copy links, copy and save images, view page source, media controls), plus the meaning of a selected word, read-aloud, and the reading settings.
On a touch screen a long press keeps the phone's own menu, so selecting text still works.
The browser's own menu is always available: hold **Shift** while right-clicking, or choose *Use the browser's menu instead* in the menu, or use the link in the footer. Mark an element `data-native-menu` to keep the browser's menu there. Instruments that use right-click themselves (Glass Groove, DevelopDrop and the like) do not load this file.
Some browser-menu items cannot be done by a web page at all (*Inspect*, *Save page as*, *Translate*, *Cast*); the Shift route is the way to those.

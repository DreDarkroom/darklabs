/* Groove arrangement: what plays, bar by bar, as the page is scrolled. Pure (no audio, no page), so the tests can run it exactly.

   One number, p (0..1, how far down the page), decides everything:
     tempo       84 BPM up to 174 BPM, smoothly
     the kit     closed hats alone -> hat variations and flicks -> ghost notes -> backbeat snare -> kick -> toms in fills
                 -> ride -> crash and splash -> china -> the full kit, then a drum & bass pattern at 174
     the band    bass (BlueHeron) -> cello (ChungusCello) -> meows (MeowSynth), all in A minor and all sparse
   Every bar is a pure function of (p, bar number): the same inputs always give the same bar. */

export const KEY = { name: 'A minor', tonic: 9, scale: [0, 2, 3, 5, 7, 8, 10] };

/** At which p each layer first plays. Ordered the way a drummer builds a groove. */
export const ENTRY = {
  hatC: 0, hatVar: 0.1, ghost: 0.17, snare: 0.21, kick: 0.28, bass: 0.34, tomFill: 0.4, ride: 0.46, crash: 0.5,
  cello: 0.54, splash: 0.58, china: 0.63, meow: 0.68, dnb: 0.78,
};

/** The camera looks toward the next thing to arrive (a little before it does). [from p, what]. */
export const FOCUS = [[0, 'hats'], [0.09, 'snare'], [0.2, 'kick'], [0.34, 'toms'], [0.44, 'ride'], [0.52, 'splash'], [0.6, 'china'], [0.7, 'kit'], [0.8, 'kick']];

export const DRUMS = ['kick', 'snare', 'ghost', 'hatC', 'hatC2', 'hatO', 'hatP', 'tomH', 'tomL', 'tomF', 'ride', 'bell', 'splash', 'china', 'crash'];
/** Hits that must never be dropped when the machine is busy, and hits that can go first. */
export const CORE = new Set(['kick', 'snare', 'hatC', 'bass', 'cello', 'crash']);

/** The notes the sample bank is rendered for (MIDI). The arrangement only ever asks for these. */
export const BASS_NOTES = [29, 31, 33, 36, 40, 41, 43, 45];      // F1 G1 A1 C2 E2 F2 G2 A2
export const CELLO_NOTES = [41, 43, 45, 48, 50, 52, 55];         // F2 G2 A2 C3 D3 E3 G3
export const MEOW_PITCHES = [57, 60, 62, 64, 67, 69, 72];        // A3 C4 D4 E4 G4 A4 C5 (A minor pentatonic)
/** i VI III VII: Am F C G, one chord per bar. [bass root, cello root, cello fifth]. */
export const CHORDS = [
  { bass: 33, cello: 45, fifth: 52 },
  { bass: 29, cello: 41, fifth: 48 },
  { bass: 36, cello: 48, fifth: 55 },
  { bass: 31, cello: 43, fifth: 50 },
];

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const BPM_START = 84, BPM_END = 174;
/** Tempo for a position: slow and steady at the start, then a long smooth climb, settling at drum & bass. */
export function tempoAt(p) { return BPM_START + (BPM_END - BPM_START) * smooth(0.03, 0.84, clamp(p, 0, 1)); }

/** Which layers are in at p. */
export function layersAt(p) {
  const on = {};
  for (const k of Object.keys(ENTRY)) on[k] = p >= ENTRY[k];
  return on;
}

export function focusAt(p) {
  let f = FOCUS[0][1];
  for (const [from, what] of FOCUS) if (p >= from) f = what;
  return f;
}

/**
 * One bar of 16 steps. Returns [{ s, i, v, n? }]: step 0..15, instrument id, velocity 0..1, and for the band a MIDI note n.
 * `bar` counts from 0 and keeps counting; the phrase is 4 bars, the section 8.
 */
export function barPlan(p, bar, seed = 1) {
  p = clamp(p, 0, 1);
  const r = rng(seed * 7919 + bar * 104729), L = layersAt(p), ev = [];
  const add = (s, i, v, n) => { if (s >= 0 && s < 16) ev.push(n == null ? { s, i, v: clamp(v, 0.05, 1) } : { s, i, v: clamp(v, 0.05, 1), n }); };
  const phrase = bar % 4, last = phrase === 3, sect = bar % 8 === 0, last8 = bar % 8 === 7;
  const chord = CHORDS[bar % 4];
  const dnb = smooth(ENTRY.dnb - 0.1, ENTRY.dnb + 0.04, p);        // 0 = the rock groove, 1 = the drum & bass groove
  const useDnb = r() < dnb;                                         // whole bars switch, so it never smears
  const busy = smooth(0.1, 0.7, p);

  /* hats: a plain 8th-note pulse first; then flicks between them; then a fancy fill at the end of each phrase */
  if (useDnb) { for (let s = 0; s < 16; s += 2) add(s, 'hatC', s % 4 === 0 ? 0.55 : 0.36); if (L.hatVar) { for (const s of [3, 7, 11, 15]) if (r() < 0.5) add(s, 'hatC2', 0.22); if (r() < 0.35) add(14, 'hatO', 0.45); } }
  else for (let s = 0; s < 16; s += 2) add(s, 'hatC', s % 8 === 0 ? 0.72 : s % 4 === 0 ? 0.55 : 0.4);
  if (L.hatVar && !useDnb) {
    const flick = 0.2 + 0.45 * smooth(ENTRY.hatVar, ENTRY.kick, p);
    for (let s = 1; s < 16; s += 2) if (r() < flick) add(s, r() < 0.5 ? 'hatC2' : 'hatC', 0.2 + r() * 0.15);
    if (r() < 0.45) add(14, 'hatO', 0.5);
    if (r() < 0.3) add(6, 'hatP', 0.4);
    if (last) { for (let s = 8; s < 16; s++) add(s, s % 2 ? 'hatC2' : 'hatC', 0.3 + (s - 8) * 0.07); add(15, 'hatO', 0.65); }
  }

  /* snare: ghost notes whisper first, the backbeat arrives a little after */
  if (L.ghost) {
    const g = r;
    for (const s of useDnb ? [7, 15] : [3, 7, 11, 14]) if (g() < 0.35 + 0.35 * busy) add(s, 'ghost', 0.16 + g() * 0.1);
  }
  if (L.snare) { add(4, 'snare', 0.82); add(12, 'snare', 0.86); if (!useDnb && r() < 0.18 * busy) add(13, 'ghost', 0.3); }

  /* kick */
  if (L.kick) {
    if (useDnb) { add(0, 'kick', 1); add(10, 'kick', 0.9); if (r() < 0.4) add(7, 'kick', 0.7); if (last && r() < 0.5) add(2, 'kick', 0.7); }
    else {
      add(0, 'kick', 0.95); add(8, 'kick', 0.85);
      if (p > ENTRY.kick + 0.04 && r() < 0.5) add(10, 'kick', 0.7);
      if (p > ENTRY.kick + 0.08 && r() < 0.35) add(6, 'kick', 0.6);
      if (p > ENTRY.kick + 0.12 && r() < 0.3) add(3, 'kick', 0.55);
    }
  }

  /* toms: only in the fills, at the end of a phrase; bigger fills at the end of a section */
  if (L.tomFill && last) {
    const big = last8 && p > ENTRY.tomFill + 0.04;
    const fill = big ? [[8, 'tomH', 0.8], [10, 'tomH', 0.75], [11, 'tomL', 0.8], [12, 'tomL', 0.85], [13, 'tomF', 0.85], [14, 'tomF', 0.9], [15, 'tomF', 1]]
      : [[12, 'tomH', 0.7], [13, 'tomL', 0.72], [14, 'tomF', 0.78], [15, 'tomF', 0.7]];
    for (const [s, i, v] of fill) { for (let k = ev.length - 1; k >= 0; k--) if (ev[k].s === s && ev[k].i === 'snare') ev.splice(k, 1); add(s, i, v); }
  }

  /* cymbals: ride on the second half of a phrase, a crash to open each section, splash and china for punctuation */
  if (L.ride && phrase >= 2 && !useDnb) { for (let s = 0; s < 16; s += 4) add(s, 'ride', 0.4); add(0, 'bell', 0.42); }
  if (L.ride && useDnb) for (let s = 0; s < 16; s += 4) add(s, 'ride', 0.34);
  if (L.crash && sect) add(0, 'crash', 0.8);
  if (L.splash && !sect && phrase === 0 && r() < 0.8) add(0, 'splash', 0.55);
  if (L.splash && last && r() < 0.6) add(10, 'splash', 0.5);
  if (L.china && (bar % 8 === 4 || last8)) add(last8 ? 15 : 0, 'china', 0.62);

  /* bass: roots of the chord, simple until the drum & bass part */
  if (L.bass) {
    const root = chord.bass, ok = (n) => BASS_NOTES.includes(n);
    const steps = useDnb ? [[0, 1, 0.95], [3, 1, 0.6], [10, 1, 0.9], [14, 0, 0.6]] : [[0, 1, 0.9], [6, 1, 0.65], [8, 1, 0.8], [11, 1, 0.6]];
    for (const [s, always, v] of steps) if (always && (s === 0 || r() < 0.45 + 0.35 * busy)) {
      let n = root; if (s >= 8 && !useDnb && r() < 0.3) n = root + 7 > 45 ? root : root + 7;
      add(s, 'bass', v, ok(n) ? n : root);
    }
  }

  /* cello: one long note a bar, the fifth above it later on */
  if (L.cello) {
    add(0, 'cello', 0.7, chord.cello);
    if (p > ENTRY.cello + 0.12 && bar % 2 === 1) add(8, 'cello', 0.5, chord.fifth);
  }

  /* meows: rare, always a note of the A minor pentatonic scale */
  if (L.meow && r() < 0.35 + 0.3 * smooth(ENTRY.meow, 0.95, p)) {
    const n = MEOW_PITCHES[Math.floor(r() * MEOW_PITCHES.length)];
    add([2, 6, 10, 13][Math.floor(r() * 4)], 'meow', 0.45 + r() * 0.2, n);
  }
  return ev.sort((a, b) => a.s - b.s);
}

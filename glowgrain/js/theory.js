// Notes, scales, chords and small helpers. No audio in here.
// Adapted from chunguscello/js/theory.js (copied, not imported: each Darklabs
// instrument is deployed and cached on its own).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const noteName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/** Seeded PRNG so a take and its export can reproduce exactly. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Modes as semitone sets from the tonic. Seven-note modes so diatonic chords work.
export const MODES = {
  major: { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  lydian: { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  minor: { name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
};

/** Progressions as scale degrees (1-based), one chord per bar. */
export const PROGRESSIONS = {
  sunrise: { name: "Sunrise", degrees: [1, 5, 6, 4] },
  beach: { name: "Beach", degrees: [1, 4, 3, 6] },
  glass: { name: "Glass", degrees: [6, 4, 1, 5] },
  eno: { name: "Eno", degrees: [1, 2, 4, 1] },
  dusk: { name: "Dusk", degrees: [6, 2, 5, 1] },
};

/** MIDI note for scale degree d (1-based, may exceed 7 / go below 1) above `root` (MIDI). */
export function degreeNote(root, mode, d) {
  const steps = MODES[mode].steps, i = d - 1;
  const oct = Math.floor(i / 7), k = ((i % 7) + 7) % 7;
  return root + oct * 12 + steps[k];
}

/** Diatonic chord on degree: root, 3rd, 5th, 7th, 9th as MIDI notes above `root`. */
export function chordOn(root, mode, degree) {
  return [0, 2, 4, 6, 8].map((o) => degreeNote(root, mode, degree + o));
}

export function inMode(m, root, mode) {
  const pc = (((Math.round(m) - root) % 12) + 12) % 12;
  return MODES[mode].steps.includes(pc);
}

/** Nearest note of the mode to a (possibly out-of-scale) MIDI note. */
export function snapToMode(m, root, mode) {
  m = Math.round(m);
  if (inMode(m, root, mode)) return m;
  return inMode(m - 1, root, mode) ? m - 1 : m + 1;
}

/** Move a note `n` scale steps (diatonic) within the mode. */
export function modeStep(m, n, root, mode) {
  let k = snapToMode(m, root, mode);
  const dir = Math.sign(n);
  let left = Math.abs(n);
  while (left > 0) { k += dir; if (inMode(k, root, mode)) left--; }
  return k;
}

/** Bjorklund / Euclidean rhythm: `k` onsets spread over `n` steps. */
export function euclid(k, n, rot = 0) {
  const out = new Array(n).fill(0);
  if (k <= 0) return out;
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += k; if (acc >= n) { acc -= n; out[(i + rot) % n] = 1; } }
  return out;
}

/** Move each pitch class of `next` to the octave nearest the matching voice of `prev`. */
export function voiceLead(prev, next) {
  if (!prev || !prev.length) return next.slice();
  const out = [];
  const used = new Set();
  for (const n of next) {
    let best = n, bd = Infinity;
    for (const p of prev) {
      for (let o = -3; o <= 3; o++) {
        const c = n + o * 12;
        const d = Math.abs(c - p);
        if (d < bd && !used.has(c)) { bd = d; best = c; }
      }
    }
    used.add(best); out.push(best);
  }
  return out.sort((a, b) => a - b);
}

// Computer-keyboard piano: lowercase row = white keys, row above = black.
// index = semitones above the octave's C.
export const KEY_SEQUENCE = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";", "'"];

export const dbToGain = (db) => Math.pow(10, db / 20);

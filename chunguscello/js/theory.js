// Notes, scales, tunings and a few small helpers shared by every part of the
// instrument. No audio in here.

export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const NOTE_NAMES_ASCII = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

let A4 = 440;
export function setA4(hz) { A4 = clamp(+hz || 440, 400, 480); }
export function getA4() { return A4; }

/** MIDI note number (may be fractional) → Hz at the current A4 reference. */
export function mtof(m) { return A4 * Math.pow(2, (m - 69) / 12); }
/** Hz → fractional MIDI note number. */
export function ftom(f) { return 69 + 12 * Math.log2(f / A4); }

export function noteName(m, ascii = false) {
  const r = Math.round(m);
  const names = ascii ? NOTE_NAMES_ASCII : NOTE_NAMES;
  return names[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}
export function pitchClassName(pc, ascii = false) { return (ascii ? NOTE_NAMES_ASCII : NOTE_NAMES)[((pc % 12) + 12) % 12]; }

// Scales as semitone sets from the root.
export const SCALES = {
  chromatic: { name: "Chromatic", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "Natural minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonic: { name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  penta_minor: { name: "Minor pentatonic", steps: [0, 3, 5, 7, 10] },
  penta_major: { name: "Major pentatonic", steps: [0, 2, 4, 7, 9] },
  blues: { name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  phrygian_dom: { name: "Phrygian dominant", steps: [0, 1, 4, 5, 7, 8, 10] },
  hungarian: { name: "Hungarian minor", steps: [0, 2, 3, 6, 7, 8, 11] },
  wholetone: { name: "Whole tone", steps: [0, 2, 4, 6, 8, 10] },
};

export function inScale(m, root, scaleId) {
  const sc = SCALES[scaleId] || SCALES.chromatic;
  const pc = (((Math.round(m) - root) % 12) + 12) % 12;
  return sc.steps.includes(pc);
}

/** Nearest note (integer MIDI) to fractional m that belongs to the scale. */
export function snapToScale(m, root, scaleId) {
  const sc = SCALES[scaleId] || SCALES.chromatic;
  if (sc.steps.length === 12) return Math.round(m);
  let best = Math.round(m), bestD = Infinity;
  for (let k = Math.floor(m) - 3; k <= Math.ceil(m) + 3; k++) {
    if (!inScale(k, root, scaleId)) continue;
    const d = Math.abs(k - m);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** Move a note `degrees` scale steps up (diatonic interval). */
export function scaleStep(m, degrees, root, scaleId) {
  const sc = SCALES[scaleId] || SCALES.chromatic;
  if (sc.steps.length === 12) return m + degrees;
  let k = Math.round(m);
  if (!inScale(k, root, scaleId)) k = snapToScale(k, root, scaleId);
  const dir = Math.sign(degrees);
  let n = Math.abs(degrees);
  while (n > 0) { k += dir; if (inScale(k, root, scaleId)) n--; }
  return k;
}

// Double stops: the interval added above each note. `diatonic` intervals follow
// the scale (a third in C major from E is G, not G♯).
export const DOUBLE_STOPS = {
  off: { name: "Off" },
  fifth: { name: "Fifth (power)", semis: 7 },
  octave: { name: "Octave", semis: 12 },
  fourth: { name: "Fourth", semis: 5 },
  third: { name: "Third (in key)", degrees: 2 },
  sixth: { name: "Sixth (in key)", degrees: 5 },
  fifth_oct: { name: "Fifth + octave", semis: 7, extra: 12 },
};

export function doubleStopNotes(m, id, root, scaleId) {
  const d = DOUBLE_STOPS[id];
  if (!d || id === "off") return [];
  const out = [];
  if (d.semis != null) out.push(m + d.semis);
  if (d.degrees != null) out.push(scaleStep(m, d.degrees, root, scaleId));
  if (d.extra != null) out.push(m + d.extra);
  return out;
}

// Open strings, lowest first, as MIDI notes. The fingerboard, the VR cello and
// the sympathetic resonators all follow the chosen tuning.
export const TUNINGS = {
  standard: { name: "Cello — C G D A", strings: [36, 43, 50, 57] },
  suite5: { name: "Bach Suite V scordatura — C G D G", strings: [36, 43, 50, 55] },
  kodaly: { name: "Kodály — B F♯ D A", strings: [35, 42, 50, 57] },
  chungus: { name: "Chungus drop — A E B F♯", strings: [33, 40, 47, 54] },
  viola: { name: "Viola — C G D A (up an octave)", strings: [48, 55, 62, 69] },
  violin: { name: "Violin — G D A E", strings: [55, 62, 69, 76] },
  bass: { name: "Double bass — E A D G", strings: [28, 33, 38, 43] },
};

// Keyboard (typing piano) layout shared with MeowSynth: lowercase = white keys,
// the row above = black keys; index = semitones above the octave's C.
export const KEY_SEQUENCE = [
  { key: "a", black: false }, { key: "w", black: true },
  { key: "s", black: false }, { key: "e", black: true },
  { key: "d", black: false },
  { key: "f", black: false }, { key: "t", black: true },
  { key: "g", black: false }, { key: "y", black: true },
  { key: "h", black: false }, { key: "u", black: true },
  { key: "j", black: false },
  { key: "k", black: false }, { key: "o", black: true },
  { key: "l", black: false }, { key: "p", black: true },
  { key: ";", black: false },
  { key: "'", black: false },
];

export function isBlack(m) { return [1, 3, 6, 8, 10].includes(((Math.round(m) % 12) + 12) % 12); }

/** Seeded PRNG so exports and share links reproduce exactly. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));

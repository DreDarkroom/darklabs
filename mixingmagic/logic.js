/* MixingMagic: the pure parts. A pattern is a grid of levels (0 off, 1 soft, 2 medium, 3 loud), two bars of 16 steps, for every row of
   every instrument. Nothing here touches the page or the audio, so the tests can run it exactly.
   - fromPlan:       fill the grid from the home page's own arrangement at any point of the climb
   - penroseMelody:  the PenrosePulse melody: a quasi-periodic (Sturmian / Fibonacci) rhythm that never quite repeats, notes walked along the scale
   - serialise:      saving and loading, with every number checked
   - encodeWav:      the export */
import { barPlan, BASS_NOTES, CELLO_NOTES, MEOW_PITCHES, DRUMS } from '../kit/groove/arrange.js';
import { chordOn, toChordTone } from '../kit/theory.js';

export const STEPS = 32;
export const LEVEL_V = [0, 0.4, 0.7, 1];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteLabel = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export const DRUM_ROWS = [['kick', 'Kick'], ['snare', 'Snare'], ['ghost', 'Ghost snare'], ['hatC', 'Hi-hat closed'], ['hatC2', 'Hi-hat tick'], ['hatO', 'Hi-hat open'], ['hatP', 'Hi-hat pedal'],
  ['tomH', 'Hi-tom'], ['tomL', 'Low-tom'], ['tomF', 'Floor-tom'], ['ride', 'Ride'], ['bell', 'Ride bell'], ['splash', 'Splash'], ['china', 'China'], ['crash', 'Crash']];
export const MONKEY_ROWS = [[0, 'Chest thump'], [1, 'Slap'], [2, 'Clap'], [3, 'Chatter'], [4, 'Screech'], [5, 'Hoot'], [6, 'Grunt'], [7, 'Tap']];
const notes = (list) => [...list].sort((a, b) => b - a).map((m) => [m, noteLabel(m)]);
export const MELODY_NOTES = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];           // A minor, A3 to E5
export const TRACKS = [
  { id: 'drums', label: 'Drums', from: 'DarkDeck', hue: '#ff3a52', rows: DRUM_ROWS, poly: true },
  { id: 'monkey', label: 'Monkey beat', from: 'MonkeyBeat', hue: '#e0a050', rows: MONKEY_ROWS, poly: true },
  { id: 'bass', label: 'Bass', from: 'BlueHeronBass', hue: '#5ab0ff', rows: notes(BASS_NOTES), poly: false },
  { id: 'cello', label: 'Cello', from: 'ChungusCello', hue: '#d98a3a', rows: notes(CELLO_NOTES), poly: true },
  { id: 'meow', label: 'Meows', from: 'MeowSynth', hue: '#9be37a', rows: notes(MEOW_PITCHES), poly: false },
  { id: 'melody', label: 'Melody', from: 'PenrosePulse', hue: '#c79bff', rows: notes(MELODY_NOTES), poly: false },
];
const rowKey = (r) => String(r[0]);

export function emptyPattern() {
  const p = {};
  for (const t of TRACKS) { p[t.id] = {}; for (const r of t.rows) p[t.id][rowKey(r)] = new Array(STEPS).fill(0); }
  return p;
}
export const clonePattern = (p) => JSON.parse(JSON.stringify(p));

/** Cycle a cell through off, soft, medium, loud, off. Mono tracks clear the other rows of that step. Returns the new level. */
export function cycleCell(pattern, trackId, row, step, to) {
  const t = TRACKS.find((x) => x.id === trackId), cells = pattern[trackId][String(row)];
  const next = to == null ? (cells[step] + 1) % 4 : to;
  if (!t.poly && next > 0) for (const r of t.rows) pattern[trackId][rowKey(r)][step] = 0;
  cells[step] = next;
  return next;
}

/** What plays on a step (0..31): [{ i, v, n? }], in the shape the engine's Sequencer.hit takes. */
export function eventsAt(pattern, step, solo = null, muted = null) {
  const ev = [];
  for (const t of TRACKS) {
    if (muted && muted.has(t.id)) continue;
    if (solo && solo !== t.id) continue;
    for (const r of t.rows) {
      const lv = pattern[t.id][rowKey(r)][step];
      if (!lv) continue;
      const v = LEVEL_V[lv];
      ev.push(t.id === 'drums' ? { i: r[0], v } : { i: t.id, n: r[0], v });
    }
  }
  return ev;
}

/** Fill the drums, bass, cello and meows from the page's arrangement at position p (0 = hi-hats alone, 1 = drum & bass). */
export function fromPlan(p, seed = 1, startBar = 0) {
  const pat = emptyPattern();
  for (let b = 0; b < 2; b++) {
    for (const e of barPlan(p, startBar + b, seed)) {
      const s = b * 16 + e.s, lv = e.v < 0.3 ? 1 : e.v < 0.66 ? 2 : 3;
      if (DRUMS.includes(e.i)) pat.drums[e.i][s] = Math.max(pat.drums[e.i][s], lv);
      else if (e.i === 'bass' || e.i === 'cello' || e.i === 'meow') { const row = pat[e.i][String(e.n)]; if (row) row[s] = Math.max(row[s], lv); }
    }
  }
  return pat;
}

/* ---------- the PenrosePulse melody ---------- */
const PHI = (1 + Math.sqrt(5)) / 2;

/** The Fibonacci word 0100101001001...: the one-dimensional cousin of a Penrose tiling. Two kinds of gap, in an order that never repeats. */
export function fibWord(n) {
  let a = '0', b = '01';
  while (b.length < n) [a, b] = [b, b + a];
  return b.slice(0, n);
}

/**
 * Onsets from a Sturmian sequence (an onset whenever the golden-ratio rotation lands in the first `density` of its cycle), so the rhythm is
 * evenly spread but never repeats. The contour walks the scale by one or two steps, in the direction the Fibonacci word says, and lands
 * on a chord tone (Am F C G, one chord per bar) on the strong steps.
 */
export function penroseMelody({ seed = 1, density = 0.42, steps = STEPS, scale = MELODY_NOTES } = {}) {
  const out = new Array(steps).fill(0);
  const phase = ((seed * 0.6180339887) % 1 + 1) % 1, word = fibWord(steps + 64), deg = [1, 6, 3, 7];
  let idx = Math.floor(scale.length / 2), n = 0;
  for (let s = 0; s < steps; s++) {
    const x = (s * PHI + phase) % 1;
    if (x >= density) continue;
    const move = (word[n % word.length] === '1' ? 1 : -1) * (word[(n + 5) % word.length] === '1' ? 2 : 1);
    idx += move; if (idx < 0) idx = -idx; if (idx > scale.length - 1) idx = 2 * (scale.length - 1) - idx;
    idx = Math.max(0, Math.min(scale.length - 1, idx));
    let m = scale[idx];
    if (s % 8 === 0) {                                                            // strong steps: a chord tone of this bar's chord
      const tones = chordOn(57, 'minor', deg[Math.floor(s / 16) % 4]);
      const want = toChordTone(m, tones), at = scale.indexOf(want);
      if (at >= 0) { m = want; idx = at; }
    }
    out[s] = { n: m, lv: s % 8 === 0 ? 3 : s % 4 === 0 ? 2 : 1 }; n++;
  }
  return out;
}

/** Write a penroseMelody into a pattern's melody track (replacing it). */
export function setMelody(pattern, opts) {
  for (const r of TRACKS.find((t) => t.id === 'melody').rows) pattern.melody[rowKey(r)].fill(0);
  penroseMelody(opts).forEach((c, s) => { if (c) pattern.melody[String(c.n)][s] = c.lv; });
  return pattern;
}

/* ---------- saving and loading ---------- */
export function serialise(state) { return JSON.stringify({ v: 1, bpm: state.bpm, swing: state.swing, pattern: state.pattern, mix: state.mix || {} }); }

/** Parse and check a saved state; anything wrong is dropped or clamped, never trusted. Returns null if it is not a MixingMagic file. */
export function deserialise(text) {
  let o; try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || o.v !== 1 || !o.pattern || typeof o.pattern !== 'object') return null;
  const num = (x, lo, hi, d) => (Number.isFinite(+x) ? Math.min(hi, Math.max(lo, +x)) : d);
  const pattern = emptyPattern();
  for (const t of TRACKS) for (const r of t.rows) {
    const src = o.pattern[t.id] && o.pattern[t.id][rowKey(r)];
    if (Array.isArray(src)) for (let s = 0; s < STEPS; s++) pattern[t.id][rowKey(r)][s] = Math.round(num(src[s], 0, 3, 0));
  }
  const mix = {};
  for (const t of TRACKS) { const m = o.mix && o.mix[t.id]; if (m) mix[t.id] = { level: num(m.level, 0, 1, 1), mute: !!m.mute }; }
  return { bpm: Math.round(num(o.bpm, 60, 200, 120)), swing: num(o.swing, 0, 0.5, 0), pattern, mix };
}

/* ---------- export ---------- */
/** 16-bit PCM WAV from one or two channels of float samples. */
export function encodeWav(channels, sr) {
  const n = channels[0].length, nch = channels.length, bytes = n * nch * 2, buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) { const x = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return buf;
}

// GlowGrain sound generation. Pure functions: sample rate in, Float32Array out.
// No Web Audio and no DOM, so the same code runs in the page, in an
// OfflineAudioContext export and under Node for testing.
//
// Nothing here is a recording. A felt piano note is ~14 stretched partials, each
// a pair of slightly detuned "strings" with a two-stage decay (the prompt sound
// and the after-sound), a felt-hammer spectral rolloff, a strike-point comb, a
// low thump and a puff of filtered noise. A marimba bar is three modes tuned
// 1 : 4 : 10 plus a resonator tube. They are rendered once per pitch group on
// first use and played back with a small playbackRate shift.

import { clamp, mulberry32 } from "./theory.js";

const TAU = Math.PI * 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Add one decaying sinusoid (two-stage envelope) into `out` with a sine recurrence. */
function addMode(out, sr, freq, amp, phase, tau1, tau2, w2) {
  if (freq <= 20 || freq >= sr * 0.45 || amp < 1e-5) return;
  const n = out.length, w = (TAU * freq) / sr, c2 = 2 * Math.cos(w);
  let s1 = Math.sin(phase - w), s0 = Math.sin(phase);
  const k1 = Math.exp(-1 / (tau1 * sr)), k2 = Math.exp(-1 / (tau2 * sr));
  let e1 = 1 - w2, e2 = w2;
  for (let i = 0; i < n; i++) {
    out[i] += amp * (e1 + e2) * s0;
    const s = c2 * s0 - s1; s1 = s0; s0 = s;
    e1 *= k1; e2 *= k2;
    if (e1 + e2 < 2e-5) break;
  }
}

/** Scale `out` so the RMS of its first `win` seconds hits `target`; never clip. */
function leveled(out, sr, target, win = 0.5) {
  const n = Math.min(out.length, Math.floor(win * sr));
  let e = 0; for (let i = 0; i < n; i++) e += out[i] * out[i];
  const rms = Math.sqrt(e / Math.max(1, n)) || 1e-9;
  let pk = 1e-9; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  const g = Math.min(target / rms, 0.95 / pk);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

function fadeTail(out, sr, sec) {
  const f = Math.min(out.length, Math.floor(sec * sr));
  for (let i = 0; i < f; i++) { const k = i / f; out[out.length - 1 - i] *= k * k * (3 - 2 * k); }
}

export const PIANO_RANGE = [21, 108];
export const MARIMBA_RANGE = [40, 100];

/** Felt piano note, mono. */
export function bakePiano(midi, sr) {
  midi = clamp(midi, PIANO_RANGE[0], PIANO_RANGE[1]);
  const f0 = hz(midi);
  const dur = clamp(6.0 - (midi - 36) * 0.07, 2.0, 5.6);
  const out = new Float32Array(Math.floor(dur * sr));
  const rnd = mulberry32(4001 + midi * 37);

  const B = 0.00016 * (1 + Math.pow((midi - 58) / 26, 2) * 1.5);           // string stiffness: stretches upper partials
  const t60 = clamp(10.5 - (midi - 30) * 0.13, 2.4, 10.5);                  // fundamental T60 (s)
  const tau0 = t60 / 6.9;
  const strike = 0.11 + 0.012 * rnd();                                       // hammer strike point (fraction of string)
  // felt: how many partials survive. Baked fairly bright on purpose; the per-note velocity filter
  // at play time is what makes a soft touch muffled and a firm touch open.
  const bright = clamp(9.2 - (midi - 60) * 0.04, 6, 9.2);
  const maxP = Math.min(30, Math.floor((sr * 0.42) / f0));

  for (let p = 1; p <= maxP; p++) {
    const fp = p * f0 * Math.sqrt(1 + B * p * p);
    let a = Math.pow(p, -0.6) * Math.exp(-(p - 1) / (bright + 3.5));
    a *= 0.16 + Math.abs(Math.sin(Math.PI * p * strike));
    if (p === 2) a *= 1.15;                                                  // a little body in the 2nd/3rd
    a /= 1 + Math.pow(fp / 3000, 2.4);                                       // felt hammers soften anything above ~3 kHz
    if (a < 0.006) continue;
    const tau = tau0 / (1 + 0.36 * Math.pow(p - 1, 1.08));
    const d = (0.0005 + 0.0007 * rnd()) * (p === 1 ? 0.8 : 1);              // unison detune -> slow shimmer
    const ph = rnd() * TAU;
    addMode(out, sr, fp, a * 0.54, ph, tau, tau * 3.6, 0.32);
    addMode(out, sr, fp * (1 + d), a * 0.46, ph + 1.7, tau * 1.06, tau * 3.2, 0.34);
  }

  // soft felt attack on the tonal part
  const att = Math.floor(0.06 * sr);
  for (let i = 0; i < att; i++) out[i] *= 1 - Math.exp(-i / (0.0042 * sr));

  // hammer: felt thump + a puff of low-passed noise
  const tf = clamp(f0 * 0.5, 52, 120), thumpN = Math.floor(0.12 * sr), nz = Math.floor(0.045 * sr);
  const thumpAmp = 0.16 * clamp(1.3 - (midi - 36) / 60, 0.35, 1);
  for (let i = 0; i < thumpN && i < out.length; i++) {
    const t = i / sr;
    out[i] += thumpAmp * Math.sin(TAU * tf * t) * Math.exp(-t / 0.028) * (1 - Math.exp(-t / 0.0015));
  }
  let lp = 0;
  for (let i = 0; i < nz && i < out.length; i++) {
    lp += 0.10 * ((rnd() * 2 - 1) - lp);
    out[i] += lp * 0.55 * Math.exp(-i / (0.0075 * sr));
  }

  fadeTail(out, sr, 0.4);
  return leveled(out, sr, 0.105);
}

/**
 * Marimba bar, mono. Soft mallet on a rosewood bar: the fundamental (a slightly detuned pair, so it
 * shimmers) carries the note; the 4th partial is a quick bright "tock" and the 10th is barely there.
 * A tube resonator keeps the fundamental ringing warmly under the bar.
 */
export function bakeMarimba(midi, sr) {
  midi = clamp(midi, MARIMBA_RANGE[0], MARIMBA_RANGE[1]);
  const f0 = hz(midi);
  const dur = clamp(3.0 - (midi - 48) * 0.032, 1.1, 3.0);
  const out = new Float32Array(Math.floor(dur * sr));
  const rnd = mulberry32(9001 + midi * 53);
  const tau1 = clamp(0.66 - (midi - 48) * 0.0058, 0.2, 0.66);

  addMode(out, sr, f0, 0.62, rnd() * TAU, tau1, tau1 * 2.4, 0.3);
  addMode(out, sr, f0 * (1 + 0.0013), 0.4, rnd() * TAU, tau1 * 1.06, tau1 * 2.2, 0.3);
  addMode(out, sr, f0 * 4.0 * (1 + 0.003 * (rnd() - 0.5)), 0.17, rnd() * TAU, tau1 * 0.2, tau1 * 0.45, 0.15);
  addMode(out, sr, f0 * 9.9 * (1 + 0.005 * (rnd() - 0.5)), 0.035, rnd() * TAU, tau1 * 0.06, tau1 * 0.1, 0.1);
  addMode(out, sr, f0, 0.3, rnd() * TAU, tau1 * 2.0, tau1 * 3.2, 0.5);        // resonator tube

  const att = Math.floor(0.03 * sr);
  for (let i = 0; i < att; i++) out[i] *= 1 - Math.exp(-i / (0.0022 * sr));  // soft mallet: a rounded onset

  // mallet: a muffled knock (low-passed) plus a faint woody body resonance
  let lp = 0, lp2 = 0, b1 = 0, b2 = 0;
  const nz = Math.floor(0.05 * sr);
  const wf = 2 * Math.sin(Math.PI * Math.min(f0 * 2.7, 2400) / sr);
  for (let i = 0; i < nz && i < out.length; i++) {
    const x = rnd() * 2 - 1;
    lp += 0.07 * (x - lp); lp2 += 0.02 * (x - lp2);
    out[i] += (lp - lp2) * 0.55 * Math.exp(-i / (0.005 * sr));
    b1 += wf * b2; const hi = x - b1 - 0.08 * b2; b2 += wf * hi;           // narrow band-pass: the bar's wood
    out[i] += b2 * 0.05 * Math.exp(-i / (0.012 * sr));
  }
  fadeTail(out, sr, 0.3);
  return leveled(out, sr, 0.1, 0.3);
}

/** Restrained hand percussion: shaker, wood tick, soft conga. */
export function bakePerc(kind, sr) {
  const rnd = mulberry32(7000 + kind.length * 91);
  if (kind === "shaker") {
    const out = new Float32Array(Math.floor(0.16 * sr)); let lp = 0, soft = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, x = rnd() * 2 - 1;
      lp += 0.28 * (x - lp);
      soft += 0.45 * ((x - lp) - soft);                                  // roll the top off (~7 kHz): a shaker, not a hiss
      const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.032);
      out[i] = soft * env;
    }
    fadeTail(out, sr, 0.02);
    return leveled(out, sr, 0.06, 0.12);
  }
  if (kind === "tick") {
    const out = new Float32Array(Math.floor(0.14 * sr)); let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, f = 920 + 360 * Math.exp(-t / 0.006);
      ph += (TAU * f) / sr;
      const click = i < 0.002 * sr ? (rnd() * 2 - 1) * 0.5 : 0;
      out[i] = (Math.sin(ph) * Math.exp(-t / 0.014) + click) * (1 - Math.exp(-t / 0.0006));
    }
    fadeTail(out, sr, 0.02);
    return leveled(out, sr, 0.07, 0.08);
  }
  // soft conga / hand drum
  const out = new Float32Array(Math.floor(0.5 * sr)); let ph = 0, lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, f = 118 + 78 * Math.exp(-t / 0.035);
    ph += (TAU * f) / sr;
    lp += 0.12 * ((rnd() * 2 - 1) - lp);
    const body = Math.sin(ph) * Math.exp(-t / 0.13);
    const slap = lp * Math.exp(-t / 0.012) * 0.55;
    out[i] = (body + slap) * (1 - Math.exp(-t / 0.001));
  }
  fadeTail(out, sr, 0.1);
  return leveled(out, sr, 0.12, 0.2);
}

/** Procedural sunlit-room reverb: decaying noise that darkens with age, soft early taps, a slow bloom. */
export function makeReverbIR(sr, seconds = 2.8, seed = 99) {
  const pre = Math.floor(0.016 * sr), len = Math.floor(sr * (seconds + 0.02)) + pre;
  const chans = [new Float32Array(len), new Float32Array(len)];
  chans.forEach((d, ch) => {
    const rnd = mulberry32(seed + ch * 7919);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.pow(10, (-3 * t) / seconds) * (1 - Math.exp(-t / 0.028));
      const a = Math.min(0.97, 0.18 + 0.78 * Math.pow(t / seconds, 0.7));
      lp = lp * a + (rnd() * 2 - 1) * (1 - a);
      d[i] = lp * env * (1 + (1 - a) * 0.6);
    }
    for (let k = 0; k < 9; k++) {
      const at = pre + Math.floor((0.006 + rnd() * 0.06) * sr);
      if (at < len) d[at] += (rnd() < 0.5 ? -1 : 1) * 0.16 * (1 - k * 0.07);
    }
    const f = Math.floor(0.2 * sr);
    for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f;
  });
  let e = 0; for (const d of chans) for (let i = 0; i < len; i++) e += d[i] * d[i];
  const g = 1 / Math.sqrt(e / 2 || 1) * 0.55;
  for (const d of chans) for (let i = 0; i < len; i++) d[i] *= g;
  return chans;
}

/**
 * Gentle asymmetric tape saturation curve (adds even harmonics, rounds peaks).
 * Unity slope at zero, so quiet signals pass unchanged and only louder ones compress.
 */
export function tapeCurve(drive = 0.5, n = 2048) {
  const c = new Float32Array(n), k = 1 + drive * 2.2, b = 0.08 * drive, norm = k * (1 - Math.tanh(b) * Math.tanh(b));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(k * x + b) - Math.tanh(b)) / norm;
  }
  return c;
}

/** Master soft clip: transparent below ~-6 dB, rounds the rare peak instead of squaring it. */
export function softClipCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
  }
  return c;
}

/** Vowel formants (Hz) for the choir: alto-ish, chosen for beauty rather than speech. */
export const VOWELS = {
  ah: [780, 1150, 2800],
  oh: [470, 830, 2700],
  oo: [330, 720, 2560],
  eh: [560, 1780, 2600],
  ee: [320, 2200, 2900],
};

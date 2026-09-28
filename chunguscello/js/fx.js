// Impulse responses and curves, all generated in the browser — no IR files.
//
// Body: a cello body is a box of resonances. We build its impulse response by
// summing damped sine "modes": a handful of strong, named low modes (the air
// resonance around 100 Hz, the main wood modes around 180–220 Hz), then a
// dense forest of higher modes shaped by a broad "bridge hill". Convolving the
// string's bridge force with that response is what turns a buzzy waveguide
// into something that sounds like it's made of spruce and maple.

import { mulberry32 } from "./theory.js";

// Low modes per body type: [Hz, relative amplitude, decay seconds]
const BODIES = {
  concert: {
    name: "Concert cello",
    low: [[102, 0.9, 0.09], [145, 0.35, 0.05], [196, 1.0, 0.06], [222, 0.85, 0.06], [300, 0.45, 0.04], [412, 0.6, 0.035], [520, 0.4, 0.03], [585, 0.5, 0.03], [720, 0.3, 0.025]],
    hill: 1600, hillWidth: 1.1, hillGain: 1.0, tilt: 1.0, density: 90, direct: 0.18,
  },
  baroque: {
    name: "Baroque (gut strings)",
    low: [[98, 1.0, 0.1], [140, 0.4, 0.06], [188, 1.0, 0.07], [214, 0.8, 0.07], [290, 0.5, 0.05], [395, 0.45, 0.04], [505, 0.3, 0.03]],
    hill: 1100, hillWidth: 1.0, hillGain: 0.6, tilt: 1.5, density: 70, direct: 0.12,
  },
  carbon: {
    name: "Carbon fibre",
    low: [[110, 0.7, 0.07], [205, 1.0, 0.05], [236, 0.9, 0.05], [330, 0.6, 0.035], [455, 0.7, 0.03], [610, 0.6, 0.025]],
    hill: 2300, hillWidth: 1.2, hillGain: 1.4, tilt: 0.7, density: 100, direct: 0.22,
  },
  electric: {
    name: "Electric (silent cello)",
    low: [[160, 0.4, 0.02], [320, 0.3, 0.015]],
    hill: 2600, hillWidth: 1.6, hillGain: 0.5, tilt: 0.6, density: 25, direct: 0.8,
  },
  cardboard: {
    name: "Cardboard box",
    low: [[180, 1.0, 0.03], [260, 0.8, 0.025], [410, 0.9, 0.02], [690, 0.7, 0.015]],
    hill: 900, hillWidth: 0.8, hillGain: 1.2, tilt: 1.8, density: 45, direct: 0.1,
  },
};
export const BODY_TYPES = Object.fromEntries(Object.entries(BODIES).map(([k, v]) => [k, v.name]));

export function makeBodyIR(ctx, type = "concert") {
  const b = BODIES[type] || BODIES.concert;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.16);
  const ir = ctx.createBuffer(2, len, sr);
  const rand = mulberry32(1234 + type.length * 77);
  const modes = [];
  for (const [f, a, d] of b.low) modes.push([f, a, d]);
  // Dense upper modes, spaced roughly log-uniformly, amplitude shaped by the bridge hill.
  for (let i = 0; i < b.density; i++) {
    const f = 650 * Math.pow(9000 / 650, rand());
    const oct = Math.log2(f / b.hill) / b.hillWidth;
    const hill = b.hillGain * Math.exp(-oct * oct * 1.4);
    const tilt = Math.pow(650 / f, 0.35 * b.tilt);
    const a = (0.25 + 0.75 * rand()) * (0.35 * tilt + hill * 0.55);
    const d = 0.004 + 0.02 * Math.pow(650 / f, 0.8) * (0.5 + rand());
    modes.push([f, a, d]);
  }
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (const [f, a, d] of modes) {
      // each channel gets its own mode phases → a little width, like two mics
      const ph = rand() * Math.PI * 2;
      const w = 2 * Math.PI * f / sr;
      const k = Math.exp(-1 / (d * sr));
      // recursive oscillator: cheap damped sinusoid
      let env = a, c = Math.cos(w), s0 = Math.sin(ph), s1 = Math.sin(ph - w);
      const n = Math.min(len, Math.floor(d * sr * 7));
      for (let i = 0; i < n; i++) {
        const s = 2 * c * s0 - s1; s1 = s0; s0 = s;
        data[i] += s1 * env;
        env *= k;
      }
    }
    // normalise to unit energy, then add the direct (bridge) path
    let e = 0; for (let i = 0; i < len; i++) e += data[i] * data[i];
    const g = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < len; i++) data[i] *= g * (1 - b.direct);
    data[0] += b.direct * 1.2;
    // tiny fade-out to avoid a click at the end of the response
    for (let i = len - 256; i < len; i++) data[i] *= (len - i) / 256;
  }
  return ir;
}

// Reverb rooms: decaying noise whose brightness falls over time, with a few
// early reflections at the front. [seconds, predelay, damping, early]
const ROOMS = {
  chamber: { name: "Chamber", t: 1.3, pre: 0.008, damp: 0.55, early: 0.5, bright: 0.7 },
  hall: { name: "Concert hall", t: 2.6, pre: 0.022, damp: 0.6, early: 0.35, bright: 0.55 },
  church: { name: "Cathedral", t: 6.5, pre: 0.035, damp: 0.7, early: 0.25, bright: 0.45 },
  plate: { name: "Plate", t: 2.0, pre: 0.002, damp: 0.3, early: 0.0, bright: 1.0 },
  darkroom: { name: "Darkroom (small, dead)", t: 0.45, pre: 0.003, damp: 0.75, early: 0.8, bright: 0.5 },
  cave: { name: "Cave", t: 4.0, pre: 0.06, damp: 0.5, early: 0.6, bright: 0.35 },
};
export const ROOM_TYPES = Object.fromEntries(Object.entries(ROOMS).map(([k, v]) => [k, v.name]));

export function makeReverbIR(ctx, type = "hall") {
  const r = ROOMS[type] || ROOMS.hall;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (r.t * 1.15 + r.pre));
  const ir = ctx.createBuffer(2, len, sr);
  const rand = mulberry32(99 + type.length * 13);
  const pre = Math.floor(r.pre * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.pow(10, (-3 * t) / r.t);
      // lowpass coefficient closes as the tail ages (air absorbs the highs)
      const a = Math.min(0.98, 0.05 + (1 - r.bright) * 0.5 + r.damp * (t / r.t) * 0.9);
      lp = lp * a + (rand() * 2 - 1) * (1 - a);
      d[i] = lp * env * (1 + (1 - a) * 0.5);
    }
    // early reflections
    if (r.early > 0) {
      for (let k = 0; k < 12; k++) {
        const at = pre + Math.floor((0.004 + rand() * 0.07) * sr);
        if (at < len) d[at] += (rand() < 0.5 ? -1 : 1) * r.early * (0.6 - k * 0.04) * 0.35;
      }
    }
    // normalise energy
    let e = 0; for (let i = 0; i < len; i++) e += d[i] * d[i];
    const g = 0.6 / Math.sqrt(e || 1);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return ir;
}

/** Waveshaper curve for the drive: asymmetric soft clip, like a pushed valve stage. */
export function driveCurve(amount = 0.5, n = 2048) {
  const c = new Float32Array(n);
  const k = 1 + amount * 40;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = Math.tanh(k * x + 0.15 * amount) - Math.tanh(0.15 * amount);
    c[i] = y / Math.tanh(k);
  }
  return c;
}

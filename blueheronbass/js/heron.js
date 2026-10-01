// Synthesised blue-heron calls. No recordings ship with this instrument:
// a heron's "fraaank" is a rough, pulsed, low croak — a jittery sawtooth-ish
// source (with noise riding on each pulse) pushed through three sweeping
// formant filters and soft-clipped for grit. Drop real recordings into
// samples/ (see README) and they replace these.

export const HERON_SR = 44100;

export const CALLS = [
  { id: "croak",  name: "Croak",  dur: 0.62, f0: [210, 105], harsh: 0.55, fl: 38, flD: 0.12, f1: [480, 780],  f2: [1400, 1050], f3: [2600, 2300], drive: 2.2 },
  { id: "squawk", name: "Squawk", dur: 0.38, f0: [330, 190], harsh: 0.70, fl: 0,  flD: 0,    f1: [700, 1000], f2: [1700, 1500], f3: [3000, 2800], drive: 3.0 },
  { id: "rattle", name: "Rattle", dur: 0.90, f0: [150, 120], harsh: 0.35, fl: 26, flD: 0.55, f1: [420, 520],  f2: [1200, 1300], f3: [2400, 2400], drive: 2.5 },
  { id: "shriek", name: "Shriek", dur: 0.42, f0: [700, 380], harsh: 0.40, fl: 14, flD: 0.08, f1: [900, 1300], f2: [2200, 1900], f3: [3600, 3300], drive: 2.4 },
  { id: "clack",  name: "Clack",  clack: true },
  { id: "cowbell", name: "Cowbell", cowbell: true },
];

export function synthCall(c, sr = HERON_SR) {
  let seed = 90210 + c.id.length * 7919;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  let out;

  if (c.cowbell) {
    // 808-style cowbell: two detuned squares through a bandpass, punchy two-stage decay
    out = new Float32Array(Math.floor(0.55 * sr));
    let low = 0, band = 0, p1 = 0, p2 = 0;
    const f1 = 2 * Math.sin(Math.PI * 1000 / sr), q = 0.45;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      p1 += 562 / sr; p2 += 845 / sr;
      const x = ((p1 % 1) < 0.5 ? 1 : -1) + ((p2 % 1) < 0.5 ? 1 : -1);
      low += f1 * band; const high = x - low - q * band; band += f1 * high;
      out[i] = band * (0.65 * Math.exp(-t / 0.012) + 0.35 * Math.exp(-t / 0.13));
    }
  } else if (c.clack) {
    // bill clacks: three short resonant noise bursts
    out = new Float32Array(Math.floor(0.3 * sr));
    let low = 0, band = 0;
    const f1 = 2 * Math.sin(Math.PI * 2400 / sr), q = 0.12;
    for (const t0 of [0, 0.075, 0.14]) {
      const s0 = Math.floor(t0 * sr), len = Math.floor(0.05 * sr);
      for (let i = 0; i < len && s0 + i < out.length; i++) {
        const x = rnd() * Math.exp(-i / (0.0016 * sr));
        low += f1 * band; const high = x - low - q * band; band += f1 * high;
        out[s0 + i] += band;
      }
    }
  } else {
    const n = Math.floor(c.dur * sr);
    out = new Float32Array(n);
    let ph = 0;
    const st = [[0, 0], [0, 0], [0, 0]]; // [low, band] per formant
    const q = 0.18;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f0 = (c.f0[0] + (c.f0[1] - c.f0[0]) * Math.pow(p, 0.8)) * (1 + 0.02 * rnd()) * (1 + c.flD * Math.sin(2 * Math.PI * c.fl * i / sr));
      ph += f0 / sr; if (ph >= 1) ph -= 1;
      const saw = 2 * ph - 1;
      const src = saw * (1 - c.harsh) + rnd() * c.harsh * (0.6 + 0.4 * Math.abs(saw));
      const env = Math.min(1, p / 0.06) * Math.pow(1 - p, 0.6);
      let y = src * 0.12;
      [c.f1, c.f2, c.f3].forEach((fr, k) => {
        const fc = fr[0] + (fr[1] - fr[0]) * p;
        const f = 2 * Math.sin(Math.PI * fc / sr);
        const s = st[k];
        s[0] += f * s[1]; const high = src - s[0] - q * s[1]; s[1] += f * high;
        y += s[1] * [1, 0.7, 0.35][k];
      });
      out[i] = Math.tanh(y * env * c.drive);
    }
  }
  // normalise, and fade the last few ms so it never clicks
  let pk = 1e-9; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  const fade = Math.floor(0.008 * sr);
  for (let i = 0; i < out.length; i++) {
    out[i] *= 0.9 / pk;
    if (i > out.length - fade) out[i] *= (out.length - i) / fade;
  }
  return out;
}

// Sonic Smithy DSP core. Pure functions on Float32Array — no DOM, runs in Node too.
export const SR = 48000;
const TAU = Math.PI * 2;

// ---------- random ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.vary = (v, pct) => v * (1 + (r() * 2 - 1) * pct);
  return r;
}

export const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
export const undb = (d) => Math.pow(10, d / 20);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const N = (sec, sr = SR) => Math.max(1, Math.round(sec * sr));

// ---------- noise ----------
export function white(n, r) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = r() * 2 - 1;
  return o;
}
export function pink(n, r) { // Paul Kellet economy filter
  const o = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return o;
}
export function brown(n, r) {
  const o = new Float32Array(n); let l = 0;
  for (let i = 0; i < n; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; o[i] = l * 3.5; }
  return o;
}

// ---------- envelopes & oscillators ----------
/** Piecewise envelope through [[sec, value], ...]. exp=true interpolates geometrically. */
export function env(n, pts, exp = false, sr = SR) {
  const o = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [t0, v0] = pts[k], [t1, v1] = pts[Math.min(k + 1, pts.length - 1)];
    let u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
    o[i] = exp && v0 > 0 && v1 > 0 ? v0 * Math.pow(v1 / v0, u) : v0 + (v1 - v0) * u;
  }
  return o;
}
/** Instant attack, exponential decay with time-constant tau (s). */
export function decay(n, tau, sr = SR, attack = 0.0005) {
  const o = new Float32Array(n), a = Math.max(1, attack * sr);
  for (let i = 0; i < n; i++) o[i] = Math.min(1, i / a) * Math.exp(-i / sr / tau);
  return o;
}
/** Frequency track that glides f0->f1 over dur seconds (exponential) then holds. */
export function glide(n, f0, f1, dur, sr = SR, curve = 1) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = clamp(i / sr / dur, 0, 1), c = Math.pow(u, curve);
    o[i] = f0 * Math.pow(f1 / f0, c);
  }
  return o;
}
export function osc(n, freq, shape = 'sine', sr = SR, phase0 = 0) {
  const o = new Float32Array(n); let p = phase0;
  const fa = typeof freq === 'number' ? null : freq;
  for (let i = 0; i < n; i++) {
    const f = fa ? fa[i] : freq;
    p += f / sr; p -= Math.floor(p);
    o[i] = shape === 'sine' ? Math.sin(p * TAU)
      : shape === 'tri' ? 4 * Math.abs(p - 0.5) - 1
      : shape === 'saw' ? 2 * p - 1
      : p < 0.5 ? 1 : -1;
  }
  return o;
}
/** 2-op FM: carrier freq array/number, modulator ratio & index (index may be array). */
export function fm(n, fc, ratio, index, sr = SR) {
  const o = new Float32Array(n); let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof fc === 'number' ? fc : fc[i];
    const ix = typeof index === 'number' ? index : index[i];
    pm += (f * ratio) / sr; pc += f / sr;
    o[i] = Math.sin(pc * TAU + ix * Math.sin(pm * TAU));
  }
  return o;
}

// ---------- array math ----------
export const mul = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * (typeof b === 'number' ? b : b[i]); return o; };
export const add = (a, b) => { const n = Math.max(a.length, b.length), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (a[i] || 0) + (b[i] || 0); return o; };
export const scale = (a, g) => mul(a, g);
/** Mix `src` into `dst` in place starting at sample `at`, growing not allowed (dst preallocated). */
export function mixInto(dst, src, at = 0, g = 1) {
  for (let i = 0; i < src.length; i++) { const j = i + at; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; }
}
export const peakOf = (a) => { let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m; };
export function normalize(a, targetDb = -1) { const p = peakOf(a); if (p < 1e-9) return a; return mul(a, undb(targetDb) / p); }

// ---------- filters ----------
/** Time-varying TPT state-variable filter. type: lp | hp | bp | notch. fc: number or per-sample array. */
export function svf(x, fc, q = 0.707, type = 'lp', sr = SR) {
  const o = new Float32Array(x.length); let ic1 = 0, ic2 = 0;
  const fa = typeof fc === 'number' ? null : fc;
  const qa = typeof q === 'number' ? null : q;
  let g = Math.tan(Math.PI * Math.min(fc || 1000, sr * 0.45) / sr);
  for (let i = 0; i < x.length; i++) {
    if (fa) g = Math.tan(Math.PI * clamp(fa[i], 10, sr * 0.45) / sr);
    const k = 1 / (qa ? qa[i] : q);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = x[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    o[i] = type === 'lp' ? v2 : type === 'bp' ? k * v1 : type === 'hp' ? v0 - k * v1 - v2 : v0 - k * v1;
  }
  return o;
}
/** RBJ biquad. type: lowshelf | highshelf | peak | lp | hp */
export function biquad(x, type, f, q = 0.707, gainDb = 0, sr = SR) {
  const A = Math.pow(10, gainDb / 40), w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; }
  else if (type === 'highshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  return biquadRaw(x, [b0 / a0, b1 / a0, b2 / a0], [a1 / a0, a2 / a0]);
}
export function biquadRaw(x, b, a) {
  const o = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y;
  }
  return o;
}
/** 4th-order (24 dB/oct) via two cascaded SVFs — used for layer band-splitting. */
export const lp4 = (x, f, sr = SR) => svf(svf(x, f, 0.707, 'lp', sr), f, 0.707, 'lp', sr);
export const hp4 = (x, f, sr = SR) => svf(svf(x, f, 0.707, 'hp', sr), f, 0.707, 'hp', sr);

// ---------- dynamics & colour ----------
export function softClip(x, drive = 1.5) {
  const o = new Float32Array(x.length), n = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) o[i] = Math.tanh(x[i] * drive) / n;
  return o;
}
export function bitcrush(x, bits = 8, hold = 1) {
  const o = new Float32Array(x.length), q = Math.pow(2, bits - 1); let h = 0;
  for (let i = 0; i < x.length; i++) { if (i % hold === 0) h = Math.round(x[i] * q) / q; o[i] = h; }
  return o;
}
export function ringmod(x, f, sr = SR) { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * Math.sin(TAU * f * i / sr); return o; }
/** Feed-forward compressor over N linked channels. Returns new channels. */
export function compress(chs, { thresh = -18, ratio = 3, attack = 0.003, release = 0.08, makeup = 0, sr = SR } = {}) {
  const n = chs[0].length, out = chs.map(() => new Float32Array(n));
  const ca = Math.exp(-1 / (attack * sr)), cr = Math.exp(-1 / (release * sr)), mk = undb(makeup);
  let e = 0;
  for (let i = 0; i < n; i++) {
    let p = 0; for (const c of chs) p = Math.max(p, Math.abs(c[i]));
    e = p > e ? ca * e + (1 - ca) * p : cr * e + (1 - cr) * p;
    const over = db(e) - thresh, gr = over > 0 ? -over * (1 - 1 / ratio) : 0, g = undb(gr) * mk;
    for (let c = 0; c < chs.length; c++) out[c][i] = chs[c][i] * g;
  }
  return out;
}
/** Look-ahead brickwall limiter (offline, non-causal so the ceiling is guaranteed). */
export function limit(chs, ceilDb = -1, lookMs = 1.5, sr = SR) {
  const n = chs[0].length, L = Math.max(2, Math.round(lookMs * 0.001 * sr)), th = undb(ceilDb);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { let p = 0; for (const c of chs) p = Math.max(p, Math.abs(c[i])); need[i] = p > th ? th / p : 1; }
  const mn = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 1; const a = Math.max(0, i - L), b = Math.min(n - 1, i + L); for (let j = a; j <= b; j++) if (need[j] < m) m = need[j]; mn[i] = m; }
  // Moving average of the min-filtered curve: every mn[j] within +-L of i is <= need[i],
  // so the average can never exceed what sample i requires (guaranteed ceiling, smooth ramps).
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + mn[i];
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i - L, b = i + L; let s = pre[Math.min(n, b + 1)] - pre[Math.max(0, a)];
    s += Math.max(0, -a) * mn[0] + Math.max(0, b + 1 - n) * mn[n - 1];
    g[i] = s / (2 * L + 1);
  }
  return chs.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * g[i]; return o; });
}

// ---------- time / space ----------
export function fade(x, inMs = 2, outMs = 8, sr = SR) {
  const o = Float32Array.from(x), a = Math.round(inMs * 0.001 * sr), b = Math.round(outMs * 0.001 * sr);
  for (let i = 0; i < a && i < o.length; i++) o[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b && i < o.length; i++) o[o.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  return o;
}
export function delay(x, samples) { const o = new Float32Array(x.length + samples); o.set(x, samples); return o; }
export const reverse = (x) => Float32Array.from(x).reverse();
/** Resample by ratio (>1 = higher pitch/shorter). 4-point cubic. */
export function resample(x, ratio) {
  const n = Math.max(1, Math.floor(x.length / ratio)), o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, k = Math.floor(p), f = p - k;
    const a = x[k - 1] ?? x[0], b = x[k] ?? 0, c = x[k + 1] ?? 0, d = x[k + 2] ?? 0;
    o[i] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  return o;
}
export const semis = (s) => Math.pow(2, s / 12);
/** Small Schroeder room. Deliberately short: rt60 capped, `mix` capped — SFX shouldn't wash out. */
export function reverb(x, { rt60 = 0.25, mix = 0.1, damp = 4500, sr = SR } = {}) {
  rt60 = clamp(rt60, 0.05, 0.9); mix = clamp(mix, 0, 0.35);
  const tail = Math.round(rt60 * 1.2 * sr), n = x.length + tail, inp = new Float32Array(n); inp.set(x);
  const ds = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.round(d * sr));
  let wet = new Float32Array(n);
  for (const d of ds) {
    const g = Math.pow(10, -3 * (d / sr) / rt60), buf = new Float32Array(d); let lp = 0, idx = 0;
    const dc = Math.exp(-TAU * damp / sr);
    for (let i = 0; i < n; i++) {
      const y = buf[idx]; lp = y * (1 - dc) + lp * dc; buf[idx] = inp[i] + lp * g; idx = (idx + 1) % d; wet[i] += y * 0.25;
    }
  }
  for (const [dm, g] of [[0.005, 0.7], [0.0017, 0.7]]) { // allpass diffusers
    const d = Math.round(dm * sr), buf = new Float32Array(d); let idx = 0;
    for (let i = 0; i < n; i++) { const b = buf[idx], v = wet[i] + b * g; buf[idx] = v; wet[i] = b - v * g; idx = (idx + 1) % d; }
  }
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (i < x.length ? x[i] : 0) * (1 - mix * 0.5) + wet[i] * mix * 2.2;
  return o;
}

// ---------- analysis primitives ----------
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** Averaged magnitude spectrum (Hann, hop=size/2). Returns Float32Array(size/2) of power. */
export function spectrum(x, size = 2048) {
  const acc = new Float32Array(size / 2), re = new Float32Array(size), im = new Float32Array(size);
  let frames = 0;
  for (let s = 0; s + size <= Math.max(x.length, size); s += size / 2) {
    for (let i = 0; i < size; i++) { re[i] = (x[s + i] || 0) * (0.5 - 0.5 * Math.cos(TAU * i / size)); im[i] = 0; }
    fftInPlace(re, im);
    for (let i = 0; i < size / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i];
    frames++;
    if (frames > 400) break;
  }
  for (let i = 0; i < acc.length; i++) acc[i] /= Math.max(1, frames);
  return acc;
}
/** BS.1770 K-weighting, returns filtered copy. */
export function kweight(x, sr = SR) {
  const sh = (() => {
    const G = 3.999843853973347, Q = 0.7071752369554196, fc = 1681.974450955533;
    const K = Math.tan(Math.PI * fc / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
    return [[(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]];
  })();
  const hp = (() => {
    const Q = 0.5003270373238773, fc = 38.13547087602444, K = Math.tan(Math.PI * fc / sr), a0 = 1 + K / Q + K * K;
    return [[1, -2, 1], [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]];
  })();
  return biquadRaw(biquadRaw(x, sh[0], sh[1]), hp[0], hp[1]);
}
/** Approx true peak via 4x cubic oversampling. */
export function truePeak(x) {
  let m = 0;
  for (let i = 1; i < x.length - 2; i++) for (let f = 0; f < 4; f++) {
    const t = f / 4, a = x[i - 1], b = x[i], c = x[i + 1], d = x[i + 2];
    const v = Math.abs(b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)))); if (v > m) m = v;
  }
  return Math.max(m, peakOf(x));
}

// ---------- editing helpers ----------
export function trimSilence(chs, thrDb = -55, padMs = 2, sr = SR) {
  const n = chs[0].length, th = undb(thrDb); let a = 0, b = n - 1;
  const loud = (i) => chs.some((c) => Math.abs(c[i]) > th);
  while (a < n && !loud(a)) a++;
  while (b > a && !loud(b)) b--;
  const pad = Math.round(padMs * 0.001 * sr); a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad);
  return chs.map((c) => c.slice(a, b + 1));
}
export function removeDC(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; s /= Math.max(1, x.length); if (Math.abs(s) < 1e-6) return x; return x.map((v) => v - s); }
/** Nearest zero-crossing to sample i (searches +-w). */
export function snapZero(x, i, w = 400) {
  let best = i, bd = 1e9;
  for (let d = 0; d <= w; d++) for (const j of [i - d, i + d]) {
    if (j < 1 || j >= x.length) continue;
    if (x[j - 1] <= 0 && x[j] > 0) { if (d < bd) { bd = d; best = j; } }
  }
  return best;
}
/** Split points at transients using a fast/slow envelope ratio. Returns sample indices. */
export function findTransients(x, sensitivity = 0.5, minGapMs = 60, sr = SR) {
  const hop = 128, n = Math.floor(x.length / hop), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j++) s += Math.abs(x[i * hop + j]); e[i] = s / hop; }
  const marks = []; let slow = 0; const gap = Math.round(minGapMs * 0.001 * sr / hop), ratio = 1.2 + (1 - sensitivity) * 4;
  let last = -gap;
  for (let i = 0; i < n; i++) {
    if (e[i] > slow * ratio && e[i] > 0.02 && i - last >= gap) { marks.push(snapZero(x, i * hop, 200)); last = i; }
    slow = slow * 0.9 + e[i] * 0.1;
  }
  return marks;
}
/** Equal-power crossfade so [start,end) loops seamlessly: blends the `xf` samples before `end` with the ones before `start`. */
export function bakeLoop(x, start, end, xf) {
  xf = Math.min(xf, start, end - start >> 1);
  const o = Float32Array.from(x.subarray(0, end));
  for (let i = 0; i < xf; i++) {
    const u = i / xf, a = Math.cos(u * Math.PI / 2), b = Math.sin(u * Math.PI / 2);
    o[end - xf + i] = x[end - xf + i] * a + x[start - xf + i] * b;
  }
  return o;
}
/** Loop material [a,b) whose last `xf` samples are blended into the head, so wrap-around is seamless. Length = b-a-xf. */
export function loopCrossfade(x, a, b, xf) {
  xf = Math.max(0, Math.min(xf, (b - a) >> 1)); const L = b - a - xf, o = new Float32Array(L);
  for (let i = 0; i < L; i++) o[i] = x[a + i];
  for (let i = 0; i < xf && i < L; i++) { const u = i / xf; o[i] = x[a + i] * Math.sin(u * Math.PI / 2) + x[a + L + i] * Math.cos(u * Math.PI / 2); }
  return o;
}
/** Search for the loop end whose lead-in best matches the start (normalised correlation). */
export function bestLoopEnd(x, start, minLen, maxEnd, win = 2048) {
  let best = maxEnd, bs = -2;
  const step = 64;
  for (let e = Math.max(start + minLen, win); e <= maxEnd; e += step) {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < win; i++) { const a = x[start + i] || 0, b = x[e + i] || 0; sxy += a * b; sxx += a * a; syy += b * b; }
    const c = sxy / Math.sqrt(sxx * syy + 1e-12);
    if (c > bs) { bs = c; best = e; }
  }
  return { end: snapZero(x, best, 300), score: bs };
}

// ---------- master chain ----------
/** Game-ready mastering: DC removal, sub cut, trim, fades, gentle glue, brickwall to ceiling. */
export function gameMaster(chs, o = {}) {
  const { sr = SR, ceil = -1, fadeIn = 1.5, fadeOut = 12, trim = true, glue = true, hpf = 25, mono = false, target = null, loop = false } = o;
  let c = chs.map((x) => svf(removeDC(x), hpf, 0.707, 'hp', sr));
  if (mono && c.length > 1) { const m = new Float32Array(c[0].length); for (const ch of c) for (let i = 0; i < m.length; i++) m[i] += ch[i] / c.length; c = [m]; }
  if (trim && !loop) c = trimSilence(c, -60, 1.5, sr);
  if (glue) c = compress(c, { thresh: -14, ratio: 2.2, attack: 0.004, release: 0.09, sr });
  if (!loop) c = c.map((x) => fade(x, fadeIn, fadeOut, sr));
  const p = Math.max(...c.map(peakOf));
  const g = target != null ? 1 : (p > 1e-9 ? undb(ceil) / p : 1);
  c = c.map((x) => mul(x, g));
  return limit(c, ceil, 1.5, sr);
}

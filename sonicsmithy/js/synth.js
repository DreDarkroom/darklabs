// Sonic Smithy synth: procedural SFX, layered pistol builder, and the rail-grind loop maker.
// Everything returns mono Float32Array at SR (48 kHz) unless noted. Deterministic per seed.
import {
  SR, N, rng, white, pink, brown, env, decay, glide, osc, fm, mul, add, mixInto, svf, biquad, lp4, hp4,
  softClip, bitcrush, compress, limit, fade, delay, reverb, gameMaster, peakOf, undb, clamp, semis, normalize,
} from './dsp.js';
import { PROFILES } from './analyze.js';
import { kweight } from './dsp.js';

const TAU = Math.PI * 2;
const norm1 = (x) => { const p = peakOf(x); return p > 1e-9 ? mul(x, 1 / p) : x; };
const lfoNoise = (n, hz, r) => norm1(svf(white(n, r), hz, 0.7, 'lp'));

// =====================================================================================
// Generic SFX
// =====================================================================================
export const DEFAULT_P = { pitch: 0, len: 1, bright: 0.5, grit: 0.25, scifi: 0.5, space: 0.15 };

/** Cut & fade to the category's max length, add capped room, then game-master. */
export function finish(x, cat, p = DEFAULT_P, o = {}) {
  const prof = PROFILES[cat] || PROFILES.misc;
  let y = x;
  if (p.space > 0.01) y = reverb(y, { rt60: 0.10 + p.space * 0.22, mix: p.space * 0.16, damp: 3500 });
  const maxN = N((o.maxMs ?? prof.len[1]) / 1000);
  if (y.length > maxN) y = y.slice(0, maxN);
  // a natural sound ends in silence: fade over the last ~22% (15-140 ms) rather than clicking off
  const fo = clamp(y.length / SR * 1000 * 0.22, 15, 140);
  y = gameMaster([y], { ceil: o.ceil ?? -1, fadeIn: 1, fadeOut: fo, glue: true })[0];
  return o.matchLoudness === false ? y : attenuateToTarget(y, prof.lufs);
}

/** Loudness-match professionally: only ever turn hot sounds DOWN (never needs a limiter) so a bank sits evenly. */
export function attenuateToTarget(y, targetLufs, sr = SR) {
  const kw = kweight(y, sr), W = Math.min(y.length, N(0.4, sr)), step = N(0.05, sr); let best = 0;
  for (let s = 0; s + W <= y.length; s += step) { let t = 0; for (let i = s; i < s + W; i++) t += kw[i] * kw[i]; best = Math.max(best, t / W); }
  if (y.length <= W) { let t = 0; for (let i = 0; i < y.length; i++) t += kw[i] * kw[i]; best = t / y.length; }
  const lufs = -0.691 + 10 * Math.log10(Math.max(best, 1e-12)), over = lufs - (targetLufs + 2);
  return over > 0 ? mul(y, undb(-over)) : y;
}
const K = {};
const defKind = (id, label, cat, gen) => { K[id] = { id, label, cat, gen }; };

defKind('blaster', 'Blaster bolt', 'energy', (p, r) => {
  const d = 0.30 * p.len, n = N(d + 0.05), f0 = 1900 * semis(p.pitch) * r.vary(1, 0.06), f1 = f0 * (0.14 + 0.1 * (1 - p.bright));
  const fr = glide(n, f0, f1, d * 0.65, SR, 0.7), e = decay(n, d * 0.32);
  const core = mul(fm(n, fr, 2.0, glide(n, 1 + p.scifi * 5, 0.2, d * 0.5)), e);
  const body = mul(osc(n, mul(fr, 0.5), 'saw'), mul(e, 0.35));
  const click = mul(hp4(white(n, r), 3500), decay(n, 0.004, SR, 0.0002)); // transient
  let x = add(add(core, body), mul(click, 0.4));
  x = svf(x, 3500 + p.bright * 7000, 0.8, 'lp');
  return p.grit > 0.05 ? add(mul(x, 1 - p.grit * 0.4), mul(bitcrush(x, 8, 2), p.grit * 0.4)) : x;
});
defKind('plasma', 'Plasma bolt', 'energy', (p, r) => {
  const d = 0.5 * p.len, n = N(d), f = glide(n, 900 * semis(p.pitch), 260 * semis(p.pitch), d * 0.8);
  const e = env(n, [[0, 0], [0.006, 1], [d * 0.25, 0.7], [d, 0]], false);
  const saw = svf(osc(n, f, 'saw'), env(n, [[0, 5000], [d, 700]], true), 3 + p.scifi * 6, 'lp');
  const sizzle = mul(svf(white(n, r), 5200 + p.bright * 3000, 1.5, 'bp'), mul(decay(n, d * 0.3), 0.35 + p.grit * 0.4));
  const wob = osc(n, 22 + p.scifi * 20, 'sine').map((v) => 0.8 + 0.2 * v);
  return mul(add(mul(saw, 0.8), sizzle), mul(e, wob));
});
defKind('zap', 'Electric zap', 'energy', (p, r) => {
  const d = 0.32 * p.len, n = N(d), e = decay(n, d * 0.22);
  const jitter = lfoNoise(n, 900, r).map((v) => 0.5 + 0.5 * v);
  const carrier = svf(white(n, r), env(n, [[0, 6000 + p.bright * 3000], [d, 1500]], true), 2.5, 'bp');
  const buzz = mul(osc(n, 110 * semis(p.pitch) * (1 + p.scifi), 'saw'), 0.3);
  return mul(add(mul(carrier, jitter), buzz), e);
});
defKind('explosion', 'Explosion', 'explosion', (p, r) => {
  const d = 1.5 * p.len, n = N(d), e = decay(n, d * 0.28, SR, 0.004);
  const fc = env(n, [[0, 5000 + p.bright * 4000], [d * 0.5, 600], [d, 120]], true);
  const rumble = mul(svf(pink(n, r), fc, 0.9, 'lp'), e);
  const sub = mul(osc(n, glide(n, 75 * semis(p.pitch), 28, 0.5), 'sine'), mul(decay(n, d * 0.35), 1.4));
  const crack = mul(hp4(white(n, r), 1800), decay(n, 0.05, SR, 0.0004));
  const debris = mul(svf(white(n, r).map((v) => (Math.abs(v) > 0.985 ? v : 0)), 2200, 1.4, 'bp'), decay(n, d * 0.5)).map((v) => v * 6 * p.grit);
  return add(add(rumble, mul(sub, 0.9)), add(mul(crack, 0.5), debris));
});
defKind('impact', 'Heavy impact', 'impact', (p, r) => {
  const d = 0.5 * p.len, n = N(d), f0 = 120 * semis(p.pitch);
  const sub = mul(osc(n, glide(n, f0, f0 * 0.32, 0.12), 'sine'), decay(n, 0.13 * p.len));
  const punch = mul(svf(white(n, r), 1600 + p.bright * 2500, 0.8, 'lp'), decay(n, 0.045));
  let x = add(mul(sub, 1.2), mul(punch, 0.7));
  if (p.scifi > 0.15) { // metallic ring — inharmonic partials, gently
    for (const [m, g] of [[1, 1], [2.76, 0.6], [5.4, 0.35]]) x = add(x, mul(osc(n, 340 * semis(p.pitch) * m, 'sine'), mul(decay(n, 0.13 * m ** -0.4), g * 0.16 * p.scifi)));
  }
  return softClip(x, 1 + p.grit * 1.5);
});
defKind('whoosh', 'Whoosh', 'whoosh', (p, r) => {
  const d = 0.7 * p.len, n = N(d);
  const fc = env(n, [[0, 350], [d * 0.42, 3200 * semis(p.pitch) * (0.6 + p.bright)], [d, 500]], true);
  const e = env(n, [[0, 0], [d * 0.42, 1], [d, 0]]).map((v) => Math.sin(v * Math.PI / 2));
  return mul(svf(pink(n, r), fc, 1.4 + p.scifi * 2, 'bp'), e);
});
const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
defKind('powerup', 'Power-up', 'pickup', (p, r) => {
  const step = 0.075 * p.len, count = 5, n = N(step * count + 0.4), out = new Float32Array(n), base = 523 * semis(p.pitch);
  for (let k = 0; k < count; k++) {
    const f = base * semis(PENT[k + (r() < 0.3 ? 1 : 0)]), m = N(0.32), e = decay(m, 0.11 * p.len, SR, 0.002);
    const tone = add(mul(osc(m, f, 'tri'), 0.7), mul(fm(m, f * 2, 1.5, 0.8 + p.scifi * 2), 0.25 * p.scifi + 0.05));
    mixInto(out, mul(tone, e), N(step * k), 0.6);
  }
  return svf(out, 4000 + p.bright * 6000, 0.7, 'lp');
});
defKind('pickup', 'Pickup chime', 'pickup', (p, r) => {
  const n = N(0.45 * p.len), f = 1318 * semis(p.pitch), out = new Float32Array(n);
  for (const [m, at] of [[1, 0], [1.5, 0.07]]) {
    const len = n - N(at), t = add(fm(len, f * m, 3.5, decay(len, 0.06).map((v) => v * (1 + p.scifi * 2))), mul(osc(len, f * m * 2, 'sine'), 0.2));
    mixInto(out, mul(t, decay(len, 0.12 * p.len)), N(at), 0.6);
  }
  return out;
});
defKind('ui_click', 'UI click', 'ui', (p, r) => {
  const n = N(0.07), f = 1900 * semis(p.pitch), e = decay(n, 0.012, SR, 0.0003);
  return mul(add(mul(osc(n, glide(n, f * 1.3, f, 0.01), 'sine'), 0.8), mul(hp4(white(n, r), 4000), 0.25)), e);
});
defKind('ui_confirm', 'UI confirm', 'ui', (p, r) => {
  const n = N(0.28 * p.len), out = new Float32Array(n), f = 660 * semis(p.pitch);
  for (const [m, at] of [[1, 0], [1.5, 0.085]]) { const l = n - N(at); mixInto(out, mul(add(osc(l, f * m, 'sine'), mul(osc(l, f * m * 2, 'sine'), 0.15 + p.scifi * 0.2)), decay(l, 0.07 * p.len, SR, 0.002)), N(at), 0.6); }
  return out;
});
defKind('ui_error', 'UI error', 'ui', (p, r) => {
  const n = N(0.32 * p.len), out = new Float32Array(n), f = 220 * semis(p.pitch);
  for (const [m, at] of [[1.19, 0], [1, 0.11]]) { const l = n - N(at); mixInto(out, mul(svf(osc(l, f * m, 'saw'), 1200 + p.bright * 1500, 0.8, 'lp'), decay(l, 0.08 * p.len, SR, 0.003)), N(at), 0.7); }
  return out;
});
defKind('shield', 'Shield hit', 'energy', (p, r) => {
  const d = 0.75 * p.len, n = N(d), f = 520 * semis(p.pitch), e = decay(n, d * 0.32);
  const ring = add(fm(n, f, 1.41, 2.2 * p.scifi + 0.4), mul(fm(n, f * 1.5, 2.01, 1.5), 0.5));
  const trem = osc(n, 14, 'sine').map((v) => 0.75 + 0.25 * v);
  const swirl = mul(svf(pink(n, r), env(n, [[0, 4500], [d, 900]], true), 3, 'bp'), 0.5);
  return mul(add(mul(ring, trem), swirl), e);
});
defKind('servo', 'Servo / door', 'mech', (p, r) => {
  const d = 0.7 * p.len, n = N(d), f = env(n, [[0, 90], [d * 0.35, 260 * semis(p.pitch)], [d * 0.8, 240 * semis(p.pitch)], [d, 120]]);
  const whine = svf(osc(n, f, 'saw'), 2200 + p.bright * 2500, 1.4, 'lp');
  const e = env(n, [[0, 0], [0.04, 1], [d * 0.85, 0.8], [d, 0]]);
  const thunk = mul(osc(n, 70, 'sine'), decay(n, 0.05));
  const late = new Float32Array(n); mixInto(late, mul(add(svf(white(n, r), 900, 1, 'lp'), thunk), decay(n, 0.05)), N(d * 0.86), 0.8);
  return add(mul(mul(whine, e), 0.55), late);
});
defKind('teleport', 'Teleport', 'sweep', (p, r) => {
  const d = 0.9 * p.len, n = N(d), f = env(n, [[0, 220], [d * 0.7, 1500 * semis(p.pitch)], [d, 1800 * semis(p.pitch)]], true);
  const tone = fm(n, f, 3.01, env(n, [[0, 0.3], [d * 0.7, 3 * p.scifi + 1], [d, 0]]));
  const shim = svf(white(n, r), env(n, [[0, 600], [d, 4200]], true), 1.4, 'bp');
  const e = env(n, [[0, 0], [d * 0.72, 1], [d, 0]]);
  return svf(mul(add(mul(tone, 0.8), mul(shim, 0.22)), e), 5500, 0.7, 'lp');
});
defKind('dash_whoosh', 'Dash whoosh', 'whoosh', (p, r) => {
  // True doppler shape: a bandpass centre frequency that arcs UP then DOWN (approach -> passing -> departure),
  // with amplitude peaking at the same instant, is what makes fast movement read convincingly (see Design Notes).
  const d = 0.55 * p.len, n = N(d), peak = 0.42;
  const arc = (lo, hi) => env(n, [[0, lo], [d * peak, hi], [d, lo]], true);
  const fc = arc(500, 3400 * semis(p.pitch) * (0.7 + p.bright * 0.6));
  const amp = env(n, [[0, 0], [d * peak, 1], [d, 0]]).map((v) => Math.sin(v * Math.PI / 2));
  let x = mul(svf(pink(n, r), fc, 2.2 + p.scifi * 1.5, 'bp'), amp);
  if (p.scifi > 0.05) { // a faint shimmering "wonder" layer riding the same doppler arc
    const shimmer = mul(osc(n, arc(1200, 4200), 'sine'), mul(amp, 0.18 * p.scifi));
    x = add(x, shimmer);
  }
  return x;
});
defKind('dash_land', 'Dash landing', 'impact', (p, r) => {
  // A soft "feet find the ground" thump, not a crash: shorter, rounder and quieter in the highs than Heavy impact.
  const d = 0.32 * p.len, n = N(d), f0 = 92 * semis(p.pitch);
  const thud = mul(osc(n, glide(n, f0, f0 * 0.45, 0.09), 'sine'), decay(n, 0.1 * p.len));
  const pat = mul(svf(white(n, r), 900 + p.bright * 1200, 0.9, 'lp'), decay(n, 0.03));
  let x = add(mul(thud, 1.1), mul(pat, 0.35));
  if (p.scifi > 0.15) x = add(x, mul(osc(n, 220 * semis(p.pitch), 'sine'), mul(decay(n, 0.1), 0.1 * p.scifi)));
  return softClip(x, 1.1 + p.grit);
});
defKind('ricochet', 'Ricochet', 'impact', (p, r) => {
  const d = 0.5 * p.len, n = N(d), f0 = 2400 * semis(p.pitch);
  let x = new Float32Array(n);
  for (const m of [1, 1.5, 2.3]) x = add(x, mul(osc(n, glide(n, f0 * m, f0 * m * 0.5, d * 0.6), 'sine'), decay(n, 0.09 / m + 0.02)));
  return add(mul(x, 0.5), mul(mul(hp4(white(n, r), 2500), decay(n, 0.01)), 0.5));
});

export const KINDS = K;
export function makeSfx(kind, p = {}, seed = 1, o = {}) {
  const k = K[kind], pp = { ...DEFAULT_P, ...p }, r = rng(seed);
  return finish(k.gen(pp, r), k.cat, pp, o);
}

// =====================================================================================
// Pistol builder: 8 stacked layers, each in its own frequency band, roles as in film/game
// gun design — Click (mechanical transient) / Crack (mid snap) / Body / Sub / Zap (sci-fi
// sweetener) / Action (slide) / Tink (casing) / Tail (short room slap).
// =====================================================================================
export const PISTOL_KINDS = {
  sidearm:  { label: 'Sidearm',        crackHz: 3200, crackTau: 0.016, bodyF: [260, 95, 0.05],  subTau: 0.06, tailTau: 0.08, tailLP: 3200, maxMs: 450, casing: 1, g: { click: -8, crack: -2, body: -3, sub: -12, zap: -30, action: -16, tink: -22, tail: -13 } },
  revolver: { label: 'Revolver',       crackHz: 2400, crackTau: 0.026, bodyF: [190, 70, 0.09],  subTau: 0.10, tailTau: 0.09, tailLP: 2600, maxMs: 560, casing: 0, g: { click: -10, crack: -2, body: -1, sub: -7, zap: -30, action: -18, tink: -30, tail: -11 } },
  silenced: { label: 'Silenced',       crackHz: 2000, crackTau: 0.010, bodyF: [210, 100, 0.04], subTau: 0.05, tailTau: 0.04, tailLP: 2400, maxMs: 380, casing: 1, g: { click: -6, crack: -12, body: -6, sub: -16, zap: -30, action: -8, tink: -18, tail: -20 } },
  plasma:   { label: 'Plasma pistol',  crackHz: 3800, crackTau: 0.012, bodyF: [320, 130, 0.06], subTau: 0.08, tailTau: 0.10, tailLP: 6500, maxMs: 500, casing: 0, g: { click: -12, crack: -10, body: -5, sub: -11, zap: -1, action: -30, tink: -30, tail: -12 } },
  pulse:    { label: 'Pulse pistol',   crackHz: 3000, crackTau: 0.010, bodyF: [420, 150, 0.045], subTau: 0.06, tailTau: 0.05, tailLP: 5000, maxMs: 380, casing: 0, g: { click: -10, crack: -8, body: -4, sub: -12, zap: -4, action: -30, tink: -30, tail: -15 } },
  cannon:   { label: 'Hand cannon',    crackHz: 1800, crackTau: 0.034, bodyF: [140, 52, 0.13],  subTau: 0.14, tailTau: 0.10, tailLP: 2200, maxMs: 600, casing: 1, g: { click: -12, crack: -3, body: 0, sub: -4, zap: -30, action: -20, tink: -22, tail: -10 } },
};
export const PISTOL_LAYERS = [
  { id: 'click',  label: 'Click',  role: 'mechanical transient', hp: 2200, lp: 12000, off: 0 },
  { id: 'crack',  label: 'Crack',  role: 'mid snap / blast',      hp: 900,  lp: 9000,  off: 0 },
  { id: 'body',   label: 'Body',   role: 'punch / weight',        hp: 70,   lp: 1100,  off: 1 },
  { id: 'sub',    label: 'Sub',    role: 'low thump',             hp: 30,   lp: 150,   off: 2 },
  { id: 'zap',    label: 'Zap',    role: 'sci-fi sweetener',      hp: 300,  lp: 8000,  off: 0 },
  { id: 'action', label: 'Action', role: 'slide / hammer',        hp: 1500, lp: 9000,  off: 22 },
  { id: 'tink',   label: 'Tink',   role: 'casing ring-out',       hp: 2500, lp: 12000, off: 210 },
  { id: 'tail',   label: 'Tail',   role: 'short room slap',       hp: 250,  lp: 4000,  off: 6 },
];

export function pistolLayers(kind = 'sidearm', seed = 1, variation = 0.08, sci = 0.5) {
  const P = PISTOL_KINDS[kind], r = rng(seed), v = (x) => r.vary(x, variation), n = N(0.7);
  const raw = {};
  raw.click = mul(white(n, r), decay(n, v(0.0016), SR, 0.00005));
  const cf = env(n, [[0, v(P.crackHz) * 1.6], [0.045, v(P.crackHz) * 0.6], [0.3, v(P.crackHz) * 0.5]], true);
  raw.crack = mul(svf(white(n, r), cf, 0.9, 'bp'), decay(n, v(P.crackTau), SR, 0.0003)).map((x) => x * 3);
  const [b0, b1, bt] = P.bodyF;
  raw.body = softClip(add(mul(osc(n, glide(n, v(b0), b1, 0.08), 'sine'), decay(n, v(bt))), mul(svf(white(n, r), 700, 0.8, 'lp'), mul(decay(n, bt * 0.8), 0.6))), 1.6);
  raw.sub = mul(osc(n, glide(n, v(95), 42, 0.1), 'sine'), decay(n, v(P.subTau)));
  const zf = glide(n, v(3600), v(480), 0.09 + 0.05 * sci);
  raw.zap = mul(fm(n, zf, 2.01, glide(n, 2 + sci * 3, 0.1, 0.09)), decay(n, v(0.075)));
  const act = new Float32Array(n);
  mixInto(act, mul(svf(white(n, r), 3200, 6, 'bp'), decay(n, 0.012)), 0, 4);
  mixInto(act, mul(svf(white(n, r), 1400, 4, 'bp'), decay(n, 0.02)), N(0.012), 3);
  raw.action = act;
  const tink = new Float32Array(n);
  if (P.casing) for (const [f, g] of [[4100, 1], [6300, 0.6], [9000, 0.35]]) mixInto(tink, mul(osc(n, v(f), 'sine'), decay(n, 0.05 + 0.02 * (1 / (f / 4100)))), 0, g * 0.4);
  raw.tink = tink;
  raw.tail = mul(svf(pink(n, r), v(P.tailLP), 0.7, 'lp'), decay(n, v(P.tailTau), SR, 0.004));

  return PISTOL_LAYERS.map((L) => ({
    id: L.id, label: L.label, role: L.role, data: raw[L.id], gainDb: P.g[L.id], offsetMs: L.off + (L.id === 'tink' ? Math.round(r.range(0, 80)) : 0),
    hp: L.hp, lp: L.lp, mute: false, solo: false,
  }));
}

/** Sum layers (band-limited, offset, gained), then glue → soft clip → brickwall → fade. */
export function renderLayers(layers, { ceil = -1, glue = true, maxMs = 650, drive = 1.15, sr = SR } = {}) {
  const any = layers.some((l) => l.solo), n = N(maxMs / 1000 + 0.1, sr), out = new Float32Array(n);
  for (const l of layers) {
    if (any ? !l.solo : l.mute) continue;
    let x = l.data;
    if (l.hp > 20) x = hp4(x, l.hp, sr);
    if (l.lp < 20000) x = lp4(x, l.lp, sr);
    mixInto(out, x, Math.round(l.offsetMs * 0.001 * sr), undb(l.gainDb));
  }
  let y = out;
  if (glue) y = compress([y], { thresh: -16, ratio: 3, attack: 0.002, release: 0.07, makeup: 2, sr })[0];
  y = softClip(y, drive);
  y = y.slice(0, N(maxMs / 1000, sr));
  return gameMaster([y], { ceil, fadeIn: 0.3, fadeOut: 25, glue: false, sr })[0];
}
export const makePistol = (kind, seed, variation, sci) => renderLayers(pistolLayers(kind, seed, variation, sci), { maxMs: PISTOL_KINDS[kind].maxMs });

// =====================================================================================
// Rail grind — pleasant, singing-metal scrape. Loopable; speed 0..1.
// =====================================================================================
export const DEFAULT_RAIL = { speed: 0.5, metal: 0.45, sparks: 0.35, warmth: 0.6, len: 3.0, seed: 1 };

export function railLoop(p = {}) {
  p = { ...DEFAULT_RAIL, ...p };
  const r = rng(p.seed), xf = 0.4, L = N(p.len), n = L + N(xf), s = p.speed;
  // scrape band, cutoff wandering slowly so it never sits still
  const wander = lfoNoise(n, 2.2, r);
  const fc = wander.map((w) => (650 + s * 1300) * (1 + 0.28 * w));
  let fric = svf(pink(n, r), fc, 1.0 + p.metal * 1.6, 'bp');
  // stick-slip roughness (amplitude modulation faster with speed)
  const rough = lfoNoise(n, 45 + s * 90, r);
  fric = fric.map((v, i) => v * (0.72 + 0.28 * clamp(rough[i], -1, 1)));
  fric = norm1(fric);
  // singing rail: open-fifth resonators (F5/C6/F6/C7 shifted a little by speed) excited by the friction itself
  let ring = new Float32Array(n);
  [[698.5, 1], [1046.5, 0.7], [1396.9, 0.45], [2093, 0.25]].forEach(([f, g], k) => {
    const f2 = f * (1 + s * 0.06), w = lfoNoise(n, 0.7 + k * 0.3, r).map((v) => f2 * (1 + 0.006 * v));
    ring = add(ring, mul(svf(fric, w, 55, 'bp'), g * 6));
  });
  ring = norm1(ring);
  const body = mul(svf(brown(n, r), 260, 0.7, 'lp'), 0.9 + s * 0.6);
  // sparks: sparse tiny ticks
  const spark = new Float32Array(n), rate = 5 + p.sparks * 40;
  for (let i = 0; i < n; i++) if (r() < rate / SR) {
    const ln = N(0.002 + r() * 0.004), g = 0.3 + r() * 0.7;
    mixInto(spark, mul(hp4(white(ln, r), 3500), decay(ln, 0.0012, SR, 0.0001)), i, g);
  }
  let x = add(add(mul(fric, 0.8), mul(ring, 0.09 + p.metal * 0.22)), add(mul(body, 0.22), mul(lp4(spark, 9000), 0.10 + p.sparks * 0.25)));
  // pleasantness: scoop harsh 3-4 kHz, tilt highs down, round the peaks
  const w = p.warmth;
  x = biquad(x, 'peak', 3400, 0.9, -5 * w);
  x = biquad(x, 'highshelf', 5200, 0.7, -2 - 5 * w);
  x = lp4(x, 9500 - 3500 * w);
  x = softClip(x, 1.1 + 0.3 * w);
  // Master the full-length stretch FIRST (filter/compressor start-up transients then sit inside the
  // faded-out head and can't reach the seam), then equal-power blend the overshoot into the head.
  x = gameMaster([x], { ceil: -3, loop: true, trim: false, glue: true, fadeIn: 0, fadeOut: 0 })[0];
  const out = new Float32Array(L), X = N(xf);
  for (let i = 0; i < L; i++) {
    if (i < X) { const u = i / X; out[i] = x[i] * Math.sin(u * Math.PI / 2) + x[L + i] * Math.cos(u * Math.PI / 2); } else out[i] = x[i];
  }
  return out;
}

/** One-shots that bookend the loop: landing on the rail and hopping off. */
export function railLand(p = {}) {
  p = { ...DEFAULT_RAIL, ...p }; const r = rng(p.seed + 101), n = N(0.5);
  const clang = new Float32Array(n);
  for (const [f, g, t] of [[930, 1, 0.14], [1395, 0.6, 0.11], [2140, 0.35, 0.08]]) mixInto(clang, mul(osc(n, f * (1 + r() * 0.01), 'sine'), decay(n, t, SR, 0.0004)), 0, g * 0.35);
  const thud = mul(osc(n, glide(n, 130, 55, 0.08), 'sine'), decay(n, 0.09));
  const scrape = mul(svf(pink(n, r), env(n, [[0, 700], [0.25, 1600 + p.speed * 1000]], true), 1.4, 'bp'), env(n, [[0, 0], [0.03, 0.2], [0.3, 0.6], [0.5, 0.6]])).map((v) => v * 1.3);
  const x = add(add(mul(clang, 0.8), mul(thud, 0.9)), scrape);
  return finish(lp4(x, 9500 - 3500 * p.warmth), 'impact', { space: 0.05 }, { ceil: -2 });
}
export function railLeave(p = {}) {
  p = { ...DEFAULT_RAIL, ...p }; const r = rng(p.seed + 202), n = N(0.42);
  const scrape = mul(svf(pink(n, r), env(n, [[0, 1600 + p.speed * 900], [0.25, 700]], true), 1.3, 'bp'), env(n, [[0, 0.7], [0.18, 0.15], [0.3, 0]])).map((v) => v * 1.4);
  const ping = mul(add(osc(n, 1568, 'sine'), mul(osc(n, 2350, 'sine'), 0.3)), decay(n, 0.09, SR, 0.002));
  const x = add(scrape, mul(ping, 0.22));
  return finish(lp4(x, 9500 - 3500 * p.warmth), 'impact', { space: 0.05 }, { ceil: -2 });
}

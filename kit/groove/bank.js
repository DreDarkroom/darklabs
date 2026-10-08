/* Groove sound bank: every sound is rendered ONCE, offline, into a short AudioBuffer when the music starts.
   Playing a note afterwards is one BufferSource and one gain: no oscillators, filters or worklets running while you scroll.
   That is what keeps the page smooth: the old engine built a whole synth graph for every hit.

   drums   DarkDeck's own drum recipes (drumdj), plus hat variants, splash and china, rendered with an OfflineAudioContext
   bass    BlueHeronBass's Karplus-Strong string worklet ("bhb-bass"), one finger-style note per pitch
   cello   ChungusCello's bowed-string waveguide worklet ("chungus-cello"), one bowed note per pitch
   meow    MeowSynth's recorded meows (decoded once, pitched with playbackRate)
   Bass and cello are rendered together in one offline pass each (one channel per note) and split afterwards.
   If a worklet cannot load (an old browser), that instrument is skipped and the drums carry on. */
import { BASS_NOTES, CELLO_NOTES } from './arrange.js';

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- drums: DarkDeck's synth helpers, context-agnostic, so they render offline ---------- */
const nbc = new WeakMap();
function noiseBuf(c) {
  let b = nbc.get(c);
  if (!b) { b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } nbc.set(c, b); }
  return b;
}
/* a 1.2 ms attack instead of an instant one: the same snap, without a single-sample step that reads as a click when a hat, snare and ride land together */
function envG(c, d, t, peak, dec) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.0012); g.gain.exponentialRampToValueAtTime(0.0008, t + dec); g.connect(d); return g; }
function osc(c, d, t, o) {
  const dec = o.dec || 0.3, s = c.createOscillator(); s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f0, t);
  if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || 0.08));
  s.connect(envG(c, d, t, o.peak, dec)); s.start(t); s.stop(t + dec + 0.05);
}
function noiseHit(c, d, t, o) {
  const dec = o.dec || 0.2, s = c.createBufferSource(); s.buffer = noiseBuf(c);
  const f = c.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.f; f.Q.value = o.q || 0.7;
  s.connect(f); f.connect(envG(c, d, t, o.peak, dec)); s.start(t, o.at || 0, dec + 0.05);
}
function metal(c, d, t, o) {
  const dec = o.dec, g = envG(c, d, t, o.peak, dec);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.bp || 10000; bp.Q.value = o.q || 0.6;
  bp.connect(hp); hp.connect(g);
  const mix = c.createGain(); mix.gain.value = 0.25; mix.connect(bp);
  (o.ratios || [2, 3, 4.16, 5.43, 6.79, 8.21]).forEach((r) => { const s = c.createOscillator(); s.type = 'square'; s.frequency.value = 40 * r * (o.pitch || 1); s.connect(mix); s.start(t); s.stop(t + dec + 0.05); });
}
const tom = (c, d, t, f) => { osc(c, d, t, { f0: f * 1.5, f1: f, sweep: 0.08, peak: 0.9, dec: 0.42 }); osc(c, d, t, { type: 'triangle', f0: f * 2.1, f1: f * 1.6, sweep: 0.05, peak: 0.15, dec: 0.1 }); noiseHit(c, d, t, { type: 'bandpass', f: f * 5, peak: 0.18, dec: 0.02 }); };

/** id -> [seconds, recipe(c, destination, t)]. Velocity is applied when the sound is played, so every recipe renders at full level. */
export const DRUM_RECIPES = {
  kick: [0.7, (c, d, t) => { osc(c, d, t, { f0: 165, f1: 46, sweep: 0.09, peak: 1, dec: 0.55 }); osc(c, d, t, { type: 'triangle', f0: 95, f1: 50, sweep: 0.05, peak: 0.4, dec: 0.14 }); noiseHit(c, d, t, { f: 3500, peak: 0.3, dec: 0.012 }); }],
  snare: [0.45, (c, d, t) => { osc(c, d, t, { type: 'triangle', f0: 190, f1: 165, sweep: 0.1, peak: 0.55, dec: 0.13 }); osc(c, d, t, { type: 'triangle', f0: 335, f1: 300, sweep: 0.1, peak: 0.3, dec: 0.09 }); noiseHit(c, d, t, { f: 1800, peak: 0.75, dec: 0.22 }); }],
  ghost: [0.2, (c, d, t) => { osc(c, d, t, { type: 'triangle', f0: 200, f1: 175, sweep: 0.06, peak: 0.4, dec: 0.06 }); noiseHit(c, d, t, { type: 'bandpass', f: 2200, q: 0.8, peak: 0.55, dec: 0.09, at: 0.3 }); }],
  hatC: [0.12, (c, d, t) => metal(c, d, t, { dec: 0.055, hp: 7000, peak: 0.4 })],
  hatC2: [0.1, (c, d, t) => metal(c, d, t, { dec: 0.04, hp: 8200, bp: 11500, pitch: 1.12, peak: 0.36 })],
  hatO: [0.6, (c, d, t) => metal(c, d, t, { dec: 0.45, hp: 6500, peak: 0.36 })],
  hatP: [0.12, (c, d, t) => { metal(c, d, t, { dec: 0.035, hp: 5200, bp: 8000, peak: 0.3 }); osc(c, d, t, { f0: 120, f1: 70, sweep: 0.03, peak: 0.25, dec: 0.04 }); }],
  tomH: [0.6, (c, d, t) => tom(c, d, t, 200)],
  tomL: [0.65, (c, d, t) => tom(c, d, t, 150)],
  tomF: [0.8, (c, d, t) => tom(c, d, t, 100)],
  ride: [1.3, (c, d, t) => { metal(c, d, t, { dec: 1, hp: 5500, bp: 7500, peak: 0.26, pitch: 0.85 }); osc(c, d, t, { type: 'triangle', f0: 3300, peak: 0.08, dec: 0.3 }); }],
  bell: [0.9, (c, d, t) => { metal(c, d, t, { dec: 0.6, hp: 6200, bp: 9000, peak: 0.22, pitch: 1.05, ratios: [2, 3, 4.16, 5.43] }); osc(c, d, t, { type: 'triangle', f0: 3900, peak: 0.16, dec: 0.5 }); }],
  splash: [1, (c, d, t) => { metal(c, d, t, { dec: 0.7, hp: 6000, bp: 10500, pitch: 1.25, peak: 0.34 }); noiseHit(c, d, t, { f: 7000, peak: 0.18, dec: 0.5 }); }],
  china: [1.5, (c, d, t) => { metal(c, d, t, { dec: 1.25, hp: 3300, bp: 5800, pitch: 0.9, peak: 0.36, ratios: [2, 3, 4.16, 5.43, 6.79, 8.21, 9.9] }); noiseHit(c, d, t, { type: 'bandpass', f: 3500, q: 0.5, peak: 0.3, dec: 1 }); }],
  crash: [2, (c, d, t) => { metal(c, d, t, { dec: 1.7, hp: 4200, bp: 9000, peak: 0.42 }); noiseHit(c, d, t, { f: 5500, peak: 0.25, dec: 1.4 }); }],
};

/** Make a buffer peak at `peak` and end without a click. */
export function finish(data, sr, peak = 0.9, fade = 0.012) {
  let pk = 1e-9; for (let i = 0; i < data.length; i++) pk = Math.max(pk, Math.abs(data[i]));
  const k = peak / pk, n = Math.floor(fade * sr);
  for (let i = 0; i < data.length; i++) data[i] *= k;
  for (let i = 0; i < n && i < data.length; i++) data[data.length - 1 - i] *= i / n;
  return data;
}

const SOFT = new Set(['hatC', 'hatC2', 'hatO', 'hatP', 'ride', 'bell', 'splash', 'china', 'crash']);
export async function renderDrums(sr, ids = Object.keys(DRUM_RECIPES)) {
  const out = {};
  await Promise.all(ids.map(async (id) => {
    const [dur, recipe] = DRUM_RECIPES[id];
    const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    let dest = off.destination;
    if (SOFT.has(id)) { dest = off.createBiquadFilter(); dest.type = 'lowpass'; dest.frequency.value = 11000; dest.Q.value = 0.5; dest.connect(off.destination); }   // takes the ice-pick edge off the metal
    recipe(off, dest, 0);
    const buf = await off.startRendering();
    finish(buf.getChannelData(0), sr, 0.9, 0.02);
    out[id] = buf;
  }));
  return out;
}

/* ---------- the string instruments: the real worklets, run once offline, one channel per note ---------- */
async function renderNotes(sr, notes, seconds, moduleUrl, make) {
  const off = new OfflineAudioContext(notes.length, Math.ceil(seconds * sr), sr);
  await off.audioWorklet.addModule(moduleUrl);
  const merger = off.createChannelMerger(notes.length); merger.connect(off.destination);
  notes.forEach((m, k) => { const node = make(off, m); node.connect(merger, 0, k); });
  const all = await off.startRendering();
  const out = {};
  notes.forEach((m, k) => {
    const b = off.createBuffer(1, all.length, sr);
    b.copyToChannel(all.getChannelData(k), 0);
    out[m] = b;
  });
  return out;
}

export async function renderBass(sr, url) {
  const notes = await renderNotes(sr, BASS_NOTES, 1.5, url, (off, m) => {
    const node = new AudioWorkletNode(off, 'bhb-bass', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.postMessage({ t: 'on', id: m, f: mtof(m), vel: 0.85, style: 'finger' });
    return node;
  });
  for (const b of Object.values(notes)) finish(b.getChannelData(0), sr, 0.9, 0.06);
  return notes;
}

export async function renderCello(sr, url) {
  const notes = await renderNotes(sr, CELLO_NOTES, 3, url, (off, m) => {
    const node = new AudioWorkletNode(off, 'chungus-cello', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.postMessage({ type: 'noteOn', id: m, time: 0.02, freq: mtof(m), vel: 0.62, attack: 0.3, release: 0.7, hold: 1.9, bowPos: 0.3, pressure: 0.42, bright: 0.35, vibDepth: 9, vibRate: 5.3, vibDelay: 0.5, gain: 0.9 });
    return node;
  });
  for (const b of Object.values(notes)) {                      // a soft low-pass for the body of the instrument, then a slow fade in and out
    const d = b.getChannelData(0); let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 3200 / sr);
    for (let i = 0; i < d.length; i++) { lp += a * (d[i] - lp); d[i] = lp; }
    finish(d, sr, 0.8, 0.25);
  }
  return notes;
}

/** MeowSynth's own recordings. Returns { id: { buf, hz } }; hz is the pitch each recording was measured at. */
export const MEOWS = { classic: 329.1, chirp: 512.8, swell: 469.1 };
export async function loadMeows(ctx, baseUrl) {
  const out = {};
  await Promise.all(Object.entries(MEOWS).map(async ([id, hz]) => {
    try {
      const r = await fetch(new URL(`${id}.mp3`, baseUrl));
      if (r.ok) out[id] = { buf: await ctx.decodeAudioData(await r.arrayBuffer()), hz };
    } catch (e) { /* a missing recording just means fewer meows */ }
  }));
  return out;
}

/* CircuitStomp — a drum & bass machine built from synthesised robot voices.
   Part of Darkroom Labs. No libraries, no build step. MIT licence.

   Signal flow per hit:
     voice (oscillators / noise / your recording)
       -> robotize (ring modulator) -> grit (waveshaper) -> tone (low-pass)
       -> velocity gain -> pan -> dry bus ---------------------> master
                                   \-> reverb send  -> reverb --^
                                   \-> delay send   -> delay ---^
     master: filter -> volume -> glue limiter -> speakers

   Timing uses the "two clocks" pattern (schedule ahead on the audio clock, driven by a
   timer that lives in a Web Worker so background tabs don't stall it). */

"use strict";

// ---------- constants ----------

const NUM_UNITS = 8;
const STEPS = 16;
const NUM_PATTERNS = 8;
const LETTERS = "ABCDEFGH";
const UNIT_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const STEP_VEL = [0, 0.45, 0.75, 1];
const MIDI_VEL = [0, 50, 90, 120];
const MIDI_BASE_NOTE = 36;       // unit 1 = GM kick
const NEURO_BASE_MIDI = 33;      // A1 = 55 Hz
// Note maps. "gm" suits electronic kits and DAW drum plugins; "labs" matches MonkeyBeat (36-43 in order).
const NOTE_MAPS = {
  gm:   { label: "General MIDI kit", out: [36, 38, 42, 43, 51, 49, 48, 39],
          in: [[36, 35], [38, 40, 37], [42, 44, 46], [43, 41, 45], [51, 59, 53], [49, 57, 52, 55], [48, 47, 50], [39, 54, 56]] },
  labs: { label: "Darkroom Labs 36-43", out: [36, 37, 38, 39, 40, 41, 42, 43], in: [[36], [37], [38], [39], [40], [41], [42], [43]] },
};
const noteMap = () => NOTE_MAPS[state.midi.map] || NOTE_MAPS.gm;
function unitForNote(note) { const m = noteMap().in; for (let u = 0; u < m.length; u++) if (m[u].includes(note)) return u; return -1; }
const LOOKAHEAD = 0.12;
const DB_NAME = "circuitstomp";
const DB_STORE = "kv";
const EMBED = typeof window !== "undefined" && window.__EMBED ? window.__EMBED : null;

const UNIT_DEFAULTS = [
  { name: "KICK",   type: "kick",  gain: 90, pitch: 0, decay: 42, tone: 70, grit: 18, robot: 0,  pan: 0,   verb: 4,  delay: 0,  group: 0 },
  { name: "SNARE",  type: "snare", gain: 78, pitch: 0, decay: 45, tone: 82, grit: 28, robot: 8,  pan: 0,   verb: 24, delay: 8,  group: 0 },
  { name: "HAT",    type: "hat",   gain: 52, pitch: 0, decay: 18, tone: 96, grit: 0,  robot: 0,  pan: 14,  verb: 10, delay: 0,  group: 1 },
  { name: "SERVO",  type: "servo", gain: 52, pitch: 0, decay: 38, tone: 72, grit: 22, robot: 18, pan: -32, verb: 20, delay: 30, group: 0 },
  { name: "CLANK",  type: "clank", gain: 50, pitch: 0, decay: 34, tone: 86, grit: 10, robot: 0,  pan: 36,  verb: 30, delay: 18, group: 0 },
  { name: "BITZAP", type: "zap",   gain: 42, pitch: 0, decay: 30, tone: 90, grit: 45, robot: 0,  pan: -16, verb: 14, delay: 40, group: 0 },
  { name: "VOXBOT", type: "vox",   gain: 55, pitch: 0, decay: 42, tone: 82, grit: 14, robot: 46, pan: 20,  verb: 28, delay: 34, group: 0 },
  { name: "NEURO",  type: "neuro", gain: 66, pitch: 0, decay: 50, tone: 46, grit: 55, robot: 8,  pan: 0,   verb: 4,  delay: 0,  group: 2 },
];

function makeUnit(i) {
  return Object.assign({ start: 0, end: 1000, reverse: false, mute: false, solo: false, sampleName: "" }, UNIT_DEFAULTS[i]);
}

function emptyGrid(fill) { return Array.from({ length: NUM_UNITS }, () => new Array(STEPS).fill(fill)); }
function emptyPattern() { return { v: emptyGrid(0), n: emptyGrid(0), c: emptyGrid(100) }; }

function fromStrings(p, rows) {
  // rows: { unitIndex: "x.o.X..." } where X=3, x=2, o=1, . = 0
  Object.keys(rows).forEach((u) => {
    [...rows[u]].forEach((ch, s) => { p.v[u][s] = ch === "X" ? 3 : ch === "x" ? 2 : ch === "o" ? 1 : 0; });
  });
  return p;
}

function defaultState() {
  const patterns = Array.from({ length: NUM_PATTERNS }, emptyPattern);
  // A: classic two-step roller
  fromStrings(patterns[0], {
    0: "X.........X.....",
    1: "....X.......X...",
    2: "x.o.x.o.x.o.x.oo",
    7: "X..o......x..o..",
    4: "...........o....",
  });
  patterns[0].n[7] = [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 5, 0, 0, 7, 0, 0];
  // B: variation with robot fills
  fromStrings(patterns[1], {
    0: "X.........X..o..",
    1: "....X.....o.X.x.",
    2: "x.o.x.o.x.o.x.o.",
    3: "..........o.....",
    5: "..............xo",
    6: "......x.........",
    7: "X..o......x.....",
  });
  patterns[1].n[7] = [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, -2, 0, 0, 0, 0, 0];
  patterns[1].c[2] = patterns[1].c[2].map((c, s) => (s % 2 ? 60 : 100));
  return {
    v: 1,
    bpm: 174, swing: 0, click: false,
    songMode: false, chain: [0, 0, 0, 1],
    pattern: 0, sel: 0,
    patterns,
    units: Array.from({ length: NUM_UNITS }, (_, i) => makeUnit(i)),
    master: { filter: 16000, reverb: 22, delay: 24, volume: 75, limiter: true },
    paint: "vel", lockPitch: 3, lockChance: 50,
    exp: { prefix: "dre", type: "loop", src: "own", ver: 1, rate: 48000, bits: 24, repeat: 1, norm: true, wrap: true, wet: true },
    midi: { inId: "", outId: "", ch: 10, clock: false, map: "gm" },
    brain: "twostep",
  };
}

let state = defaultState();

// runtime
let live = null, liveChain = null, liveGroups = {};
let sampleBuffers = new Array(NUM_UNITS).fill(null);
let reversedCache = new Array(NUM_UNITS).fill(null);
let sampleBytes = new Array(NUM_UNITS).fill(null);
let playing = false, recording = false;
let nextTime = 0, seqIdx = 0, seqStep = 0;
let history = [];
let shownStep = -1;
let clipboard = null;
let tapTimes = [];
let analyser = null;
let ticker = null;

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const semis = (s) => Math.pow(2, s / 12);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setStatus(msg, isErr, id = "status") {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!isErr);
}

// ---------- persistence (IndexedDB) ----------

function idb() {
  return new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("no indexedDB"));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvSet(k, v) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { /* private mode etc. */ }
}
async function kvGet(k) {
  try { const db = await idb(); return await new Promise((res, rej) => { const tx = db.transaction(DB_STORE, "readonly"); const q = tx.objectStore(DB_STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; }
}
async function kvDel(k) {
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { /* ignore */ }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet("project", JSON.parse(JSON.stringify(state))), 400);
}

function mergeSaved(saved) {
  const base = defaultState();
  if (!saved || saved.v !== 1) return base;
  const out = Object.assign(base, saved);
  out.master = Object.assign(defaultState().master, saved.master || {});
  out.exp = Object.assign(defaultState().exp, saved.exp || {});
  out.midi = Object.assign(defaultState().midi, saved.midi || {});
  out.units = Array.from({ length: NUM_UNITS }, (_, i) => Object.assign(makeUnit(i), (saved.units || [])[i] || {}));
  out.patterns = Array.from({ length: NUM_PATTERNS }, (_, p) => {
    const sp = (saved.patterns || [])[p], e = emptyPattern();
    if (!sp) return e;
    ["v", "n", "c"].forEach((k) => {
      for (let u = 0; u < NUM_UNITS; u++) for (let s = 0; s < STEPS; s++) {
        const val = sp[k] && sp[k][u] ? sp[k][u][s] : undefined;
        if (typeof val === "number" && isFinite(val)) e[k][u][s] = val;
      }
    });
    return e;
  });
  out.chain = (Array.isArray(saved.chain) ? saved.chain : [0]).filter((n) => n >= 0 && n < NUM_PATTERNS);
  if (!out.chain.length) out.chain = [0];
  out.pattern = clamp(out.pattern | 0, 0, NUM_PATTERNS - 1);
  out.sel = clamp(out.sel | 0, 0, NUM_UNITS - 1);
  return out;
}

// ---------- audio graph ----------

const irCache = new WeakMap();
function makeImpulse(ctx, seconds, decay) {
  let byCtx = irCache.get(ctx);
  if (!byCtx) { byCtx = {}; irCache.set(ctx, byCtx); }
  const key = seconds + ":" + decay;
  if (byCtx[key]) return byCtx[key];
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const rng = mulberry32(1234);   // fixed seed: live and export reverbs sound identical
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // metallic early reflections + smooth tail: a small "machine room"
      const early = i < rate * 0.04 && i % Math.floor(rate * 0.0071 + c * 13) === 0 ? 0.6 : 0;
      d[i] = ((rng() * 2 - 1) * Math.pow(1 - t, decay) + early) * 0.9;
    }
  }
  byCtx[key] = buf;
  return buf;
}

function knobToVolume(v) { return Math.pow(v / 100, 1.4) * 0.9; }

function setLimiter(node, glue) {
  node.threshold.value = glue ? -8 : -1;
  node.knee.value = glue ? 6 : 0;
  node.ratio.value = glue ? 6 : 20;
  node.attack.value = 0.003;
  node.release.value = glue ? 0.12 : 0.05;
}

function delayTime() { return (60 / state.bpm) * 0.75; } // dotted eighth

// opts.masterFx=false renders stems: no master filter/limiter, sends still returned
function buildChain(ctx, opts = {}) {
  const masterFx = opts.masterFx !== false;
  const dry = ctx.createGain();
  const verbIn = ctx.createGain();
  const delayIn = ctx.createGain();
  const sum = ctx.createGain();

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 1.9, 3.2);
  const verbRet = ctx.createGain();
  verbRet.gain.value = (state.master.reverb / 100) * 0.9;
  verbIn.connect(conv); conv.connect(verbRet); verbRet.connect(sum);

  const dl = ctx.createDelay(2);
  dl.delayTime.value = delayTime();
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dlf = ctx.createBiquadFilter(); dlf.type = "bandpass"; dlf.frequency.value = 1800; dlf.Q.value = 0.6;
  const dlRet = ctx.createGain(); dlRet.gain.value = (state.master.delay / 100) * 0.8;
  delayIn.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(dlRet); dlRet.connect(sum);

  dry.connect(sum);

  let out = sum, filter = null, vol = null, lim = null;
  if (masterFx) {
    filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 0.8;
    filter.frequency.value = state.master.filter;
    vol = ctx.createGain(); vol.gain.value = knobToVolume(state.master.volume);
    lim = ctx.createDynamicsCompressor(); setLimiter(lim, state.master.limiter);
    sum.connect(filter); filter.connect(vol); vol.connect(lim);
    out = lim;
  } else {
    vol = ctx.createGain(); vol.gain.value = 0.9; sum.connect(vol); out = vol;
  }
  out.connect(ctx.destination);
  return { dry, verbIn, delayIn, sum, verbRet, dl, dlRet, filter, vol, lim, out, wetSends: opts.wet !== false };
}

// ---------- shaping curves ----------

const curveCache = {};
function gritCurve(amount) {
  const k = Math.round(amount);
  if (curveCache[k]) return curveCache[k];
  const n = 2048, c = new Float32Array(n);
  const drive = 1 + (k / 100) * 18;
  const steps = k > 60 ? Math.round(64 - (k - 60) * 1.3) : 0;   // top of the range adds bit reduction
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1;
    let y = Math.tanh(x * drive) / Math.tanh(drive);
    if (steps > 2) y = Math.round(y * steps) / steps;
    c[i] = y;
  }
  curveCache[k] = c;
  return c;
}

const noiseCache = new WeakMap();
function getNoise(ctx) {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const len = ctx.sampleRate;
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0), rng = mulberry32(99);
  for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
  noiseCache.set(ctx, b);
  return b;
}

// ---------- the robot voices ----------
// Each voice writes into `out` starting at time t, and returns its length in seconds.

function env(ctx, t, peak, attack, dur, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  g.connect(out);
  return g;
}
function oscNode(ctx, type, f, t, stop) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.start(t); o.stop(stop);
  return o;
}
function noiseNode(ctx, t, stop) {
  const n = ctx.createBufferSource(); n.buffer = getNoise(ctx); n.loop = true;
  n.start(t, Math.random() * 0.5); n.stop(stop);
  return n;
}
function filt(ctx, type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; }

const VOICES = {
  kick(ctx, t, p, out, r) {
    const dur = 0.12 + (p.decay / 100) * 0.6;
    const g = env(ctx, t, 1, 0.002, dur, out);
    const o = oscNode(ctx, "sine", 170 * r, t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(52 * r, t + 0.045);
    o.frequency.exponentialRampToValueAtTime(40 * r, t + dur);
    o.connect(g);
    // servo "tick" transient
    const cg = env(ctx, t, 0.35, 0.001, 0.012, out);
    const hp = filt(ctx, "highpass", 3500, 0.7);
    noiseNode(ctx, t, t + 0.03).connect(hp); hp.connect(cg);
    return dur;
  },
  snare(ctx, t, p, out, r) {
    const dur = 0.07 + (p.decay / 100) * 0.3;
    const body = env(ctx, t, 0.55, 0.001, dur * 0.45, out);
    const o1 = oscNode(ctx, "triangle", 190 * r, t, t + dur);
    o1.frequency.exponentialRampToValueAtTime(150 * r, t + 0.06);
    const o2 = oscNode(ctx, "square", 333 * r, t, t + dur);
    const o2g = ctx.createGain(); o2g.gain.value = 0.12;
    o1.connect(body); o2.connect(o2g); o2g.connect(body);
    const ng = env(ctx, t, 0.8, 0.001, dur, out);
    const bp = filt(ctx, "bandpass", 4200 * Math.sqrt(r), 0.9);
    noiseNode(ctx, t, t + dur + 0.02).connect(bp); bp.connect(ng);
    return dur;
  },
  hat(ctx, t, p, out, r) {
    const dur = 0.02 + (p.decay / 100) * 0.35;
    const g = env(ctx, t, 0.45, 0.001, dur, out);
    const hp = filt(ctx, "highpass", 7000, 0.8);
    const bp = filt(ctx, "bandpass", 10000, 0.5);
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((m) => { oscNode(ctx, "square", 40 * m * r, t, t + dur + 0.02).connect(bp); });
    bp.connect(hp); hp.connect(g);
    return dur;
  },
  servo(ctx, t, p, out, r) {
    const dur = 0.08 + (p.decay / 100) * 0.45;
    const g = env(ctx, t, 0.5, 0.006, dur, out);
    const base = 280 * r;
    const o = oscNode(ctx, "sawtooth", base * 0.6, t, t + dur + 0.02);
    o.frequency.linearRampToValueAtTime(base * 1.9, t + dur * 0.45);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + dur);
    const bp = filt(ctx, "bandpass", base * 2, 5);
    bp.frequency.linearRampToValueAtTime(base * 4, t + dur * 0.45);
    bp.frequency.linearRampToValueAtTime(base * 1.5, t + dur);
    o.connect(bp); bp.connect(g);
    return dur;
  },
  clank(ctx, t, p, out, r) {
    const dur = 0.06 + (p.decay / 100) * 0.7;
    const base = 230 * r;
    [1, 1.83, 2.71, 3.41, 4.97].forEach((m, i) => {
      const g = env(ctx, t, 0.26 / (i + 1), 0.001, dur * (1 - i * 0.12), out);
      oscNode(ctx, i % 2 ? "square" : "triangle", base * m, t, t + dur + 0.02).connect(g);
    });
    const ng = env(ctx, t, 0.35, 0.001, 0.025, out);
    const hp = filt(ctx, "highpass", 2500, 0.7);
    noiseNode(ctx, t, t + 0.04).connect(hp); hp.connect(ng);
    return dur;
  },
  zap(ctx, t, p, out, r) {
    const dur = 0.04 + (p.decay / 100) * 0.3;
    const g = env(ctx, t, 0.4, 0.001, dur, out);
    const base = 1400 * r;
    const o = oscNode(ctx, "square", base, t, t + dur + 0.02);
    const steps = 10;
    for (let i = 1; i <= steps; i++) o.frequency.setValueAtTime(base * Math.pow(0.06, i / steps), t + (i / steps) * dur);
    o.connect(g);
    return dur;
  },
  vox(ctx, t, p, out, r) {
    // formant "robot syllable": sweeps from an 'o' to an 'ee' shape
    const dur = 0.07 + (p.decay / 100) * 0.35;
    const g = env(ctx, t, 0.6, 0.006, dur, out);
    const o = oscNode(ctx, "sawtooth", 150 * r, t, t + dur + 0.02);
    o.frequency.setValueAtTime(150 * r, t);
    o.frequency.setValueAtTime(165 * r, t + dur * 0.5);
    const f1 = filt(ctx, "bandpass", 500, 9), f2 = filt(ctx, "bandpass", 900, 9);
    f1.frequency.linearRampToValueAtTime(300, t + dur);
    f2.frequency.linearRampToValueAtTime(2300, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g);
    return dur;
  },
  neuro(ctx, t, p, out, r) {
    const dur = 0.1 + (p.decay / 100) * 0.9;
    const f = 55 * r;
    const g = env(ctx, t, 0.55, 0.004, dur, out);
    const lp = filt(ctx, "lowpass", 2200, 6);
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur * 0.8);
    const a = oscNode(ctx, "sawtooth", f, t, t + dur + 0.05); a.detune.value = -14;
    const b = oscNode(ctx, "sawtooth", f, t, t + dur + 0.05); b.detune.value = 14;
    a.connect(lp); b.connect(lp); lp.connect(g);
    const sg = env(ctx, t, 0.7, 0.004, dur, out);
    oscNode(ctx, "sine", f, t, t + dur + 0.05).connect(sg);
    return dur;
  },
};

// ---------- trigger ----------

function audible(i) {
  const anySolo = state.units.some((u) => u.solo);
  const u = state.units[i];
  return anySolo ? u.solo : !u.mute;
}

function getBuffer(i) {
  const buf = sampleBuffers[i];
  if (!buf) return null;
  if (!state.units[i].reverse) return buf;
  if (reversedCache[i] && reversedCache[i].src === buf) return reversedCache[i].buf;
  const rev = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c), d = rev.getChannelData(c);
    for (let k = 0, n = s.length; k < n; k++) d[k] = s[n - 1 - k];
  }
  reversedCache[i] = { src: buf, buf: rev };
  return rev;
}

// Returns the node that sounds, so choke groups can cut it.
function triggerUnit(ctx, chain, groups, i, t, vel, extraSemis = 0, force = false, onlyDry = false) {
  if (!force && !audible(i)) return null;
  const p = state.units[i];
  t = Math.max(t, ctx.currentTime);
  const r = semis(p.pitch + extraSemis);

  // choke: cut whatever this group is still ringing
  if (p.group && groups) {
    const prev = groups[p.group];
    if (prev) { try { prev.gain.cancelScheduledValues(t); prev.gain.setTargetAtTime(0, t, 0.006); } catch (e) { /* ended */ } }
  }

  // per-hit chain: voice -> robotize -> grit -> tone -> vca -> pan
  const voiceOut = ctx.createGain();
  let node = voiceOut;
  let len;

  const buf = getBuffer(i);
  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = r;
    const s0 = (clamp(p.start, 0, 1000) / 1000) * buf.duration;
    const s1 = Math.max(s0 + 0.005, (clamp(p.end, 0, 1000) / 1000) * buf.duration);
    const full = (s1 - s0) / r;
    len = Math.min(full, 0.03 + (p.decay / 100) * full * 1.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.002);
    g.gain.setValueAtTime(1, t + Math.max(0.003, len - 0.02));
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(voiceOut);
    src.start(t, s0, s1 - s0);
    src.stop(t + len + 0.05);
  } else {
    len = VOICES[p.type](ctx, t, p, voiceOut, r);
  }

  if (p.robot > 0) {
    const m = p.robot / 100;
    const mix = ctx.createGain();
    const dryG = ctx.createGain(); dryG.gain.value = 1 - m * 0.85;
    const ring = ctx.createGain(); ring.gain.value = 0;
    const car = ctx.createOscillator(); car.type = "sine"; car.frequency.value = 30 + m * 420;
    car.connect(ring.gain); car.start(t); car.stop(t + len + 0.1);
    const wet = ctx.createGain(); wet.gain.value = m * 1.4;
    node.connect(dryG); dryG.connect(mix);
    node.connect(ring); ring.connect(wet); wet.connect(mix);
    node = mix;
  }
  if (p.grit > 0) {
    const ws = ctx.createWaveShaper(); ws.curve = gritCurve(p.grit); ws.oversample = "2x";
    const comp = ctx.createGain(); comp.gain.value = 1 / (1 + (p.grit / 100) * 0.9);
    node.connect(ws); ws.connect(comp); node = comp;
  }
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass";
  tone.frequency.value = 180 * Math.pow(2, (p.tone / 100) * 6.9);
  tone.Q.value = 0.6;
  node.connect(tone);

  const vca = ctx.createGain();
  vca.gain.value = Math.pow(p.gain / 100, 1.3) * vel;
  tone.connect(vca);

  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  let last = vca;
  if (pan) { pan.pan.value = p.pan / 100; vca.connect(pan); last = pan; }
  last.connect(chain.dry);
  if (!onlyDry && chain.wetSends) {
    if (p.verb > 0) { const s = ctx.createGain(); s.gain.value = p.verb / 100; last.connect(s); s.connect(chain.verbIn); }
    if (p.delay > 0) { const s = ctx.createGain(); s.gain.value = p.delay / 100; last.connect(s); s.connect(chain.delayIn); }
  }
  if (p.group && groups) groups[p.group] = vca;
  return vca;
}

// ---------- sequencer ----------

function currentSequence() { return state.songMode && state.chain.length ? state.chain : [state.pattern]; }
function stepDur() { return 60 / state.bpm / 4; }
function swingShift(step, sd) { return step % 2 === 1 ? (state.swing / 100) * sd * 0.5 : 0; }

const workerTimer = (() => {
  try {
    const src = "let id=null;onmessage=e=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),25)}";
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    return { start(fn) { w.onmessage = fn; w.postMessage("start"); }, stop() { w.postMessage("stop"); } };
  } catch (e) {
    let id = null;
    return { start(fn) { clearInterval(id); id = setInterval(fn, 25); }, stop() { clearInterval(id); } };
  }
})();

function scheduleStep() {
  const seq = currentSequence();
  if (seqIdx >= seq.length) seqIdx = 0;
  const pat = seq[seqIdx];
  const P = state.patterns[pat];
  const sd = stepDur();
  const t = nextTime + swingShift(seqStep, sd);
  const fired = [];
  for (let u = 0; u < NUM_UNITS; u++) {
    const lvl = P.v[u][seqStep];
    if (!lvl) continue;
    if (Math.random() * 100 >= P.c[u][seqStep]) continue;
    if (!audible(u)) continue;
    triggerUnit(live, liveChain, liveGroups, u, t, STEP_VEL[lvl], P.n[u][seqStep]);
    midiOutNote(u, lvl, P.n[u][seqStep], t);
    fired.push(u);
  }
  if (state.click && seqStep % 4 === 0) clickAt(nextTime, seqStep === 0);
  midiClockPulses(nextTime, sd);
  history.push({ time: t, step: seqStep, pat, fired });
  if (history.length > 64) history.splice(0, history.length - 64);

  nextTime += sd;
  seqStep++;
  if (seqStep >= STEPS) { seqStep = 0; seqIdx = (seqIdx + 1) % seq.length; }
}

function scheduler() {
  while (nextTime < live.currentTime + LOOKAHEAD) scheduleStep();
}

function clickAt(t, accent) {
  const g = live.createGain();
  g.gain.setValueAtTime(accent ? 0.35 : 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  const o = live.createOscillator(); o.type = "square"; o.frequency.value = accent ? 2000 : 1400;
  o.connect(g); g.connect(liveChain.out);
  o.start(t); o.stop(t + 0.04);
}

async function play() {
  if (!live) return;
  if (live.state === "suspended") await live.resume();
  playing = true;
  seqIdx = 0; seqStep = 0;
  nextTime = live.currentTime + 0.06;
  history = [];
  midiStart(nextTime);
  workerTimer.start(scheduler);
  scheduler();
  $("playBtn").innerHTML = "&#9632; Stop";
  $("playBtn").classList.add("on");
  $("miniPlay").innerHTML = "&#9632;";
}

function stop() {
  playing = false;
  workerTimer.stop();
  midiStop();
  $("playBtn").innerHTML = "&#9654; Run";
  $("playBtn").classList.remove("on");
  $("miniPlay").innerHTML = "&#9654;";
  shownStep = -1;
  document.querySelectorAll(".cell.now").forEach((c) => c.classList.remove("now"));
  if (recording) toggleRec();
}
function togglePlay() { playing ? stop() : play(); }
function toggleRec() {
  recording = !recording;
  $("recBtn").classList.toggle("on", recording);
  if (recording && !playing) play();
}

// ---------- visuals: playhead, scope, robot ----------

function drawLoop() {
  if (live && playing) {
    const now = live.currentTime;
    let cur = null;
    for (let k = history.length - 1; k >= 0; k--) if (history[k].time <= now) { cur = history[k]; break; }
    if (cur && cur.step !== shownStep) {
      shownStep = cur.step;
      document.querySelectorAll(".cell.now").forEach((c) => c.classList.remove("now"));
      if (cur.pat === state.pattern) document.querySelectorAll(`.cell[data-s="${cur.step}"]`).forEach((c) => c.classList.add("now"));
      else if (state.pattern !== cur.pat && state.songMode) { selectPattern(cur.pat, true); }
      if (cur.fired.length) { pulseRobot(); cur.fired.forEach(flashPad); }
      const mini = $("miniSteps").children;
      for (let s = 0; s < mini.length; s++) mini[s].classList.toggle("now", s === cur.step);
      $("miniInfo").textContent = `${LETTERS[cur.pat]} · ${state.bpm}`;
    }
  }
  drawScope();
  requestAnimationFrame(drawLoop);
}

let scopeData = null;
function drawScope() {
  const c = $("scope");
  if (!c || !analyser) return;
  const g = c.getContext("2d");
  const w = c.width, h = c.height;
  if (!scopeData) scopeData = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(scopeData);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,47,78,0.9)";
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < scopeData.length; i++) {
    const x = (i / (scopeData.length - 1)) * w;
    const y = (scopeData[i] / 255) * h;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

let robotTimer = null;
function pulseRobot() {
  const r = $("robot");
  r.classList.add("hit");
  clearTimeout(robotTimer);
  robotTimer = setTimeout(() => r.classList.remove("hit"), 90);
}
function flashPad(i) {
  const el = document.querySelector(`.pad[data-u="${i}"]`);
  if (!el) return;
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 90);
}

// live hit (pad, key, MIDI)
function hitUnit(i, level = 3, extra = 0) {
  if (!live) return;
  triggerUnit(live, liveChain, liveGroups, i, live.currentTime, STEP_VEL[level], extra, true);
  flashPad(i);
  pulseRobot();
  if (recording && playing) recordHit(i, level, extra);
}

function recordHit(i, level, extra) {
  const now = live.currentTime;
  const sd = stepDur();
  let best = null;
  for (const h of history) if (!best || Math.abs(h.time - now) < Math.abs(best.time - now)) best = h;
  if (!best) return;
  let step = best.step, pat = best.pat;
  if (now - best.time > sd / 2) { step = (step + 1) % STEPS; }
  const P = state.patterns[pat];
  P.v[i][step] = Math.max(P.v[i][step], level);
  if (extra) P.n[i][step] = extra;
  if (pat === state.pattern) renderCell(i, step);
  renderPatternButtons();
  scheduleSave();
}

// ---------- robot keys (chromatic) ----------

const KEY_SEQUENCE = [
  ["a", 0, "C"], ["w", 1, "C#"], ["s", 2, "D"], ["e", 3, "D#"], ["d", 4, "E"], ["f", 5, "F"],
  ["t", 6, "F#"], ["g", 7, "G"], ["y", 8, "G#"], ["h", 9, "A"], ["u", 10, "A#"], ["j", 11, "B"],
  ["k", 12, "C"], ["o", 13, "C#"], ["l", 14, "D"], ["p", 15, "D#"], [";", 16, "E"], ["'", 17, "F"],
];
let octaveShift = 0, keysMode = false;

function playKey(semi) {
  // keys are laid out from C; NEURO is tuned to A, so C = +3 for it
  const off = state.units[state.sel].type === "neuro" && !sampleBuffers[state.sel] ? semi + 3 - 12 : semi;
  hitUnit(state.sel, 3, off + octaveShift * 12);
  const el = document.querySelector(`.key[data-semi="${semi}"]`);
  if (el) { el.classList.add("active"); setTimeout(() => el.classList.remove("active"), 110); }
}
function shiftOctave(d) { octaveShift = clamp(octaveShift + d, -2, 2); $("octLabel").textContent = octaveShift; }
function setKeysMode(on) { keysMode = on; $("keysMode").textContent = `Keys mode: ${on ? "on" : "off"}`; $("keysMode").classList.toggle("on", on); }

function buildKeyboardUI() {
  const kb = $("keyboard");
  kb.innerHTML = "";
  KEY_SEQUENCE.forEach(([key, semi, note]) => {
    const b = document.createElement("button");
    b.className = "key" + (note.includes("#") ? " black" : "");
    b.dataset.semi = semi;
    b.textContent = key.toUpperCase();
    b.title = note;
    b.setAttribute("aria-label", `${note} (${key})`);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); playKey(semi); });
    kb.appendChild(b);
  });
}

// ---------- pattern + grid UI ----------

function patternHasNotes(p) { return state.patterns[p].v.some((row) => row.some((x) => x)); }

function renderPatternButtons() {
  const box = $("patBtns");
  box.innerHTML = "";
  for (let p = 0; p < NUM_PATTERNS; p++) {
    const b = document.createElement("button");
    b.className = "pat-btn" + (p === state.pattern ? " sel" : "") + (patternHasNotes(p) ? " has" : "");
    b.textContent = LETTERS[p];
    b.title = `Pattern ${LETTERS[p]} (${p + 1})`;
    b.addEventListener("click", () => selectPattern(p));
    box.appendChild(b);
  }
}

function selectPattern(p, fromPlayhead) {
  state.pattern = p;
  renderPatternButtons();
  renderSeq();
  if (!fromPlayhead) scheduleSave();
}

function renderSeq() {
  const seq = $("seq");
  seq.innerHTML = "";
  const head = document.createElement("div");
  head.className = "seq-head";
  head.innerHTML = "<span></span>";
  const nums = document.createElement("div");
  nums.className = "cells";
  for (let s = 0; s < STEPS; s++) {
    const n = document.createElement("span");
    n.className = "cell num" + (s % 4 === 0 ? " beat" : "");
    n.textContent = s + 1;
    nums.appendChild(n);
  }
  head.appendChild(nums);
  seq.appendChild(head);

  for (let u = 0; u < NUM_UNITS; u++) {
    const row = document.createElement("div");
    row.className = "seq-row";
    const nm = document.createElement("button");
    nm.className = "seq-name" + (u === state.sel ? " sel" : "") + (!audible(u) ? " muted" : "");
    nm.textContent = state.units[u].name;
    nm.title = `Select ${state.units[u].name}`;
    nm.addEventListener("click", () => { selectUnit(u); hitUnit(u); });
    row.appendChild(nm);
    const cells = document.createElement("div");
    cells.className = "cells";
    for (let s = 0; s < STEPS; s++) {
      const c = document.createElement("button");
      c.className = "cell";
      c.dataset.u = u; c.dataset.s = s;
      c.addEventListener("click", () => paintCell(u, s));
      c.addEventListener("contextmenu", (e) => { e.preventDefault(); setCell(u, s, 0); });
      cells.appendChild(c);
    }
    row.appendChild(cells);
    seq.appendChild(row);
    for (let s = 0; s < STEPS; s++) renderCell(u, s);
  }
}

function renderCell(u, s) {
  const c = document.querySelector(`.cell[data-u="${u}"][data-s="${s}"]`);
  if (!c) return;
  const P = state.patterns[state.pattern];
  const v = P.v[u][s], n = P.n[u][s], ch = P.c[u][s];
  c.dataset.l = v;
  c.innerHTML = "";
  if (v && n) { const e = document.createElement("span"); e.className = "pl"; e.textContent = (n > 0 ? "+" : "") + n; c.appendChild(e); }
  if (v && ch < 100) { const e = document.createElement("span"); e.className = "ch"; e.style.right = `${Math.round(100 - ch)}%`; c.appendChild(e); }
  const vel = ["off", "soft", "medium", "full"][v];
  c.setAttribute("aria-label", `${state.units[u].name} step ${s + 1}: ${vel}${n ? `, pitch ${n}` : ""}${ch < 100 ? `, ${ch}% chance` : ""}`);
}

function setCell(u, s, lvl) {
  const P = state.patterns[state.pattern];
  P.v[u][s] = lvl;
  if (!lvl) { P.n[u][s] = 0; P.c[u][s] = 100; }
  renderCell(u, s);
  renderPatternButtons();
  scheduleSave();
}

function paintCell(u, s) {
  const P = state.patterns[state.pattern];
  if (state.paint === "vel") {
    const next = (P.v[u][s] + 3) % 4;       // off -> full -> medium -> soft -> off
    setCell(u, s, next);
    if (next && live) triggerUnit(live, liveChain, liveGroups, u, live.currentTime, STEP_VEL[next], P.n[u][s], true);
  } else if (state.paint === "pitch") {
    if (!P.v[u][s]) P.v[u][s] = 3;
    P.n[u][s] = P.n[u][s] === state.lockPitch ? 0 : state.lockPitch;
    renderCell(u, s); renderPatternButtons(); scheduleSave();
    if (live) triggerUnit(live, liveChain, liveGroups, u, live.currentTime, STEP_VEL[P.v[u][s]], P.n[u][s], true);
  } else {
    if (!P.v[u][s]) P.v[u][s] = 3;
    P.c[u][s] = P.c[u][s] === state.lockChance ? 100 : state.lockChance;
    renderCell(u, s); renderPatternButtons(); scheduleSave();
  }
}

function setPaint(mode) {
  state.paint = mode;
  document.querySelectorAll(".chip[data-paint]").forEach((b) => { const on = b.dataset.paint === mode; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  const pv = $("paintVal");
  const help = $("paintHelp");
  if (mode === "vel") {
    pv.innerHTML = "";
    help.textContent = "tap a step: full → medium → soft → off (right-click clears)";
  } else if (mode === "pitch") {
    pv.innerHTML = `<input type="range" id="lockSlider" min="-24" max="24" step="1" value="${state.lockPitch}" aria-label="Pitch lock in semitones"><output id="lockOut">${fmtSemi(state.lockPitch)}</output>`;
    help.textContent = "tap a step to give it this pitch (tap again to clear). NEURO: 0 = A, +3 = C, +5 = D, +7 = E";
    $("lockSlider").addEventListener("input", (e) => { state.lockPitch = parseInt(e.target.value, 10); $("lockOut").textContent = fmtSemi(state.lockPitch); scheduleSave(); });
  } else {
    pv.innerHTML = `<input type="range" id="lockSlider" min="5" max="95" step="5" value="${state.lockChance}" aria-label="Chance percent"><output id="lockOut">${state.lockChance}%</output>`;
    help.textContent = "tap a step to make it fire only some of the time (striped bar = chance). Great for hats and fills.";
    $("lockSlider").addEventListener("input", (e) => { state.lockChance = parseInt(e.target.value, 10); $("lockOut").textContent = state.lockChance + "%"; scheduleSave(); });
  }
  scheduleSave();
}
const fmtSemi = (n) => (n > 0 ? "+" : "") + n + " st";

// ---------- units (pads) + editor ----------

function renderPads() {
  const box = $("pads");
  box.innerHTML = "";
  for (let u = 0; u < NUM_UNITS; u++) {
    const p = state.units[u];
    const b = document.createElement("button");
    b.className = "pad" + (u === state.sel ? " sel" : "") + (sampleBuffers[u] ? " custom" : "") + (!audible(u) ? " muted" : "");
    b.dataset.u = u;
    b.innerHTML = `<span class="num">${u + 1} · ${UNIT_KEYS[u].toUpperCase()}</span><span class="lbl"></span><span class="src"></span>`;
    b.querySelector(".lbl").textContent = p.name;
    b.querySelector(".src").textContent = sampleBuffers[u] ? "your recording" : "robot synth";
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); hitUnit(u); if (state.sel !== u) selectUnit(u); });
    b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop"); });
    b.addEventListener("dragleave", () => b.classList.remove("drop"));
    b.addEventListener("drop", (e) => { e.preventDefault(); b.classList.remove("drop"); const f = e.dataTransfer.files[0]; if (f) loadFileIntoUnit(u, f); });
    box.appendChild(b);
  }
}

function selectUnit(u) {
  state.sel = u;
  renderPads();
  document.querySelectorAll(".seq-name").forEach((el, i) => el.classList.toggle("sel", i === u));
  syncEditor();
  scheduleSave();
}

const ED = [["uGain", "gain"], ["uPitch", "pitch"], ["uDecay", "decay"], ["uTone", "tone"], ["uGrit", "grit"], ["uRobot", "robot"], ["uPan", "pan"], ["uVerb", "verb"], ["uDelay", "delay"], ["uStart", "start"], ["uEnd", "end"]];

function syncEditor() {
  const p = state.units[state.sel];
  $("unitTitle").textContent = `— unit ${state.sel + 1}`;
  $("unitName").value = p.name;
  ED.forEach(([id, k]) => { $(id).value = p[k]; });
  $("uPitchVal").textContent = p.pitch;
  $("uGroup").value = String(p.group);
  $("uReverse").checked = p.reverse; $("uMute").checked = p.mute; $("uSolo").checked = p.solo;
  const hasS = !!sampleBuffers[state.sel];
  document.querySelector(".editor").classList.toggle("synth", !hasS);
  $("synthBtn").disabled = !hasS;
  $("unitInfo").textContent = hasS
    ? `Your recording: ${p.sampleName || "loaded file"} · ${sampleBuffers[state.sel].duration.toFixed(2)} s. Decay shortens it; Start/End trim it.`
    : `Robot synth voice "${p.type}". Load a recording (or drag a file onto the pad) to replace it with your own sound.`;
  drawWave();
}

function drawWave() {
  const c = $("wave");
  if (!c) return;
  const w = (c.width = c.clientWidth * (window.devicePixelRatio || 1) || 600);
  const h = (c.height = 70 * (window.devicePixelRatio || 1));
  const g = c.getContext("2d");
  g.clearRect(0, 0, w, h);
  const buf = sampleBuffers[state.sel];
  let data;
  if (buf) data = getBuffer(state.sel).getChannelData(0);
  else data = previewSynth(state.sel);
  if (!data) return;
  const mid = h / 2;
  g.fillStyle = "rgba(255,47,78,0.75)";
  for (let x = 0; x < w; x++) {
    const a = Math.floor((x / w) * data.length), b = Math.floor(((x + 1) / w) * data.length);
    let mn = 1, mx = -1;
    for (let k = a; k < Math.max(b, a + 1); k++) { const v = data[k] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
    g.fillRect(x, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95));
  }
  if (buf) {
    const p = state.units[state.sel];
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(0, 0, (p.start / 1000) * w, h);
    g.fillRect((p.end / 1000) * w, 0, w, h);
  }
}

// cheap, deterministic preview of the synth voice for the waveform box
const previewCache = {};
let previewTimer = null;
function previewSynth(i) {
  const p = state.units[i];
  const key = JSON.stringify([p.type, p.pitch, p.decay, p.tone, p.grit, p.robot]);
  if (previewCache[key]) return previewCache[key];
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const rate = 22050, ctx = new OfflineAudioContext(1, Math.ceil(rate * 1.1), rate);
      const chain = { dry: ctx.destination, wetSends: false };
      triggerUnit(ctx, chain, null, i, 0, 1, 0, true, true);
      const r = await ctx.startRendering();
      previewCache[key] = r.getChannelData(0);
      if (state.sel === i) drawWave();
    } catch (e) { /* preview is cosmetic */ }
  }, 60);
  return null;
}

function bindUnit(id, key, after) {
  $(id).addEventListener("input", (e) => {
    const p = state.units[state.sel];
    p[key] = parseInt(e.target.value, 10);
    if (after) after(p);
    scheduleSave();
  });
}

function wireEditor() {
  ED.forEach(([id, k]) => bindUnit(id, k, (p) => {
    if (k === "pitch") $("uPitchVal").textContent = p.pitch;
    if (k === "start" && p.start > p.end - 5) { p.start = p.end - 5; $("uStart").value = p.start; }
    if (k === "end" && p.end < p.start + 5) { p.end = p.start + 5; $("uEnd").value = p.end; }
    drawWave();
  }));
  ["uGain", "uPitch", "uDecay", "uTone", "uGrit", "uRobot", "uPan"].forEach((id) =>
    $(id).addEventListener("change", () => hitUnit(state.sel)));
  $("uGroup").addEventListener("change", (e) => { state.units[state.sel].group = parseInt(e.target.value, 10); scheduleSave(); });
  $("uReverse").addEventListener("change", (e) => { state.units[state.sel].reverse = e.target.checked; drawWave(); scheduleSave(); });
  $("uMute").addEventListener("change", (e) => { state.units[state.sel].mute = e.target.checked; renderPads(); renderSeq(); scheduleSave(); });
  $("uSolo").addEventListener("change", (e) => { state.units[state.sel].solo = e.target.checked; renderPads(); renderSeq(); scheduleSave(); });
  $("unitName").addEventListener("input", (e) => {
    state.units[state.sel].name = e.target.value.toUpperCase() || UNIT_DEFAULTS[state.sel].name;
    const lbl = document.querySelector(`.pad[data-u="${state.sel}"] .lbl`); if (lbl) lbl.textContent = state.units[state.sel].name;
    const nm = document.querySelectorAll(".seq-name")[state.sel]; if (nm) nm.textContent = state.units[state.sel].name;
    scheduleSave();
  });
  $("fileInput").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) loadFileIntoUnit(state.sel, f); e.target.value = ""; });
  $("synthBtn").addEventListener("click", () => clearSample(state.sel));
  $("resetUnit").addEventListener("click", () => resetUnit(state.sel));
  $("auditionBtn").addEventListener("click", () => hitUnit(state.sel));
  window.addEventListener("resize", () => drawWave());
}

async function setUnitFromBytes(i, bytes, name) {
  const buf = await live.decodeAudioData(bytes.slice(0));
  sampleBuffers[i] = buf; reversedCache[i] = null; sampleBytes[i] = bytes;
  Object.assign(state.units[i], { sampleName: name, start: 0, end: 1000, reverse: false, pitch: 0, grit: 0, robot: 0, tone: 100, decay: 100 });
  await kvSet("sample" + i, { name, bytes });
}

async function loadFileIntoUnit(i, file) {
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("That file is over 20 MB. Trim it to the sound you want first.");
    setStatus("Loading " + file.name + "…");
    await setUnitFromBytes(i, await file.arrayBuffer(), file.name);
    if (state.sel !== i) state.sel = i;
    renderPads(); syncEditor(); scheduleSave();
    setStatus(`Loaded ${file.name} onto ${state.units[i].name}. Robotize and Grit are at zero; turn them up to make it mechanical.`);
    hitUnit(i);
  } catch (err) {
    setStatus(`Couldn't load that file: ${err.message || "the browser can't decode this format"}. WAV and MP3 are safest.`, true);
  }
}

function clearSample(i) {
  sampleBuffers[i] = null; reversedCache[i] = null; sampleBytes[i] = null;
  const name = state.units[i].name;
  state.units[i] = makeUnit(i); state.units[i].name = name;
  kvDel("sample" + i);
  renderPads(); syncEditor(); scheduleSave();
}

function resetUnit(i) {
  sampleBuffers[i] = null; reversedCache[i] = null; sampleBytes[i] = null;
  state.units[i] = makeUnit(i);
  kvDel("sample" + i);
  renderPads(); renderSeq(); syncEditor(); scheduleSave();
  hitUnit(i);
}

async function restoreSamples() {
  for (let i = 0; i < NUM_UNITS; i++) {
    const s = await kvGet("sample" + i);
    if (s && s.bytes) {
      try { const buf = await live.decodeAudioData(s.bytes.slice(0)); sampleBuffers[i] = buf; sampleBytes[i] = s.bytes; }
      catch (e) { /* stale sample; fall back to synth */ }
    }
  }
}

// ---------- robot brain (pattern generator) ----------

function generate(style, seed) {
  const rng = mulberry32(seed || (Date.now() & 0xffffffff));
  const P = emptyPattern();
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const hit = (u, s, v = 3, n = 0, c = 100) => { P.v[u][s] = v; P.n[u][s] = n; P.c[u][s] = c; };
  const minorA = [0, 3, 5, 7, 10, -2, -5];

  if (style === "twostep" || style === "neuro") {
    hit(0, 0); hit(0, pick([10, 10, 11, 9]));
    if (rng() < 0.4) hit(0, pick([6, 14]), 2);
    hit(1, 4); hit(1, 12);
    if (rng() < 0.5) hit(1, pick([7, 9, 15]), 1);
    for (let s = 0; s < STEPS; s += 2) hit(2, s, s % 4 === 0 ? 2 : 1, 0, s % 4 === 2 && rng() < 0.4 ? 70 : 100);
    if (rng() < 0.5) hit(2, 15, 1, 0, 60);
  }
  if (style === "jungle") {
    hit(0, 0); hit(0, 2, 2); hit(0, 10); if (rng() < 0.6) hit(0, 11, 2);
    hit(1, 4); hit(1, 12); hit(1, 7, 1); hit(1, 9, 1); hit(1, 14, 1);
    if (rng() < 0.6) hit(1, 15, 2);
    for (let s = 0; s < STEPS; s++) if (rng() < 0.7) hit(2, s, s % 2 ? 1 : 2, 0, rng() < 0.3 ? 60 : 100);
    if (rng() < 0.5) hit(4, pick([3, 6, 11]), 2);
  }
  if (style === "halftime") {
    hit(0, 0); if (rng() < 0.6) hit(0, pick([3, 6, 11]), 2);
    hit(1, 8);
    for (let s = 0; s < STEPS; s += 2) hit(2, s, s % 8 === 0 ? 3 : 1, 0, rng() < 0.3 ? 60 : 100);
    hit(3, pick([12, 14]), 2);
  }
  if (style === "neuro") {
    const hits = [0, 3, 6, 10, 13];
    hits.forEach((s) => { if (rng() < 0.8) hit(7, s, 3, pick(minorA.slice(0, 5))); });
    P.n[7][0] = 0;
    hit(5, pick([7, 15]), 2); hit(6, pick([6, 14]), 2);
  } else if (style !== "chaos") {
    hit(7, 0, 3, 0);
    if (rng() < 0.7) hit(7, pick([3, 6, 7]), 2, pick([3, 5, 7]));
    if (rng() < 0.5) hit(7, pick([10, 13, 14]), 2, pick([0, -2, 3]));
    if (rng() < 0.6) hit(pick([3, 4, 5, 6]), pick([6, 7, 14, 15]), 2);
  }
  if (style === "chaos") {
    for (let u = 0; u < NUM_UNITS; u++) for (let s = 0; s < STEPS; s++) {
      const dens = [0.3, 0.2, 0.5, 0.15, 0.15, 0.15, 0.12, 0.2][u];
      if (rng() < dens) hit(u, s, 1 + Math.floor(rng() * 3), u >= 3 ? pick([-12, -5, 0, 3, 7, 12]) : 0, rng() < 0.35 ? pick([40, 60, 80]) : 100);
    }
    hit(0, 0); hit(1, 4); hit(1, 12);
  }
  return P;
}

function mutate(P, seed) {
  const rng = mulberry32(seed);
  const out = JSON.parse(JSON.stringify(P));
  const moves = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < moves; k++) {
    const u = 2 + Math.floor(rng() * 6), s = Math.floor(rng() * STEPS);
    if (s === 0 || s === 4 || s === 12) continue;       // keep the backbone
    out.v[u][s] = out.v[u][s] ? 0 : 1 + Math.floor(rng() * 3);
    if (u === 7 && out.v[u][s]) out.n[u][s] = [0, 3, 5, 7, -2][Math.floor(rng() * 5)];
    if (!out.v[u][s]) { out.n[u][s] = 0; out.c[u][s] = 100; }
  }
  return out;
}

// ---------- tutorial examples (loaded into pattern H) ----------

const EXAMPLES = {
  pulse: { bpm: 174, swing: 0, rows: { 0: "X...X...X...X...", 2: "x.x.x.x.x.x.x.x." } },
  twostep: { bpm: 174, swing: 0, rows: { 0: "X.........X.....", 1: "....X.......X...", 2: "x.x.x.x.x.x.x.x." } },
  groove: { bpm: 174, swing: 18, rows: { 0: "X.........X.....", 1: "....X..o....X..o", 2: "Xoxo.oXoxoxoXoxo" } },
  jungle: { bpm: 172, swing: 8, rows: { 0: "X.x.......Xx....", 1: "....X..o.o..X.ox", 2: "xoxoxoxoxoxoxoxo", 4: "......o........." } },
  design: { bpm: 174, swing: 0, rows: { 0: "X.........X.....", 1: "....X.......X...", 5: "..x...x...x...x.", 6: ".......X.......x" }, n: { 5: { 2: 0, 6: 5, 10: 7, 14: 12 }, 6: { 7: 0, 15: -5 } } },
  space: { bpm: 174, swing: 0, rows: { 0: "X.........X.....", 1: "....X.......X...", 2: "x.x.x.x.x.x.x.x.", 3: "..........x.....", 4: "......x.......x." } },
  bassline: { bpm: 174, swing: 0, rows: { 0: "X.........X.....", 1: "....X.......X...", 2: "x.o.x.o.x.o.x.o.", 7: "X..x..x...X..x.." }, n: { 7: { 0: 0, 3: 3, 6: 5, 10: 0, 13: -2 } } },
  live: { bpm: 170, swing: 0, rows: { 0: "X.........X.....", 2: "x...x...x...x..." } },
};

function loadExample(key) {
  const ex = EXAMPLES[key];
  if (key === "song") {
    // intro (thin) -> drop -> variation, written into F, G, H
    state.patterns[5] = fromStrings(emptyPattern(), { 0: "X.........X.....", 2: "x.o.x.o.x.o.x.o." });
    state.patterns[6] = generate("twostep", 7);
    state.patterns[7] = generate("neuro", 11);
    state.chain = [5, 5, 6, 6, 7, 7, 6, 7];
    state.songMode = true; state.bpm = 174;
    syncControlsFromState(); selectPattern(5);
    setStatus("Loaded a song into F, G, H with the chain F F G G H H G H and Song mode on. Press Run.");
    return;
  }
  const P = fromStrings(emptyPattern(), ex.rows);
  if (ex.n) Object.keys(ex.n).forEach((u) => Object.keys(ex.n[u]).forEach((s) => { P.n[u][s] = ex.n[u][s]; }));
  state.patterns[7] = P;
  state.bpm = ex.bpm; state.swing = ex.swing; state.songMode = false;
  if (key === "design") { Object.assign(state.units[1], { decay: 15, grit: 70, robot: 50 }); }
  syncControlsFromState();
  selectPattern(7);
  setStatus(`Example loaded into pattern H at ${ex.bpm} BPM. Press Run (or Space).`);
  $("panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- transport wiring ----------

function parseChain(text) {
  return text.toUpperCase().split(/[^A-H]+|(?=[A-H])/).map((c) => LETTERS.indexOf(c.trim())).filter((n) => n >= 0);
}
function updateChainInfo() {
  const n = state.chain.length;
  const secs = (n * STEPS * stepDur()).toFixed(1);
  $("chainInfo").textContent = `${n} bar${n === 1 ? "" : "s"} · ${secs} s`;
}

function wireTransport() {
  $("playBtn").addEventListener("click", togglePlay);
  $("miniPlay").addEventListener("click", togglePlay);
  $("recBtn").addEventListener("click", toggleRec);
  $("bpm").addEventListener("change", (e) => setBpm(parseInt(e.target.value, 10)));
  $("tapBtn").addEventListener("click", tapTempo);
  $("swing").addEventListener("input", (e) => { state.swing = parseInt(e.target.value, 10); scheduleSave(); });
  $("clickChk").addEventListener("change", (e) => { state.click = e.target.checked; scheduleSave(); });
  $("songChk").addEventListener("change", (e) => { state.songMode = e.target.checked; seqIdx = 0; scheduleSave(); });
  $("chainInput").addEventListener("input", (e) => {
    const c = parseChain(e.target.value);
    state.chain = c.length ? c : [0];
    updateChainInfo(); updateExportName(); scheduleSave();
  });
  $("copyPat").addEventListener("click", () => { clipboard = JSON.parse(JSON.stringify(state.patterns[state.pattern])); setStatus(`Copied pattern ${LETTERS[state.pattern]}.`); });
  $("pastePat").addEventListener("click", () => {
    if (!clipboard) return setStatus("Nothing copied yet.", true);
    state.patterns[state.pattern] = JSON.parse(JSON.stringify(clipboard));
    renderSeq(); renderPatternButtons(); scheduleSave();
  });
  $("clearPat").addEventListener("click", () => { state.patterns[state.pattern] = emptyPattern(); renderSeq(); renderPatternButtons(); scheduleSave(); });
  $("brainStyle").addEventListener("change", (e) => { state.brain = e.target.value; scheduleSave(); });
  $("brainBtn").addEventListener("click", () => {
    state.patterns[state.pattern] = generate(state.brain);
    renderSeq(); renderPatternButtons(); scheduleSave();
    setStatus(`Robot brain wrote a ${$("brainStyle").selectedOptions[0].textContent} pattern into ${LETTERS[state.pattern]}. Mutate to vary it, Copy/Paste to build variations.`);
  });
  $("mutateBtn").addEventListener("click", () => {
    state.patterns[state.pattern] = mutate(state.patterns[state.pattern], Date.now() & 0xffffffff);
    renderSeq(); renderPatternButtons(); scheduleSave();
  });
  document.querySelectorAll(".chip[data-paint]").forEach((b) => b.addEventListener("click", () => setPaint(b.dataset.paint)));

  $("filterKnob").addEventListener("input", (e) => { state.master.filter = parseInt(e.target.value, 10); liveChain.filter.frequency.setTargetAtTime(state.master.filter, live.currentTime, 0.02); scheduleSave(); });
  $("reverbKnob").addEventListener("input", (e) => { state.master.reverb = parseInt(e.target.value, 10); liveChain.verbRet.gain.setTargetAtTime((state.master.reverb / 100) * 0.9, live.currentTime, 0.02); scheduleSave(); });
  $("delayKnob").addEventListener("input", (e) => { state.master.delay = parseInt(e.target.value, 10); liveChain.dlRet.gain.setTargetAtTime((state.master.delay / 100) * 0.8, live.currentTime, 0.02); scheduleSave(); });
  $("volumeKnob").addEventListener("input", (e) => { state.master.volume = parseInt(e.target.value, 10); liveChain.vol.gain.setTargetAtTime(knobToVolume(state.master.volume), live.currentTime, 0.02); scheduleSave(); });
  $("limiterChk").addEventListener("change", (e) => { state.master.limiter = e.target.checked; setLimiter(liveChain.lim, state.master.limiter); scheduleSave(); });

  $("keysMode").addEventListener("click", () => setKeysMode(!keysMode));
  $("octDown").addEventListener("click", () => shiftOctave(-1));
  $("octUp").addEventListener("click", () => shiftOctave(1));

  document.querySelectorAll(".try[data-ex]").forEach((b) => b.addEventListener("click", () => loadExample(b.dataset.ex)));
}

function setBpm(v) {
  state.bpm = clamp(v || 174, 60, 220);
  $("bpm").value = state.bpm;
  if (liveChain) liveChain.dl.delayTime.setTargetAtTime(delayTime(), live.currentTime, 0.05);
  updateChainInfo(); scheduleSave();
}

function tapTempo() {
  const now = performance.now();
  tapTimes = tapTimes.filter((t) => now - t < 2500);
  tapTimes.push(now);
  if (tapTimes.length >= 2) {
    const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
    let bpm = 60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
    // D&B players often tap the half-time feel; fold into a sensible range
    while (bpm < 70) bpm *= 2;
    setBpm(Math.round(bpm));
  }
}

// ---------- keyboard ----------

const heldKeys = new Set();
function typingInField(e) { const t = e.target; return t && (t.tagName === "INPUT" && t.type !== "range" && t.type !== "checkbox" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"); }

function onKeyDown(e) {
  if (typingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (heldKeys.has(k)) return;
  heldKeys.add(k);
  if (k === " ") { e.preventDefault(); togglePlay(); return; }
  if (keysMode) {
    if (k === "z") return shiftOctave(-1);
    if (k === "x") return shiftOctave(1);
    const m = KEY_SEQUENCE.find((q) => q[0] === k);
    if (m) { e.preventDefault(); playKey(m[1]); return; }
  } else {
    const u = UNIT_KEYS.indexOf(k);
    if (u >= 0) { hitUnit(u); return; }
  }
  if (k === "r") return toggleRec();
  if (k === "t") return tapTempo();
  if (/^[1-8]$/.test(k)) return selectPattern(parseInt(k, 10) - 1);
}
function onKeyUp(e) { heldKeys.delete(e.key.toLowerCase()); }

// ---------- MIDI in / out ----------

let midiAccess = null;
function midiSupported() { return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator; }

function midiOutPort() { return midiAccess && state.midi.outId ? midiAccess.outputs.get(state.midi.outId) : null; }
function audioToPerf(t) {
  // map an audio-clock time to a performance.now() timestamp for MIDI output
  const lat = (live.outputLatency || live.baseLatency || 0);
  return performance.now() + (t - live.currentTime + lat) * 1000;
}
function midiOutNote(u, lvl, n, t) {
  const out = midiOutPort();
  if (!out) return;
  const ts = audioToPerf(t);
  let ch, note;
  if (state.units[u].type === "neuro") { ch = 1; note = clamp(NEURO_BASE_MIDI + state.units[u].pitch + n, 0, 127); }
  else { ch = state.midi.ch - 1; note = noteMap().out[u]; }
  try {
    out.send([0x90 | ch, note, MIDI_VEL[lvl]], ts);
    out.send([0x80 | ch, note, 0], ts + (state.units[u].type === "neuro" ? stepDur() * 900 : 60));
  } catch (e) { /* port closed */ }
}
function midiClockPulses(t, sd) {
  const out = midiOutPort();
  if (!out || !state.midi.clock) return;
  for (let k = 0; k < 6; k++) { try { out.send([0xf8], audioToPerf(t + (k * sd) / 6)); } catch (e) { return; } }
}
function midiStart(t) { const o = midiOutPort(); if (o && state.midi.clock) { try { o.send([0xfa], audioToPerf(t)); } catch (e) { /* */ } } }
function midiStop() { const o = midiOutPort(); if (o && state.midi.clock) { try { o.send([0xfc]); } catch (e) { /* */ } } }

function onMIDI(e) {
  if (state.midi.inId && e.target.id !== state.midi.inId) return;
  const [st, note, vel] = e.data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && vel > 0) {
    const u = unitForNote(note);
    if (u >= 0 && !keysMode) hitUnit(u, vel > 100 ? 3 : vel > 60 ? 2 : 1);
    else if (keysMode) hitUnit(state.sel, vel > 100 ? 3 : vel > 60 ? 2 : 1, note - 60);
  }
}

function fillMidiPorts() {
  const inSel = $("midiIn"), outSel = $("midiOut");
  inSel.innerHTML = '<option value="">all inputs</option>';
  outSel.innerHTML = '<option value="">off</option>';
  midiAccess.inputs.forEach((p) => { inSel.add(new Option(p.name, p.id)); p.onmidimessage = onMIDI; });
  midiAccess.outputs.forEach((p) => outSel.add(new Option(p.name, p.id)));
  inSel.value = state.midi.inId; outSel.value = state.midi.outId;
  if (inSel.value !== state.midi.inId) { state.midi.inId = ""; inSel.value = ""; }
  if (outSel.value !== state.midi.outId) { state.midi.outId = ""; outSel.value = ""; }
  setStatus(`MIDI on: ${midiAccess.inputs.size} input${midiAccess.inputs.size === 1 ? "" : "s"}, ${midiAccess.outputs.size} output${midiAccess.outputs.size === 1 ? "" : "s"}.` +
    (midiAccess.outputs.size === 0 ? " To send to a DAW on this computer, create a virtual port (Windows: loopMIDI; Mac: IAC Driver in Audio MIDI Setup)." : ""), false, "midiStatus");
}

async function enableMIDI() {
  if (!midiSupported()) return setStatus("This browser has no Web MIDI. Safari (Mac and iPhone) doesn't support it at all. Use Chrome, Edge or Firefox on a computer or Android.", true, "midiStatus");
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = fillMidiPorts;
    fillMidiPorts();
    $("midiEnable").textContent = "MIDI enabled";
    $("midiEnable").disabled = true;
  } catch (e) {
    setStatus(EMBED ? "MIDI is blocked inside this preview. Open the full page on Darkroom Labs to use MIDI." : "MIDI permission was refused. Allow it in the site settings (padlock icon) and try again.", true, "midiStatus");
  }
}

function wireMidi() {
  $("midiSupport").textContent = midiSupported()
    ? "Web MIDI is available in this browser. Enable it to see your devices."
    : "Heads up: this browser has no Web MIDI (Safari never has). Everything else works; for MIDI use Chrome, Edge or Firefox.";
  const ch = $("midiCh");
  for (let c = 1; c <= 16; c++) ch.add(new Option(String(c), String(c)));
  ch.value = String(state.midi.ch);
  ch.addEventListener("change", (e) => { state.midi.ch = parseInt(e.target.value, 10); scheduleSave(); });
  const mapSel = $("midiMap");
  Object.keys(NOTE_MAPS).forEach((k) => mapSel.add(new Option(NOTE_MAPS[k].label, k)));
  mapSel.value = state.midi.map;
  mapSel.addEventListener("change", (e) => { state.midi.map = e.target.value; scheduleSave(); });
  $("midiClock").checked = state.midi.clock;
  $("midiClock").addEventListener("change", (e) => { state.midi.clock = e.target.checked; scheduleSave(); });
  $("midiIn").addEventListener("change", (e) => { state.midi.inId = e.target.value; scheduleSave(); });
  $("midiOut").addEventListener("change", (e) => { state.midi.outId = e.target.value; scheduleSave(); });
  $("midiEnable").addEventListener("click", enableMIDI);
}

// ---------- export: events + rendering ----------

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const pad2 = (n) => String(n).padStart(2, "0");

function fileName(type, ver, ext = "wav") {
  const e = state.exp;
  return `${slug(e.prefix) || "cs"}_${slug(type) || "loop"}_${slug(e.src) || "own"}_v${pad2(ver || e.ver)}.${ext}`;
}
function updateExportName() {
  const seq = exportSequence();
  $("exName").textContent = `Next files: ${fileName(state.exp.type)} · ${seq.length} bar${seq.length === 1 ? "" : "s"} at ${state.bpm} BPM (${state.songMode ? "song chain" : "pattern " + LETTERS[state.pattern]})`;
}

function exportSequence() {
  const base = currentSequence();
  const out = [];
  for (let r = 0; r < state.exp.repeat; r++) out.push(...base);
  return out;
}

// Roll chance steps once, so mix, stems and MIDI agree.
function buildEvents(seq, seed) {
  const rng = mulberry32(seed);
  const sd = stepDur();
  const events = [];
  let g = 0;
  seq.forEach((pat) => {
    const P = state.patterns[pat];
    for (let s = 0; s < STEPS; s++) {
      for (let u = 0; u < NUM_UNITS; u++) {
        const lvl = P.v[u][s];
        if (!lvl) continue;
        const roll = rng() * 100;
        if (roll >= P.c[u][s]) continue;
        events.push({ t: g * sd + swingShift(s, sd), tick: g, s, u, lvl, n: P.n[u][s] });
      }
      g++;
    }
  });
  return { events, length: g * sd, steps: g };
}

function peakOf(chs) { let pk = 0; for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } return pk; }
const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const fmtDb = (v) => (isFinite(toDb(v)) ? toDb(v).toFixed(1) : "-inf");
function normalise(chs, db) { const pk = peakOf(chs); if (pk <= 0) return pk; const g = Math.pow(10, db / 20) / pk; for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g; return pk * g; }
function scaleAll(chs, g) { for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g; }

// opts: { only: unitIndex|null, masterFx: bool, wet: bool }
async function renderEvents(ev, opts) {
  const e = state.exp, rate = e.rate;
  const tail = e.wrap ? 3 : 2;
  const ctx = new OfflineAudioContext(2, Math.ceil((ev.length + tail) * rate), rate);
  const chain = buildChain(ctx, { masterFx: opts.masterFx, wet: opts.wet });
  const groups = {};
  ev.events.forEach((x) => {
    if (opts.only != null && x.u !== opts.only) return;
    if (opts.only == null && !audible(x.u)) return;
    triggerUnit(ctx, chain, groups, x.u, x.t, STEP_VEL[x.lvl], x.n, true);
  });
  const r = await ctx.startRendering();
  const loopN = Math.round(ev.length * rate);
  let chs = [Float32Array.from(r.getChannelData(0)), Float32Array.from(r.getChannelData(1))];
  if (e.wrap) {
    chs.forEach((d) => { for (let i = 0; loopN + i < d.length; i++) d[i % loopN] += d[loopN + i]; });
    chs = chs.map((d) => d.slice(0, loopN));
  }
  return chs;
}

async function renderMix(ev) {
  const chs = await renderEvents(ev, { only: null, masterFx: true, wet: true });
  const rawPeak = peakOf(chs);
  const peak = state.exp.norm ? normalise(chs, -1) : rawPeak;
  return { chs, peak, rawPeak, length: chs[0].length / state.exp.rate };
}

async function renderOneShot(i) {
  const rate = state.exp.rate;
  const ctx = new OfflineAudioContext(2, Math.ceil(2.5 * rate), rate);
  const chain = buildChain(ctx, { masterFx: false, wet: false });
  triggerUnit(ctx, chain, null, i, 0, 1, 0, true, true);
  const r = await ctx.startRendering();
  let chs = trimTail([Float32Array.from(r.getChannelData(0)), Float32Array.from(r.getChannelData(1))], rate, -60);
  const rawPeak = peakOf(chs);
  const peak = state.exp.norm ? normalise(chs, -1) : rawPeak;
  return { chs, peak, length: chs[0].length / rate };
}

function trimTail(chs, rate, thDb) {
  const thr = Math.pow(10, thDb / 20);
  let last = 0;
  for (const d of chs) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > thr) { last = i; break; }
  const end = Math.min(chs[0].length, last + Math.floor(rate * 0.03));
  const out = chs.map((d) => d.slice(0, Math.max(end, 1)));
  const fade = Math.min(out[0].length, Math.floor(rate * 0.01));
  out.forEach((d) => { for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade; });
  return out;
}

// ---------- encoders ----------

function encodeWav(chs, rate, bits) {
  const n = chs[0].length, nch = chs.length, bytes = bits / 8, dataLen = n * nch * bytes;
  const buf = new ArrayBuffer(44 + dataLen), dv = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); wr(8, "WAVE");
  wr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * nch * bytes, true); dv.setUint16(32, nch * bytes, true); dv.setUint16(34, bits, true);
  wr(36, "data"); dv.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    const v = clamp(chs[c][i], -1, 1);
    if (bits === 16) { dv.setInt16(o, Math.round(v < 0 ? v * 32768 : v * 32767), true); o += 2; }
    else { const s = Math.round(v < 0 ? v * 8388608 : v * 8388607); dv.setUint8(o, s & 255); dv.setUint8(o + 1, (s >> 8) & 255); dv.setUint8(o + 2, (s >> 16) & 255); o += 3; }
  }
  return new Uint8Array(buf);
}

function vlq(n) { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; }
function strBytes(s) { return [...s].map((c) => c.charCodeAt(0) & 0x7f); }
function chunk(id, data) { const l = data.length; return [...strBytes(id), (l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255, ...data]; }

// Type 1 SMF, 480 PPQ: a tempo track, one drum track per unit (GM channel), NEURO on ch 2 as notes.
function encodeMidi(ev) {
  const PPQ = 480, stepTicks = PPQ / 4;
  const tracks = [];
  const t0 = [];
  const us = Math.round(60000000 / state.bpm);
  t0.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  t0.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  const nm = strBytes("CircuitStomp");
  t0.push(0, 0xff, 0x03, nm.length, ...nm);
  t0.push(...vlq(ev.steps * stepTicks), 0xff, 0x2f, 0);
  tracks.push(t0);

  for (let u = 0; u < NUM_UNITS; u++) {
    const mine = ev.events.filter((x) => x.u === u);
    if (!mine.length) continue;
    const isBass = state.units[u].type === "neuro";
    const ch = isBass ? 1 : state.midi.ch - 1;
    const list = [];
    mine.forEach((x) => {
      const shift = x.s % 2 === 1 ? Math.round((state.swing / 100) * stepTicks * 0.5) : 0;
      const tick = x.tick * stepTicks + shift;
      const note = isBass ? clamp(NEURO_BASE_MIDI + state.units[u].pitch + x.n, 0, 127) : noteMap().out[u];
      const len = isBass ? stepTicks - 10 : Math.floor(stepTicks / 2);
      list.push({ tick, order: 1, b: [0x90 | ch, note, MIDI_VEL[x.lvl]] });
      list.push({ tick: tick + len, order: 0, b: [0x80 | ch, note, 0] });
    });
    list.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const trk = [];
    const name = strBytes(`${pad2(u + 1)} ${state.units[u].name}`);
    trk.push(0, 0xff, 0x03, name.length, ...name);
    let prev = 0;
    list.forEach((m) => { trk.push(...vlq(m.tick - prev), ...m.b); prev = m.tick; });
    trk.push(...vlq(Math.max(0, ev.steps * stepTicks - prev)), 0xff, 0x2f, 0);
    tracks.push(trk);
  }
  const head = chunk("MThd", [0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255]);
  return Uint8Array.from([...head, ...tracks.flatMap((t) => chunk("MTrk", t))]);
}

// REAPER project: one track per stem, all items at 0, same length, looped if seamless.
function encodeRpp(stems, lenSec, seq) {
  const q = (s) => `"${String(s).replace(/"/g, "'")}"`;
  const L = [];
  L.push(`<REAPER_PROJECT 0.1 "6.0" ${Math.floor(Date.now() / 1000)}`);
  L.push(`  TEMPO ${state.bpm} 4 4`);
  L.push(`  SAMPLERATE ${state.exp.rate} 0 0`);
  L.push(`  LOOP 1`);
  L.push(`  SELECTION 0 ${lenSec.toFixed(6)}`);
  const barSec = STEPS * stepDur();
  seq.forEach((pat, i) => { if (i === 0 || seq[i - 1] !== pat) L.push(`  MARKER ${i + 1} ${(i * barSec).toFixed(6)} ${q("Pattern " + LETTERS[pat])} 0`); });
  stems.forEach((st) => {
    L.push("  <TRACK");
    L.push(`    NAME ${q(st.track)}`);
    L.push(`    VOLPAN 1 ${(st.pan || 0).toFixed(3)} -1 -1 1`);
    L.push("    <ITEM");
    L.push("      POSITION 0");
    L.push(`      LENGTH ${lenSec.toFixed(6)}`);
    L.push(`      LOOP ${state.exp.wrap ? 1 : 0}`);
    L.push(`      NAME ${q(st.file.replace(/^.*\//, ""))}`);
    L.push("      <SOURCE WAVE");
    L.push(`        FILE ${q(st.file)}`);
    L.push("      >");
    L.push("    >");
    L.push("  >");
  });
  L.push(">");
  return new TextEncoder().encode(L.join("\r\n") + "\r\n");
}

// ---------- zip (store) ----------

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  });
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// ---------- download (plain page, or the hosted preview's download capability) ----------

let dlCap = null;
async function download(blobOrBytes, name, type) {
  let blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type });
  if (EMBED) {
    if (!dlCap && window.claude && window.claude.use) dlCap = await window.claude.use("downloads");
    if (!dlCap) throw new Error("Downloads aren't available in this view. Use the full CircuitStomp page on Darkroom Labs.");
    if (!/\.(zip|pdf|json)$/i.test(name)) {
      blob = makeZip([{ name, data: new Uint8Array(await blob.arrayBuffer()) }]);
      name = name.replace(/\.[^.]+$/, "") + ".zip";
    }
    try { await dlCap.save({ filename: name, data: blob }); }
    catch (e) { throw new Error(e && e.code === "declined" ? "Save cancelled." : (e && e.message) || "Couldn't save the file."); }
    return name;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return name;
}
window.__csDownload = download;

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
function exportSeed() { return (state.exp.ver * 7919 + state.bpm * 31 + state.pattern) | 0; }
const busy = (on) => document.querySelectorAll("#exportDrawer .btn").forEach((b) => { b.disabled = on; });

// ---------- export actions ----------

async function doBounce() {
  busy(true);
  try {
    setStatus("Rendering mix…", false, "exStatus");
    const seq = exportSequence(), ev = buildEvents(seq, exportSeed());
    if (!ev.events.length) throw new Error("Nothing to render: the pattern is empty (or every step rolled 'no' on chance).");
    const r = await renderMix(ev);
    const name = await download(encodeWav(r.chs, state.exp.rate, state.exp.bits), fileName(state.exp.type), "audio/wav");
    setStatus(`Saved ${name}\n${seq.length} bar${seq.length === 1 ? "" : "s"} @ ${state.bpm} BPM · ${r.length.toFixed(3)} s · peak ${fmtDb(r.peak)} dBFS` +
      (r.peak > 0.999 ? "\nCLIPPING: switch on Normalise or lower the volume." : ""), r.peak > 0.999, "exStatus");
  } catch (err) { setStatus(err.message || String(err), true, "exStatus"); }
  busy(false);
}

async function doMidi() {
  busy(true);
  try {
    const seq = exportSequence(), ev = buildEvents(seq, exportSeed());
    if (!ev.events.length) throw new Error("This pattern is empty. Add some steps first.");
    const name = await download(encodeMidi(ev), fileName(state.exp.type, null, "mid"), "audio/midi");
    setStatus(`Saved ${name}\nOne track per unit. Drums on channel ${state.midi.ch} (${noteMap().label} map), NEURO bass on channel 2 as real notes. ${state.bpm} BPM.`, false, "exStatus");
  } catch (err) { setStatus(err.message || String(err), true, "exStatus"); }
  busy(false);
}

async function doOneShot() {
  busy(true);
  try {
    const i = state.sel;
    setStatus("Rendering one-shot…", false, "exStatus");
    const r = await renderOneShot(i);
    const name = await download(encodeWav(r.chs, state.exp.rate, state.exp.bits), fileName(state.units[i].name), "audio/wav");
    setStatus(`Saved ${name}\n${r.length.toFixed(2)} s · dry (no reverb/delay/master) · peak ${fmtDb(r.peak)} dBFS`, false, "exStatus");
  } catch (err) { setStatus(err.message || String(err), true, "exStatus"); }
  busy(false);
}

async function doKit() {
  busy(true);
  try {
    const e = state.exp, files = [], rows = [["file", "unit", "source", "length_s", "sample_rate", "bit_depth", "peak_dbfs", "created"]];
    const created = new Date().toISOString(), used = new Set();
    for (let i = 0; i < NUM_UNITS; i++) {
      setStatus(`Rendering one-shot ${i + 1}/${NUM_UNITS}…`, false, "exStatus");
      const r = await renderOneShot(i);
      let n = fileName(state.units[i].name);
      if (used.has(n)) n = n.replace(/\.wav$/, `${i + 1}.wav`);
      used.add(n);
      files.push({ name: n, data: encodeWav(r.chs, e.rate, e.bits) });
      rows.push([n, state.units[i].name, sampleBuffers[i] ? state.units[i].sampleName || "recording" : "robot synth", r.length.toFixed(3), e.rate, e.bits, fmtDb(r.peak), created]);
    }
    files.push({ name: "manifest.csv", data: new TextEncoder().encode(rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n") });
    const zn = `${slug(e.prefix) || "cs"}_circuitstomp_kit_${slug(e.src) || "own"}_v${pad2(e.ver)}.zip`;
    await download(makeZip(files), zn, "application/zip");
    setStatus(`Saved ${zn}\n${NUM_UNITS} dry one-shots + manifest.csv.`, false, "exStatus");
  } catch (err) { setStatus(err.message || String(err), true, "exStatus"); }
  busy(false);
}

async function doReaperPack() {
  busy(true);
  try {
    const e = state.exp, seq = exportSequence(), ev = buildEvents(seq, exportSeed());
    if (!ev.events.length) throw new Error("Nothing to export: the pattern is empty.");
    const base = `${slug(e.prefix) || "cs"}_${slug(e.type) || "loop"}_${slug(e.src) || "own"}_v${pad2(e.ver)}`;
    const folder = base + "/";
    const files = [], stems = [];
    const rows = [["file", "kind", "unit", "bpm", "bars", "length_s", "sample_rate", "bit_depth", "peak_dbfs", "created"]];
    const created = new Date().toISOString();
    const used = [...new Set(ev.events.map((x) => x.u))].sort((a, b) => a - b);

    // render stems first (unnormalised), then scale them all by ONE shared gain so they still sum correctly
    const rendered = [];
    for (let k = 0; k < used.length; k++) {
      const u = used[k];
      setStatus(`Rendering stem ${k + 1}/${used.length}: ${state.units[u].name}…`, false, "exStatus");
      rendered.push({ u, chs: await renderEvents(ev, { only: u, masterFx: false, wet: e.wet }) });
    }
    const pk = Math.max(...rendered.map((r) => peakOf(r.chs)));
    const shared = pk > 0.891 ? 0.891 / pk : 1;       // keep every stem at or below -1 dBFS, same gain for all
    rendered.forEach((r) => scaleAll(r.chs, shared));

    const lenSec = rendered[0].chs[0].length / e.rate;
    rendered.forEach((r) => {
      const n = `stems/${pad2(r.u + 1)}_${slug(state.units[r.u].name) || "unit" + (r.u + 1)}.wav`;
      files.push({ name: folder + n, data: encodeWav(r.chs, e.rate, e.bits) });
      stems.push({ file: n, track: `${pad2(r.u + 1)} ${state.units[r.u].name}`, pan: 0 });
      rows.push([n, "stem", state.units[r.u].name, state.bpm, seq.length, lenSec.toFixed(6), e.rate, e.bits, fmtDb(peakOf(r.chs)), created]);
    });

    setStatus("Rendering reference mix…", false, "exStatus");
    const mix = await renderMix(ev);
    const mixName = `${base}_mix.wav`;
    files.push({ name: folder + mixName, data: encodeWav(mix.chs, e.rate, e.bits) });
    rows.push([mixName, "mix", "all", state.bpm, seq.length, mix.length.toFixed(6), e.rate, e.bits, fmtDb(mix.peak), created]);

    const midName = `${base}.mid`;
    files.push({ name: folder + midName, data: encodeMidi(ev) });
    rows.push([midName, "midi", "all", state.bpm, seq.length, "", "", "", "", created]);

    files.push({ name: folder + `${base}.RPP`, data: encodeRpp(stems, lenSec, seq) });
    files.push({ name: folder + "manifest.csv", data: new TextEncoder().encode(rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n") });

    const gainDb = (20 * Math.log10(shared)).toFixed(1);
    const readme = [
      "CircuitStomp Reaper pack",
      "========================",
      "",
      `Tempo: ${state.bpm} BPM, 4/4. Length: ${seq.length} bar(s), ${lenSec.toFixed(3)} s. ${e.rate} Hz / ${e.bits}-bit.`,
      `Chain: ${seq.map((p) => LETTERS[p]).join(" ")}`,
      "",
      "REAPER",
      "1. Unzip this whole folder somewhere permanent first (not inside the zip viewer).",
      `2. Double-click ${base}.RPP. Each unit opens on its own named track, lined up at 0.`,
      "3. If REAPER asks where media is, point it at the stems folder next to the .RPP.",
      "4. Drag the .mid onto a new track to get the notes (drums ch " + state.midi.ch + ", " + noteMap().label + " note map; NEURO bass on ch 2).",
      "",
      "OTHER DAWS",
      `Set the project to ${state.bpm} BPM, then drag every file in stems/ in at bar 1, beat 1.`,
      "",
      "NOTES",
      "- Stems are pre-master: no master filter or glue limiter. Sum them and you get the mix minus the glue.",
      e.wet ? "- Each stem includes its own reverb and delay send." : "- Stems are dry (no reverb/delay). Add your own in the DAW.",
      `- All stems share one gain change (${gainDb} dB) so their balance is exactly as you mixed it.`,
      e.wrap ? "- Seamless loop is on: tails are folded to the start, so items loop cleanly (LOOP is set on each item)." : "- Seamless loop is off: files include the natural tail after the last bar.",
      "- Chance steps were rolled once for this export; stems, mix and MIDI all match.",
      "",
      "Made with CircuitStomp (Darkroom Labs).",
    ].join("\r\n");
    files.push({ name: folder + "README.txt", data: new TextEncoder().encode(readme + "\r\n") });

    setStatus("Packing zip…", false, "exStatus");
    const zn = `${base}_reaper.zip`;
    await download(makeZip(files), zn, "application/zip");
    setStatus(`Saved ${zn}\n${stems.length} stems + mix + MIDI + .RPP + manifest + README. Unzip, then open the .RPP.`, false, "exStatus");
  } catch (err) { setStatus(err.message || String(err), true, "exStatus"); }
  busy(false);
}

function wireExport() {
  const e = state.exp;
  const txt = (id, k, fn) => $(id).addEventListener("input", (ev) => { e[k] = ev.target.value; if (fn) fn(); updateExportName(); scheduleSave(); });
  txt("exPrefix", "prefix"); txt("exType", "type"); txt("exSrc", "src");
  $("exVer").addEventListener("change", (ev) => { e.ver = clamp(parseInt(ev.target.value, 10) || 1, 1, 99); ev.target.value = e.ver; updateExportName(); scheduleSave(); });
  $("exRate").addEventListener("change", (ev) => { e.rate = parseInt(ev.target.value, 10); scheduleSave(); });
  $("exBits").addEventListener("change", (ev) => { e.bits = parseInt(ev.target.value, 10); scheduleSave(); });
  $("exRepeat").addEventListener("change", (ev) => { e.repeat = parseInt(ev.target.value, 10); updateExportName(); scheduleSave(); });
  $("exNorm").addEventListener("change", (ev) => { e.norm = ev.target.checked; scheduleSave(); });
  $("exWrap").addEventListener("change", (ev) => { e.wrap = ev.target.checked; scheduleSave(); });
  $("exWet").addEventListener("change", (ev) => { e.wet = ev.target.checked; scheduleSave(); });
  $("bounceBtn").addEventListener("click", doBounce);
  $("midiExportBtn").addEventListener("click", doMidi);
  $("shotBtn").addEventListener("click", doOneShot);
  $("bundleBtn").addEventListener("click", doKit);
  $("reaperBtn").addEventListener("click", doReaperPack);
  $("exportDrawer").addEventListener("toggle", updateExportName);
}

// ---------- save / share ----------

function shareable() {
  const s = JSON.parse(JSON.stringify(state));
  s.units.forEach((u) => { u.sampleName = ""; });
  delete s.midi; delete s.exp;
  return s;
}
function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }

function bytesToB64(bytes) { let s = ""; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

function wireSave() {
  $("shareBtn").addEventListener("click", async () => {
    const url = location.href.split("#")[0] + "#b=" + b64urlEncode(JSON.stringify(shareable()));
    try { await navigator.clipboard.writeText(url); setStatus(`Share link copied (${url.length} characters). Anyone opening it gets your patterns, tempo and unit settings.`, false, "saveStatus"); }
    catch (e) { prompt("Copy this link:", url); }
  });
  $("saveProjBtn").addEventListener("click", async () => {
    try {
      const proj = { app: "circuitstomp", saved: new Date().toISOString(), state, samples: {} };
      sampleBytes.forEach((b, i) => { if (b) proj.samples[i] = { name: state.units[i].sampleName, b64: bytesToB64(b) }; });
      const name = await download(new Blob([JSON.stringify(proj)], { type: "application/json" }), `${slug(state.exp.prefix) || "cs"}_circuitstomp_project_v${pad2(state.exp.ver)}.json`, "application/json");
      setStatus("Saved " + name, false, "saveStatus");
    } catch (e) { setStatus(e.message, true, "saveStatus"); }
  });
  $("openProj").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try {
      const proj = JSON.parse(await f.text());
      if (proj.app !== "circuitstomp") throw new Error("That isn't a CircuitStomp project file.");
      if (playing) stop();
      state = mergeSaved(proj.state);
      sampleBuffers.fill(null); reversedCache.fill(null); sampleBytes.fill(null);
      for (let i = 0; i < NUM_UNITS; i++) await kvDel("sample" + i);
      for (const k of Object.keys(proj.samples || {})) {
        const i = parseInt(k, 10), s = proj.samples[k];
        const bytes = b64ToBytes(s.b64);
        sampleBuffers[i] = await live.decodeAudioData(bytes.slice(0)); sampleBytes[i] = bytes;
        await kvSet("sample" + i, { name: s.name, bytes });
      }
      syncControlsFromState(); renderAll(); scheduleSave();
      setStatus(`Opened ${f.name}.`, false, "saveStatus");
    } catch (e) { setStatus("Couldn't open that file: " + e.message, true, "saveStatus"); }
  });
  $("wipeBtn").addEventListener("click", async () => {
    if (!confirm("Start fresh? This clears every pattern, unit setting and loaded recording saved in this browser.")) return;
    if (playing) stop();
    state = defaultState();
    sampleBuffers.fill(null); reversedCache.fill(null); sampleBytes.fill(null);
    for (let i = 0; i < NUM_UNITS; i++) await kvDel("sample" + i);
    syncControlsFromState(); renderAll(); scheduleSave();
    setStatus("Fresh start. The two default patterns are back in A and B.", false, "saveStatus");
  });
}

function readShareHash() {
  const m = location.hash.match(/#b=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try { return JSON.parse(b64urlDecode(m[1])); } catch (e) { return null; }
}

// ---------- render everything from state ----------

function renderAll() { renderPatternButtons(); renderSeq(); renderPads(); syncEditor(); setPaint(state.paint); }

function syncControlsFromState() {
  $("bpm").value = state.bpm; $("swing").value = state.swing; $("clickChk").checked = state.click;
  $("songChk").checked = state.songMode;
  $("chainInput").value = state.chain.map((n) => LETTERS[n]).join(" ");
  $("brainStyle").value = state.brain;
  $("filterKnob").value = state.master.filter; $("reverbKnob").value = state.master.reverb;
  $("delayKnob").value = state.master.delay; $("volumeKnob").value = state.master.volume; $("limiterChk").checked = state.master.limiter;
  const e = state.exp;
  $("exPrefix").value = e.prefix; $("exType").value = e.type; $("exSrc").value = e.src; $("exVer").value = e.ver;
  $("exRate").value = String(e.rate); $("exBits").value = String(e.bits); $("exRepeat").value = String(e.repeat);
  $("exNorm").checked = e.norm; $("exWrap").checked = e.wrap; $("exWet").checked = e.wet;
  if (liveChain) {
    liveChain.filter.frequency.value = state.master.filter;
    liveChain.verbRet.gain.value = (state.master.reverb / 100) * 0.9;
    liveChain.dlRet.gain.value = (state.master.delay / 100) * 0.8;
    liveChain.vol.gain.value = knobToVolume(state.master.volume);
    liveChain.dl.delayTime.value = delayTime();
    setLimiter(liveChain.lim, state.master.limiter);
  }
  updateChainInfo(); updateExportName();
}

// ---------- boot ----------

async function boot() {
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "booting the robot…";
  try { if ("audioSession" in navigator) navigator.audioSession.type = "playback"; } catch (e) { /* iOS silent switch fix, where supported */ }
  live = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  if (live.state === "suspended") await live.resume();

  const saved = await kvGet("project");
  state = mergeSaved(saved);
  const shared = readShareHash();
  if (shared && confirm("This link contains a shared CircuitStomp beat. Load it? (Your own saved work will be replaced by it.)")) {
    state = mergeSaved(Object.assign({}, shared, { midi: state.midi, exp: state.exp }));
    try { window.history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* */ }
  }
  await restoreSamples();

  liveChain = buildChain(live);
  analyser = live.createAnalyser(); analyser.fftSize = 1024;
  liveChain.out.connect(analyser);

  syncControlsFromState();
  buildKeyboardUI();
  renderAll();
  wireTransport(); wireEditor(); wireExport(); wireMidi(); wireSave();
  const ms = $("miniSteps"); for (let s = 0; s < STEPS; s++) ms.appendChild(document.createElement("i"));

  $("startScreen").hidden = true;
  $("panel").hidden = false;
  $("drawers").hidden = false;
  drawWave();
  scheduleSave();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => heldKeys.clear());
  document.addEventListener("visibilitychange", () => { if (!document.hidden && live.state === "suspended") live.resume(); });

  // mini transport shows once the main one scrolls out of view
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => { $("mini").hidden = en.isIntersecting; }, { threshold: 0 }).observe($("transport"));
  }
  requestAnimationFrame(drawLoop);
  hitUnit(0, 3);
  document.dispatchEvent(new CustomEvent("cs-ready"));
}

$("startBtn").addEventListener("click", boot);

// lets the promo boot the engine too
window.CS = {
  get live() { return live; }, get chain() { return liveChain; }, get state() { return state; },
  get ready() { return !!liveChain; }, boot, triggerUnit, STEP_VEL, stop: () => playing && stop(),
  flashPad, pulseRobot,
};

// subtle header parallax, as on MeowSynth and MonkeyBeat
(function parallax() {
  const robot = $("robot"), title = document.querySelector(".title");
  if (!robot || !title || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let raf = null;
  window.addEventListener("mousemove", (e) => {
    if (raf) return;
    const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
    raf = requestAnimationFrame(() => { robot.style.transform = `translate(${nx * 6}px, ${ny * 4}px)`; title.style.transform = `translate(${nx * 3}px, ${ny * 2}px)`; raf = null; });
  });
})();

// test hook for headless checks
window.__cs = { get state() { return state; }, buildEvents, renderMix, renderEvents, renderOneShot, encodeWav, encodeMidi, encodeRpp, makeZip, exportSequence, generate, exportSeed };

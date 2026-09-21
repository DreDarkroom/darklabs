// MonkeyBeat — a browser drum machine built from human "monkey" recordings.
// Same spirit as MeowSynth: no frameworks, no build step, plain Web Audio.
//
// One signal chain, used identically for live playback and offline bounces:
//
//   pad voice -> voiceGain -> panner -+-> dry ------------> mix -> filter -> master -> limiter -> out
//                                     \-> reverb send -> convolver -> wet -^
//
// Until a pad has a recording loaded it plays a built-in synth stand-in.
"use strict";

// ---------- constants ----------

const NUM_PADS = 8;
const STEPS = 16;
const NUM_PATTERNS = 8;
const LETTERS = "ABCDEFGH";
const PAD_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const STEP_VEL = [0, 0.45, 0.75, 1];      // step level -> velocity
const MIDI_VEL = [0, 50, 90, 120];        // step level -> MIDI velocity
const MIDI_BASE_NOTE = 36;                // pad 1 = C1 (kick in General MIDI), pads 1-8 -> 36-43
const LOOKAHEAD = 0.12;
const SCHED_MS = 25;
const DB_NAME = "monkeybeat";
const DB_STORE = "kv";

// Names are the narrative; `kind` is the synth stand-in used until a recording is loaded.
const DEFAULT_KIT = [
  { name: "chest thump", kind: "kick",  group: 0, verb: 0.15 },
  { name: "slap",        kind: "snare", group: 0, verb: 1.0 },
  { name: "clap",        kind: "clap",  group: 0, verb: 1.0 },
  { name: "chatter",     kind: "chat",  group: 1, verb: 0.4 },
  { name: "screech",     kind: "ohat",  group: 1, verb: 0.6 },
  { name: "hoot",        kind: "tomhi", group: 0, verb: 0.8 },
  { name: "grunt",       kind: "tomlo", group: 0, verb: 0.8 },
  { name: "tap",         kind: "rim",   group: 0, verb: 0.8 },
];

// ---------- state ----------

function makePad(def) {
  return {
    name: def.name, kind: def.kind, group: def.group, verb: def.verb,
    gain: 0.8, pitch: 0, pan: 0, tail: 0.5, start: 0, end: 1,
    reverse: false, mute: false, solo: false, sampleName: null,
  };
}
function emptyPattern() {
  return Array.from({ length: NUM_PADS }, () => new Array(STEPS).fill(0));
}
function defaultState() {
  const patterns = Array.from({ length: NUM_PATTERNS }, emptyPattern);
  const a = patterns[0];
  [0, 8, 10].forEach((s) => (a[0][s] = s === 10 ? 2 : 3));      // chest thump
  [4, 12].forEach((s) => (a[1][s] = 3));                        // slap
  for (let s = 0; s < STEPS; s += 2) a[3][s] = s % 4 === 0 ? 2 : 1; // chatter
  a[4][14] = 2;                                                 // screech
  return {
    bpm: 100, swing: 0, pattern: 0, songMode: false, chain: [0], click: false,
    patterns,
    pads: DEFAULT_KIT.map(makePad),
    master: { filter: 16000, reverb: 18, volume: 75, limiter: true },
    exp: { type: "loop", src: "own", ver: 1, rate: 44100, bits: 16, repeat: 1, norm: true, wrap: true },
    sel: 0,
  };
}
let state = defaultState();

let live = null;                     // live AudioContext
let liveChain = null;
let liveGroups = {};
let sampleBuffers = new Array(NUM_PADS).fill(null);   // AudioBuffer | null
let reversedCache = new Array(NUM_PADS).fill(null);

let playing = false;
let recording = false;
let nextTime = 0;
let seqIdx = 0, seqStep = 0;
let timer = null;
let history = [];                    // recent scheduled steps {time, step, pat}
let shownStep = -1;
let clipboard = null;
let tapTimes = [];

// ---------- tiny helpers ----------

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setStatus(msg, isErr) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("err", !!isErr);
}

// ---------- persistence (IndexedDB, best effort) ----------

function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function kvSet(k, v) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) { /* storage unavailable: app still works */ }
}
async function kvGet(k) {
  try {
    const db = await idb();
    const v = await new Promise((res, rej) => {
      const rq = db.transaction(DB_STORE).objectStore(DB_STORE).get(k);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    db.close();
    return v;
  } catch (e) { return undefined; }
}
async function kvDel(k) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) { /* ignore */ }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet("project", JSON.parse(JSON.stringify(state))), 400);
}

// Merge a saved project into the defaults, keeping only well-formed values.
function mergeSaved(saved) {
  const d = defaultState();
  if (!saved || typeof saved !== "object") return d;
  const num = (v, lo, hi, fb) => (typeof v === "number" && isFinite(v) ? clamp(v, lo, hi) : fb);
  d.bpm = num(saved.bpm, 40, 220, d.bpm);
  d.swing = num(saved.swing, 0, 100, d.swing);
  d.pattern = Math.round(num(saved.pattern, 0, NUM_PATTERNS - 1, 0));
  d.songMode = !!saved.songMode;
  d.click = !!saved.click;
  d.sel = Math.round(num(saved.sel, 0, NUM_PADS - 1, 0));
  if (Array.isArray(saved.chain) && saved.chain.length) {
    d.chain = saved.chain.filter((n) => Number.isInteger(n) && n >= 0 && n < NUM_PATTERNS).slice(0, 64);
    if (!d.chain.length) d.chain = [0];
  }
  if (Array.isArray(saved.patterns) && saved.patterns.length === NUM_PATTERNS) {
    d.patterns = saved.patterns.map((pat) =>
      Array.from({ length: NUM_PADS }, (_, p) =>
        Array.from({ length: STEPS }, (_, s) => {
          const v = pat && pat[p] && pat[p][s];
          return Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0;
        })));
  }
  if (Array.isArray(saved.pads)) {
    saved.pads.slice(0, NUM_PADS).forEach((sp, i) => {
      if (!sp) return;
      const p = d.pads[i];
      if (typeof sp.name === "string") p.name = sp.name.slice(0, 24);
      p.group = Math.round(num(sp.group, 0, 3, p.group));
      p.verb = num(sp.verb, 0, 1, p.verb);
      p.gain = num(sp.gain, 0, 1, p.gain);
      p.pitch = Math.round(num(sp.pitch, -24, 24, 0));
      p.pan = num(sp.pan, -1, 1, 0);
      p.tail = num(sp.tail, 0, 1, p.tail);
      p.start = num(sp.start, 0, 1, 0);
      p.end = num(sp.end, 0, 1, 1);
      p.reverse = !!sp.reverse; p.mute = !!sp.mute; p.solo = !!sp.solo;
      p.sampleName = typeof sp.sampleName === "string" ? sp.sampleName : null;
    });
  }
  if (saved.master) {
    d.master.filter = num(saved.master.filter, 200, 16000, d.master.filter);
    d.master.reverb = num(saved.master.reverb, 0, 100, d.master.reverb);
    d.master.volume = num(saved.master.volume, 0, 100, d.master.volume);
    d.master.limiter = saved.master.limiter !== false;
  }
  if (saved.exp) {
    const e = d.exp, s = saved.exp;
    if (typeof s.type === "string") e.type = s.type;
    if (typeof s.src === "string") e.src = s.src;
    e.ver = Math.round(num(s.ver, 1, 99, 1));
    e.rate = s.rate === 48000 ? 48000 : 44100;
    e.bits = s.bits === 24 ? 24 : 16;
    e.repeat = [1, 2, 4].includes(s.repeat) ? s.repeat : 1;
    e.norm = s.norm !== false; e.wrap = s.wrap !== false;
  }
  return d;
}

// ---------- audio graph ----------

const irCache = {};
function makeImpulseResponse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  if (irCache[rate]) return irCache[rate];
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  const rnd = mulberry32(42);           // deterministic, so bounces match live playback
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (rnd() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  irCache[rate] = impulse;
  return impulse;
}

function knobToVolume(v) { return Math.pow(v / 100, 1.4) * 0.9; }

function setLimiter(node, glue) {
  // glue on = same limiter as MeowSynth; off = near-brickwall safety only.
  node.threshold.value = glue ? -10 : -1;
  node.knee.value = glue ? 12 : 0;
  node.ratio.value = glue ? 6 : 20;
  node.attack.value = 0.003;
  node.release.value = 0.25;
}

function buildChain(ctx) {
  const m = state.master;
  const input = ctx.createGain();
  const mix = ctx.createGain();
  const rvIn = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulseResponse(ctx, 2.2, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = (m.reverb / 100) * 0.8;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = m.filter; filter.Q.value = 0.7;
  const master = ctx.createGain();
  master.gain.value = knobToVolume(m.volume);
  const limiter = ctx.createDynamicsCompressor();
  setLimiter(limiter, m.limiter);

  input.connect(mix);
  rvIn.connect(conv).connect(wet).connect(mix);
  mix.connect(filter).connect(master).connect(limiter).connect(ctx.destination);
  return { input, rvIn, wet, filter, master, limiter };
}

// Dry chain for game-ready one-shots: no reverb, no filter, no limiter.
function buildDryChain(ctx) {
  const input = ctx.createGain();
  input.connect(ctx.destination);
  return { input, rvIn: null };
}

// ---------- synth stand-in voices ----------

const noiseCache = new WeakMap();
function getNoise(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0), rnd = mulberry32(1234);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function envGain(ctx, t, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.002 + decay);
  return g;
}
function osc(ctx, type, f0, f1, t, sweep, dur, out, peak, decay) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  const g = envGain(ctx, t, peak, decay);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur);
}
function noise(ctx, filterType, freq, q, t, dur, out, peak, decay) {
  const s = ctx.createBufferSource();
  s.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = Math.min(freq, ctx.sampleRate / 2 - 100); f.Q.value = q;
  const g = envGain(ctx, t, peak, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t); s.stop(t + dur);
}

// r = pitch ratio, d = decay multiplier
const SYNTH = {
  kick(ctx, t, out, r, d) {
    osc(ctx, "sine", 160 * r, 46 * r, t, 0.12, 0.6 * d + 0.05, out, 1.0, 0.42 * d);
    noise(ctx, "lowpass", 3000, 0.7, t, 0.03, out, 0.3, 0.012);
  },
  snare(ctx, t, out, r, d) {
    noise(ctx, "highpass", 1500 * r, 0.7, t, 0.3 * d + 0.05, out, 0.75, 0.2 * d);
    osc(ctx, "triangle", 200 * r, 140 * r, t, 0.08, 0.2 * d + 0.05, out, 0.5, 0.1 * d);
  },
  clap(ctx, t, out, r, d) {
    const s = ctx.createBufferSource();
    s.buffer = getNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1400 * r; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 3; k++) {
      const tk = t + k * 0.011;
      g.gain.setValueAtTime(0.9, tk);
      g.gain.exponentialRampToValueAtTime(0.2, tk + 0.009);
    }
    g.gain.setValueAtTime(0.9, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.033 + 0.2 * d);
    s.connect(f).connect(g).connect(out);
    s.start(t); s.stop(t + 0.3 * d + 0.1);
  },
  chat(ctx, t, out, r, d) { noise(ctx, "highpass", 7000 * r, 0.7, t, 0.1 * d + 0.03, out, 0.5, 0.045 * d); },
  ohat(ctx, t, out, r, d) { noise(ctx, "highpass", 7000 * r, 0.7, t, 0.6 * d + 0.05, out, 0.5, 0.32 * d); },
  tomhi(ctx, t, out, r, d) { osc(ctx, "sine", 240 * r, 150 * r, t, 0.15, 0.5 * d + 0.05, out, 0.9, 0.3 * d); },
  tomlo(ctx, t, out, r, d) { osc(ctx, "sine", 160 * r, 90 * r, t, 0.18, 0.6 * d + 0.05, out, 0.9, 0.4 * d); },
  rim(ctx, t, out, r, d) {
    osc(ctx, "triangle", 1700 * r, 1700 * r, t, 0, 0.08 * d + 0.03, out, 0.6, 0.03 * d);
    noise(ctx, "highpass", 3000 * r, 0.7, t, 0.05, out, 0.35, 0.02 * d);
  },
};

// ---------- voice triggering (live and offline share this) ----------

function audible(i) {
  const anySolo = state.pads.some((p) => p.solo);
  return anySolo ? state.pads[i].solo : !state.pads[i].mute;
}

function getBuffer(i) {
  const b = sampleBuffers[i];
  if (!b) return null;
  if (!state.pads[i].reverse) return b;
  if (!reversedCache[i]) {
    const r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c), dst = r.getChannelData(c);
      for (let n = 0, L = src.length; n < L; n++) dst[n] = src[L - 1 - n];
    }
    reversedCache[i] = r;
  }
  return reversedCache[i];
}

// vel is 0..1. Returns the pad's output gain node (used for choking).
function triggerPad(ctx, chain, groups, i, t, vel, extraSemis = 0) {
  if (!audible(i)) return null;
  const p = state.pads[i];
  const out = ctx.createGain();
  out.gain.value = p.gain * vel;
  const pan = ctx.createStereoPanner();
  pan.pan.value = p.pan;
  out.connect(pan).connect(chain.input);
  if (chain.rvIn && p.verb > 0) {
    const send = ctx.createGain();
    send.gain.value = p.verb;
    pan.connect(send).connect(chain.rvIn);
  }

  if (p.group) {
    const list = groups[p.group] || (groups[p.group] = []);
    list.forEach((g) => g.gain.setTargetAtTime(0, t, 0.004));
    list.length = 0;
    list.push(out);
  }

  const rate = Math.pow(2, (p.pitch + extraSemis) / 12);
  const buf = getBuffer(i);
  if (buf) {
    const total = buf.duration;
    const s = clamp(p.start, 0, 0.995), e = clamp(p.end, s + 0.005, 1);
    // reversed buffer: mirror the trim window so start/end still refer to what you see
    const winStart = p.reverse ? (1 - e) : s;
    const seg = (e - s) * total;
    const offset = winStart * total;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    const ATTACK = 0.003;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + ATTACK);
    const playDur = (seg / rate) * (0.1 + 0.9 * p.tail);
    const fadeDur = Math.min(0.3, Math.max(0.01, playDur * 0.35));
    const fadeStart = Math.max(t + ATTACK, t + playDur - fadeDur);
    env.gain.setValueAtTime(1, fadeStart);
    env.gain.linearRampToValueAtTime(0, fadeStart + fadeDur);
    src.connect(env).connect(out);
    src.start(t, offset, seg);
    src.stop(fadeStart + fadeDur + 0.05);
  } else {
    const d = 0.3 + 1.4 * p.tail;
    (SYNTH[p.kind] || SYNTH.kick)(ctx, t, out, rate, d);
  }
  return out;
}

// ---------- live playback + sequencer ----------

function currentSequence() {
  return state.songMode && state.chain.length ? state.chain : [state.pattern];
}
function swingShift(step, stepDur) {
  return step % 2 === 1 ? (state.swing / 100) * stepDur * 0.5 : 0;
}

function scheduleStep() {
  const seq = currentSequence();
  if (seqIdx >= seq.length) seqIdx = 0;
  const pat = seq[seqIdx];
  const step = seqStep;
  const stepDur = 60 / state.bpm / 4;
  const t = nextTime + swingShift(step, stepDur);

  for (let p = 0; p < NUM_PADS; p++) {
    const lvl = state.patterns[pat][p][step];
    if (lvl) triggerPad(live, liveChain, liveGroups, p, t, STEP_VEL[lvl]);
  }
  if (state.click && step % 4 === 0) clickAt(nextTime, step === 0);

  history.push({ time: nextTime, step, pat, idx: seqIdx });
  if (history.length > 96) history.shift();

  nextTime += stepDur;
  seqStep++;
  if (seqStep >= STEPS) {
    seqStep = 0;
    seqIdx++;
    if (seqIdx >= seq.length) seqIdx = 0;
  }
}

function scheduler() {
  while (nextTime < live.currentTime + LOOKAHEAD) scheduleStep();
}

function clickAt(t, accent) {
  const o = live.createOscillator(), g = live.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  o.connect(g).connect(live.destination);
  o.start(t); o.stop(t + 0.05);
}

async function play() {
  if (!live) return;
  if (live.state === "suspended") await live.resume();
  liveGroups = {};
  history = [];
  seqIdx = 0; seqStep = 0;
  nextTime = live.currentTime + 0.06;
  playing = true;
  timer = setInterval(scheduler, SCHED_MS);
  scheduler();
  $("playBtn").innerHTML = "&#9632; Stop";
  $("playBtn").classList.add("on");
}

function stop() {
  clearInterval(timer);
  playing = false;
  history = [];
  shownStep = -1;
  $("playBtn").innerHTML = "&#9654; Play";
  $("playBtn").classList.remove("on");
  document.querySelectorAll(".cell.now").forEach((c) => c.classList.remove("now"));
}

function togglePlay() { playing ? stop() : play(); }

function toggleRec() {
  recording = !recording;
  $("recBtn").classList.toggle("on", recording);
  if (recording && !playing) play();
}

// Playhead: follow the audio clock, not the scheduler.
function drawLoop() {
  if (playing && live) {
    const now = live.currentTime;
    let cur = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].time <= now) { cur = history[i]; break; }
    }
    if (cur) {
      if (state.songMode && cur.pat !== state.pattern) {
        state.pattern = cur.pat;
        renderPatternButtons();
        renderSeq();
      }
      const key = cur.step + cur.idx * 100;
      if (key !== shownStep) {
        shownStep = key;
        document.querySelectorAll(".cell.now").forEach((c) => c.classList.remove("now"));
        document.querySelectorAll(`.cell[data-step="${cur.step}"]`).forEach((c) => c.classList.add("now"));
      }
    }
  }
  requestAnimationFrame(drawLoop);
}

// ---------- pad hits (keyboard, touch, MIDI) ----------

let monkeyTimer = null;
function pulseMonkey() {
  const el = $("monkey");
  el.classList.add("hit");
  clearTimeout(monkeyTimer);
  monkeyTimer = setTimeout(() => el.classList.remove("hit"), 130);
}

function flashPad(i) {
  const el = document.querySelector(`.pad[data-pad="${i}"]`);
  if (!el) return;
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 120);
}

function hitPad(i, level = 3) {
  if (!live) return;
  if (live.state === "suspended") live.resume();
  triggerPad(live, liveChain, liveGroups, i, live.currentTime, STEP_VEL[level]);
  flashPad(i);
  pulseMonkey();
  if (recording && playing) recordHit(i, level);
}

// ---------- keys: play the selected pad chromatically (MeowSynth-style) ----------

// Same "typing piano" layout as MeowSynth: index = semitones above the pad's own pitch.
const KEY_SEQUENCE = [
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
let octaveShift = 0;
let keysMode = false;
const OCTAVE_MIN = -2, OCTAVE_MAX = 3;

function playKey(k) {
  if (!live) return;
  if (live.state === "suspended") live.resume();
  triggerPad(live, liveChain, liveGroups, state.sel, live.currentTime, 1, k + octaveShift * 12);
  pulseMonkey();
}

function shiftOctave(dir) {
  octaveShift = clamp(octaveShift + dir, OCTAVE_MIN, OCTAVE_MAX);
  $("octLabel").textContent = octaveShift > 0 ? `+${octaveShift}` : `${octaveShift}`;
}

function setKeysMode(on) {
  keysMode = on;
  $("keysMode").classList.toggle("on", on);
  $("keysMode").textContent = on ? "Keys mode: on" : "Keys mode: off";
}

function buildKeyboardUI() {
  const el = $("keyboard");
  el.innerHTML = "";
  KEY_SEQUENCE.forEach((k, i) => {
    const btn = document.createElement("div");
    btn.className = "key" + (k.black ? " black" : "");
    btn.dataset.i = i;
    btn.textContent = k.key.toUpperCase();
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.classList.add("active"); playKey(i); });
    const up = () => btn.classList.remove("active");
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
    el.appendChild(btn);
  });
  $("octDown").addEventListener("click", () => shiftOctave(-1));
  $("octUp").addEventListener("click", () => shiftOctave(1));
  $("keysMode").addEventListener("click", () => setKeysMode(!keysMode));
}

// Quantise a live hit to the nearest scheduled step, compensating for output latency.
function recordHit(i, level) {
  if (!history.length) return;
  const target = live.currentTime - (live.outputLatency || live.baseLatency || 0);
  let best = null, bestD = Infinity;
  for (const h of history) {
    const d = Math.abs(h.time - target);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) return;
  state.patterns[best.pat][i][best.step] = level;
  if (best.pat === state.pattern) renderCell(i, best.step);
  renderPatternButtons();
  scheduleSave();
}

// ---------- sample loading ----------

// Decode audio bytes onto a pad and remember them (IndexedDB) so they survive a reload.
async function setPadFromBytes(i, arr, sampleName) {
  const copy = arr.slice(0);
  const buf = await live.decodeAudioData(arr);
  sampleBuffers[i] = buf;
  reversedCache[i] = null;
  const p = state.pads[i];
  p.sampleName = sampleName;
  p.start = 0; p.end = 1; p.reverse = false;
  kvSet("sample-" + i, copy);
  scheduleSave();
  return buf;
}

async function loadFileIntoPad(i, file) {
  if (!live) return;
  try {
    const buf = await setPadFromBytes(i, await file.arrayBuffer(), file.name);
    const p = state.pads[i];
    p.tail = 1; p.pitch = 0;
    p.name = file.name.replace(/\.[^.]+$/, "").slice(0, 24) || p.name;
    selectPad(i);
    renderAll();
    setStatus(`Loaded "${file.name}" onto pad ${i + 1} (${buf.duration.toFixed(2)} s).` +
      (buf.duration > 15 ? " Long file: trim it with Start / End." : ""));
    hitPad(i, 3);
  } catch (e) {
    setStatus(`Couldn't read "${file.name}" as audio. Try WAV, MP3 or M4A.`, true);
  }
}

// The slices that ship with the page, cut from the original monkey recording.
let bank = null;   // { pads: [...], library: [...] } from samples/manifest.json

const EMBED = typeof window !== "undefined" && window.__EMBED ? window.__EMBED : null;
function b64ToBuf(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

async function fetchBank() {
  if (EMBED) { bank = EMBED.manifest; return bank; }
  try {
    const r = await fetch("samples/manifest.json");
    if (!r.ok) throw new Error(r.status);
    bank = await r.json();
  } catch (e) { bank = null; }
  return bank;
}
async function fetchSlice(file) {
  if (EMBED) return b64ToBuf(EMBED.files[file]);
  const r = await fetch("samples/" + file);
  if (!r.ok) throw new Error("missing " + file);
  return r.arrayBuffer();
}

// Put the default monkey slice (and its default settings) back on a pad.
async function resetPad(i) {
  const d = bank && bank.pads && bank.pads[i];
  if (!d) { clearSample(i); return; }
  try {
    await setPadFromBytes(i, await fetchSlice(d.file), d.file);
    Object.assign(state.pads[i], {
      name: d.name, pitch: d.pitch, tail: d.tail, group: d.group, verb: d.verb, gain: d.gain,
      mute: false, solo: false, pan: 0,
    });
  } catch (e) { setStatus("Couldn't load the built-in slice for this pad.", true); }
}

async function applyDefaultKit() {
  for (let i = 0; i < NUM_PADS; i++) await resetPad(i);
}

async function loadFromLibrary(file) {
  const i = state.sel;
  try {
    const buf = await setPadFromBytes(i, await fetchSlice(file), file);
    state.pads[i].tail = 0.8; state.pads[i].pitch = 0;
    renderAll();
    setStatus(`Loaded slice ${file.replace(/\.wav$/, "")} onto pad ${i + 1} (${buf.duration.toFixed(2)} s).`);
    hitPad(i, 3);
  } catch (e) { setStatus("Couldn't load that slice.", true); }
}

function clearSample(i) {
  sampleBuffers[i] = null;
  reversedCache[i] = null;
  const p = state.pads[i];
  p.sampleName = null; p.start = 0; p.end = 1; p.tail = 0.5; p.reverse = false;
  p.name = DEFAULT_KIT[i].name;
  kvDel("sample-" + i);
  scheduleSave();
  renderAll();
}

function fillLibrary() {
  const sel = $("libSelect");
  sel.innerHTML = '<option value="">Library: slices of your recording…</option>';
  if (!bank || !bank.library) { sel.disabled = true; return; }
  bank.library.forEach((l) => {
    const o = document.createElement("option");
    o.value = l.file; o.textContent = l.label;
    sel.appendChild(o);
  });
}

async function restoreSamples() {
  for (let i = 0; i < NUM_PADS; i++) {
    if (!state.pads[i].sampleName) continue;
    const bytes = await kvGet("sample-" + i);
    if (!bytes) { state.pads[i].sampleName = null; continue; }
    try { sampleBuffers[i] = await live.decodeAudioData(bytes.slice(0)); }
    catch (e) { state.pads[i].sampleName = null; }
  }
}

// ---------- UI: patterns, sequencer, pads ----------

function patternHasNotes(pat) { return state.patterns[pat].some((row) => row.some((v) => v)); }

function renderPatternButtons() {
  const el = $("patBtns");
  el.innerHTML = "";
  for (let n = 0; n < NUM_PATTERNS; n++) {
    const b = document.createElement("button");
    b.className = "pat-btn" + (n === state.pattern ? " sel" : "") + (patternHasNotes(n) ? " has" : "");
    b.textContent = LETTERS[n];
    b.title = `Pattern ${LETTERS[n]} (key ${n + 1})`;
    b.addEventListener("click", () => selectPattern(n));
    el.appendChild(b);
  }
}

function selectPattern(n) {
  state.pattern = n;
  if (!state.songMode) seqIdx = 0;
  renderPatternButtons();
  renderSeq();
  scheduleSave();
}

function renderSeq() {
  const el = $("seq");
  el.innerHTML = "";
  const head = document.createElement("div");
  head.className = "seq-head";
  head.innerHTML = "<div></div>";
  const nums = document.createElement("div");
  nums.className = "cells";
  for (let s = 0; s < STEPS; s++) {
    const n = document.createElement("div");
    n.className = "cell num" + (s % 4 === 0 ? " beat" : "");
    n.textContent = s % 4 === 0 ? String(s / 4 + 1) : "·";
    nums.appendChild(n);
  }
  head.appendChild(nums);
  el.appendChild(head);

  for (let p = 0; p < NUM_PADS; p++) {
    const row = document.createElement("div");
    row.className = "seq-row";
    const name = document.createElement("button");
    name.className = "seq-name" + (p === state.sel ? " sel" : "") + (!audible(p) ? " muted" : "");
    name.dataset.pad = p;
    name.textContent = state.pads[p].name;
    name.addEventListener("click", () => { selectPad(p); hitPad(p, 3); });
    row.appendChild(name);
    const cells = document.createElement("div");
    cells.className = "cells";
    for (let s = 0; s < STEPS; s++) {
      const c = document.createElement("div");
      c.className = "cell";
      c.dataset.pad = p; c.dataset.step = s;
      c.dataset.l = state.patterns[state.pattern][p][s];
      c.addEventListener("click", () => cycleCell(p, s));
      c.addEventListener("contextmenu", (e) => { e.preventDefault(); setCell(p, s, 0); });
      cells.appendChild(c);
    }
    row.appendChild(cells);
    el.appendChild(row);
  }
}

function renderCell(p, s) {
  const c = document.querySelector(`.cell[data-pad="${p}"][data-step="${s}"]`);
  if (c) c.dataset.l = state.patterns[state.pattern][p][s];
}

function setCell(p, s, lvl) {
  state.patterns[state.pattern][p][s] = lvl;
  renderCell(p, s);
  renderPatternButtons();
  scheduleSave();
}

function cycleCell(p, s) {
  const cur = state.patterns[state.pattern][p][s];
  const next = cur === 0 ? 3 : cur - 1;
  setCell(p, s, next);
  if (next > 0 && !playing && live) triggerPad(live, liveChain, liveGroups, p, live.currentTime, STEP_VEL[next]);
}

function renderPads() {
  const el = $("pads");
  el.innerHTML = "";
  state.pads.forEach((p, i) => {
    const btn = document.createElement("div");
    btn.className = "pad" + (i === state.sel ? " sel" : "") + (sampleBuffers[i] ? " custom" : "") + (!audible(i) ? " muted" : "");
    btn.dataset.pad = i;
    btn.innerHTML = `<span class="num">${PAD_KEYS[i].toUpperCase()} · ${i + 1}</span><span class="lbl"></span><span class="src">${sampleBuffers[i] ? "your recording" : "synth stand-in"}</span>`;
    btn.querySelector(".lbl").textContent = p.name;
    const trigger = () => { selectPad(i); hitPad(i, 3); };
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); trigger(); });
    btn.addEventListener("dragover", (e) => { e.preventDefault(); btn.classList.add("drop"); });
    btn.addEventListener("dragleave", () => btn.classList.remove("drop"));
    btn.addEventListener("drop", (e) => {
      e.preventDefault(); btn.classList.remove("drop");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFileIntoPad(i, f);
    });
    el.appendChild(btn);
  });
}

function selectPad(i) {
  if (state.sel === i && $("padName").dataset.pad === String(i)) return;
  state.sel = i;
  document.querySelectorAll(".pad").forEach((el) => el.classList.toggle("sel", el.dataset.pad === String(i)));
  document.querySelectorAll(".seq-name").forEach((el) => el.classList.toggle("sel", el.dataset.pad === String(i)));
  syncEditor();
  scheduleSave();
}

// ---------- pad editor ----------

function syncEditor() {
  const i = state.sel, p = state.pads[i];
  $("padTitle").textContent = `— pad ${i + 1}`;
  const nameEl = $("padName");
  nameEl.value = p.name; nameEl.dataset.pad = i;
  $("padGain").value = Math.round(p.gain * 100);
  $("padPitch").value = p.pitch; $("padPitchVal").textContent = (p.pitch > 0 ? "+" : "") + p.pitch;
  $("padPan").value = Math.round(p.pan * 100);
  $("padTail").value = Math.round(p.tail * 100);
  $("padVerb").value = Math.round(p.verb * 100);
  $("padStart").value = Math.round(p.start * 1000);
  $("padEnd").value = Math.round(p.end * 1000);
  $("padGroup").value = String(p.group);
  $("padReverse").checked = p.reverse;
  $("padMute").checked = p.mute;
  $("padSolo").checked = p.solo;
  const has = !!sampleBuffers[i];
  ["padStart", "padEnd", "padReverse"].forEach((id) => ($(id).disabled = !has));
  $("clearSample").disabled = !has;
  $("resetPad").disabled = !(bank && bank.pads && bank.pads[i]);
  $("padInfo").textContent = has
    ? `${p.sampleName} · ${sampleBuffers[i].duration.toFixed(2)} s · ${sampleBuffers[i].sampleRate} Hz · ${sampleBuffers[i].numberOfChannels} ch`
    : "Synth stand-in. Load a recording, pick a library slice, or reset the pad to its default monkey slice.";
  drawWave();
  updateExportName();
}

function drawWave() {
  const cv = $("wave");
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const i = state.sel, p = state.pads[i], buf = sampleBuffers[i];
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim() || "#ff2f4e";
  const dim = css.getPropertyValue("--dim").trim() || "#7a6468";
  if (!buf) {
    g.fillStyle = dim; g.font = "12px monospace"; g.textAlign = "center";
    g.fillText("synth stand-in — load a recording or a library slice to see its waveform", w / 2, h / 2 + 4);
    return;
  }
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  g.fillStyle = accent;
  for (let x = 0; x < w; x++) {
    let lo = 1, hi = -1;
    const from = x * step, to = Math.min(data.length, from + step);
    for (let n = from; n < to; n++) { const v = data[n]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo > hi) continue;
    const y1 = (1 - (hi * 0.5 + 0.5)) * h, y2 = (1 - (lo * 0.5 + 0.5)) * h;
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.fillRect(0, 0, p.start * w, h);
  g.fillRect(p.end * w, 0, w - p.end * w, h);
  g.fillStyle = "#ff8a3d";
  g.fillRect(p.start * w, 0, 1.5, h);
  g.fillRect(p.end * w - 1.5, 0, 1.5, h);
}

function bindPad(id, fn, redraw) {
  $(id).addEventListener("input", (e) => {
    const p = state.pads[state.sel];
    fn(p, e.target);
    if (redraw) drawWave();
    scheduleSave();
  });
}

function wireEditor() {
  $("padName").addEventListener("input", (e) => {
    state.pads[state.sel].name = e.target.value.slice(0, 24);
    renderPads(); renderSeq(); updateExportName(); scheduleSave();
  });
  bindPad("padGain", (p, el) => (p.gain = el.value / 100));
  bindPad("padPitch", (p, el) => { p.pitch = parseInt(el.value, 10); $("padPitchVal").textContent = (p.pitch > 0 ? "+" : "") + p.pitch; });
  bindPad("padPan", (p, el) => (p.pan = el.value / 100));
  bindPad("padTail", (p, el) => (p.tail = el.value / 100));
  bindPad("padVerb", (p, el) => (p.verb = el.value / 100));
  bindPad("padStart", (p, el) => { p.start = Math.min(el.value / 1000, p.end - 0.01); el.value = Math.round(p.start * 1000); }, true);
  bindPad("padEnd", (p, el) => { p.end = Math.max(el.value / 1000, p.start + 0.01); el.value = Math.round(p.end * 1000); }, true);
  $("padGroup").addEventListener("change", (e) => { state.pads[state.sel].group = parseInt(e.target.value, 10); scheduleSave(); });
  $("padReverse").addEventListener("change", (e) => { state.pads[state.sel].reverse = e.target.checked; reversedCache[state.sel] = null; scheduleSave(); });
  $("padMute").addEventListener("change", (e) => { state.pads[state.sel].mute = e.target.checked; renderPads(); renderSeq(); scheduleSave(); });
  $("padSolo").addEventListener("change", (e) => { state.pads[state.sel].solo = e.target.checked; renderPads(); renderSeq(); scheduleSave(); });
  $("fileInput").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadFileIntoPad(state.sel, f);
    e.target.value = "";
  });
  $("clearSample").addEventListener("click", () => clearSample(state.sel));
  $("resetPad").addEventListener("click", async () => { await resetPad(state.sel); renderAll(); hitPad(state.sel, 3); });
  $("libSelect").addEventListener("change", (e) => {
    if (e.target.value) loadFromLibrary(e.target.value);
    e.target.value = "";
  });
  $("auditionBtn").addEventListener("click", () => hitPad(state.sel, 3));
  window.addEventListener("resize", drawWave);
}

// ---------- transport + master wiring ----------

function parseChain(text) {
  return text.toUpperCase().replace(/[^A-H]/g, "").split("").map((c) => LETTERS.indexOf(c)).slice(0, 64);
}

function wireTransport() {
  $("playBtn").addEventListener("click", togglePlay);
  $("recBtn").addEventListener("click", toggleRec);
  $("bpm").addEventListener("change", (e) => {
    state.bpm = clamp(parseInt(e.target.value, 10) || 100, 40, 220);
    e.target.value = state.bpm; updateExportName(); scheduleSave();
  });
  $("tapBtn").addEventListener("click", () => {
    const now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
    tapTimes.push(now);
    tapTimes = tapTimes.slice(-5);
    if (tapTimes.length >= 2) {
      const avg = (tapTimes[tapTimes.length - 1] - tapTimes[0]) / (tapTimes.length - 1);
      state.bpm = clamp(Math.round(60000 / avg), 40, 220);
      $("bpm").value = state.bpm; scheduleSave();
    }
  });
  $("swing").addEventListener("input", (e) => { state.swing = parseFloat(e.target.value); scheduleSave(); });
  $("clickChk").addEventListener("change", (e) => { state.click = e.target.checked; scheduleSave(); });

  $("copyPat").addEventListener("click", () => {
    clipboard = JSON.parse(JSON.stringify(state.patterns[state.pattern]));
    setStatus(`Copied pattern ${LETTERS[state.pattern]}.`);
  });
  $("pastePat").addEventListener("click", () => {
    if (!clipboard) { setStatus("Nothing copied yet.", true); return; }
    state.patterns[state.pattern] = JSON.parse(JSON.stringify(clipboard));
    renderSeq(); renderPatternButtons(); scheduleSave();
    setStatus(`Pasted into pattern ${LETTERS[state.pattern]}.`);
  });
  $("clearPat").addEventListener("click", () => {
    state.patterns[state.pattern] = emptyPattern();
    renderSeq(); renderPatternButtons(); scheduleSave();
  });

  $("songChk").addEventListener("change", (e) => { state.songMode = e.target.checked; seqIdx = 0; updateExportName(); scheduleSave(); });
  $("chainInput").addEventListener("input", (e) => {
    const c = parseChain(e.target.value);
    state.chain = c.length ? c : [0];
    updateChainInfo(); updateExportName(); scheduleSave();
  });

  $("filterKnob").addEventListener("input", (e) => {
    state.master.filter = parseFloat(e.target.value);
    if (liveChain) liveChain.filter.frequency.setTargetAtTime(state.master.filter, live.currentTime, 0.01);
    scheduleSave();
  });
  $("reverbKnob").addEventListener("input", (e) => {
    state.master.reverb = parseFloat(e.target.value);
    if (liveChain) liveChain.wet.gain.setTargetAtTime((state.master.reverb / 100) * 0.8, live.currentTime, 0.01);
    scheduleSave();
  });
  $("volumeKnob").addEventListener("input", (e) => {
    state.master.volume = parseFloat(e.target.value);
    if (liveChain) liveChain.master.gain.setTargetAtTime(knobToVolume(state.master.volume), live.currentTime, 0.01);
    scheduleSave();
  });
  $("limiterChk").addEventListener("change", (e) => {
    state.master.limiter = e.target.checked;
    if (liveChain) setLimiter(liveChain.limiter, state.master.limiter);
    scheduleSave();
  });
}

function updateChainInfo() {
  $("chainInfo").textContent = state.songMode || state.chain.length > 1
    ? `${state.chain.length} pattern${state.chain.length === 1 ? "" : "s"} · ${state.chain.map((n) => LETTERS[n]).join(" ")}`
    : "";
}

// ---------- keyboard ----------

const heldKeys = new Set();
function onKeyDown(e) {
  const t = e.target;
  if (t && (t.tagName === "SELECT" || t.tagName === "TEXTAREA" ||
      (t.tagName === "INPUT" && (t.type === "text" || t.type === "number")))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const ch = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (ch === " ") { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
  if (e.repeat) return;
  if (ch === "r") { toggleRec(); return; }
  if (/^[1-8]$/.test(ch)) { selectPattern(parseInt(ch, 10) - 1); return; }
  if (keysMode) {
    if (ch === "z") { shiftOctave(-1); return; }
    if (ch === "x") { shiftOctave(1); return; }
    const k = KEY_SEQUENCE.findIndex((s) => s.key === ch);
    if (k !== -1 && !heldKeys.has(ch)) {
      heldKeys.add(ch);
      playKey(k);
      const el = document.querySelector(`.key[data-i="${k}"]`);
      if (el) el.classList.add("active");
    }
    return;
  }
  const p = PAD_KEYS.indexOf(ch);
  if (p !== -1 && !heldKeys.has(ch)) {
    heldKeys.add(ch);
    selectPad(p);
    hitPad(p, 3);
  }
}
function onKeyUp(e) {
  const ch = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  heldKeys.delete(ch);
  const k = KEY_SEQUENCE.findIndex((s) => s.key === ch);
  if (k !== -1) {
    const el = document.querySelector(`.key[data-i="${k}"]`);
    if (el) el.classList.remove("active");
  }
}

// ---------- MIDI in ----------

function onMIDI(e) {
  const [status, note, vel] = e.data;
  if ((status & 0xf0) === 0x90 && vel > 0) {
    const i = note - MIDI_BASE_NOTE;
    if (i >= 0 && i < NUM_PADS) hitPad(i, vel < 50 ? 1 : vel < 95 ? 2 : 3);
  }
}
async function enableMIDI() {
  const st = $("midiStatus");
  if (!navigator.requestMIDIAccess) { st.textContent = "MIDI in: not supported in this browser"; return; }
  try {
    const acc = await navigator.requestMIDIAccess();
    const hook = () => {
      let n = 0;
      acc.inputs.forEach((inp) => { inp.onmidimessage = onMIDI; n++; });
      st.textContent = n ? `MIDI in: ${n} device${n === 1 ? "" : "s"} connected (notes 36–43 play pads 1–8)`
                         : "MIDI in: no devices found (notes 36–43 play pads 1–8)";
    };
    hook();
    acc.onstatechange = hook;
    $("midiEnable").disabled = true;
  } catch (e) { st.textContent = "MIDI in: access blocked"; }
}

// ---------- export: naming ----------

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const pad2 = (n) => String(n).padStart(2, "0");

function fileName(type, ver) {
  const e = state.exp;
  return `dre_${slug(type) || "sound"}_${slug(e.src) || "own"}_v${pad2(ver ?? e.ver)}.wav`;
}
function updateExportName() {
  const e = state.exp;
  const seq = exportSequence();
  const secs = seq.length * STEPS * (60 / state.bpm / 4);
  $("exName").textContent =
    `Loop file: ${fileName(e.type)} · ${seq.length} bar${seq.length === 1 ? "" : "s"} @ ${state.bpm} BPM ≈ ${secs.toFixed(2)} s` +
    ` · one-shot file: ${fileName(state.pads[state.sel].name)}`;
}

// ---------- export: sequence + offline render ----------

function exportSequence() {
  const base = state.songMode && state.chain.length ? state.chain : [state.pattern];
  const out = [];
  for (let r = 0; r < state.exp.repeat; r++) out.push(...base);
  return out;
}

function buildEvents(seq) {
  const stepDur = 60 / state.bpm / 4;
  const events = [];
  let g = 0;
  seq.forEach((pat) => {
    for (let s = 0; s < STEPS; s++) {
      const shift = swingShift(s, stepDur);
      for (let p = 0; p < NUM_PADS; p++) {
        const lvl = state.patterns[pat][p][s];
        if (lvl) events.push({ t: g * stepDur + shift, pad: p, lvl });
      }
      g++;
    }
  });
  return { events, length: g * stepDur, steps: g };
}

function peakOf(chs) {
  let pk = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; }
  return pk;
}
const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

function normalise(chs, targetDb) {
  const pk = peakOf(chs);
  if (pk <= 0) return pk;
  const g = Math.pow(10, targetDb / 20) / pk;
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g;
  return pk * g;
}

async function renderLoop() {
  const e = state.exp;
  const seq = exportSequence();
  const { events, length } = buildEvents(seq);
  if (!events.length) throw new Error("This pattern is empty. Add some steps first.");
  const rate = e.rate;
  const tail = e.wrap ? 2.6 : 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil((length + tail) * rate), rate);
  const chain = buildChain(ctx);
  const groups = {};
  events.forEach((ev) => triggerPad(ctx, chain, groups, ev.pad, ev.t, STEP_VEL[ev.lvl]));
  const rendered = await ctx.startRendering();
  const loopN = Math.round(length * rate);
  let chs = [rendered.getChannelData(0), rendered.getChannelData(1)].map((c) => Float32Array.from(c));
  if (e.wrap) {
    chs.forEach((d) => {
      for (let i = 0; loopN + i < d.length; i++) d[i] += d[loopN + i];
    });
    chs = chs.map((d) => d.slice(0, loopN));
  }
  const rawPeak = peakOf(chs);
  const peak = e.norm ? normalise(chs, -1) : rawPeak;
  return { chs, rate, peak, rawPeak, length: chs[0].length / rate, bars: seq.length, steps: seq.length * STEPS };
}

async function renderOneShot(i) {
  const e = state.exp, p = state.pads[i];
  const rate = e.rate;
  const buf = getBuffer(i);
  const dur = buf ? Math.min(20, ((clamp(p.end, 0, 1) - clamp(p.start, 0, 1)) * buf.duration) / Math.pow(2, p.pitch / 12)) + 0.3 : 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
  const chain = buildDryChain(ctx);
  const saved = { mute: p.mute, solo: p.solo };
  // export ignores mute/solo so a muted pad can still be exported
  const anySolo = state.pads.some((x) => x.solo);
  p.mute = false; if (anySolo) p.solo = true;
  triggerPad(ctx, chain, {}, i, 0, 1);
  p.mute = saved.mute; p.solo = saved.solo;
  const rendered = await ctx.startRendering();
  let chs = [Float32Array.from(rendered.getChannelData(0)), Float32Array.from(rendered.getChannelData(1))];
  chs = trimTail(chs, rate, -60);
  const rawPeak = peakOf(chs);
  const peak = e.norm ? normalise(chs, -1) : rawPeak;
  return { chs, rate, peak, rawPeak, length: chs[0].length / rate };
}

// Drop trailing silence below thresholdDb, keep a short safety margin, and fade the last 10 ms.
function trimTail(chs, rate, thresholdDb) {
  const thr = Math.pow(10, thresholdDb / 20);
  let last = 0;
  for (const d of chs) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > thr) { last = i; break; }
  const end = Math.min(chs[0].length, last + Math.floor(rate * 0.03));
  const out = chs.map((d) => d.slice(0, Math.max(end, 1)));
  const fade = Math.min(out[0].length, Math.floor(rate * 0.01));
  out.forEach((d) => { for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade; });
  return out;
}

// ---------- export: encoders ----------

function encodeWav(chs, rate, bits) {
  const n = chs[0].length, nch = chs.length, bytes = bits / 8;
  const dataLen = n * nch * bytes;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); wr(8, "WAVE");
  wr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * nch * bytes, true);
  dv.setUint16(32, nch * bytes, true); dv.setUint16(34, bits, true);
  wr(36, "data"); dv.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const v = clamp(chs[c][i], -1, 1);
      if (bits === 16) { dv.setInt16(o, Math.round(v < 0 ? v * 32768 : v * 32767), true); o += 2; }
      else {
        const s = Math.round(v < 0 ? v * 8388608 : v * 8388607);
        dv.setUint8(o, s & 255); dv.setUint8(o + 1, (s >> 8) & 255); dv.setUint8(o + 2, (s >> 16) & 255); o += 3;
      }
    }
  }
  return new Uint8Array(buf);
}

function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

// Standard MIDI File, type 0, 480 PPQ, drums on channel 10, pads on notes 36-43.
function encodeMidi() {
  const PPQ = 480, stepTicks = PPQ / 4;
  const seq = exportSequence();
  const ev = [];
  let g = 0;
  seq.forEach((pat) => {
    for (let s = 0; s < STEPS; s++) {
      const shift = s % 2 === 1 ? Math.round((state.swing / 100) * stepTicks * 0.5) : 0;
      const tick = g * stepTicks + shift;
      for (let p = 0; p < NUM_PADS; p++) {
        const lvl = state.patterns[pat][p][s];
        if (!lvl) continue;
        ev.push({ tick, order: 1, bytes: [0x99, MIDI_BASE_NOTE + p, MIDI_VEL[lvl]] });
        ev.push({ tick: tick + Math.floor(stepTicks / 2), order: 0, bytes: [0x89, MIDI_BASE_NOTE + p, 0] });
      }
      g++;
    }
  });
  ev.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track = [];
  const usPerBeat = Math.round(60000000 / state.bpm);
  track.push(0, 0xff, 0x51, 0x03, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255);
  track.push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8);
  const nm = "MonkeyBeat";
  track.push(0, 0xff, 0x03, nm.length, ...[...nm].map((c) => c.charCodeAt(0)));
  let prev = 0;
  ev.forEach((e) => { track.push(...vlq(e.tick - prev), ...e.bytes); prev = e.tick; });
  track.push(...vlq(Math.max(0, g * stepTicks - prev)), 0xff, 0x2f, 0x00);

  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
  const len = track.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255];
  return Uint8Array.from([...head, ...trk, ...track]);
}

// Minimal ZIP writer (store only, no compression).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  });
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

let dlCap = null;
async function download(blobOrBytes, name, type) {
  let blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type });
  if (EMBED) {
    // Hosted single-file build: pages can't start downloads themselves, and .wav/.mid aren't
    // allowed extensions there, so single files are wrapped in a .zip (the bundle already is one).
    if (!dlCap && window.claude && window.claude.use) dlCap = await window.claude.use("downloads");
    if (!dlCap) throw new Error("Downloads aren't available in this view. Use the full MonkeyBeat page to export.");
    if (!/\.zip$/i.test(name)) {
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
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const fmtDb = (v) => (isFinite(v) ? toDb(v).toFixed(1) : "-inf");

// ---------- export: buttons ----------

async function doBounce() {
  try {
    setStatus("Rendering loop…");
    const r = await renderLoop();
    const name = await download(encodeWav(r.chs, r.rate, state.exp.bits), fileName(state.exp.type), "audio/wav");
    setStatus(`Saved ${name}\n${r.bars} bar${r.bars === 1 ? "" : "s"} @ ${state.bpm} BPM · ${r.length.toFixed(3)} s · peak ${fmtDb(r.peak)} dBFS` +
      (r.peak > 0.999 ? " — CLIPPING: turn on Normalise or lower the volume" : ""), r.peak > 0.999);
  } catch (err) { setStatus(err.message || String(err), true); }
}

async function doOneShot() {
  try {
    const i = state.sel;
    setStatus("Rendering one-shot…");
    const r = await renderOneShot(i);
    const name = await download(encodeWav(r.chs, r.rate, state.exp.bits), fileName(state.pads[i].name), "audio/wav");
    setStatus(`Saved ${name}\n${r.length.toFixed(2)} s · dry (no reverb or filter) · peak ${fmtDb(r.peak)} dBFS`);
  } catch (err) { setStatus(err.message || String(err), true); }
}

async function doMidi() {
  const seq = exportSequence();
  if (!buildEvents(seq).events.length) { setStatus("This pattern is empty. Add some steps first.", true); return; }
  try {
    const name = await download(encodeMidi(), fileName(state.exp.type).replace(/\.wav$/, ".mid"), "audio/midi");
    setStatus(`Saved ${name}\nDrums on channel 10, pads 1–8 = notes 36–43, ${state.bpm} BPM.`);
  } catch (err) { setStatus(err.message || String(err), true); }
}

async function doBundle() {
  try {
    const e = state.exp;
    setStatus("Rendering bundle…");
    const files = [];
    const rows = [["file", "type", "source_recording", "bpm", "bars", "length_s", "sample_rate", "bit_depth", "peak_dbfs", "created"]];
    const created = new Date().toISOString();
    const ver = e.ver;

    try {
      const loop = await renderLoop();
      const n = fileName(e.type, ver);
      files.push({ name: n, data: encodeWav(loop.chs, loop.rate, e.bits) });
      rows.push([n, "loop", "pattern", state.bpm, loop.bars, loop.length.toFixed(3), loop.rate, e.bits, fmtDb(loop.peak), created]);
      files.push({ name: n.replace(/\.wav$/, ".mid"), data: encodeMidi() });
      rows.push([n.replace(/\.wav$/, ".mid"), "midi", "pattern", state.bpm, loop.bars, "", "", "", "", created]);
    } catch (err) { /* empty pattern: still export the one-shots */ }

    const used = new Set();
    for (let i = 0; i < NUM_PADS; i++) {
      const p = state.pads[i];
      const r = await renderOneShot(i);
      let n = fileName(p.name, ver);
      if (used.has(n)) n = n.replace(/\.wav$/, `${i + 1}.wav`);   // two pads with the same name
      used.add(n);
      files.push({ name: n, data: encodeWav(r.chs, r.rate, e.bits) });
      rows.push([n, "one-shot", p.sampleName || "synth stand-in", "", "", r.length.toFixed(3), r.rate, e.bits, fmtDb(r.peak), created]);
    }
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    files.push({ name: "manifest.csv", data: new TextEncoder().encode(csv) });

    const zipName = `dre_monkeybeat_bundle_${slug(e.src) || "own"}_v${pad2(ver)}.zip`;
    await download(makeZip(files), zipName, "application/zip");
    setStatus(`Saved ${zipName}\n${files.length} files, including manifest.csv for your tracking sheet.`);
  } catch (err) { setStatus(err.message || String(err), true); }
}

function wireExport() {
  const e = state.exp;
  $("exType").addEventListener("input", (ev) => { e.type = ev.target.value; updateExportName(); scheduleSave(); });
  $("exSrc").addEventListener("input", (ev) => { e.src = ev.target.value; updateExportName(); scheduleSave(); });
  $("exVer").addEventListener("change", (ev) => { e.ver = clamp(parseInt(ev.target.value, 10) || 1, 1, 99); ev.target.value = e.ver; updateExportName(); scheduleSave(); });
  $("exRate").addEventListener("change", (ev) => { e.rate = parseInt(ev.target.value, 10); scheduleSave(); });
  $("exBits").addEventListener("change", (ev) => { e.bits = parseInt(ev.target.value, 10); scheduleSave(); });
  $("exRepeat").addEventListener("change", (ev) => { e.repeat = parseInt(ev.target.value, 10); updateExportName(); scheduleSave(); });
  $("exNorm").addEventListener("change", (ev) => { e.norm = ev.target.checked; scheduleSave(); });
  $("exWrap").addEventListener("change", (ev) => { e.wrap = ev.target.checked; scheduleSave(); });
  $("bounceBtn").addEventListener("click", doBounce);
  $("midiExportBtn").addEventListener("click", doMidi);
  $("shotBtn").addEventListener("click", doOneShot);
  $("bundleBtn").addEventListener("click", doBundle);
  $("midiEnable").addEventListener("click", enableMIDI);
}

// ---------- render everything from state ----------

function renderAll() {
  renderPatternButtons();
  renderSeq();
  renderPads();
  syncEditor();
}

function syncControlsFromState() {
  $("bpm").value = state.bpm;
  $("swing").value = state.swing;
  $("clickChk").checked = state.click;
  $("songChk").checked = state.songMode;
  $("chainInput").value = state.chain.map((n) => LETTERS[n]).join(" ");
  $("filterKnob").value = state.master.filter;
  $("reverbKnob").value = state.master.reverb;
  $("volumeKnob").value = state.master.volume;
  $("limiterChk").checked = state.master.limiter;
  const e = state.exp;
  $("exType").value = e.type; $("exSrc").value = e.src; $("exVer").value = e.ver;
  $("exRate").value = String(e.rate); $("exBits").value = String(e.bits); $("exRepeat").value = String(e.repeat);
  $("exNorm").checked = e.norm; $("exWrap").checked = e.wrap;
  updateChainInfo();
}

// ---------- boot ----------

async function start() {
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "waking the monkey…";

  live = new (window.AudioContext || window.webkitAudioContext)();
  if (live.state === "suspended") await live.resume();

  const saved = await kvGet("project");
  state = mergeSaved(saved);
  await fetchBank();
  if (!saved) await applyDefaultKit();   // first visit: kit sliced from the monkey recording
  else await restoreSamples();

  liveChain = buildChain(live);
  syncControlsFromState();
  fillLibrary();
  buildKeyboardUI();
  renderAll();
  wireTransport();
  wireEditor();
  wireExport();
  updateExportName();
  if (!bank) setStatus("Couldn't load the built-in monkey slices (they need to be served over http/https, not opened from a file). Pads use synth stand-ins; you can still load your own recordings.", true);

  $("startScreen").hidden = true;
  $("panel").hidden = false;
  drawWave();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => heldKeys.clear());
  requestAnimationFrame(drawLoop);

  hitPad(0, 3); // audible hello
}

$("startBtn").addEventListener("click", start);

// Subtle header parallax, as on MeowSynth.
(function parallax() {
  const monkey = $("monkey");
  const title = document.querySelector(".title");
  if (!monkey || !title) return;
  let raf = null;
  function apply(nx, ny) {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      monkey.style.transform = `translate(${nx * 6}px, ${ny * 4}px)`;
      title.style.transform = `translate(${nx * 3}px, ${ny * 2}px)`;
      raf = null;
    });
  }
  window.addEventListener("mousemove", (e) => apply(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5));
})();

// Test hook (harmless in production): lets the headless checks drive exports.
window.__monkeybeat = { get state() { return state; }, renderLoop, renderOneShot, encodeWav, encodeMidi, makeZip, exportSequence };

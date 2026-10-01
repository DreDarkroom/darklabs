// BlueHeronBass — UI, amp chain, fretboard, loop station, MIDI and exports.
import { CALLS, synthCall, HERON_SR } from "./heron.js";
import { encodeWav, encodeMidi, makeZip, encodeRpp, download, normalise, stamp } from "./files.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ------------------------------------------------------------------ settings

const LS = "blueheronbass:";
const lsGet = (k, d) => { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* private window */ } };

const TUNINGS = {
  five:  { name: "5-string  B E A D G", open: [23, 28, 33, 38, 43] },
  dropA: { name: "5-string  Drop A", open: [21, 28, 33, 38, 43] },
  four:  { name: "4-string  E A D G", open: [28, 33, 38, 43] },
  highC: { name: "5-string  E A D G C", open: [28, 33, 38, 43, 48] },
  six:   { name: "6-string  B E A D G C", open: [23, 28, 33, 38, 43, 48] },
};
const SCALES = {
  none:  { name: "no scale", iv: null },
  minp:  { name: "minor pentatonic", iv: [0, 3, 5, 7, 10] },
  majp:  { name: "major pentatonic", iv: [0, 2, 4, 7, 9] },
  blues: { name: "blues", iv: [0, 3, 5, 6, 7, 10] },
  minor: { name: "natural minor", iv: [0, 2, 3, 5, 7, 8, 10] },
  major: { name: "major", iv: [0, 2, 4, 5, 7, 9, 11] },
  dor:   { name: "dorian", iv: [0, 2, 3, 5, 7, 9, 10] },
};
const ARTS = [
  { id: "finger", label: "Finger", tip: "two-finger pluck: round and woody" },
  { id: "pick",   label: "Pick",   tip: "plectrum near the bridge: bright and clicky" },
  { id: "slap",   label: "Slap·Pop", tip: "upper half of a string = pop, lower half = slap" },
  { id: "tap",    label: "Tap",    tip: "two-hand tapping: soft, legato; slide to hammer on/off" },
  { id: "mute",   label: "Dead",   tip: "palm-muted thump" },
  { id: "harm",   label: "Harmonic", tip: "touch the diamonds (5, 7, 12, 19, 24) for natural harmonics" },
  { id: "heron",  label: "Heron",  tip: "the string is excited by a heron croak instead of a pluck" },
];
const HARM = { 12: 2, 7: 3, 19: 3, 5: 4, 24: 4, 4: 5, 9: 5, 16: 5 };

// knob definitions: id, label, min, max, step, default, format
const KNOBS = [
  { id: "level",  label: "Level",     min: 0, max: 1, step: 0.01, def: 0.8, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "comp",   label: "Compress",  min: 0, max: 1, step: 0.01, def: 0.4, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "drive",  label: "Fuzz drive", min: 0, max: 1, step: 0.01, def: 0.3, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "blend",  label: "Fuzz blend", min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "env",    label: "Env filter", min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "envq",   label: "Env squelch", min: 1, max: 9, step: 0.1, def: 3.5, fmt: (v) => "Q " + v.toFixed(1) },
  { id: "growl",  label: "Heron growl", min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "cowbell", label: "More cowbell", min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => Math.round(v * 100) + "%" },
  { id: "bass",   label: "Bass",      min: -12, max: 12, step: 0.5, def: 0, fmt: (v) => (v > 0 ? "+" : "") + v + " dB" },
  { id: "mid",    label: "Mid",       min: -12, max: 12, step: 0.5, def: 0, fmt: (v) => (v > 0 ? "+" : "") + v + " dB" },
  { id: "treble", label: "Treble",    min: -12, max: 12, step: 0.5, def: 0, fmt: (v) => (v > 0 ? "+" : "") + v + " dB" },
  { id: "tone",   label: "Tone",      min: 0, max: 1, step: 0.01, def: 0.7, fmt: (v) => Math.round(1200 * Math.pow(10, v)) + " Hz" },
  { id: "vel",    label: "Touch",     min: 0.2, max: 1, step: 0.01, def: 0.8, fmt: (v) => Math.round(v * 100) + "%" },
];
const PRESETS = {
  "Still water (clean finger)": { art: "finger", comp: 0.45, drive: 0.2, blend: 0, env: 0, growl: 0.12, bass: 2, mid: 0, treble: 0, tone: 0.6, level: 0.8 },
  "Marsh slap": { art: "slap", comp: 0.7, drive: 0.25, blend: 0.05, env: 0, growl: 0.2, bass: 4, mid: -5, treble: 4, tone: 0.85, level: 0.75 },
  "Wader (fuzz + squelch)": { art: "pick", comp: 0.5, drive: 0.7, blend: 0.55, env: 0.6, envq: 4.5, growl: 0.3, bass: 3, mid: 2, treble: 0, tone: 0.75, level: 0.7 },
  "Fraaank (heron-excited)": { art: "heron", comp: 0.5, drive: 0.45, blend: 0.25, env: 0.25, growl: 0.55, bass: 2, mid: 1, treble: 1, tone: 0.75, level: 0.75 },
  "Deep silt (dark, tapped)": { art: "tap", comp: 0.35, drive: 0.15, blend: 0, env: 0.15, growl: 0.1, bass: 5, mid: -2, treble: -3, tone: 0.4, level: 0.85 },
  "Mud flat (dead notes)": { art: "mute", comp: 0.6, drive: 0.3, blend: 0.1, env: 0, growl: 0.35, bass: 3, mid: 2, treble: -2, tone: 0.5, level: 0.8 },
};

const S = Object.assign({ art: "finger", tuning: "five", span: 17, root: 4, scale: "none", ring: false, bpm: 100, metro: false, countIn: true, bars: "0", padPitch: 0, padLvl: 0.8, loopVol: 0.9, oct: 0 },
  lsGet("settings", {}));
for (const k of KNOBS) if (S[k.id] == null) S[k.id] = k.def;
const save = () => lsSet("settings", S);

// ------------------------------------------------------------------ audio engine

let ctx, bass, recBus, recMaster, nodes = {}, ready = false;
let heronBufs = [];         // AudioBuffers for the five pads
let voiceSeq = 1;

function shaperCurve(drive) {
  const n = 2048, c = new Float32Array(n), k = 1 + drive * 40;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * (x + 0.12)) - Math.tanh(k * 0.12); }
  return c;
}

async function startAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule("js/bass-worklet.js");
  bass = new AudioWorkletNode(ctx, "bhb-bass", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  recBus = new AudioWorkletNode(ctx, "bhb-rec", { numberOfOutputs: 0 });
  recMaster = new AudioWorkletNode(ctx, "bhb-rec", { numberOfOutputs: 0 });

  const n = nodes;
  n.comp = new DynamicsCompressorNode(ctx, { attack: 0.006, release: 0.15, knee: 12 });
  n.dry = new GainNode(ctx);
  n.hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 140, Q: 0.7 });
  n.shaper = new WaveShaperNode(ctx, { oversample: "4x" });
  n.dirtLp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3800, Q: 0.5 });
  n.dirt = new GainNode(ctx, { gain: 0 });
  n.sum = new GainNode(ctx);
  n.lo = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 90 });
  n.mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 650, Q: 1 });
  n.hi = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 2800 });
  n.cab = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 6000, Q: 0.6 });
  n.inst = new GainNode(ctx);                       // instrument bus (loop recorder taps here)
  n.heronBus = new GainNode(ctx);                   // pads + growl layer
  n.loopBus = new GainNode(ctx);
  n.master = new GainNode(ctx);
  n.limit = new DynamicsCompressorNode(ctx, { threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.1 });
  n.an = new AnalyserNode(ctx, { fftSize: 1024 });

  bass.connect(n.comp);
  n.comp.connect(n.dry).connect(n.sum);
  n.comp.connect(n.hp).connect(n.shaper).connect(n.dirtLp).connect(n.dirt).connect(n.sum);
  n.sum.connect(n.lo).connect(n.mid).connect(n.hi).connect(n.cab).connect(n.inst);
  n.heronBus.connect(n.inst);
  n.inst.connect(n.master); n.inst.connect(recBus);
  n.loopBus.connect(n.master);
  n.master.connect(n.limit).connect(ctx.destination);
  n.limit.connect(n.an); n.limit.connect(recMaster);

  // heron calls: synthesise, or replace with files from samples/
  heronBufs = CALLS.map((c) => {
    const d = synthCall(c), b = ctx.createBuffer(1, d.length, HERON_SR);
    b.copyToChannel(d, 0); return b;
  });
  await loadDropIns();
  sendHeron();

  applyAll();
  ready = true;
  if (ctx.state === "suspended") await ctx.resume();
}

async function loadDropIns() {
  try {
    const m = await (await fetch("samples/manifest.json", { cache: "no-cache" })).json();
    for (let i = 0; i < (m.slots || []).length && i < CALLS.length; i++) {
      const f = m.slots[i]; if (!f) continue;
      try {
        const ab = await (await fetch("samples/" + f)).arrayBuffer();
        heronBufs[i] = await ctx.decodeAudioData(ab);
      } catch (e) { /* keep the synth call */ }
    }
  } catch (e) { /* no manifest: synth only */ }
}

/** The croak the string-exciter uses: pad 0, mono, first 0.5 s, resampled to the context rate. */
function sendHeron() {
  const b = heronBufs[0], d = b.getChannelData(0);
  const len = Math.min(d.length, Math.floor(b.sampleRate * 0.5));
  const out = new Float32Array(Math.floor(len * ctx.sampleRate / b.sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = d[Math.min(len - 1, Math.floor(i * b.sampleRate / ctx.sampleRate))];
  bass.port.postMessage({ t: "heron", buf: out });
}

// ------------------------------------------------------------------ knobs

const applyKnob = {
  level: (v) => nodes.master.gain.setTargetAtTime(v * 1.1, ctx.currentTime, 0.02),
  comp: (v) => { const c = nodes.comp; c.threshold.value = -6 - 30 * v; c.ratio.value = 1.5 + 8 * v; },
  drive: (v) => { nodes.shaper.curve = shaperCurve(v); },
  blend: (v) => { nodes.dirt.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.02); nodes.dry.gain.setTargetAtTime(1 - v * 0.45, ctx.currentTime, 0.02); },
  env: (v) => bass.port.postMessage({ t: "fx", fx: { envAmt: v } }),
  envq: (v) => bass.port.postMessage({ t: "fx", fx: { envQ: v } }),
  growl: () => {},
  cowbell: () => {},
  bass: (v) => { nodes.lo.gain.value = v; },
  mid: (v) => { nodes.mid.gain.value = v; },
  treble: (v) => { nodes.hi.gain.value = v; },
  tone: (v) => { nodes.cab.frequency.value = 1200 * Math.pow(10, v); },
  vel: () => {},
};
function applyAll() {
  for (const k of KNOBS) applyKnob[k.id](S[k.id]);
  nodes.heronBus.gain.value = S.padLvl;
  nodes.loopBus.gain.value = S.loopVol;
}

function buildKnobs() {
  const host = $("knobs");
  for (const k of KNOBS) {
    const g = document.createElement("div"); g.className = "knob-group";
    g.innerHTML = `<label for="k_${k.id}">${k.label} <span class="val" id="v_${k.id}"></span></label><input type="range" id="k_${k.id}" min="${k.min}" max="${k.max}" step="${k.step}">`;
    host.appendChild(g);
    const r = g.querySelector("input"), val = g.querySelector(".val");
    r.value = S[k.id]; val.textContent = k.fmt(S[k.id]);
    r.addEventListener("input", () => {
      S[k.id] = +r.value; val.textContent = k.fmt(S[k.id]);
      if (ready) applyKnob[k.id](S[k.id]);
      save();
    });
  }
}
function setKnob(id, v) {
  const r = $("k_" + id); if (!r) return;
  r.value = v; r.dispatchEvent(new Event("input"));
}

// ------------------------------------------------------------------ playing

let tuning = TUNINGS[S.tuning].open;
const strVoice = [];        // last voice id per string
const noteLog = [];         // for MIDI export while a take is recording
let takeT0 = null;
let midiOut = null;

function styleFor(art, yy) {
  if (art === "slap") return yy < 0.5 ? "pop" : "slap";
  return art;
}

/** Start a note on string s at fret. Returns a handle for later release/bend. */
function noteOn(s, fret, vel, art, yy = 0.5) {
  if (!ready) return null;
  const style = styleFor(art, yy);
  let f = mtof(tuning[s] + fret), h = 1, midi = tuning[s] + fret;
  if (style === "harm") {
    h = HARM[fret] || 1;
    f = mtof(tuning[s]); midi = tuning[s] + Math.round(12 * Math.log2(h));
    if (h === 1) { f = mtof(tuning[s] + fret); midi = tuning[s] + fret; }
  }
  // one finger per string: a new note cuts the old one
  if (strVoice[s]) bass.port.postMessage({ t: "off", id: strVoice[s], mute: true });
  const id = voiceSeq++;
  strVoice[s] = id;
  bass.port.postMessage({ t: "on", id, f, h, vel, style });
  growlHit(mtof(midi), vel, style);
  cowbellHit(vel);
  if (midiOut) midiOut.send([0x90, midi & 127, Math.max(1, Math.round(vel * 127))]);
  const t = ctx.currentTime;
  if (takeT0 != null) noteLog.push({ t: t - takeT0, d: 0.25, midi, vel, open: true });
  vib[s] = Math.max(vib[s] || 0, vel);
  art$hit();
  return { id, s, fret, style, midi, vel, t };
}

function noteOff(h, mute = false) {
  if (!h) return;
  if (!S.ring || mute) bass.port.postMessage({ t: "off", id: h.id, mute });
  if (strVoice[h.s] === h.id && !S.ring) strVoice[h.s] = 0;
  if (midiOut) midiOut.send([0x80, h.midi & 127, 0]);
  if (takeT0 != null) for (let i = noteLog.length - 1; i >= 0; i--) if (noteLog[i].open && noteLog[i].midi === h.midi) { noteLog[i].d = Math.max(0.05, ctx.currentTime - takeT0 - noteLog[i].t); noteLog[i].open = false; break; }
}

function bendTo(h, fret, glide) {
  if (!h || fret === h.fret) return;
  h.fret = fret;
  bass.port.postMessage({ t: "bend", id: h.id, f: mtof(tuning[h.s] + fret), glide });
  if (midiOut) midiOut.send([0x80, h.midi & 127, 0]);
  h.midi = tuning[h.s] + fret;
  if (midiOut) midiOut.send([0x90, h.midi & 127, Math.round(h.vel * 127)]);
}

function panic() {
  if (!ready) return;
  bass.port.postMessage({ t: "panic" });
  strVoice.length = 0;
  if (midiOut) midiOut.send([0xb0, 123, 0]);
}

/** The heron layer that rides on every note (pad 0, pitched to the note). */
function growlHit(f, vel, style) {
  const g = S.growl; if (g < 0.02 || !heronBufs[0]) return;
  const src = new AudioBufferSourceNode(ctx, { buffer: heronBufs[0], playbackRate: clamp(f / 140, 0.45, 2.2) * (0.97 + Math.random() * 0.06) });
  const env = new GainNode(ctx, { gain: 0 });
  const t = ctx.currentTime, dur = style === "slap" || style === "pop" ? 0.18 : style === "mute" ? 0.1 : 0.32;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(g * vel * 0.5, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(env).connect(nodes.heronBus);
  src.start(t); src.stop(t + dur + 0.05);
}

/** "More cowbell": a quiet 808 cowbell on every note, scaled by the knob. */
function cowbellHit(vel) {
  const g = S.cowbell; if (g < 0.02 || !heronBufs[5]) return;
  const src = new AudioBufferSourceNode(ctx, { buffer: heronBufs[5] });
  const gn = new GainNode(ctx, { gain: g * (0.4 + 0.6 * vel) * 0.8 });
  src.connect(gn).connect(nodes.heronBus); src.start();
}

function playPad(i) {
  if (!ready) return;
  const src = new AudioBufferSourceNode(ctx, { buffer: heronBufs[i], playbackRate: Math.pow(2, S.padPitch / 12) });
  src.connect(nodes.heronBus); src.start();
  art$hit(true);
  if (takeT0 != null) noteLog.push({ t: ctx.currentTime - takeT0, d: 0.3, midi: 36 + i, vel: 0.8, open: false });
}

// nearest string/fret for a MIDI note (lowest position wins)
function assign(m) {
  const lo = tuning[0], hiMax = tuning[tuning.length - 1] + 24;
  while (m < lo) m += 12;
  while (m > hiMax) m -= 12;
  let best = null;
  for (let s = 0; s < tuning.length; s++) {
    const fr = m - tuning[s];
    if (fr >= 0 && fr <= 24 && (best == null || fr < best.fret)) best = { s, fret: fr };
  }
  return best || { s: 0, fret: 0 };
}

// ------------------------------------------------------------------ fretboard

const fb = $("fretboard"), fbc = fb.getContext("2d");
const vib = [];             // per-string vibration amplitude (for drawing)
const touches = new Map();  // pointerId → { h, laneS }
const LANE = 46, PAD_X = 40, RIGHT = 10;
const R = 0.965;            // fret spacing shrink (real bass ~0.944; milder is friendlier for touch)
let fbW = 600, fbH = 240, dpr = 1;

const fretX = (n) => PAD_X + (fbW - PAD_X - RIGHT) * (1 - Math.pow(R, n)) / (1 - Math.pow(R, S.span));
function fretAtX(x) {
  if (x < PAD_X) return 0;
  for (let n = 1; n <= S.span; n++) if (x < fretX(n)) return n;
  return S.span;
}
const laneTop = (s) => 8 + (tuning.length - 1 - s) * LANE;   // lowest string at the bottom, like tab

function sizeBoard() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  fbW = fb.clientWidth;
  fbH = tuning.length * LANE + 26;
  fb.style.height = fbH + "px";
  fb.width = Math.round(fbW * dpr); fb.height = Math.round(fbH * dpr);
  fbc.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const inScale = (m) => { const sc = SCALES[S.scale]; return sc.iv ? sc.iv.includes(((m - S.root) % 12 + 12) % 12) : false; };

function drawBoard(now) {
  const c = fbc, W = fbW, H = fbH;
  c.clearRect(0, 0, W, H);
  const bodyTop = 6, bodyBot = 8 + tuning.length * LANE - 2;
  const grd = c.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, "#1a2029"); grd.addColorStop(1, "#10151b");
  c.fillStyle = grd; c.fillRect(PAD_X - 4, bodyTop, W - PAD_X - RIGHT + 4, bodyBot - bodyTop);
  // frets + inlays
  c.lineWidth = 1.5;
  for (let n = 0; n <= S.span; n++) {
    const x = fretX(n);
    c.strokeStyle = n === 0 ? "#cfe3f2" : "#3b4a58"; c.lineWidth = n === 0 ? 4 : 1.5;
    c.beginPath(); c.moveTo(x, bodyTop); c.lineTo(x, bodyBot); c.stroke();
  }
  c.fillStyle = "#2f4a63";
  for (const n of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) {
    if (n > S.span) continue;
    const x = (fretX(n - 1) + fretX(n)) / 2, y = (bodyTop + bodyBot) / 2;
    if (n === 12 || n === 24) { c.beginPath(); c.arc(x, y - 16, 3.5, 0, 7); c.arc(x, y + 16, 3.5, 0, 7); c.fill(); }
    else { c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); }
  }
  // harmonic diamonds
  if (S.art === "harm") {
    c.fillStyle = "#7fd6ff";
    for (const n of Object.keys(HARM)) {
      if (+n > S.span) continue;
      const x = fretX(+n);
      for (let s = 0; s < tuning.length; s++) {
        const y = laneTop(s) + LANE / 2;
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y); c.fill();
      }
    }
  }
  // scale dots + strings
  for (let s = 0; s < tuning.length; s++) {
    const y = laneTop(s) + LANE / 2;
    if (SCALES[S.scale].iv) {
      for (let n = 0; n <= S.span; n++) {
        const m = tuning[s] + n;
        if (!inScale(m)) continue;
        const x = n === 0 ? PAD_X - 16 : (fretX(n - 1) + fretX(n)) / 2;
        c.fillStyle = ((m - S.root) % 12 + 12) % 12 === 0 ? "#ff8a3d" : "#4fb4ff";
        c.beginPath(); c.arc(x, y + 11, 3, 0, 7); c.fill();
      }
    }
    const v = vib[s] || 0, thick = 1.2 + (tuning.length - s) * 0.5;
    c.strokeStyle = v > 0.02 ? "#dff2ff" : "#9fb3c4"; c.lineWidth = thick;
    c.beginPath(); c.moveTo(PAD_X - 34, y);
    if (v > 0.02) {
      const amp = v * 5, ph = now / 22;
      for (let x = PAD_X - 34; x <= W - RIGHT; x += 6) c.lineTo(x, y + Math.sin(x / 26 + ph) * amp * Math.sin(Math.PI * (x - PAD_X) / (W - PAD_X)));
    }
    c.lineTo(W - RIGHT, y); c.stroke();
    vib[s] = v * 0.965;
    // string name
    c.fillStyle = "#6d8296"; c.font = "11px monospace"; c.textAlign = "left";
    c.fillText(noteName(tuning[s]).replace(/\d/, ""), 5, y + 4);
  }
  // fret numbers
  c.fillStyle = "#4b5f72"; c.font = "10px monospace"; c.textAlign = "center";
  for (const n of [1, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) if (n <= S.span) c.fillText(n, (fretX(n - 1) + fretX(n)) / 2, H - 5);
  // fingers
  c.fillStyle = "rgba(255,138,61,.85)";
  for (const t of touches.values()) {
    const x = t.h.fret === 0 ? PAD_X - 16 : (fretX(t.h.fret - 1) + fretX(t.h.fret)) / 2;
    c.beginPath(); c.arc(x, laneTop(t.h.s) + LANE / 2, 9, 0, 7); c.fill();
  }
}

function boardPos(e) {
  const r = fb.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
fb.addEventListener("pointerdown", (e) => {
  if (!ready) return;
  e.preventDefault();
  fb.setPointerCapture(e.pointerId);
  const { x, y } = boardPos(e);
  const s = tuning.length - 1 - clamp(Math.floor((y - 8) / LANE), 0, tuning.length - 1);
  const yy = clamp(((y - 8) % LANE) / LANE, 0, 1);
  let vel = S.vel * (0.78 + 0.4 * yy);
  if (e.pointerType === "pen" && e.pressure > 0) vel = clamp(0.2 + e.pressure, 0.2, 1);
  const h = noteOn(s, fretAtX(x), clamp(vel, 0.12, 1), S.art, yy);
  if (h) touches.set(e.pointerId, { h });
});
fb.addEventListener("pointermove", (e) => {
  const t = touches.get(e.pointerId); if (!t) return;
  const { x } = boardPos(e);
  const fret = t.h.style === "harm" ? t.h.fret : fretAtX(x);
  bendTo(t.h, fret, t.h.style === "tap" ? 0.008 : 0.045);
});
const release = (e) => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); noteOff(t.h);
};
fb.addEventListener("pointerup", release);
fb.addEventListener("pointercancel", release);
fb.addEventListener("contextmenu", (e) => e.preventDefault());

// computer keyboard: two rows of a typing piano, E1 upwards
const KEYROWS = ["zsxdcvgbhnjm,l.;/", "q2w3er5t6y7ui9o0p"];
const keyNote = (k) => {
  let i = KEYROWS[0].indexOf(k); if (i >= 0) return 28 + i + S.oct * 12;
  i = KEYROWS[1].indexOf(k); if (i >= 0) return 40 + i + S.oct * 12;
  return -1;
};
const heldKeys = new Map();
addEventListener("keydown", (e) => {
  if (!ready || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches("input,select,textarea")) return;
  if (e.key === "Escape") { panic(); return; }
  const m = keyNote(e.key.toLowerCase());
  if (m < 0 || heldKeys.has(e.key.toLowerCase())) return;
  e.preventDefault();
  const a = assign(m);
  const h = noteOn(a.s, a.fret, S.vel, S.art === "harm" ? "finger" : S.art, 0.75);
  if (h) heldKeys.set(e.key.toLowerCase(), h);
});
addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase(), h = heldKeys.get(k);
  if (h) { heldKeys.delete(k); noteOff(h); }
});
addEventListener("blur", () => { for (const h of heldKeys.values()) noteOff(h); heldKeys.clear(); });

// ------------------------------------------------------------------ ASCII heron flash + scope

const heronArt = $("heronArt");
let hitTimer = 0;
function art$hit(pad) {
  heronArt.classList.add("hit"); clearTimeout(hitTimer);
  hitTimer = setTimeout(() => heronArt.classList.remove("hit"), pad ? 260 : 90);
}
const scope = $("scope"), sc = scope.getContext("2d"), scopeBuf = new Float32Array(1024);
function drawScope() {
  const W = scope.width, H = scope.height;
  sc.clearRect(0, 0, W, H);
  sc.strokeStyle = "#4fb4ff"; sc.lineWidth = 1.5; sc.beginPath();
  if (ready) {
    nodes.an.getFloatTimeDomainData(scopeBuf);
    // lock to a rising zero-crossing so bass notes hold still
    let s0 = 0; for (let i = 1; i < 512; i++) if (scopeBuf[i - 1] < 0 && scopeBuf[i] >= 0) { s0 = i; break; }
    for (let i = 0; i < 512; i++) { const x = (i / 511) * W, y = H / 2 - scopeBuf[s0 + i] * H * 0.9; i ? sc.lineTo(x, y) : sc.moveTo(x, y); }
  } else { sc.moveTo(0, H / 2); sc.lineTo(W, H / 2); }
  sc.stroke();
}

// ------------------------------------------------------------------ metronome

const metro = { timer: null, next: 0, beat: 0, on: false, until: Infinity };
function click(t, accent) {
  const o = new OscillatorNode(ctx, { type: "square", frequency: accent ? 1500 : 1000 });
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
}
function metroStart(t0) {
  metroStop(); metro.on = true; metro.next = t0; metro.beat = 0; metro.until = Infinity;
  const tick = () => {
    if (metro.next >= metro.until) { metroStop(); return; }
    while (metro.next < ctx.currentTime + 0.12) {
      if (metro.next >= metro.until) break;
      click(metro.next, metro.beat % 4 === 0);
      metro.next += 60 / S.bpm; metro.beat++;
    }
  };
  metro.timer = setInterval(tick, 25); tick();
}
function metroStop() { clearInterval(metro.timer); metro.timer = null; metro.on = false; }

// ------------------------------------------------------------------ loop station

const loop = { layers: [], state: "empty", len: 0, start: 0, pending: null, sr: 48000 };

function loopPos() { return loop.len ? (((ctx.currentTime - loop.start) % loop.len) + loop.len) % loop.len : 0; }

function addLayer(data) {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
  const g = new GainNode(ctx, { gain: 1 });
  src.connect(g).connect(nodes.loopBus);
  src.start(ctx.currentTime, loopPos());
  loop.layers.push({ buf, src, g });
}

function onReady() {
  recBus.port.onmessage = (e) => {
    if (e.data.t !== "done") return;
    const d = e.data.data;
    if (loop.state === "recording") {
      loop.len = d.length / ctx.sampleRate; loop.start = e.data.start / ctx.sampleRate;
      loop.state = "playing"; addLayer(d);
    } else if (loop.state === "overdub") {
      loop.state = "playing"; addLayer(d);
    }
    loopUi();
  };
  recMaster.port.onmessage = (e) => {
    if (e.data.t !== "done") return;
    take.audio = e.data.data; take.rate = ctx.sampleRate; takeUi();
  };
}

function loopPress() {
  if (!ready) return;
  const sr = ctx.sampleRate;
  switch (loop.state) {
    case "empty": case "stopped": {
      if (loop.state === "stopped" && loop.layers.length) { loopPlay(); return; }
      const spb = 60 / S.bpm, bars = +S.bars;
      let t0 = ctx.currentTime + 0.06;
      if (S.countIn) {
        metroStart(t0); t0 += 4 * spb;
        if (!S.metro) metro.until = t0 + 0.001; // click for the count-in only
        loop.state = "countin"; loopUi();
        setTimeout(() => { if (loop.state === "countin") { loop.state = "recording"; loopUi(); } }, Math.max(0, (t0 - ctx.currentTime) * 1000));
      } else {
        if (S.metro && !metro.on) metroStart(t0);
        loop.state = "recording";
      }
      recBus.port.postMessage({ t: "start", startFrame: Math.round(t0 * sr), frames: bars ? Math.round(bars * 4 * spb * sr) : 0 });
      loop.free = !bars;
      loopUi(); return;
    }
    case "countin": recBus.port.postMessage({ t: "cancel" }); metroStop(); loop.state = "empty"; loopUi(); return;
    case "recording": if (loop.free) recBus.port.postMessage({ t: "stop" }); return;
    case "playing": {
      const t = ctx.currentTime;
      let nb = loop.start + Math.ceil((t - loop.start) / loop.len) * loop.len;
      if (nb - t < 0.04) nb += loop.len;
      recBus.port.postMessage({ t: "start", startFrame: Math.round(nb * sr), frames: loop.layers[0].buf.length });
      loop.state = "waitdub"; loopUi();
      setTimeout(() => { if (loop.state === "waitdub") { loop.state = "overdub"; loopUi(); } }, Math.max(0, (nb - t) * 1000));
      return;
    }
    case "waitdub": recBus.port.postMessage({ t: "cancel" }); loop.state = "playing"; loopUi(); return;
    case "overdub": recBus.port.postMessage({ t: "cancel" }); loop.state = "playing"; loopUi(); return;
  }
}
function loopPlay() {
  const layers = loop.layers; loop.layers = [];
  for (const l of layers) { l.src.disconnect(); addLayerFromBuf(l.buf); }
  loop.state = "playing"; loopUi();
}
function addLayerFromBuf(buf) {
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
  const g = new GainNode(ctx, { gain: 1 });
  src.connect(g).connect(nodes.loopBus); src.start(ctx.currentTime, loopPos());
  loop.layers.push({ buf, src, g });
}
function loopStop() {
  if (!ready) return;
  if (loop.state === "recording" || loop.state === "countin" || loop.state === "overdub" || loop.state === "waitdub") recBus.port.postMessage({ t: "cancel" });
  for (const l of loop.layers) { try { l.src.stop(); } catch (e) { /* */ } }
  metroStop();
  loop.state = loop.layers.length ? "stopped" : "empty"; loopUi();
}
function loopUndo() {
  const l = loop.layers.pop(); if (!l) return;
  l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.01); setTimeout(() => { try { l.src.stop(); } catch (e) { /* */ } }, 80);
  if (!loop.layers.length) { loop.state = "empty"; loop.len = 0; }
  loopUi();
}
function loopClear() {
  for (const l of loop.layers) { try { l.src.stop(); } catch (e) { /* */ } }
  loop.layers = []; loop.len = 0; loop.state = "empty";
  if (ready) recBus.port.postMessage({ t: "cancel" });
  loopUi();
}
function loopUi() {
  const b = $("loopBtn"), st = loop.state;
  const label = { empty: "● Loop", countin: "count-in… (tap to cancel)", recording: loop.free ? "■ stop & play" : "recording…", playing: "◉ overdub", waitdub: "overdub next bar… (cancel)", overdub: "overdubbing… (cancel)", stopped: "▶ play loop" }[st];
  b.textContent = label;
  b.className = "btn big rec" + (st === "recording" || st === "countin" ? " on" : st === "overdub" || st === "waitdub" ? " dub" : "");
  $("undoBtn").disabled = !loop.layers.length; $("clearBtn").disabled = !loop.layers.length;
  $("stopBtn").disabled = !loop.layers.length && st === "empty";
  $("exLoop").disabled = !loop.layers.length;
  $("loopInfo").textContent = loop.layers.length ? `${loop.layers.length} layer${loop.layers.length > 1 ? "s" : ""} · ${loop.len.toFixed(2)} s · ${(loop.len * S.bpm / 60 / 4).toFixed(2)} bars @ ${S.bpm} BPM` : "no loop yet";
}
function loopTick() {
  const bar = $("loopBar");
  if (ready && loop.len && (loop.state === "playing" || loop.state === "overdub" || loop.state === "waitdub")) bar.style.width = (loopPos() / loop.len * 100).toFixed(1) + "%";
  else if (loop.state !== "recording") bar.style.width = "0%";
}

// ------------------------------------------------------------------ take recorder + exports

const take = { on: false, audio: null, rate: 48000 };
function takeToggle() {
  if (!ready) return;
  if (!take.on) {
    take.on = true; take.audio = null; noteLog.length = 0; takeT0 = ctx.currentTime;
    recMaster.port.postMessage({ t: "start", startFrame: 0, frames: 0 });
  } else {
    take.on = false; recMaster.port.postMessage({ t: "stop" });
    for (const n of noteLog) n.open = false;
    takeT0 = null;
  }
  takeUi();
}
function takeUi() {
  const b = $("takeBtn");
  b.textContent = take.on ? "■ stop take" : "● Record take";
  b.classList.toggle("on", take.on);
  $("exTakeWav").disabled = !take.audio; $("exTakeMidi").disabled = !noteLog.length || take.on;
}
function status(msg) { $("status").textContent = msg; }

function exportLoop() {
  if (!loop.layers.length) return;
  const sr = ctx.sampleRate, n = loop.layers[0].buf.length, base = `blueheronbass-${stamp()}`;
  const files = [], stems = [], mix = new Float32Array(n);
  loop.layers.forEach((l, i) => {
    const d = l.buf.getChannelData(0), fn = `${String(i + 1).padStart(2, "0")}-layer.wav`;
    for (let k = 0; k < n; k++) mix[k] += d[k];
    files.push({ name: `${base}/${fn}`, data: encodeWav([d], sr) });
    stems.push({ name: `Layer ${i + 1}`, file: fn });
  });
  normalise([mix], -1);
  files.push({ name: `${base}/00-mix.wav`, data: encodeWav([mix], sr) });
  files.push({ name: `${base}/${base}.rpp`, data: encodeRpp(stems, n / sr, S.bpm) });
  files.push({ name: `${base}/info.txt`, data: `BlueHeronBass loop export\n\nTempo: ${S.bpm} BPM (4/4)\nLength: ${(n / sr).toFixed(4)} s\nSample rate: ${sr} Hz, 16-bit\nLayers: ${loop.layers.length}\n\nAll WAVs start at 0 and are the same length. Reaper: unzip, open the .rpp. Other DAWs: drag all WAVs to bar 1 and set the tempo above.\n\nMade with BlueHeronBass — Dre Darklabs\n` });
  download(makeZip(files), `${base}.zip`, "application/zip");
  status("Exported the loop as stems + mix + Reaper project.");
}
function exportTakeWav() {
  if (!take.audio) return;
  const ch = normalise([Float32Array.from(take.audio)], -1);
  download(encodeWav(ch, take.rate), `blueheronbass-take-${stamp()}.wav`, "audio/wav");
}
function exportTakeMidi() {
  if (!noteLog.length) return;
  download(encodeMidi(noteLog.map((n) => ({ t: n.t, d: n.d, midi: n.midi, vel: n.vel })), S.bpm), `blueheronbass-take-${stamp()}.mid`, "audio/midi");
}

// ------------------------------------------------------------------ MIDI

async function enableMidi() {
  if (!navigator.requestMIDIAccess) { status("This browser has no Web MIDI (Safari, Quest browser): the keyboard and touch still work."); return; }
  try {
    const acc = await navigator.requestMIDIAccess();
    const held = new Map();
    const bind = () => {
      for (const inp of acc.inputs.values()) inp.onmidimessage = (ev) => {
        const [st, a, b] = ev.data, cmd = st & 0xf0;
        if (cmd === 0x90 && b > 0) {
          const p = assign(a), h = noteOn(p.s, p.fret, clamp(b / 127, 0.1, 1), S.art === "harm" ? "finger" : S.art, 0.75);
          if (h) { const old = held.get(a); if (old) noteOff(old); held.set(a, h); }
        } else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) { const h = held.get(a); if (h) { held.delete(a); noteOff(h); } }
        else if (cmd === 0xb0 && a === 1) setKnob("growl", b / 127);
        else if (cmd === 0xb0 && a === 74) setKnob("env", b / 127);
        else if (cmd === 0xb0 && (a === 123 || a === 120)) panic();
      };
      const sel = $("midiOut"); sel.innerHTML = '<option value="">MIDI out: off</option>';
      for (const o of acc.outputs.values()) sel.insertAdjacentHTML("beforeend", `<option value="${o.id}">${o.name}</option>`);
      sel.onchange = () => { midiOut = sel.value ? acc.outputs.get(sel.value) : null; };
    };
    bind(); acc.onstatechange = bind;
    $("midiBtn").textContent = "MIDI on"; $("midiBtn").classList.add("on"); $("midiOut").hidden = false;
    status(`MIDI ready: ${acc.inputs.size} input${acc.inputs.size === 1 ? "" : "s"}, ${acc.outputs.size} output${acc.outputs.size === 1 ? "" : "s"}. Mod wheel (CC1) = heron growl, CC74 = envelope filter.`);
  } catch (e) { status("MIDI access was blocked."); }
}

// ------------------------------------------------------------------ pads + own sounds

function buildPads() {
  const host = $("pads");
  CALLS.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "pad"; b.textContent = c.name; b.dataset.i = i;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); playPad(i); });
    host.appendChild(b);
  });
  const sel = $("slotSel");
  CALLS.forEach((c, i) => sel.insertAdjacentHTML("beforeend", `<option value="${i}">${c.name}${i === 0 ? " (also excites the strings)" : ""}</option>`));
  $("slotFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f || !ready) return;
    try {
      const b = await ctx.decodeAudioData(await f.arrayBuffer()), i = +sel.value;
      heronBufs[i] = b; if (i === 0) sendHeron();
      status(`Loaded “${f.name}” into ${CALLS[i].name}${i === 0 ? ": strings and growl now use it." : "."}`);
    } catch (err) { status("Couldn't decode that file."); }
    e.target.value = "";
  });
}

// ------------------------------------------------------------------ wiring

function buildArts() {
  const host = $("arts");
  for (const a of ARTS) {
    const b = document.createElement("button");
    b.className = "art"; b.textContent = a.label; b.title = a.tip; b.setAttribute("role", "radio"); b.dataset.id = a.id;
    b.addEventListener("click", () => setArt(a.id));
    host.appendChild(b);
  }
}
function setArt(id) {
  S.art = id; save();
  for (const b of $("arts").children) { const on = b.dataset.id === id; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); }
  $("artTip").textContent = ARTS.find((a) => a.id === id).tip;
}
function setTuning(id) {
  S.tuning = id; tuning = TUNINGS[id].open; strVoice.length = 0; save(); sizeBoard();
}

function initUi() {
  buildArts(); buildKnobs(); buildPads();
  const pre = $("presetSel");
  pre.innerHTML = '<option value="">Sound…</option>' + Object.keys(PRESETS).map((k) => `<option>${k}</option>`).join("");
  pre.addEventListener("change", () => {
    const p = PRESETS[pre.value]; if (!p) return;
    for (const [k, v] of Object.entries(p)) { if (k === "art") setArt(v); else setKnob(k, v); }
    if (p.envq == null) setKnob("envq", 3.5);
  });
  const tsel = $("tuningSel");
  tsel.innerHTML = Object.entries(TUNINGS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  tsel.value = S.tuning; tsel.addEventListener("change", () => setTuning(tsel.value));
  const span = $("spanSel"); span.value = String(S.span);
  if (span.value !== String(S.span)) { S.span = 17; span.value = "17"; }
  span.addEventListener("change", () => { S.span = +span.value; save(); });
  const root = $("rootSel"); root.innerHTML = NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join(""); root.value = S.root;
  root.addEventListener("change", () => { S.root = +root.value; save(); });
  const scl = $("scaleSel"); scl.innerHTML = Object.entries(SCALES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join(""); scl.value = S.scale;
  scl.addEventListener("change", () => { S.scale = scl.value; save(); });

  const setOct = (d) => { S.oct = clamp(S.oct + d, -1, 2); $("octLabel").textContent = S.oct; save(); };
  $("octDown").onclick = () => setOct(-1); $("octUp").onclick = () => setOct(1); $("octLabel").textContent = S.oct;
  const ring = $("ringBtn");
  const showRing = () => { ring.classList.toggle("on", S.ring); ring.textContent = "Let ring: " + (S.ring ? "on" : "off"); };
  ring.onclick = () => { S.ring = !S.ring; save(); showRing(); };
  showRing();
  $("panicBtn").onclick = panic;

  // loop + groove
  $("bpm").value = S.bpm;
  $("bpm").addEventListener("change", () => { S.bpm = clamp(+$("bpm").value || 100, 40, 240); $("bpm").value = S.bpm; save(); try { localStorage.setItem("darklabs:bpm", S.bpm); } catch (e) { /* */ } loopUi(); });
  const mb = $("metroBtn"), showM = () => { mb.classList.toggle("on", S.metro); mb.textContent = "Click: " + (S.metro ? "on" : "off"); };
  mb.onclick = () => { S.metro = !S.metro; save(); showM(); if (ready) { S.metro ? metroStart(ctx.currentTime + 0.05) : metroStop(); } };
  showM();
  const ci = $("countBtn"), showC = () => { ci.classList.toggle("on", S.countIn); ci.textContent = "Count-in: " + (S.countIn ? "on" : "off"); };
  ci.onclick = () => { S.countIn = !S.countIn; save(); showC(); }; showC();
  $("barsSel").value = S.bars; $("barsSel").addEventListener("change", () => { S.bars = $("barsSel").value; save(); });
  $("loopBtn").onclick = loopPress; $("stopBtn").onclick = loopStop; $("undoBtn").onclick = loopUndo; $("clearBtn").onclick = loopClear;
  $("loopVol").value = S.loopVol; $("loopVol").addEventListener("input", () => { S.loopVol = +$("loopVol").value; if (ready) nodes.loopBus.gain.value = S.loopVol; save(); });
  $("padLvl").value = S.padLvl; $("padLvl").addEventListener("input", () => { S.padLvl = +$("padLvl").value; if (ready) nodes.heronBus.gain.value = S.padLvl; save(); });
  $("padPitch").value = S.padPitch; $("padPitch").addEventListener("input", () => { S.padPitch = +$("padPitch").value; $("padPitchV").textContent = (S.padPitch > 0 ? "+" : "") + S.padPitch + " st"; save(); });
  $("padPitchV").textContent = (S.padPitch > 0 ? "+" : "") + S.padPitch + " st";
  $("takeBtn").onclick = takeToggle; $("exLoop").onclick = exportLoop; $("exTakeWav").onclick = exportTakeWav; $("exTakeMidi").onclick = exportTakeMidi;
  $("midiBtn").onclick = enableMidi;
  setArt(S.art); loopUi(); takeUi();
  sizeBoard(); addEventListener("resize", sizeBoard);
  new ResizeObserver(sizeBoard).observe(fb);
}

function frame(now) {
  drawBoard(now); drawScope(); loopTick();
  requestAnimationFrame(frame);
}

initUi();
requestAnimationFrame(frame);

$("startBtn").addEventListener("click", async () => {
  const b = $("startBtn"); b.disabled = true; b.textContent = "tuning up…";
  try {
    await startAudio(); onReady();
    $("startScreen").hidden = true; $("panel").hidden = false;
    sizeBoard();
  } catch (e) {
    b.disabled = false; b.textContent = "try again";
    $("startErr").textContent = "Couldn't start audio: " + (e && e.message ? e.message : e) + " (needs https or localhost and a modern browser)";
  }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

window.__bhb = { get nodes() { return nodes; }, get ctx() { return ctx; }, loop, take, S }; // handy for console poking / tests

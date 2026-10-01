// The conductor: transport clock, the Bloom ensemble and the loop station.
//
// Timing is the "two clocks" pattern from CircuitStomp: a Web Worker ticks every
// 25 ms (so a backgrounded tab doesn't stall it) and each tick schedules whatever
// falls inside the next ~140 ms on the audio clock. Notes you play yourself never
// go through here: they are started at the audio clock immediately.
//
// BLOOM is the one big idea. At 0 you have a felt piano and a room. Turn it up and
// the instrument wakes layer by layer: a pad, a warm bass, a marimba ostinato,
// hand percussion, a voice, and finally a self-playing piano figure that mutates
// slowly the way a minimalist piece does. Each layer can also be pinned on or off.
//
// Loops are stored as note events, not audio: tiny, tempo-exact, and they export
// through the same offline render as everything else.

import {
  clamp, lerp, smooth, mulberry32, MODES, PROGRESSIONS, degreeNote, chordOn, voiceLead,
  euclid, modeStep, snapToMode, NOTE_NAMES,
} from "./theory.js";

export const LAYERS = [
  { id: "pad", name: "Pad", at: 0.1 },
  { id: "bass", name: "Bass", at: 0.28 },
  { id: "marimba", name: "Marimba", at: 0.42 },
  { id: "rhythm", name: "Hand", at: 0.55 },
  { id: "voice", name: "Voice", at: 0.66 },
  { id: "muse", name: "Muse", at: 0.82 },
];

const VOWEL_CYCLE = ["ah", "oh", "oo", "eh"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function makeTimer() {
  try {
    const src = "let id=null;onmessage=e=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),25)}";
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    return { start(fn) { w.onmessage = fn; w.postMessage("start"); }, stop() { w.postMessage("stop"); } };
  } catch (e) {
    let id = null;
    return { start(fn) { clearInterval(id); id = setInterval(fn, 25); }, stop() { clearInterval(id); } };
  }
}

export class Conductor {
  constructor(engine) {
    this.e = engine;
    this.bpm = 76; this.key = 0; this.mode = "major"; this.prog = "sunrise"; this.bloom = 0;
    this.pin = {};                       // layer id -> true/false to override the Bloom automation
    this.metro = false;
    this.running = false; this.step = 0; this.nextT = 0;
    this.rnd = mulberry32((Date.now() & 0xffff) + 11);
    this.cur = null; this.prevPad = null;
    this.museShape = [0, 2, 1, 2, 3, 2, 1, 2]; this.marPat = euclid(7, 16, 0); this.arpIdx = 0;
    this.listeners = {};
    this.timer = null;
    this.loop = { state: "idle", bars: 4, layers: [], stepSec: 0, len: 0, start: 0, recStart: 0, recEnd: 0, rec: [], open: new Map(), from: 0, odStart: 0, cursor: 0 };
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, d) { for (const f of this.listeners[ev] || []) { try { f(d); } catch (e) { console.error(e); } } }

  get ctx() { return this.e.ctx; }
  get stepSec() { return 60 / this.bpm / 4; }
  get barSec() { return this.stepSec * 16; }

  /** How awake a layer is, 0..1. */
  amt(id) {
    if (this.pin[id] === true) return 1;
    if (this.pin[id] === false) return 0;
    const L = LAYERS.find((l) => l.id === id);
    return smooth(L.at, L.at + 0.16, this.bloom);
  }

  // ───────────────────────────────────────────── transport

  need() { return this.bloom > 0.02 || Object.values(this.pin).some((v) => v === true) || this.loop.state !== "idle"; }

  refresh() {
    if (!this.e.ready) return;
    if (this.need() && !this.running) this.start();
    else if (!this.need() && this.running) this.stop();
  }

  start() {
    if (this.running || !this.e.ready) return;
    this.running = true; this.step = 0; this.cur = null;
    this.nextT = this.ctx.currentTime + 0.09;
    this.loop.cursor = this.nextT;
    if (!this.timer) this.timer = makeTimer();
    this.timer.start(() => this.tick());
    this.emit("transport", true);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) this.timer.stop();
    this.emit("transport", false);
  }

  tick() {
    if (!this.running) return;
    const ctx = this.ctx, now = ctx.currentTime, horizon = now + 0.14;
    this.loopState(now);
    while (this.nextT < horizon) {
      this.scheduleStep(this.step, this.nextT);
      this.step++; this.nextT += this.stepSec;
    }
    this.loopPlay(this.loop.cursor, horizon);       // events slightly in the past play at once rather than being dropped
    this.loop.cursor = horizon;
    if (!this.need()) this.stop();
  }

  nextBarTime(minAhead = 0) {
    const ss = this.stepSec;
    let k = Math.ceil(this.step / 16) * 16, t = this.nextT + (k - this.step) * ss;
    while (t < this.ctx.currentTime + minAhead) { k += 16; t += 16 * ss; }
    return t;
  }

  // ───────────────────────────────────────────── the ensemble

  humanise(t, ms = 7) { return t + (this.rnd() - 0.5) * (ms / 500); }

  note(inst, midi, vel, t, dur) {
    this.e.voices.playTimed(inst, midi, clamp(vel, 0.05, 1), t, dur);
    this.emit("note", { inst, midi, vel, t, gen: true });
  }

  newBar(bar, t) {
    const degs = PROGRESSIONS[this.prog].degrees;
    const deg = degs[bar % degs.length];
    const root = 60 + this.key;
    const tones = chordOn(root, this.mode, deg);                 // r 3 5 7 9, around C4
    const third = tones[1] - tones[0];
    let pad = [tones[1], tones[2], tones[3], tones[4]].map((n) => (n > 76 ? n - 12 : n));
    pad = voiceLead(this.prevPad, pad); this.prevPad = pad;
    pad = pad.map((n) => clamp(n, 55, 79));
    const bassRoot = degreeNote(36 + this.key, this.mode, deg);
    // two octaves of chord tones, a comfortable piano register; the marimba plays it an octave up
    const arp = [tones[0], tones[1], tones[2], tones[3], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[4] + 12];
    const roman = ROMAN[(deg - 1) % 7];
    this.cur = {
      bar, deg, tones, pad, bassRoot, arp, third,
      label: NOTE_NAMES[((tones[0] % 12) + 12) % 12] + (third === 3 ? "m" : ""),
      roman: third === 3 ? roman.toLowerCase() : roman,
      vowel: VOWEL_CYCLE[bar % VOWEL_CYCLE.length],
    };
    // minimalist evolution: the figures hold for a cycle, then change a little
    if (bar % degs.length === 0) {
      if (bar === 0 || this.rnd() < 0.5) {
        const k = [5, 7, 7, 9][Math.floor(this.rnd() * 4)];
        this.marPat = euclid(k, 16, Math.floor(this.rnd() * 4) * 2);
      }
    }
    if (this.rnd() < 0.4) {
      const i = Math.floor(this.rnd() * 8); this.museShape = this.museShape.slice();
      this.museShape[i] = clamp(this.museShape[i] + (this.rnd() < 0.5 ? -1 : 1), 0, 7);
    }
    this.bassVariant = bar % 4 === 3 ? 1 : 0;
    this.emit("bar", { ...this.cur, t });
  }

  scheduleStep(step, t) {
    const s = step % 16, bar = Math.floor(step / 16);
    if (s === 0) this.newBar(bar, t);
    const c = this.cur; if (!c) return;
    const V = this.e.voices, ss = this.stepSec, a = {};
    for (const l of LAYERS) a[l.id] = this.amt(l.id);
    const mn = (x) => (this.rnd() < x);

    // metronome: always during the count-in, otherwise only if switched on (never logged into a take)
    if (s % 4 === 0 && (this.metro || this.loop.state === "countin")) V.perc("tick", s === 0 ? 0.5 : 0.28, t, 0, true);

    // pad + voice: one chord per bar, overlapping so there's never a gap
    if (s === 0) {
      if (a.pad > 0.02) c.pad.forEach((n, i) => this.note("pad", n, 0.45 + 0.35 * a.pad, t + i * 0.012, this.barSec * 1.04));
      if (a.voice > 0.02) {
        this.e.g.setVowel(c.vowel, t, 2.2);
        [c.tones[0] + 12, c.tones[2] + 12, c.tones[1] + 24].forEach((n, i) => this.note("choir", n, 0.38 + 0.3 * a.voice, t + 0.05 + i * 0.03, this.barSec * 1.0));
      }
    }

    // bass: a long root, or a lilting tumbao every fourth bar
    if (a.bass > 0.02) {
      const r = c.bassRoot, fifth = r + 7;
      const hits = this.bassVariant ? [[0, 5, r], [6, 3, fifth], [10, 5, r + 12], [14, 2, fifth]] : [[0, 14, r], [10, 4, fifth > 47 ? fifth - 12 : fifth]];
      for (const [hs, len, n] of hits) if (hs === s) this.note("bass", n, 0.5 + 0.35 * a.bass, this.humanise(t, 5), len * ss);
    }

    // marimba: a Euclidean ostinato over the chord tones
    if (a.marimba > 0.02 && this.marPat[s]) {
      let n = c.arp[this.arpIdx++ % c.arp.length] + 12;
      while (n > 96) n -= 12;
      const acc = s % 4 === 0 ? 0.12 : 0;
      if (mn(0.55 + 0.45 * a.marimba)) this.note("marimba", n, 0.4 + acc + this.rnd() * 0.14, this.humanise(t, 9), 0.5);
    }

    // hand percussion, deliberately sparse
    if (a.rhythm > 0.02) {
      const g = a.rhythm;
      const shake = s % 2 === 0 ? 0.9 : 0.6;
      if (mn(shake * (0.4 + 0.6 * g))) V.perc("shaker", (s % 4 === 0 ? 0.34 : s % 2 === 0 ? 0.24 : 0.16) + this.rnd() * 0.08, this.humanise(t, 8), (s % 4 < 2 ? -0.25 : 0.25));
      if ([0, 3, 6, 10, 12].includes(s) && mn(0.5 * g)) V.perc("tick", 0.26 + this.rnd() * 0.1, this.humanise(t, 6), 0.35);
      if ([6, 14].includes(s) && mn(0.6 * g)) V.perc("drum", 0.34 + this.rnd() * 0.12, this.humanise(t, 6), -0.3);
    }

    // muse: a Glass-like piano arpeggio that slowly mutates
    if (a.muse > 0.02 && s % 2 === 0) {
      const pos = s / 2, idx = this.museShape[pos % 8];
      const n = c.arp[clamp(idx, 0, c.arp.length - 1)];
      const dens = lerp(0.55, 1, smooth(0.8, 1, this.bloom));
      if (pos % 4 === 0 || mn(dens)) this.note("piano", clamp(n, 48, 90), (pos % 4 === 0 ? 0.5 : 0.36) + this.rnd() * 0.12, this.humanise(t, 10), 0.6);
    }
  }

  // ───────────────────────────────────────────── loop station

  /** The one big button: record -> play -> overdub -> play ... */
  loopPress() {
    const L = this.loop;
    if (!this.e.ready) return;
    switch (L.state) {
      case "idle": {
        this.start();
        L.stepSec = this.stepSec; L.len = L.bars * 16 * L.stepSec;
        L.recStart = this.nextBarTime(2 * 60 / this.bpm);        // at least two beats of count-in
        L.recEnd = L.recStart + L.len;
        L.rec = []; L.open.clear(); L.layers = []; L.state = "countin";
        break;
      }
      case "countin": L.state = L.layers.length ? "playing" : "idle"; break;
      case "recording": L.state = L.layers.length ? "playing" : "idle"; L.open.clear(); break;
      case "playing": {
        const k = Math.max(1, Math.ceil((this.ctx.currentTime - L.start) / L.len));
        L.odStart = L.start + k * L.len; L.rec = []; L.open.clear(); L.state = "odwait";
        break;
      }
      case "odwait": L.state = "playing"; break;
      case "overdub": L.state = "playing"; L.open.clear(); break;
    }
    this.emit("loop", this.loopInfo());
    this.refresh();
  }

  loopSetBars(n) { if (this.loop.state === "idle") { this.loop.bars = n; this.emit("loop", this.loopInfo()); } }

  loopUndo() {
    const L = this.loop;
    L.layers.pop();
    if (!L.layers.length && L.state !== "countin" && L.state !== "recording") L.state = "idle";
    this.emit("loop", this.loopInfo()); this.refresh();
  }

  loopClear() {
    const L = this.loop; L.layers = []; L.rec = []; L.open.clear(); L.state = "idle";
    this.emit("loop", this.loopInfo()); this.refresh();
  }

  loopInfo() { const L = this.loop; return { state: L.state, bars: L.bars, layers: L.layers.length, lenSec: L.len }; }

  get recording() { const s = this.loop.state; return s === "recording" || s === "overdub"; }

  /** Advance the loop state machine against the audio clock. */
  loopState(now) {
    const L = this.loop;
    if (L.state === "countin" && now >= L.recStart - 0.005) { L.state = "recording"; this.emit("loop", this.loopInfo()); }
    else if (L.state === "recording" && now >= L.recEnd) {
      this.closeOpen(L.recEnd);
      L.layers.push({ events: L.rec, from: L.recEnd }); L.rec = [];
      L.start = L.recStart; L.state = "playing"; L.cursor = L.recEnd;
      this.emit("loop", this.loopInfo());
    } else if (L.state === "odwait" && now >= L.odStart - 0.005) { L.state = "overdub"; this.emit("loop", this.loopInfo()); }
    else if (L.state === "overdub" && now >= L.odStart + L.len) {
      this.closeOpen(L.odStart + L.len);
      L.layers.push({ events: L.rec, from: L.odStart + L.len }); L.rec = [];
      L.state = "playing"; this.emit("loop", this.loopInfo());
    }
  }

  windowStart() { const L = this.loop; return L.state === "recording" ? L.recStart : L.odStart; }

  closeOpen(tEnd) {
    for (const ev of this.loop.open.values()) ev.dur = Math.max(0.05, tEnd - ev.absT);
    this.loop.open.clear();
  }

  /** Called by the UI when you press a key while a loop is recording. */
  recordOn(id, inst, midi, vel, t) {
    if (!this.recording) return;
    const L = this.loop, w0 = this.windowStart();
    if (t < w0 || t >= w0 + L.len) return;
    const ev = { pos: (t - w0) / L.stepSec, inst, midi, vel, dur: null, absT: t };
    L.rec.push(ev); L.open.set(id, ev);
  }

  recordOff(id, t) {
    const L = this.loop, ev = L.open.get(id);
    if (!ev) return;
    ev.dur = Math.max(0.05, t - ev.absT); L.open.delete(id);
  }

  loopPlay(a, b) {
    const L = this.loop;
    if (!L.layers.length || !(L.len > 0)) return;
    for (const layer of L.layers) {
      for (const ev of layer.events) {
        const off = ev.pos * L.stepSec;
        let k = Math.ceil((a - L.start - off) / L.len);
        for (;; k++) {
          const T = L.start + k * L.len + off;
          if (T >= b) break;
          if (T < a || T < layer.from - 1e-6) continue;
          this.e.voices.playTimed(ev.inst, ev.midi, ev.vel, T, ev.dur ?? 0.5);
          this.emit("note", { inst: ev.inst, midi: ev.midi, vel: ev.vel, t: T, gen: true });
        }
      }
    }
  }
}

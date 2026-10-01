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
  euclid, modeStep, snapToMode, toChordTone, NOTE_NAMES,
} from "./theory.js";

// The order Bloom opens in: piano -> resonance -> companions -> marimba -> bass -> pad -> pulse -> voice -> muse.
// (Space, echo and air also swell continuously with Bloom: that is the spatial bloom.)
export const LAYERS = [
  { id: "resonance", name: "Resonance", at: 0.06 },
  { id: "companions", name: "Companions", at: 0.16 },
  { id: "marimba", name: "Marimba", at: 0.28 },
  { id: "bass", name: "Bass", at: 0.4 },
  { id: "pad", name: "Pad", at: 0.52 },
  { id: "rhythm", name: "Pulse", at: 0.64 },
  { id: "voice", name: "Voice", at: 0.76 },
  { id: "muse", name: "Muse", at: 0.88 },
];

const CELL_LENGTHS = [3, 3, 4, 5, 5, 4];                    // the figure breathes: an additive process, as in Glass
const VOICINGS = [[[1, 0], [2, 0], [3, 0], [4, 0]], [[2, 0], [4, 0], [1, 12], [3, 12]], [[4, 0], [2, 0], [3, 0], [0, 12]]];   // rich, open, sus2

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
    this.bpm = 72; this.key = 2; this.mode = "minor"; this.prog = "frahm"; this.bloom = 0;
    this.swing = 0.1; this.memory = []; this.cell = []; this.cellDirty = true; this.cellIdx = 0; this.museIdx = 0;
    this.chord = null; this.chordCount = 0; this.lastComp = 0; this.drones = [{ every: 37, at: 3, i: 0 }, { every: 53, at: 17, i: 1 }, { every: 71, at: 29, i: 2 }];
    this.pin = {};                       // layer id -> true/false to override the Bloom automation
    this.metro = false; this.quantize = true;
    this.running = false; this.step = 0; this.nextT = 0;
    this.rnd = mulberry32((Date.now() & 0xffff) + 11);
    this.cur = null; this.prevPad = null;
    this.marPat = euclid(7, 16, 0);
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

  /** Resonance and air follow Bloom; the sympathetic strings are tuned to the chord (or the key when stopped). */
  refreshFx() {
    if (!this.e.ready) return;
    this.e.setParam("symp", this.amt("resonance"));
    this.e.setParam("air", this.bloom);
    const c = this.chordNow();
    this.e.tuneResonance([c.tones[0], c.tones[2], c.tones[4]]);
  }

  refresh() {
    if (!this.e.ready) return;
    this.refreshFx();
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
    this.running = false; this.cur = null;
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

  /**
   * Live beat snap: if you are a hair EARLY for a 16th-note grid line (under ~45 ms), the note is
   * held back onto it. Anything later is left alone: delaying every hit to the next grid line would
   * add up to a whole step of latency, which no drummer could play with.
   */
  snapTime(t) {
    if (!this.running) return t;
    const ss = this.stepSec, k = Math.ceil((t - this.nextT) / ss), T = this.nextT + k * ss;
    return T - t <= Math.min(0.045, ss * 0.3) ? T : t;
  }

  /** The chord the ensemble is playing now, or the tonic chord of the progression when stopped. */
  chordNow() {
    if (this.cur) return this.cur;
    const deg = PROGRESSIONS[this.prog].degrees[0], root = 60 + this.key;
    const tones = chordOn(root, this.mode, deg);
    return { deg: parseInt(deg, 10), tones, arp: [tones[0], tones[1], tones[2], tones[3], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[4] + 12], third: tones[1] - tones[0] };
  }

  nextBarTime(minAhead = 0) {
    const ss = this.stepSec;
    let k = Math.ceil(this.step / 16) * 16, t = this.nextT + (k - this.step) * ss;
    while (t < this.ctx.currentTime + minAhead) { k += 16; t += 16 * ss; }
    return t;
  }

  // ───────────────────────────────────────────── the ensemble

  humanise(t, ms = 7) { return t + (this.rnd() - 0.5) * (ms / 500); }
  /** A little swing on the off-16ths: the lilt that makes a pulse feel played, not programmed. */
  swung(t, s) { return s % 2 === 1 ? t + this.swing * this.stepSec : t; }

  note(inst, midi, vel, t, dur) {
    this.e.voices.playTimed(inst, midi, clamp(vel, 0.05, 1), t, dur);
    this.emit("note", { inst, midi, vel, t, gen: true });
  }

  /** What you play is remembered: the marimba and the muse carry YOUR phrase on. */
  remember(m, t = this.ctx.currentTime) {
    const last = this.memory[this.memory.length - 1];
    if (last && last.m === m && t - last.t < 0.4) return;
    this.memory.push({ m, t }); if (this.memory.length > 8) this.memory.shift();
    this.cellDirty = true;
  }

  /**
   * The repeating figure (the Glass / Hania Rani cell). Built from the last notes you played, kept in
   * the mode; if you haven't played, from the chord. It breathes between 3 and 5 notes every two chords.
   */
  buildCell(c) {
    const root = 60 + this.key, now = this.ctx.currentTime;
    const seq = [];
    for (const x of this.memory) if (now - x.t < 40 && seq[seq.length - 1] !== x.m) seq.push(x.m);
    let base = seq.slice(-4).map((m) => snapToMode(m, root, this.mode));
    const fromYou = base.length >= 2;
    if (!fromYou) base = [c.tones[0], c.tones[2], c.tones[1] + 12];
    const len = CELL_LENGTHS[Math.floor(this.chordCount / 2) % CELL_LENGTHS.length];
    const cell = base.slice(0, len);
    while (cell.length < len) cell.push(modeStep(cell[cell.length - 1], cell.length % 2 ? 2 : -1, root, this.mode));
    // a whisper of change: now and then one note moves a scale step, so the loop never quite repeats
    if (!fromYou && this.rnd() < 0.35) { const i = Math.floor(this.rnd() * cell.length); cell[i] = modeStep(cell[i], this.rnd() < 0.5 ? -1 : 1, root, this.mode); }
    this.cell = cell; this.cellDirty = false;
  }

  /** Reflect a note you played (or looped) back in the key: an echo, a cushion, a shimmer. */
  companion(inst, m, vel, t) {
    const amt = this.amt("companions");
    if (amt < 0.05 || !this.e.ready || inst === "bass" || inst === "choir") return;
    if (t - this.lastComp < 0.18 || this.rnd() > 0.15 + 0.55 * amt) return;       // answers some of your notes, never a wall of echoes
    this.lastComp = t;
    const ss = this.stepSec, root = 60 + this.key, r = this.rnd();
    const fit = (n, lo, hi) => { while (n > hi) n -= 12; while (n < lo) n += 12; return n; };
    if (r < 0.42) this.note("marimba", fit(modeStep(m, 2, root, this.mode), 55, 86), vel * 0.52 * (0.6 + 0.4 * amt), t + 3 * ss, 0.5);       // a diatonic third up, a dotted-eighth later
    else if (r < 0.78) this.note("piano", fit(modeStep(m, -4, root, this.mode), 40, 84), vel * 0.4 * (0.6 + 0.4 * amt), t + 0.07, 1.4);      // a warm cushion: the fifth below, soft
    else this.note("marimba", fit(m + 12, 60, 90), vel * 0.3, t + 2 * ss, 0.4);                                                               // an octave shimmer
  }

  newBar(bar, t) {
    const P = PROGRESSIONS[this.prog], per = P.bars || 2, n = P.degrees.length;
    const idx = Math.floor(bar / per) % n, pos = bar % per, last = pos === per - 1;
    const root = 60 + this.key;
    const num = (i) => parseInt(P.degrees[i % n], 10);
    let newChord = false;
    if (pos === 0 || !this.chord) {
      newChord = true;
      const deg = num(idx), tones = chordOn(root, this.mode, P.degrees[idx]), third = tones[1] - tones[0];
      let pad = VOICINGS[idx % VOICINGS.length].map(([i, o]) => tones[i] + o).map((x) => { while (x > 76) x -= 12; return x; });
      pad = voiceLead(this.prevPad, pad).map((x) => clamp(x, 55, 79)); this.prevPad = pad;
      const roman = ROMAN[(deg - 1) % 7];
      this.chord = {
        deg, tones, third, pad, idx,
        bassRoot: degreeNote(36 + this.key, this.mode, deg),
        arp: [tones[0], tones[1], tones[2], tones[3], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[4] + 12],
        label: NOTE_NAMES[((tones[0] % 12) + 12) % 12] + (third === 3 ? "m" : ""),
        roman: third === 3 ? roman.toLowerCase() : roman,
        vowel: ["oo", "ah", "oh", "eh"][this.chordCount % 4],
      };
      this.chordCount++;
      if (this.chordCount % 4 === 2 && this.rnd() < 0.6) this.marPat = euclid([5, 7, 7, 9][Math.floor(this.rnd() * 4)], 16, Math.floor(this.rnd() * 4) * 2);
      this.e.tuneResonance([tones[0], tones[2], tones[4]]);
    }
    const nextIdx = last ? idx + 1 : idx, nd = num(nextIdx);
    this.cur = { ...this.chord, bar, pos, per, last, newChord, nextBassRoot: degreeNote(36 + this.key, this.mode, nd) };
    if (newChord || this.cellDirty) this.buildCell(this.cur);
    this.emit("bar", { ...this.cur, t });
  }

  scheduleStep(step, t) {
    const s = step % 16, bar = Math.floor(step / 16);
    if (s === 0) this.newBar(bar, t);
    if (s % 4 === 0) this.emit("beat", { beat: s / 4, t });
    const c = this.cur; if (!c) return;
    const V = this.e.voices, ss = this.stepSec, a = {};
    for (const l of LAYERS) a[l.id] = this.amt(l.id);
    const chance = (x) => this.rnd() < x;
    const T = (x = t) => this.swung(x, s);
    const fit = (n, lo, hi) => { while (n > hi) n -= 12; while (n < lo) n += 12; return n; };
    const barSec = this.barSec, chordSec = c.per * barSec;

    // metronome: always during the count-in, otherwise only if switched on (never logged into a take)
    if (s % 4 === 0 && (this.metro || this.loop.state === "countin")) V.perc("tick", s === 0 ? 0.5 : 0.28, t, 0, true);

    // pad: one open, ambiguous chord per harmonic change (rich, open, sus2 in turn), overlapping so there is never a gap
    if (s === 0 && c.newChord && a.pad > 0.02) c.pad.forEach((n, i) => this.note("pad", n, 0.4 + 0.3 * a.pad, t + i * 0.015, chordSec * 1.05));

    // Eno: three tape-loop drones of incommensurate length, each one soft pedal tone from the key, drifting in and out of phase
    if (a.pad > 0.3) for (const d of this.drones) if (step % d.every === d.at) {
      const root = 60 + this.key, tones = [root - 12, root - 12 + (this.mode === "major" || this.mode === "lydian" || this.mode === "mixolydian" ? 4 : 3), root];
      this.note("pad", tones[d.i % 3], 0.2 + 0.2 * a.pad, t, d.every * ss * 0.8);
    }

    // voice: not a pad of "ahh", a sigh: a short phrase from the figure, on every other chord, then silence
    if (s === 0 && c.pos === 0 && a.voice > 0.02 && this.chordCount % 2 === 1 && this.cell.length) {
      this.e.g.setVowel(c.vowel, t, 1.4);
      this.cell.slice(0, 3).forEach((n, i) => this.note("choir", fit(n + 12, 64, 84), 0.26 + 0.2 * a.voice, t + 0.05 + i * 60 / this.bpm, 1.5 * 60 / this.bpm));
    }

    // bass: a long soft root per chord; with the pulse awake a tumbao that ANTICIPATES the next chord on the "and of 4"
    if (a.bass > 0.02) {
      const r = c.bassRoot, fifth = r + 7 > 47 ? r - 5 : r + 7;
      if (a.rhythm < 0.4) { if (s === 0 && c.newChord) this.note("bass", r, 0.45 + 0.3 * a.bass, t, chordSec * 0.97); }
      else {
        const hits = [[0, c.newChord || c.pos > 0 ? 5 : 5, r], [6, 3, fifth], [10, 3, r]];
        if (c.last) hits.push([14, 2, c.nextBassRoot]);
        for (const [hs, len, n] of hits) if (hs === s) this.note("bass", n, 0.5 + 0.3 * a.bass, this.humanise(T(), 5), len * ss);
      }
    }

    // marimba: a Euclidean pulse carrying the cell: your phrase, circling at a length that never lines up with the bar
    if (a.marimba > 0.02 && this.marPat[s] && this.cell.length) {
      let n = fit(this.cell[this.cellIdx++ % this.cell.length] + 12, 64, 86);
      if (s % 4 === 0) n = fit(toChordTone(n, c.tones), 64, 86);
      if (chance(0.55 + 0.45 * a.marimba)) this.note("marimba", n, 0.3 + (s % 4 === 0 ? 0.1 : 0) + this.rnd() * 0.12, this.humanise(T(), 9), 0.5);
    }

    // pulse: a Latin lilt, barely there. Clave alternates 3-2 / 2-3; a cabasa on the 8ths; an occasional soft conga
    if (a.rhythm > 0.02) {
      const g = a.rhythm, clave = c.bar % 2 === 0 ? [0, 3, 6, 10, 12] : [2, 4, 8, 11, 14];
      const accent = s % 4 === 2 ? 0.34 : s % 4 === 0 ? 0.26 : 0.17;
      if (chance((s % 2 === 0 ? 0.85 : 0.5) * (0.4 + 0.6 * g))) V.perc("shaker", accent + this.rnd() * 0.07, this.humanise(T(), 8), s % 4 < 2 ? -0.3 : 0.3);
      if (clave.includes(s) && chance(0.45 * g)) V.perc("tick", 0.22 + this.rnd() * 0.1, this.humanise(T(), 6), 0.35);
      if ([6, 10, 14].includes(s) && chance(0.42 * g)) V.perc("drum", 0.28 + this.rnd() * 0.12, this.humanise(T(), 6), -0.3);
    }

    // muse: the piano answers with your own figure on straight eighths, which phases against the bar and the marimba
    if (a.muse > 0.02 && s % 2 === 0 && this.cell.length) {
      const dens = lerp(0.6, 1, smooth(0.88, 1, this.bloom));
      let n = this.cell[this.museIdx++ % this.cell.length];
      if (s % 8 === 0) n = toChordTone(n, c.tones);
      n = fit(n, 48, 79);
      if (s % 8 === 0 || chance(dens)) this.note("piano", n, (this.museIdx % this.cell.length === 1 ? 0.42 : 0.3) + this.rnd() * 0.1, this.humanise(t, 10), 0.7);
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
    let pos = (t - w0) / L.stepSec;
    if (this.quantize) pos = clamp(Math.round(pos), 0, L.bars * 16 - 1);      // loops are tightened to the 16th grid
    const ev = { pos, inst, midi, vel, dur: null, absT: t };
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
          if (ev.inst === "piano" || ev.inst === "marimba") this.companion(ev.inst, ev.midi, ev.vel, T);
        }
      }
    }
  }
}

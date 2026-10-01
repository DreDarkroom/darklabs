// The conductor: transport clock and THE ARC.
//
// Penrose is one long form that folds back on itself, like the staircase it is named for:
//
//   Intro    a felt piano alone, slow and close (Frahm)
//   Climb    a pad breathes in, a figure starts to circle, bass, hats, the filter opens
//   Build    a riser, a snare roll accelerating, the kick drops out ... and then
//   Peak     the drop: everything, wide open (Cooper)
//   Release  it all falls away to the piano ... and the key lifts a whole step, so the next loop
//            is the same music one step higher. Six laps and you are back where you began.
//
// One number runs it: ASCENT (0..1). In AUTO the arc moves it along; touch the slider and it
// holds wherever you put it. Layers wake as a function of ascent, so the slider is also a mixer.
//
// Timing is the "two clocks" pattern (CircuitStomp): a Web Worker ticks every 25 ms and each
// tick schedules what falls in the next ~140 ms on the audio clock. Notes you play yourself
// never go through here.

import { clamp, lerp, smooth, mulberry32, PROGRESSIONS, chordOn, degreeNote, voiceLead, snapToMode, toChordTone, NOTE_NAMES, mtof } from "./theory.js";

export const SECTIONS = ["Intro", "Climb", "Build", "Peak", "Release"];
export const ARC_BARS = { short: 48, medium: 72, long: 112 };
const INTRO = 8, BUILD = 8, PEAK = 8, REL = 8;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const VOICINGS = [[[1, 0], [2, 0], [3, 0], [4, 0]], [[2, 0], [4, 0], [1, 12], [3, 12]], [[4, 0], [2, 0], [3, 0], [0, 12]]];
const PIANO_CELL = [2, 4, 5, 4, 2, 6, 5, 4];          // a rocking figure around the chord (indices into the chord's arpeggio tones)
const ARP_CELL = [2, 4, 5, 4, 2, 6, 5];               // the same figure, one note short: it drifts against the bar forever

/** Ascent (0..1) and section index at a position (in bars) inside an arc of N bars. */
export function arcAt(pos, N) {
  const climbEnd = N - REL - PEAK - BUILD, buildEnd = climbEnd + BUILD, peakEnd = buildEnd + PEAK;
  if (pos < INTRO) return { a: lerp(0, 0.07, pos / INTRO), s: 0 };
  if (pos < climbEnd) return { a: lerp(0.07, 0.78, Math.pow((pos - INTRO) / (climbEnd - INTRO), 1.12)), s: 1 };
  if (pos < buildEnd) return { a: lerp(0.78, 0.97, Math.pow((pos - climbEnd) / BUILD, 1.3)), s: 2 };
  if (pos < peakEnd) return { a: 1, s: 3 };
  const t = (pos - peakEnd) / REL;
  return { a: lerp(0.34, 0, t * t * (3 - 2 * t)), s: 4 };
}

/** The arc position (bars) whose ascent best matches `a`, so AUTO can pick up from wherever you left the slider. */
export function barForAscent(a, N) {
  const climbEnd = N - REL - PEAK - BUILD;
  if (a < 0.07) return (a / 0.07) * INTRO;
  if (a <= 0.78) return INTRO + Math.pow((a - 0.07) / 0.71, 1 / 1.12) * (climbEnd - INTRO);
  if (a <= 0.97) return climbEnd + Math.pow((a - 0.78) / 0.19, 1 / 1.3) * BUILD;
  return climbEnd + BUILD;
}

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
    this.bpm = 104; this.key = 2; this.prog = "frahm"; this.arc = "medium"; this.lift = 0; this.autoLift = true;
    this.mode = "hold";               // "auto" = the arc drives ascent; "hold" = you do
    this.a = 0; this.sec = 0; this.arcBar = 0; this.offset = 0;
    this.running = false; this.step = 0; this.nextT = 0;
    this.rnd = mulberry32((Date.now() & 0xffff) + 5);
    this.chord = null; this.prevPad = null; this.chordCount = 0;
    this.memory = []; this.cellAbs = null; this.lastUser = -99;
    this.pi = 0; this.ai = 0; this.shepPhase = 0; this.lastCtl = 0; this.shepOn = false;
    this.listeners = {}; this.timer = null; this.metro = false;
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, d) { for (const f of this.listeners[ev] || []) { try { f(d); } catch (e) { console.error(e); } } }

  get ctx() { return this.e.ctx; }
  get N() { return ARC_BARS[this.arc]; }
  get stepSec() { return 60 / this.bpm / 4; }
  get barSec() { return this.stepSec * 16; }
  get pc() { return (this.key + this.lift) % 12; }
  get root() { const r = 60 + this.pc; return r > 68 ? r - 12 : r; }

  // ───────────────────────────────────────────── transport + mode

  start() {
    if (this.running || !this.e.ready) return;
    this.running = true; this.step = 0; this.chord = null;
    this.offset = 2 * Math.round(this.arcBar / 2);
    this.nextT = this.ctx.currentTime + 0.09;
    if (!this.timer) this.timer = makeTimer();
    this.timer.start(() => this.tick());
    this.emit("transport", true);
  }

  stop() {
    if (!this.running) return;
    this.running = false; this.chord = null;
    if (this.timer) this.timer.stop();
    this.e.setParam("shep", 0); this.shepOn = false;
    this.emit("transport", false);
  }

  /** The Climb button: run the arc from wherever the ascent is now; press again to pause it. */
  toggleAuto() {
    if (this.mode === "auto" && this.running) { this.mode = "hold"; this.stop(); this.emit("mode", this.mode); return; }
    this.mode = "auto";
    if (!this.running) this.arcBar = barForAscent(this.a, this.N) % this.N;
    this.start(); this.emit("mode", this.mode);
  }

  /** You grabbed the slider: hold it there. */
  setManual(a) {
    this.a = clamp(a, 0, 1);
    if (this.mode !== "hold") { this.mode = "hold"; this.emit("mode", this.mode); }
    if (this.a > 0.02 && !this.running) this.start();
    else if (this.a <= 0.02 && this.running) this.stop();
  }

  tick() {
    if (!this.running) return;
    const ctx = this.ctx, now = ctx.currentTime, horizon = now + 0.14;
    while (this.nextT < horizon) { this.scheduleStep(this.step, this.nextT); this.step++; this.nextT += this.stepSec; }
    if (now - this.lastCtl > 0.08) this.control(now, now - this.lastCtl);
  }

  /** Continuous things: the room opens with the climb, and the Shepard shimmer slides. */
  control(now, dt) {
    dt = Math.min(dt, 0.25); this.lastCtl = now;
    const a = this.a, g = this.e.g;
    g.applyAscent(a);
    const lvl = smooth(0.5, 0.95, a) * 0.09;
    if (lvl > 0.002 || this.shepOn) {
      const octPerSec = 1 / lerp(26, 8, a);
      this.shepPhase = (this.shepPhase + dt * octPerSec) % 1;
      g.shep.update(this.shepPhase, mtof(24 + this.pc), now);
      this.e.setParam("shep", lvl); this.shepOn = lvl > 0.002;
    }
  }

  // ───────────────────────────────────────────── harmony

  remember(m, t = this.ctx.currentTime) {
    const last = this.memory[this.memory.length - 1];
    if (last && last.m === m && t - last.t < 0.4) return;
    this.memory.push({ m, t }); if (this.memory.length > 8) this.memory.shift();
    this.lastUser = t; this.cellDirty = true;
  }

  userTouched(t = this.ctx.currentTime) { this.lastUser = t; }

  makeChord(idx) {
    const P = PROGRESSIONS[this.prog], n = P.degrees.length, root = this.root, i = idx % n;
    const deg = parseInt(P.degrees[i], 10), tones = chordOn(root, "minor", P.degrees[i]), third = tones[1] - tones[0];
    let arp = [tones[0], tones[1], tones[2], tones[3], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[4] + 12];
    if (Math.max(...arp) > 84) arp = arp.map((x) => x - 12);              // keep the figure out of the piercing top octave
    const roman = ROMAN[(deg - 1) % 7];
    return {
      idx: i, deg, tones, third, arp,
      bassRoot: degreeNote(36 + this.pc, "minor", deg),
      label: NOTE_NAMES[((tones[0] % 12) + 12) % 12] + (third === 3 ? "m" : ""),
      roman: third === 3 ? roman.toLowerCase() : roman,
    };
  }

  /** The chord to show (glowing keys, pads) whether or not the arc is running. */
  chordNow() { return this.chord || this.makeChord(0); }

  buildCell(c) {
    const now = this.ctx.currentTime, root = this.root, seq = [];
    for (const x of this.memory) if (now - x.t < 40 && seq[seq.length - 1] !== x.m) seq.push(x.m);
    const base = seq.slice(-5).map((m) => snapToMode(m, root, "minor"));
    this.cellAbs = base.length >= 2 ? base : null;
    this.cellDirty = false;
  }

  // ───────────────────────────────────────────── the ensemble

  note(inst, midi, vel, t, dur) {
    this.e.voices.playTimed(inst, midi, clamp(vel, 0.05, 1), t, dur);
    this.emit("note", { inst, midi, vel, t });
  }

  newBar(gbar, t) {
    const N = this.N, arcBar = gbar % N, per = 2;
    const P = PROGRESSIONS[this.prog], n = P.degrees.length;
    const idx = Math.floor(arcBar / per) % n, pos = arcBar % per;
    if (arcBar === 0 && gbar > 0 && this.autoLift) { this.lift = (this.lift + 2) % 12; this.emit("cycle", { lift: this.lift }); this.chord = null; }
    let newChord = false;
    if (pos === 0 || !this.chord) {
      newChord = true;
      const ch = this.makeChord(idx);
      let pad = VOICINGS[this.chordCount % VOICINGS.length].map(([i, o]) => ch.tones[i] + o).map((x) => { while (x > 76) x -= 12; return x; });
      pad = voiceLead(this.prevPad, pad).map((x) => clamp(x, 55, 79)); this.prevPad = pad;
      ch.pad = pad; this.chord = ch; this.chordCount++;
    }
    const next = this.makeChord(pos === per - 1 ? idx + 1 : idx);
    this.cur = { ...this.chord, bar: arcBar, pos, per, newChord, nextBassRoot: next.bassRoot };
    if (newChord || this.cellDirty) this.buildCell(this.cur);
    this.emit("bar", { ...this.cur, t, a: this.a, sec: this.sec });
  }

  scheduleStep(step, t) {
    const s = step % 16, gbar = Math.floor(step / 16) + this.offset, N = this.N, arcBar = gbar % N;
    const climbEnd = N - REL - PEAK - BUILD, buildEnd = climbEnd + BUILD, peakEnd = buildEnd + PEAK;
    const auto = this.mode === "auto";
    if (auto) {
      const r = arcAt(arcBar + s / 16, N);
      if (r.s !== this.sec) { this.sec = r.s; this.emit("section", { name: SECTIONS[r.s], s: r.s, t }); }
      this.a = r.a; this.arcBar = arcBar + s / 16;
    }
    if (s === 0) this.newBar(gbar, t);
    if (s % 4 === 0) this.emit("beat", { beat: s / 4, t });
    const c = this.cur; if (!c) return;
    const V = this.e.voices, ss = this.stepSec, a = this.a, chordSec = c.per * this.barSec;
    const A = {
      pad: smooth(0.08, 0.2, a), sub: smooth(0.14, 0.3, a), arp: smooth(0.26, 0.36, a), bass: smooth(0.4, 0.5, a),
      hat: smooth(0.48, 0.56, a), kick: smooth(0.5, 0.6, a), clap: smooth(0.68, 0.76, a),
    };

    // the arc's own events
    if (auto && s === 0) {
      if (arcBar === climbEnd) V.riser(t, BUILD * this.barSec);
      if (arcBar === buildEnd) { V.impact(t); this.emit("drop", { t }); }
    }
    const inRoll = auto && arcBar >= buildEnd - 2 && arcBar < buildEnd, lastBeforeDrop = auto && arcBar === buildEnd - 1;

    if (s % 4 === 0 && this.metro) V.drum("hat", s === 0 ? 0.6 : 0.3, t, 1.6);

    // pad + sub: a chord per two bars, breathing in
    if (s === 0 && c.pos === 0) {
      if (A.pad > 0.02) c.pad.forEach((n, i) => this.note("pad", n, 0.4 + 0.3 * A.pad, t + i * 0.015, chordSec * 1.05));
      if (A.sub > 0.02) this.note("bass", c.bassRoot, 0.4 + 0.25 * A.sub, t, chordSec * 0.98);
    }

    // piano: the Frahm figure. It thins to nothing while YOU are playing, and at the peak it holds chords instead
    const userActive = t - this.lastUser < 4;
    if (!userActive) {
      const div = a < 0.3 ? 4 : a < 0.62 ? 2 : 0;
      if (div && s % div === 0) {
        let n = this.cellAbs ? this.cellAbs[this.pi++ % this.cellAbs.length] : c.arp[PIANO_CELL[this.pi++ % PIANO_CELL.length]];
        if (this.cellAbs && s % 8 === 0) n = toChordTone(n, c.tones);
        while (n > 79) n -= 12;
        this.note("piano", n, (a < 0.3 ? 0.34 : 0.28) + this.rnd() * 0.1, t + (this.rnd() - 0.5) * 0.012, div * ss * 2.4);
      }
    }
    if (c.newChord && s === 0 && a < 0.4) this.note("piano", c.bassRoot + 12, 0.32, t, chordSec);        // a low, soft anchor under the figure
    if (a >= 0.62 && (s === 0 || s === 8) && !inRoll) c.pad.slice(0, 3).forEach((n, i) => this.note("piano", n, 0.38 + 0.1 * (s === 0), t + i * 0.01, 7 * ss));

    // arp: the same figure, one note short, on eighths then sixteenths, through a filter the climb opens
    if (A.arp > 0.02 && !lastBeforeDrop) {
      const div = a < 0.45 ? 2 : 1;
      if (s % div === 0) {
        V.fc = 280 * Math.pow(2, 5.3 * a);
        let n = this.cellAbs ? this.cellAbs[this.ai++ % this.cellAbs.length] + 12 : c.arp[ARP_CELL[this.ai++ % ARP_CELL.length]];
        if (this.cellAbs && s % 4 === 0) n = toChordTone(n, c.tones.map((x) => x + 12));
        while (n > 88) n -= 12;
        this.note("pluck", n, (0.3 + 0.3 * a + (s % 4 === 0 ? 0.1 : 0)) * (0.5 + 0.5 * A.arp), t, ss * div * 0.9);
      }
    }

    // bass pulse: offbeat eighths that anticipate the next chord
    if (A.bass > 0.02 && !inRoll) {
      if ([2, 6, 10, 14].includes(s)) this.note("bass", c.pos === c.per - 1 && s === 14 ? c.nextBassRoot : c.bassRoot, 0.5 + 0.2 * A.bass, t, ss * 1.7);
    }

    // drums: a heartbeat, then four on the floor; the kick ducks the pad, arp and fx
    if (A.kick > 0.02 && !inRoll && !lastBeforeDrop) {
      const hit = a >= 0.62 ? s % 4 === 0 : s === 0 || s === 8;
      if (hit) { V.drum("kick", 0.55 + 0.3 * A.kick, t); V.duck(t, 0.48 * A.kick, 0.22); }
    }
    if (A.hat > 0.02 && !lastBeforeDrop) {
      if (this.rnd() < 0.55 + 0.45 * A.hat) V.drum("hat", (s % 4 === 2 ? 0.34 : 0.17) + this.rnd() * 0.06, t, 1 + this.rnd() * 0.04, s % 2 ? 0.25 : -0.25);
      if (a > 0.68 && s % 4 === 2) V.drum("ohat", 0.28, t, 1, 0.1);
    }
    if (A.clap > 0.02 && !inRoll && (s === 4 || s === 12)) V.drum("clap", 0.45 * A.clap + 0.15, t);

    // the roll: eighths, then sixteenths, then thirty-seconds, pitching up
    if (inRoll) {
      const rel = arcBar - (buildEnd - 2), pos = (rel + s / 16) / 2;            // 0..1 through the roll
      const rate = 1 + 0.9 * pos, vel = 0.25 + 0.65 * pos;
      if (rel === 0 ? s % 2 === 0 : true) V.drum("clap", vel, t, rate);
      if (rel === 1 && s >= 8) V.drum("clap", vel * 0.85, t + ss / 2, rate * 1.05);
    }
  }
}

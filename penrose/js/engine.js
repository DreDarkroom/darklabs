// Penrose audio engine: sample bank, signal graph, voices. Native Web Audio nodes only
// (no AudioWorklet): nothing to fail to load, nothing allocating on the audio thread.
//
//   piano ─┐
//   pluck ─┤ (ducked by the kick)
//   pad ───┤ (ducked by the kick)         reverb (procedural IR) ┐
//   bass ──┼─► mix ─► tape ─► soft clip ─► glue ─► out           ├─ sends from every bus
//   drums ─┤                                  echo (ping-pong) ───┘
//   fx ────┘ (risers, impact, the Shepard-Risset shimmer; ducked)

import { bakePiano, bakeKick, bakeHat, bakeClap, bakeCrash, makeReverbIR, tapeCurve, softClipCurve, PIANO_RANGE } from "./dsp.js";
import { clamp, mtof, mulberry32, smooth } from "./theory.js";

// ───────────────────────────────────────────────────────── sample bank

export class SampleBank {
  constructor(ctx) { this.ctx = ctx; this.sr = ctx.sampleRate; this.bufs = new Map(); }

  slot(midi) {
    const m = clamp(Math.round(midi), PIANO_RANGE[0], PIANO_RANGE[1]);
    const base = clamp(Math.round(m / 3) * 3, PIANO_RANGE[0], PIANO_RANGE[1]);
    return { key: "p" + base, base, rate: Math.pow(2, (midi - base) / 12) };
  }

  _store(key, chans) {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, this.sr);
    chans.forEach((c, i) => b.copyToChannel(c, i));
    this.bufs.set(key, b);
    return b;
  }

  piano(midi) {
    const s = this.slot(midi);
    return { buf: this.bufs.get(s.key) || this._store(s.key, [bakePiano(s.base, this.sr)]), rate: s.rate };
  }

  drum(kind) {
    const k = "d" + kind;
    if (this.bufs.has(k)) return this.bufs.get(k);
    const d = kind === "kick" ? bakeKick(this.sr) : kind === "hat" ? bakeHat(false, this.sr) : kind === "ohat" ? bakeHat(true, this.sr)
      : kind === "clap" ? bakeClap(this.sr) : bakeCrash(this.sr);
    return this._store(k, [d]);
  }

  ir(seconds) { return this.bufs.get("ir" + seconds) || this._store("ir" + seconds, makeReverbIR(this.sr, seconds)); }

  noise() {
    if (this.bufs.has("noise")) return this.bufs.get("noise");
    const n = Math.floor(this.sr * 2), d = new Float32Array(n), r = mulberry32(31337);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return this._store("noise", [d]);
  }

  warmPiano(lo, hi) { for (let m = lo; m <= hi; m++) this.piano(m); }
}

// ───────────────────────────────────────────────────────── graph

const BUS_GAIN = { piano: 1.9, pluck: 0.55, pad: 0.42, bass: 0.7, drums: 1.1, fx: 0.8 };
const SENDS = { piano: [0.5, 0.18], pluck: [0.3, 0.4], pad: [0.5, 0.15], bass: [0.04, 0], drums: [0.2, 0.08], fx: [0.5, 0.2] };
const SHEP_N = 9;

export function buildGraph(ctx, o = {}) {
  const G = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const F = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
  const LFO = (f, depth, target) => { const osc = ctx.createOscillator(); osc.frequency.value = f; const d = G(depth); osc.connect(d); d.connect(target); osc.start(); return { osc, depth: d }; };
  const P = (pan) => { const p = ctx.createStereoPanner(); p.pan.value = pan; return p; };

  const g = { ctx };
  g.mix = G(1);
  g.buses = {}; for (const k of Object.keys(BUS_GAIN)) g.buses[k] = G(BUS_GAIN[k]);

  // sidechain "ducks": the kick pumps the pad, pluck and fx, the hallmark of an electronic build
  g.duck = { pad: G(1), pluck: G(1), fx: G(1) };
  for (const k of Object.keys(g.buses)) {
    if (g.duck[k]) { g.buses[k].connect(g.duck[k]); g.duck[k].connect(g.mix); } else g.buses[k].connect(g.mix);
  }

  // reverb
  g.revIn = G(o.space ?? 0.3);
  const revHp = F("highpass", 170, 0.6);
  g.conv = ctx.createConvolver(); g.conv.buffer = o.bank.ir(o.irSeconds || 2.6);
  g.revRet = G(0.9);
  g.revIn.connect(revHp); revHp.connect(g.conv); g.conv.connect(g.revRet); g.revRet.connect(g.mix);

  // ping-pong echo (dotted eighth)
  g.delIn = G(o.echo ?? 0.15);
  g.dL = ctx.createDelay(2); g.dR = ctx.createDelay(2);
  const lpL = F("lowpass", 2600, 0.5), lpR = F("lowpass", 2600, 0.5);
  g.echoFb = G(0.38); const fbR = G(0.38), delRet = G(0.7);
  g.delIn.connect(g.dL);
  g.dL.connect(lpL); lpL.connect(g.echoFb); g.echoFb.connect(g.dR);
  g.dR.connect(lpR); lpR.connect(fbR); fbR.connect(g.dL);
  const pL = P(-0.65), pR = P(0.65);
  g.dL.connect(pL); g.dR.connect(pR); pL.connect(delRet); pR.connect(delRet); delRet.connect(g.mix);
  const dToRev = G(0.25); delRet.connect(dToRev); dToRev.connect(g.revIn);
  g.setBpm = (bpm, t = ctx.currentTime) => {
    const d = clamp((60 / bpm) * 0.75, 0.12, 1.9);
    g.dL.delayTime.setTargetAtTime(d, t, 0.05); g.dR.delayTime.setTargetAtTime(d, t, 0.05);
  };
  g.setBpm(o.bpm || 104, 0);
  g.fbBoth = (v) => { g.echoFb.gain.setTargetAtTime(v, ctx.currentTime, 0.1); fbR.gain.setTargetAtTime(v, ctx.currentTime, 0.1); };

  for (const k of Object.keys(g.buses)) {
    const [r, d] = SENDS[k];
    if (r) { const s = G(r); g.buses[k].connect(s); s.connect(g.revIn); }
    if (d) { const s = G(d); g.buses[k].connect(s); s.connect(g.delIn); }
  }

  // tape: saturation + tone + a whisper of wow/flutter
  const shaper = ctx.createWaveShaper(); shaper.curve = tapeCurve(0.5);
  const tLo = F("lowshelf", 150, 0.7, 1.2), tHi = F("highshelf", 6200, 0.7, -3.2);
  g.flutter = ctx.createDelay(0.05); g.flutter.delayTime.value = 0.008;
  const tape = o.tape ?? 0.4;
  g.tapeDry = G(1 - tape * 0.6); g.tapeWet = G(tape); g.post = G(1);
  g.mix.connect(g.tapeDry); g.tapeDry.connect(g.post);
  g.mix.connect(shaper); shaper.connect(tLo); tLo.connect(tHi); tHi.connect(g.flutter); g.flutter.connect(g.tapeWet); g.tapeWet.connect(g.post);
  g.wow = LFO(0.5, 0.0003 * tape, g.flutter.delayTime);
  g.flut = LFO(5.7, 0.00004 * tape, g.flutter.delayTime);

  // master
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve();
  g.glue = ctx.createDynamicsCompressor();
  g.glue.threshold.value = -9; g.glue.knee.value = 12; g.glue.ratio.value = 4; g.glue.attack.value = 0.006; g.glue.release.value = 0.2;
  g.master = G(0.85);
  g.post.connect(clip); clip.connect(g.glue); g.glue.connect(g.master); g.master.connect(ctx.destination);
  if (o.analyser) { g.an = ctx.createAnalyser(); g.an.fftSize = 512; g.master.connect(g.an); }

  // pad: a shared lowpass that opens with the climb, then a two-line chorus
  g.padIn = F("lowpass", 700, -3);
  const padDry = G(0.75), padCh = G(0.55);
  g.padIn.connect(padDry); padDry.connect(g.buses.pad);
  for (const [t0, rate, depth, pan] of [[0.014, 0.21, 0.0035, -0.7], [0.019, 0.29, 0.004, 0.7]]) {
    const d = ctx.createDelay(0.05); d.delayTime.value = t0; LFO(rate, depth, d.delayTime);
    g.padIn.connect(d); const p = P(pan); d.connect(p); p.connect(padCh);
  }
  padCh.connect(g.buses.pad);

  // the Shepard-Risset shimmer: octave-spaced sines under a fixed spectral window, sliding up forever.
  // Each sine fades out at the top just as a new one fades in at the bottom, so the rise never arrives.
  g.shep = { out: G(0), oscs: [], gains: [], phase: 0 };
  for (let k = 0; k < SHEP_N; k++) {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 55 * Math.pow(2, k);
    const gn = G(0); osc.connect(gn); gn.connect(g.shep.out); osc.start();
    g.shep.oscs.push(osc); g.shep.gains.push(gn);
  }
  g.shep.out.connect(g.buses.fx);
  g.shep.update = (phase, base, t = ctx.currentTime) => {
    for (let k = 0; k < SHEP_N; k++) {
      const x = (k + phase) / SHEP_N, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
      g.shep.oscs[k].frequency.setTargetAtTime(base * Math.pow(2, k + phase), t, 0.05);
      g.shep.gains[k].gain.setTargetAtTime(w * w, t, 0.05);
    }
  };

  // live controls
  const ST = (p, v, tc = 0.06) => p.setTargetAtTime(v, ctx.currentTime, tc);
  g.set = {
    space: (v) => ST(g.revIn.gain, v),
    echo: (v) => ST(g.delIn.gain, v),
    tape: (v) => { ST(g.tapeWet.gain, v); ST(g.tapeDry.gain, 1 - v * 0.6); ST(g.wow.depth.gain, 0.0003 * v); ST(g.flut.depth.gain, 0.00004 * v); },
    master: (v) => ST(g.master.gain, v),
    shep: (v) => ST(g.shep.out.gain, v, 0.4),
  };
  /** The climb opens the room: pad filter, echo feedback. (Space and echo level are set by the app.) */
  g.applyAscent = (a) => {
    ST(g.padIn.frequency, 420 * Math.pow(2, 4.4 * a), 0.4);
    g.fbBoth(0.36 + 0.2 * smooth(0.5, 1, a));
  };
  return g;
}

// ───────────────────────────────────────────────────────── voices

const CAPS = { piano: 22, pluck: 18, pad: 8, bass: 4 };
const REL = { piano: 0.16, pluck: 0.07, pad: 0.7, bass: 0.14 };

export class Voices {
  constructor(ctx, g, bank, opts = {}) {
    this.ctx = ctx; this.g = g; this.bank = bank;
    this.list = { piano: [], pluck: [], pad: [], bass: [] };
    this.tone = { felt: opts.felt ?? 1 };
    this.fc = 1400;                       // pluck filter target, set by the climb
    this.pedal = false;
    this.rnd = mulberry32(2025);
  }

  count() { let n = 0; for (const k in this.list) n += this.list[k].length; return n; }

  start(inst, midi, vel = 0.7, t = this.ctx.currentTime) {
    t = Math.max(t, this.ctx.currentTime - 0.001);
    vel = clamp(vel, 0.02, 1);
    const arr = this.list[inst];
    for (const o of arr) if (o.midi === midi && o.pending && !o.released) this._release(o, t);     // re-striking re-damps the string
    if (arr.length >= CAPS[inst]) this._steal(arr, t);
    const v = inst === "piano" ? this._piano(midi, vel, t) : inst === "pluck" ? this._pluck(midi, vel, t) : inst === "pad" ? this._pad(midi, vel, t) : this._bass(midi, vel, t);
    v.inst = inst; v.midi = midi; v.t0 = t; v.released = false; v.pending = false;
    arr.push(v);
    return v;
  }

  noteOff(v, t = this.ctx.currentTime) {
    if (!v || v.released) return;
    if (this.pedal && v.inst === "piano") {
      v.pending = true;
      const pend = this.list.piano.filter((o) => o.pending && !o.released);
      if (pend.length > 10) this._release(pend.sort((a, b) => a.t0 - b.t0)[0], t);
      return;
    }
    this._release(v, t);
  }

  setPedal(on, t = this.ctx.currentTime) { this.pedal = on; if (!on) this.liftPedal(t); }
  liftPedal(t = this.ctx.currentTime) { for (const v of this.list.piano) if (v.pending && !v.released) this._release(v, t); }

  playTimed(inst, midi, vel, t, dur) {
    const v = this.start(inst, midi, vel, t);
    this._release(v, t + Math.max(0.03, dur));
    return v;
  }

  panic() {
    const t = this.ctx.currentTime;
    for (const k in this.list) for (const v of this.list[k].slice()) { v.pending = false; v.released = true; v.kill(t); }
    this.pedal = false;
  }

  _release(v, t) { if (v.released) return; v.released = true; v.pending = false; v.release(Math.max(t, this.ctx.currentTime)); }
  _steal(arr, t) {
    let victim = null;
    for (const v of arr) if (v.released && (!victim || v.t0 < victim.t0)) victim = v;
    if (!victim) for (const v of arr) if (!victim || v.t0 < victim.t0) victim = v;
    if (victim) { victim.released = true; victim.kill(t); }
  }
  _finish(v, nodes) {
    const arr = this.list[v.inst], i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1);
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already */ } }
  }

  _piano(midi, vel, t) {
    const ctx = this.ctx, { buf, rate } = this.bank.piano(midi);
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate; src.detune.value = (this.rnd() - 0.5) * 7;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.35;
    lp.frequency.value = clamp((260 + 3900 * Math.pow(vel, 1.4)) * this.tone.felt * (1 + clamp((midi - 60) / 60, -0.4, 0.8)), 300, 18000);   // soft touch = muffled felt
    const gn = ctx.createGain(); gn.gain.value = 0.2 + 0.8 * Math.pow(vel, 1.3);
    const pn = ctx.createStereoPanner(); pn.pan.value = clamp((midi - 66) / 34, -1, 1) * 0.6;
    src.connect(lp); lp.connect(gn); gn.connect(pn); pn.connect(this.g.buses.piano);
    src.start(t);
    const tc = REL.piano, v = {
      release: (tt) => { gn.gain.cancelScheduledValues(tt); gn.gain.setTargetAtTime(0, tt, tc); try { src.stop(tt + tc * 6.5 + 0.05); } catch (e) { /* */ } },
      kill: (tt) => { gn.gain.cancelScheduledValues(tt); gn.gain.setTargetAtTime(0, tt, 0.012); try { src.stop(tt + 0.1); } catch (e) { /* */ } },
    };
    src.onended = () => this._finish(v, [src, lp, gn, pn]);
    return v;
  }

  _env(t, amp, atk) { const e = this.ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.setTargetAtTime(amp, t, atk); return e; }

  _ends(v, env, oscs, tc, extra = []) {
    v.release = (tt) => { env.gain.cancelScheduledValues(tt); env.gain.setTargetAtTime(0, tt, tc); for (const o of oscs) { try { o.stop(tt + tc * 6.5 + 0.05); } catch (e) { /* */ } } };
    v.kill = (tt) => { env.gain.cancelScheduledValues(tt); env.gain.setTargetAtTime(0, tt, 0.015); for (const o of oscs) { try { o.stop(tt + 0.12); } catch (e) { /* */ } } };
    oscs[0].onended = () => this._finish(v, [env, ...oscs, ...extra]);
  }

  /** The arpeggio voice: a detuned saw + square through a plucked filter. fc is how open the climb is. */
  _pluck(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = f * 1.0045;
    const m2 = ctx.createGain(); m2.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2.5;
    const fc = clamp(this.fc, 180, 11000);
    lp.frequency.setValueAtTime(Math.min(fc * 2.6, 15000), t); lp.frequency.exponentialRampToValueAtTime(fc, t + 0.16);
    const env = this._env(t, 0.1 + 0.16 * vel, 0.003);
    o1.connect(lp); o2.connect(m2); m2.connect(lp); lp.connect(env); env.connect(this.g.buses.pluck);
    o1.start(t); o2.start(t);
    this._ends(v, env, [o1, o2], REL.pluck, [m2, lp]);
    return v;
  }

  _pad(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 5 + this.rnd() * 5;
    const m2 = ctx.createGain(); m2.gain.value = 0.22;
    const env = this._env(t, 0.1 + 0.09 * vel, 0.4);
    o1.connect(env); o2.connect(m2); m2.connect(env); env.connect(this.g.padIn);
    o1.start(t); o2.start(t);
    this._ends(v, env, [o1, o2], REL.pad, [m2]);
    return v;
  }

  _bass(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f;
    const m2 = ctx.createGain(); m2.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300 + 500 * vel; lp.Q.value = -1;
    const env = this._env(t, 0.34 + 0.4 * vel, 0.01);
    o1.connect(lp); o2.connect(m2); m2.connect(lp); lp.connect(env); env.connect(this.g.buses.bass);
    o1.start(t); o2.start(t);
    this._ends(v, env, [o1, o2], REL.bass, [m2, lp]);
    return v;
  }

  // ───────────────────────────── one-shots, risers, ducking

  drum(kind, vel, t, rate = 1, pan = 0) {
    t = Math.max(t, this.ctx.currentTime - 0.001);
    const src = this.ctx.createBufferSource(); src.buffer = this.bank.drum(kind); src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = 0.2 + 0.8 * clamp(vel, 0, 1);
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g); g.connect(p); p.connect(this.g.buses.drums);
    src.start(t);
    src.onended = () => { try { p.disconnect(); } catch (e) { /* */ } };
  }

  /** Sidechain: dip the pad, pluck and fx under the kick, then let them swell back. */
  duck(t, depth = 0.5, rel = 0.24) {
    for (const k of ["pad", "pluck", "fx"]) {
      const p = this.g.duck[k].gain, tt = Math.max(t, this.ctx.currentTime);
      p.setValueAtTime(1 - depth, tt); p.linearRampToValueAtTime(1, tt + rel);
    }
  }

  /** Filtered noise that rises in pitch and level for `sec` seconds: the build. */
  riser(t, sec) {
    const ctx = this.ctx; t = Math.max(t, ctx.currentTime);
    const src = ctx.createBufferSource(); src.buffer = this.bank.noise(); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(9500, t + sec);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + sec * 0.96); g.gain.linearRampToValueAtTime(0, t + sec + 0.04);
    src.connect(bp); bp.connect(g); g.connect(this.g.buses.fx);
    src.start(t); src.stop(t + sec + 0.1);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* */ } };
  }

  /** The drop: a crash, a falling sub, and a ducked breath of silence either side. */
  impact(t) {
    const ctx = this.ctx; t = Math.max(t, ctx.currentTime);
    this.drum("crash", 0.9, t, 1, 0);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g); g.connect(this.g.buses.bass); o.start(t); o.stop(t + 1.6);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* */ } };
    this.duck(t, 0.7, 0.5);
  }
}

// ───────────────────────────────────────────────────────── live engine

export class Engine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.params = { space: 0.3, echo: 0.15, tape: 0.4, felt: 1, bpm: 104, master: 0.85 };
    this.listeners = {};
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, d) { for (const f of this.listeners[ev] || []) { try { f(d); } catch (e) { console.error(e); } } }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  async start() {
    if (this.ctx) { await this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio isn't available in this browser.");
    this.ctx = new AC({ latencyHint: "interactive" });
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* iOS silent-switch hint */ }
    await this.resume();
    this.bank = new SampleBank(this.ctx);
    const slow = (navigator.hardwareConcurrency || 4) <= 4;
    this.g = buildGraph(this.ctx, { ...this.params, bank: this.bank, analyser: true, irSeconds: slow ? 1.8 : 2.6 });
    this.voices = new Voices(this.ctx, this.g, this.bank, { felt: this.params.felt });
    this.g.set.master(this.params.master);
    this.bank.warmPiano(55, 74);
    for (const k of ["kick", "hat", "clap"]) this.bank.drum(k);
    this.ctx.onstatechange = () => this.emit("state", this.ctx.state);
    this.ready = true;
    this._warmRest();
    this.emit("ready");
  }

  async resume() { if (this.ctx && this.ctx.state !== "running") { try { await this.ctx.resume(); } catch (e) { /* needs a gesture */ } } }

  _warmRest() {
    const jobs = []; for (let m = 36; m <= 96; m += 3) jobs.push(m);
    const step = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) this.bank.piano(jobs.shift());
      if (jobs.length) setTimeout(step, 24); else { this.bank.drum("ohat"); this.bank.drum("crash"); }
    };
    setTimeout(step, 400);
  }

  setParam(name, v) {
    this.params[name] = v;
    if (!this.g) return;
    if (name === "felt") this.voices.tone.felt = v;
    else if (name === "bpm") this.g.setBpm(v);
    else if (this.g.set[name]) this.g.set[name](v);
  }

  level() {
    if (!this.g || !this.g.an) return 0;
    if (!this._buf) this._buf = new Float32Array(this.g.an.fftSize);
    this.g.an.getFloatTimeDomainData(this._buf);
    let e = 0; for (let i = 0; i < this._buf.length; i++) e += this._buf[i] * this._buf[i];
    const r = Math.sqrt(e / this._buf.length);
    return Number.isFinite(r) ? r : 0;
  }
}

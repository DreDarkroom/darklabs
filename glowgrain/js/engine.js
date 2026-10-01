// GlowGrain audio engine: sample bank, signal graph, voices.
//
// Everything is native Web Audio nodes. There is deliberately no AudioWorklet:
// nothing to fail to load on Safari or Quest, nothing allocating on the audio
// thread, and the very same graph + voice code renders offline for export.
//
//   piano ─┐
//   marimba┤
//   pad ───┼─► mix ─► tape (sat · tone · flutter) ─► soft clip ─► glue ─► out
//   choir ─┤     ▲
//   bass ──┤     └── reverb (procedural IR) · ping-pong echo, fed by per-bus sends
//   perc ──┘

import { bakePiano, bakeMarimba, bakePerc, makeReverbIR, tapeCurve, softClipCurve, VOWELS, PIANO_RANGE, MARIMBA_RANGE } from "./dsp.js";
import { clamp, mtof, mulberry32 } from "./theory.js";

// ───────────────────────────────────────────────────────── sample bank

/**
 * Baked audio lives in AudioBuffers only (no second Float32 copy). An AudioBuffer isn't
 * tied to a context, so the same buffers serve the live context and offline exports.
 * Buffers are made on first use: `warm()` fills the keyboard in the background.
 */
export class SampleBank {
  constructor(ctx) { this.ctx = ctx; this.sr = ctx.sampleRate; this.bufs = new Map(); }

  slot(inst, midi) {
    if (inst === "piano") {
      const m = clamp(Math.round(midi), PIANO_RANGE[0], PIANO_RANGE[1]);
      const base = clamp(Math.round(m / 3) * 3, PIANO_RANGE[0], PIANO_RANGE[1]);
      return { key: "p" + base, base, rate: Math.pow(2, (midi - base) / 12) };
    }
    const m = clamp(Math.round(midi), MARIMBA_RANGE[0], MARIMBA_RANGE[1]);
    const base = clamp(Math.round(m / 2) * 2, MARIMBA_RANGE[0], MARIMBA_RANGE[1]);
    return { key: "m" + base, base, rate: Math.pow(2, (midi - base) / 12) };
  }

  has(inst, midi) { return this.bufs.has(this.slot(inst, midi).key); }

  _store(key, chans) {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, this.sr);
    chans.forEach((c, i) => b.copyToChannel(c, i));
    this.bufs.set(key, b);
    return b;
  }

  _slot(inst, s) {
    return this.bufs.get(s.key) || this._store(s.key, [inst === "piano" ? bakePiano(s.base, this.sr) : bakeMarimba(s.base, this.sr)]);
  }

  // the first argument (a context) is accepted but unused, so call sites read the same live or offline
  buffer(_ctx, inst, midi) { const s = this.slot(inst, midi); return { buf: this._slot(inst, s), rate: s.rate }; }
  perc(_ctx, kind) { return this.bufs.get("x" + kind) || this._store("x" + kind, [bakePerc(kind, this.sr)]); }
  ir(_ctx, seconds) { return this.bufs.get("ir" + seconds) || this._store("ir" + seconds, makeReverbIR(this.sr, seconds)); }

  noise() {
    const hit = this.bufs.get("noise"); if (hit) return hit;
    const n = Math.floor(this.sr * 2), d = new Float32Array(n), r = mulberry32(31337);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return this._store("noise", [d]);
  }

  /** Bake the groups around a pitch range (sync); returns how many were made. */
  warm(inst, lo, hi) {
    let n = 0;
    for (let m = lo; m <= hi; m++) { const s = this.slot(inst, m); if (!this.bufs.has(s.key)) { this._slot(inst, s); n++; } }
    return n;
  }

  get bytes() { let b = 0; for (const x of this.bufs.values()) b += x.length * x.numberOfChannels * 4; return b; }
}

// ───────────────────────────────────────────────────────── graph

const SENDS = { piano: [0.5, 0.2], marimba: [0.5, 0.3], pad: [0.55, 0.16], choir: [0.7, 0.3], bass: [0.08, 0], perc: [0.35, 0.12] };
// Balanced by offline renders of one chord per instrument: the piano leads (peak ~0.5),
// marimba sits just behind it, pad / voice / bass lie underneath (peaks ~0.25-0.3).
const BUS_GAIN = { piano: 1.9, marimba: 2.0, pad: 0.45, choir: 0.5, bass: 0.5, perc: 1.6 };

export function buildGraph(ctx, o = {}) {
  const G = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const F = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
  const LFO = (type, f, depth, target) => { const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f; const d = G(depth); osc.connect(d); d.connect(target); osc.start(); return { osc, depth: d }; };
  const P = (v, pan) => { const p = ctx.createStereoPanner(); p.pan.value = pan; return p; };

  const g = { ctx, bank: o.bank };
  const space = o.space ?? 0.35, echo = o.echo ?? 0.2, tape = o.tape ?? 0.5;

  g.mix = G(1);
  g.buses = {};
  for (const k of Object.keys(BUS_GAIN)) g.buses[k] = G(BUS_GAIN[k]);

  // reverb
  g.revIn = G(space);
  const revHp = F("highpass", 170, 0.6);
  g.conv = ctx.createConvolver();
  g.conv.buffer = o.bank.ir(ctx, o.irSeconds || 2.8);
  g.revRet = G(0.9);
  g.revIn.connect(revHp); revHp.connect(g.conv); g.conv.connect(g.revRet); g.revRet.connect(g.mix);

  // ping-pong echo (dotted eighth), darkened in the loop
  g.delIn = G(echo);
  g.dL = ctx.createDelay(2); g.dR = ctx.createDelay(2);
  const lpL = F("lowpass", 2300, 0.5), lpR = F("lowpass", 2300, 0.5);
  const fbL = G(0.4), fbR = G(0.4), delRet = G(0.7);
  g.delIn.connect(g.dL);
  g.dL.connect(lpL); lpL.connect(fbL); fbL.connect(g.dR);
  g.dR.connect(lpR); lpR.connect(fbR); fbR.connect(g.dL);
  const pL = P(0, -0.65), pR = P(0, 0.65);
  g.dL.connect(pL); g.dR.connect(pR); pL.connect(delRet); pR.connect(delRet);
  delRet.connect(g.mix);
  const dToRev = G(0.25); delRet.connect(dToRev); dToRev.connect(g.revIn);
  g.setBpm = (bpm, t = ctx.currentTime) => {
    const d = clamp((60 / bpm) * 0.75, 0.12, 1.9);
    g.dL.delayTime.setTargetAtTime(d, t, 0.05); g.dR.delayTime.setTargetAtTime(d, t, 0.05);
  };
  g.setBpm(o.bpm || 76, 0);

  // sends
  for (const k of Object.keys(g.buses)) {
    const b = g.buses[k], [r, d] = SENDS[k];
    b.connect(g.mix);
    if (r) { const s = G(r); b.connect(s); s.connect(g.revIn); }
    if (d) { const s = G(d); b.connect(s); s.connect(g.delIn); }
  }

  // tape: saturation + tone + a whisper of wow/flutter, blended with the dry mix
  const shaper = ctx.createWaveShaper(); shaper.curve = tapeCurve(0.55);
  const tLo = F("lowshelf", 150, 0.7, 1.4), tHi = F("highshelf", 5200, 0.7, -4.5);
  g.flutter = ctx.createDelay(0.05); g.flutter.delayTime.value = 0.008;
  g.tapeDry = G(1 - tape * 0.6); g.tapeWet = G(tape);
  g.post = G(1);
  g.mix.connect(g.tapeDry); g.tapeDry.connect(g.post);
  g.mix.connect(shaper); shaper.connect(tLo); tLo.connect(tHi); tHi.connect(g.flutter); g.flutter.connect(g.tapeWet); g.tapeWet.connect(g.post);
  g.wow = LFO("sine", 0.55, 0.00032 * tape, g.flutter.delayTime);
  g.flut = LFO("sine", 5.9, 0.00004 * tape, g.flutter.delayTime);

  // master
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve();
  g.glue = ctx.createDynamicsCompressor();
  g.glue.threshold.value = -10; g.glue.knee.value = 12; g.glue.ratio.value = 4; g.glue.attack.value = 0.006; g.glue.release.value = 0.22;
  g.master = G(0.85);
  g.post.connect(clip); clip.connect(g.glue); g.glue.connect(g.master); g.master.connect(ctx.destination);
  if (o.analyser) { g.an = ctx.createAnalyser(); g.an.fftSize = 512; g.master.connect(g.an); }

  // pad: shared lowpass breathing slowly, then a two-line chorus for width
  g.padIn = F("lowpass", 1500, 0.55);
  LFO("sine", 0.06, 420, g.padIn.frequency);
  const padDry = G(0.75), padCh = G(0.55);
  g.padIn.connect(padDry); padDry.connect(g.buses.pad);
  for (const [t0, rate, depth, pan] of [[0.014, 0.21, 0.0035, -0.7], [0.019, 0.29, 0.004, 0.7]]) {
    const d = ctx.createDelay(0.05); d.delayTime.value = t0; LFO("sine", rate, depth, d.delayTime);
    g.padIn.connect(d); const p = P(0, pan); d.connect(p); p.connect(padCh);
  }
  padCh.connect(g.buses.pad);

  // choir: three parallel formant bands (shared by every voice = paraphonic), slow vibrato with drifting rate
  // Vibrato is one tiny modulated delay on the shared choir bus, not an audio-rate detune on every
  // oscillator (that made each voice recompute its pitch per sample and cost ~5x more CPU).
  g.choirIn = G(1);
  const vibDelay = ctx.createDelay(0.02); vibDelay.delayTime.value = 0.004;
  g.choirIn.connect(vibDelay);
  g.formants = [[7, 1.0], [9, 0.42], [11, 0.2]].map(([q, gain], i) => {
    const bp = F("bandpass", VOWELS.ah[i], q), out = G(gain * 4.2);
    vibDelay.connect(bp); bp.connect(out); out.connect(g.buses.choir);
    return bp;
  });
  g.vib = LFO("sine", 5.2, 0.0002, vibDelay.delayTime);          // ~±11 cents
  const drift = ctx.createOscillator(); drift.frequency.value = 0.31; const dg = G(0.7); drift.connect(dg); dg.connect(g.vib.osc.frequency); drift.start();
  g.setVowel = (name, t = ctx.currentTime, glide = 1.6) => {
    const v = VOWELS[name] || VOWELS.ah;
    g.formants.forEach((bp, i) => bp.frequency.setTargetAtTime(v[i], t, glide / 3));
  };

  // sympathetic resonance: three tuned feedback combs (root, fifth, ninth of the chord, folded below ~340 Hz)
  // fed by the piano and marimba, so the strings seem to sing back. The Web Audio cycle floor is one render
  // quantum (2.7 ms), hence the fold. Level is Bloom's first stage.
  const sympIn = F("highpass", 140, 0.6);
  g.sympLevel = G(o.symp ?? 0);
  const sympMidis = o.sympMidis || [50, 57, 64];
  g.combs = sympMidis.map(() => {
    // lowpass Q is in dB: -3 is flat (no resonant peak), so the loop gain is exactly the feedback < 1 and cannot run away
    const d = ctx.createDelay(0.05), lp = F("lowpass", 3000, -3), fb = G(0.965), out = G(0.17);
    sympIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out); out.connect(g.sympLevel);
    return d;
  });
  g.tuneSymp = (midis, t = ctx.currentTime) => midis.forEach((m, i) => {
    let f = mtof(m); while (f > 330) f /= 2;
    if (g.combs[i]) g.combs[i].delayTime.setTargetAtTime(1 / f, t, 0.08);
  });
  g.tuneSymp(sympMidis, 0);
  g.sympLevel.connect(g.mix);
  for (const [k, lvl] of [["piano", 0.5], ["marimba", 0.3]]) { const s = G(lvl); g.buses[k].connect(s); s.connect(sympIn); }

  // air: a bed of very quiet band-limited hiss (tape and room), a little more of it as the instrument blooms
  const airSrc = ctx.createBufferSource(); airSrc.buffer = o.bank.noise(); airSrc.loop = true;
  const airHp = F("highpass", 2600, 0.5), airLp = F("lowpass", 9000, 0.5);
  g.air = G(0.0008 + 0.0035 * (o.air ?? 0));
  airSrc.connect(airHp); airHp.connect(airLp); airLp.connect(g.air); g.air.connect(g.post); airSrc.start();

  // live controls
  const ST = (p, v, tc = 0.06) => p.setTargetAtTime(v, ctx.currentTime, tc);
  g.set = {
    space: (v) => ST(g.revIn.gain, v),
    echo: (v) => ST(g.delIn.gain, v),
    tape: (v) => { ST(g.tapeWet.gain, v); ST(g.tapeDry.gain, 1 - v * 0.6); ST(g.wow.depth.gain, 0.00032 * v); ST(g.flut.depth.gain, 0.00004 * v); },
    master: (v) => ST(g.master.gain, v),
    symp: (v) => ST(g.sympLevel.gain, v * 0.9, 0.4),
    air: (v) => ST(g.air.gain, 0.0008 + 0.0035 * v, 0.5),
  };
  return g;
}

// ───────────────────────────────────────────────────────── voices

const CAPS = { piano: 22, marimba: 14, pad: 10, choir: 6, bass: 5 };
const REL = { piano: 0.16, marimba: 0.3, pad: 0.6, choir: 0.7, bass: 0.22 };

export class Voices {
  constructor(ctx, g, bank, opts = {}) {
    this.ctx = ctx; this.g = g; this.bank = bank;
    this.list = { piano: [], marimba: [], pad: [], choir: [], bass: [] };
    this.tone = { felt: opts.felt ?? 1 };
    this.pedal = false;
    this.log = null; this.logT0 = 0;
    this.rnd = mulberry32(2024);
  }

  count() { let n = 0; for (const k in this.list) n += this.list[k].length; return n; }

  /** Start a held note. Returns a voice; call voice.release(t) (or noteOff) to end it. */
  start(inst, midi, vel = 0.7, t = this.ctx.currentTime) {
    t = Math.max(t, this.ctx.currentTime - 0.001);
    vel = clamp(vel, 0.02, 1);
    const arr = this.list[inst];
    // striking a key again re-damps its own string: don't let identical pitches stack under the pedal
    for (const o of arr) if (o.midi === midi && o.pending && !o.released) this._release(o, t);
    if (arr.length >= CAPS[inst]) this._steal(arr, t);
    const v = inst === "piano" || inst === "marimba" ? this._sampled(inst, midi, vel, t)
      : inst === "pad" ? this._pad(midi, vel, t)
      : inst === "choir" ? this._choir(midi, vel, t)
      : this._bass(midi, vel, t);
    v.inst = inst; v.midi = midi; v.t0 = t; v.released = false; v.pending = false;
    arr.push(v);
    if (this.log) { v.entry = { t: t - this.logT0, inst, midi, vel, dur: null }; this.log.push(v.entry); }
    return v;
  }

  /** Release now (or at t), honouring the sustain pedal. */
  noteOff(v, t = this.ctx.currentTime) {
    if (!v || v.released) return;
    // the pedal lifts the dampers of piano and marimba only: pads, voices and bass must still end
    // when you let go, or drones stack up until the voice cap starts cutting notes
    if (this.pedal && (v.inst === "piano" || v.inst === "marimba")) {
      v.pending = true;
      const pend = this.list[v.inst].filter((o) => o.pending && !o.released);
      if (pend.length > 10) this._release(pend.sort((a, b) => a.t0 - b.t0)[0], t);   // never more than ~10 ringing
      return;
    }
    this._release(v, t);
  }

  setPedal(on, t = this.ctx.currentTime) {
    this.pedal = on;
    if (!on) this.liftPedal(t);
  }

  /** Dampers down for an instant: everything the pedal was holding stops ringing. */
  liftPedal(t = this.ctx.currentTime) {
    for (const k in this.list) for (const v of this.list[k]) if (v.pending && !v.released) this._release(v, t);
  }

  /** A note with a known length (generative layers, loop playback, export). Not affected by the pedal. */
  playTimed(inst, midi, vel, t, dur) {
    const v = this.start(inst, midi, vel, t);
    this._release(v, t + Math.max(0.03, dur));
    return v;
  }

  perc(kind, vel, t, pan = 0, nolog = false) {
    t = Math.max(t, this.ctx.currentTime - 0.001);
    const src = this.ctx.createBufferSource(); src.buffer = this.bank.perc(this.ctx, kind);
    src.playbackRate.value = 1 + (this.rnd() - 0.5) * 0.06;
    const g = this.ctx.createGain(); g.gain.value = 0.25 + 0.75 * clamp(vel, 0, 1);
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g); g.connect(p); p.connect(this.g.buses.perc);
    src.start(t);
    src.onended = () => { try { p.disconnect(); } catch (e) { /* gone */ } };
    if (this.log && !nolog) this.log.push({ t: t - this.logT0, inst: "perc", kind, vel, pan });
  }

  panic() {
    const t = this.ctx.currentTime;
    for (const k in this.list) for (const v of this.list[k].slice()) { v.pending = false; this._kill(v, t); }
    this.pedal = false;
  }

  _release(v, t) {
    if (v.released) return;
    v.released = true; v.pending = false;
    t = Math.max(t, this.ctx.currentTime);
    if (v.entry) v.entry.dur = Math.max(0.03, t - v.t0);
    v.release(t);
  }

  _kill(v, t) {
    if (v.entry && v.entry.dur == null) v.entry.dur = Math.max(0.03, t - v.t0);
    v.released = true;
    v.kill(t);
  }

  _steal(arr, t) {
    let victim = null;
    for (const v of arr) if (v.released && (!victim || v.t0 < victim.t0)) victim = v;
    if (!victim) for (const v of arr) if (!victim || v.t0 < victim.t0) victim = v;
    if (victim) this._kill(victim, t);
  }

  _finish(v, nodes) {
    const arr = this.list[v.inst], i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already */ } }
  }

  _sampled(inst, midi, vel, t) {
    const ctx = this.ctx, { buf, rate } = this.bank.buffer(ctx, inst, midi);
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    src.detune.value = (this.rnd() - 0.5) * 7;                     // organic: no two strikes are identically in tune
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.35;
    // velocity -> brightness: a soft touch is muffled felt (~1 kHz), a firm one opens up (~8 kHz)
    const base = inst === "piano" ? 260 + 3900 * Math.pow(vel, 1.4) : 700 + 4300 * Math.pow(vel, 1.2);   // soft mallet / soft felt
    lp.frequency.value = clamp(base * this.tone.felt * (1 + clamp((midi - 60) / 60, -0.4, 0.8)), 300, 18000);
    let amp = inst === "piano" ? 0.2 + 0.8 * Math.pow(vel, 1.3) : 0.3 + 0.7 * vel;
    if (inst === "marimba") amp *= 1 + clamp((midi - 72) / 24, 0, 1) * 0.9;     // the top bars are naturally quieter
    const gn = ctx.createGain(); gn.gain.value = amp;
    // the keyboard sweeps across the stereo field like a piano seen from the player's seat
    const pn = ctx.createStereoPanner(); pn.pan.value = clamp((midi - 66) / 34, -1, 1) * 0.72;
    src.connect(lp); lp.connect(gn); gn.connect(pn); pn.connect(this.g.buses[inst]);
    src.start(t);
    const tc = REL[inst];
    const v = {
      release: (tt) => { gn.gain.cancelScheduledValues(tt); gn.gain.setTargetAtTime(0, tt, tc); try { src.stop(tt + tc * 6.5 + 0.05); } catch (e) { /* */ } },
      kill: (tt) => { gn.gain.cancelScheduledValues(tt); gn.gain.setTargetAtTime(0, tt, 0.012); try { src.stop(tt + 0.1); } catch (e) { /* */ } },
    };
    src.onended = () => this._finish(v, [src, lp, gn, pn]);
    return v;
  }

  _env(t, amp, atk) {
    const e = this.ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.setTargetAtTime(amp, t, atk);
    return e;
  }

  _voiceEnds(v, env, oscs, tc, extra = []) {
    v.release = (tt) => { env.gain.cancelScheduledValues(tt); env.gain.setTargetAtTime(0, tt, tc); for (const o of oscs) { try { o.stop(tt + tc * 6.5 + 0.05); } catch (e) { /* */ } } };
    v.kill = (tt) => { env.gain.cancelScheduledValues(tt); env.gain.setTargetAtTime(0, tt, 0.015); for (const o of oscs) { try { o.stop(tt + 0.12); } catch (e) { /* */ } } };
    oscs[0].onended = () => this._finish(v, [env, ...oscs, ...extra]);
  }

  _pad(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 5 + this.rnd() * 5;
    const m2 = ctx.createGain(); m2.gain.value = 0.2;
    const env = this._env(t, 0.1 + 0.09 * vel, 0.34);
    o1.connect(env); o2.connect(m2); m2.connect(env); env.connect(this.g.padIn);
    o1.start(t); o2.start(t);
    this._voiceEnds(v, env, [o1, o2], REL.pad, [m2]);
    return v;
  }

  _bass(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f;
    const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = f / 2;
    const m2 = ctx.createGain(); m2.gain.value = 0.42; const m3 = ctx.createGain(); m3.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 280 + 520 * vel; lp.Q.value = 0.6;
    const env = this._env(t, 0.34 + 0.4 * vel, 0.012);
    o1.connect(lp); o2.connect(m2); m2.connect(lp); o3.connect(m3); m3.connect(lp); lp.connect(env); env.connect(this.g.buses.bass);
    o1.start(t); o2.start(t); o3.start(t);
    this._voiceEnds(v, env, [o1, o2, o3], REL.bass, [m2, m3, lp]);
    return v;
  }

  _choir(midi, vel, t) {
    const ctx = this.ctx, f = mtof(midi), v = {};
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = f; o1.detune.value = -5;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 6;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.Q.value = 0.4;
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const nz = ctx.createBufferSource(); nz.buffer = this.bank.noise(ctx); nz.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = "bandpass"; nbp.frequency.value = 1900; nbp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.06;
    nz.connect(nbp); nbp.connect(ng); ng.connect(lp);
    o1.connect(mix); o2.connect(mix); mix.connect(lp);
    const env = this._env(t, 0.1 + 0.08 * vel, 0.4);
    lp.connect(env); env.connect(this.g.choirIn);
    o1.start(t); o2.start(t); nz.start(t, this.rnd() * 1.5);
    this._voiceEnds(v, env, [o1, o2, nz], REL.choir, [lp, mix, nbp, ng]);
    return v;
  }
}

// ───────────────────────────────────────────────────────── live engine

export class Engine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.params = { space: 0.3, echo: 0.1, tape: 0.5, felt: 1, bpm: 72, master: 0.85, symp: 0, air: 0, sympMidis: [50, 57, 64] };
    this.takePeak = {};
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
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* iOS silent-switch hint, where supported */ }
    await this.resume();
    this.bank = new SampleBank(this.ctx);
    const slow = (navigator.hardwareConcurrency || 4) <= 4;
    this.g = buildGraph(this.ctx, { ...this.params, bank: this.bank, analyser: true, irSeconds: slow ? 1.8 : 2.6 });
    this.voices = new Voices(this.ctx, this.g, this.bank, { felt: this.params.felt });
    this.g.set.master(this.params.master);
    this.bank.warm("piano", 55, 74);       // the part of the keyboard you reach for first
    this.ctx.onstatechange = () => this.emit("state", this.ctx.state);
    this.ready = true;
    this._warmRest();
    this.emit("ready");
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== "running") { try { await this.ctx.resume(); } catch (e) { /* needs a gesture */ } }
  }

  /** Fill in the rest of the keyboard in small slices so playing never hitches. */
  _warmRest() {
    const jobs = [];
    for (let m = 36; m <= 96; m += 3) jobs.push(["piano", m]);
    for (let m = 48; m <= 84; m += 2) jobs.push(["marimba", m]);
    const step = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) { const [i, m] = jobs.shift(); this.bank.warm(i, m, m); }
      if (jobs.length) setTimeout(step, 24);
    };
    setTimeout(step, 400);
  }

  /** Retune the sympathetic strings to a chord (root, fifth, ninth as MIDI notes). */
  tuneResonance(midis) {
    this.params.sympMidis = midis;
    if (this.g) this.g.tuneSymp(midis);
  }

  setParam(name, v) {
    this.params[name] = v;
    if (this.voices && this.voices.log && typeof v === "number") this.takePeak[name] = Math.max(this.takePeak[name] ?? v, v);   // exports keep the fullest sound of the take
    if (!this.g) return;
    if (name === "felt") this.voices.tone.felt = v;
    else if (name === "bpm") this.g.setBpm(v);
    else if (this.g.set[name]) this.g.set[name](v);
  }

  /** Output level 0..1 for the visuals. */
  level() {
    if (!this.g || !this.g.an) return 0;
    if (!this._buf) this._buf = new Float32Array(this.g.an.fftSize);
    this.g.an.getFloatTimeDomainData(this._buf);
    let e = 0; for (let i = 0; i < this._buf.length; i++) e += this._buf[i] * this._buf[i];
    const r = Math.sqrt(e / this._buf.length);
    return Number.isFinite(r) ? r : 0;
  }

  startTake() { this.takePeak = { ...this.params }; this.voices.log = []; this.voices.logT0 = this.ctx.currentTime; this.takeStart = this.ctx.currentTime; }
  stopTake() { const l = this.voices.log; this.voices.log = null; this.takeLen = this.ctx.currentTime - this.takeStart; return l; }
  get taking() { return !!(this.voices && this.voices.log); }
}

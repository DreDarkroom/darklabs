// ChungusCello — the audio engine that every surface (keys, fingerboard, MIDI,
// voice, phrases, VR) plays through.
//
//  string worklet ─► body (convolved modes) ─┐
//  Chungus sampler ───────────────────────────┴► amp/drive ─► EQ ─► chorus ─► inst bus ─┬─► dry ───────────┐
//                                                                                        ├─► delay ─► verb ─┤
//                                                                                        └─► reverb ────────┴► perf bus ─► [looper tap]
//  looper playback ────────────────────────────────────────────────────────────────────────────────────────────► master ─► glue ─► limiter ─► out
//
// Notes are "handles": one thing the player is holding down (a key, a finger, a
// MIDI note, the VR bow). A handle can own several worklet voices — the double
// stop, the section players around you — and optionally a sampler voice.

import { clamp, mtof, ftom, doubleStopNotes, TUNINGS, setA4, mulberry32 } from "./theory.js";
import { makeBodyIR, makeReverbIR, driveCurve } from "./fx.js";

export const ARTICULATIONS = [
  { id: "arco", name: "Arco", key: "1", tip: "normal bowing — sustained while held" },
  { id: "spiccato", name: "Spiccato", key: "2", tip: "short bounced bow strokes" },
  { id: "pizz", name: "Pizz", key: "3", tip: "plucked with the finger" },
  { id: "tremolo", name: "Tremolo", key: "4", tip: "rapid back-and-forth bowing" },
  { id: "chug", name: "Chug", key: "5", tip: "hold a note: tempo-synced metal chugs through the amp" },
  { id: "harmonic", name: "Harmonics", key: "6", tip: "light-touch flageolet, an octave up" },
  { id: "legno", name: "Col legno", key: "7", tip: "struck with the wood of the bow" },
  { id: "ponti", name: "Ponticello", key: "8", tip: "bowed right by the bridge — glassy" },
  { id: "tasto", name: "Sul tasto", key: "9", tip: "bowed over the fingerboard — soft, flutey" },
];

// Chug rhythms on a 16-step bar. 2 = accent, 1 = hit, 0 = rest.
export const CHUG_PATTERNS = {
  straight: { name: "Straight 16ths", steps: "2111211121112111" },
  gallop: { name: "Gallop (x.xx)", steps: "2011201120112011" },
  reverse: { name: "Reverse gallop (xx.x)", steps: "2102210221022102" },
  eighths: { name: "Eighths", steps: "2010201020102010" },
  djent: { name: "Djent syncopation", steps: "2010012010201001" },
  breakdown: { name: "Breakdown", steps: "2000002000200000" },
};

export const DEFAULTS = {
  articulation: "arco",
  bowPos: 0.45, pressure: 0.5, dynamics: 0.65,
  vibDepth: 16, vibRate: 5.6, vibDelay: 0.28,
  bright: 0.5, attack: 1, release: 0.3,
  glide: 0.07, voiceMode: "poly", maxVoices: 16,
  section: 1, sectionSpread: 9,
  doubleStop: "off",
  transpose: 0, tuning: "standard", a4: 440,
  keyRoot: 0, scale: "chromatic",
  body: "concert", bodyMix: 0.85, symp: 0.3,
  source: "model", samplerMix: 0.7,
  drive: 0, driveTone: 0.5, chugPattern: "gallop",
  eqLow: 0, eqMid: 0, eqHigh: 0,
  chorus: 0,
  delayMix: 0, delayDiv: "3/16", delayFb: 0.35,
  reverbType: "hall", reverbMix: 0.22,
  volume: 0.8,
  bpm: 90, metronome: false, clickVol: 0.5,
  latencyMs: -1,           // -1 = auto
};

const CHUG_MIN_DRIVE = 0.55;

export class Engine {
  constructor() {
    this.s = { ...DEFAULTS };
    this.ctx = null;
    this.ready = false;
    this.handles = new Map();     // key → handle
    this.voiceToHandle = new Map();
    this.nextId = 1;
    this.listeners = {};
    this.levels = new Map();      // handle key → smoothed level
    this.monoStack = [];          // for mono legato
    this.rand = mulberry32(777);
    this.drone = null;
    this.transport = { t0: 0 };
    this.clickNext = 0;
    this.captures = new Map();
    this.sampler = null;          // set by app (sampler.js)
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const l = this.listeners[ev]; if (l) this.listeners[ev] = l.filter((f) => f !== fn); }
  emit(ev, data) { const l = this.listeners[ev]; if (l) for (const f of l) { try { f(data); } catch (e) { console.error(e); } } }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------------ boot

  async start() {
    if (this.ctx) { if (this.ctx.state !== "running") await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    const ctx = this.ctx;
    // iOS: a muted HTML audio element unlocks the "silent switch" playback path.
    try { if (ctx.state !== "running") await ctx.resume(); } catch (e) { /* ignore */ }

    this.worklet = false;
    if (ctx.audioWorklet) {
      try {
        await ctx.audioWorklet.addModule(new URL("./cello-worklet.js", import.meta.url));
        this.cello = new AudioWorkletNode(ctx, "chungus-cello", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        this.cello.port.onmessage = (e) => this.onWorkletMessage(e.data);
        this.worklet = true;
      } catch (e) {
        console.warn("AudioWorklet unavailable, using fallback voices", e);
      }
    }
    if (!this.worklet) this.cello = new FallbackStrings(ctx, (m) => this.onWorkletMessage(m));

    this.buildGraph();
    this.applyAll();
    this.transport.t0 = ctx.currentTime + 0.05;
    this.clickNext = 0;
    this.sched = setInterval(() => this.tick(), 25);
    this.ready = true;
    this.emit("ready");
  }

  buildGraph() {
    const ctx = this.ctx;
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };

    // strings → body
    this.bodyConv = ctx.createConvolver();
    this.bodyConv.normalize = false;
    this.bodyWet = G(); this.bodyDry = G();
    this.stringBus = G(0.55);
    this.cello.connect(this.bodyConv).connect(this.bodyWet).connect(this.stringBus);
    this.cello.connect(this.bodyDry).connect(this.stringBus);

    this.samplerBus = G(0.9);

    // amp / drive (a series amp: dry and driven paths crossfade)
    this.driveIn = G();
    this.driveDry = G(1);
    this.driveWet = G(0);
    this.driveOut = G();
    this.driveTight = F("highpass", 110, 0.7);
    this.drivePre = G(1);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "4x";
    this.cabThump = F("peaking", 110, 1.0, 5);
    this.cabMid = F("peaking", 750, 0.9, -4);
    this.cabLP = F("lowpass", 5200, 0.8);
    this.cabPost = G(0.35);
    this.stringBus.connect(this.driveIn);
    this.samplerBus.connect(this.driveIn);
    this.driveIn.connect(this.driveDry).connect(this.driveOut);
    this.driveIn.connect(this.driveTight).connect(this.drivePre).connect(this.shaper)
      .connect(this.cabThump).connect(this.cabMid).connect(this.cabLP).connect(this.cabPost).connect(this.driveWet).connect(this.driveOut);

    // EQ
    this.eqLow = F("lowshelf", 180, 0.7);
    this.eqMid = F("peaking", 900, 0.8);
    this.eqHigh = F("highshelf", 4000, 0.7);
    this.driveOut.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh);

    // chorus / ensemble widener
    this.instBus = G();
    this.chorusDry = G(1); this.chorusWet = G(0);
    this.eqHigh.connect(this.chorusDry).connect(this.instBus);
    const makeTap = (base, rate, pan) => {
      const d = ctx.createDelay(0.1); d.delayTime.value = base;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
      const depth = G(0.0025); lfo.connect(depth).connect(d.delayTime); lfo.start();
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : G();
      if (p.pan) p.pan.value = pan;
      this.eqHigh.connect(d).connect(p).connect(this.chorusWet);
    };
    makeTap(0.013, 0.41, -0.8); makeTap(0.019, 0.53, 0.8);
    this.chorusWet.connect(this.instBus);

    // sends
    this.perfBus = G();
    this.instBus.connect(this.perfBus);
    this.delaySend = G(0);
    this.delayL = ctx.createDelay(4); this.delayR = ctx.createDelay(4);
    this.delayFbL = G(0.35); this.delayFbR = G(0.35);
    this.delayTone = F("lowpass", 3800, 0.5);
    this.delayRet = G(0.8);
    const merger = ctx.createChannelMerger(2);
    this.instBus.connect(this.delaySend).connect(this.delayTone).connect(this.delayL);
    this.delayL.connect(this.delayFbL).connect(this.delayR);
    this.delayR.connect(this.delayFbR).connect(this.delayL);
    this.delayL.connect(merger, 0, 0); this.delayR.connect(merger, 0, 1);
    merger.connect(this.delayRet).connect(this.perfBus);

    this.reverb = ctx.createConvolver();
    this.reverbSend = G(0.22);
    this.reverbRet = G(1);
    this.instBus.connect(this.reverbSend).connect(this.reverb).connect(this.reverbRet).connect(this.perfBus);
    this.delayRet.connect(this.reverbSend);

    // master
    this.looperBus = G(1);
    this.master = G(1);
    this.perfBus.connect(this.master);
    this.looperBus.connect(this.master);
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -18; this.glue.knee.value = 12; this.glue.ratio.value = 2.5; this.glue.attack.value = 0.01; this.glue.release.value = 0.2;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.volume = G(0.8);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.glue).connect(this.limiter).connect(this.volume).connect(this.analyser).connect(ctx.destination);

    // metronome click goes straight out (never recorded)
    this.clickBus = G(0.5);
    this.clickBus.connect(ctx.destination);

    // capture taps
    this.silent = G(0); this.silent.connect(ctx.destination);
    if (this.worklet) {
      const mk = () => {
        const n = new AudioWorkletNode(ctx, "chungus-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit" });
        n.port.onmessage = (e) => this.onCaptured(e.data);
        n.connect(this.silent);
        return n;
      };
      this.perfTap = mk(); this.perfBus.connect(this.perfTap);
      this.masterTap = mk(); this.volume.connect(this.masterTap);
    }
  }

  // ------------------------------------------------------------------ settings

  set(name, value) {
    this.s[name] = value;
    if (this.ctx) this.apply(name);
    this.emit("setting", { name, value });
  }

  setMany(obj) { for (const k of Object.keys(obj)) if (k in DEFAULTS) this.s[k] = obj[k]; if (this.ctx) this.applyAll(); this.emit("settings", this.s); }

  applyAll() { for (const k of Object.keys(DEFAULTS)) this.apply(k); }

  apply(name) {
    const s = this.s, ctx = this.ctx, t = ctx.currentTime;
    const ramp = (param, v, tc = 0.02) => param.setTargetAtTime(v, t, tc);
    switch (name) {
      case "body": this.bodyConv.buffer = makeBodyIR(ctx, s.body); break;
      case "bodyMix": ramp(this.bodyWet.gain, s.bodyMix); ramp(this.bodyDry.gain, (1 - s.bodyMix) * 0.8); break;
      case "symp": this.post({ type: "global", values: { symp: s.symp } }); break;
      case "dynamics": if (!this.handBow) this.post({ type: "global", values: { expr: 0.3 + 1.0 * s.dynamics } }); break;
      case "maxVoices": this.post({ type: "global", values: { maxVoices: s.maxVoices } }); break;
      case "tuning": case "a4":
        setA4(s.a4);
        this.post({ type: "global", values: { sympFreqs: this.openStrings().map((m) => mtof(m)) } });
        if (this.drone) this.restartDrone();
        break;
      case "articulation": case "drive": case "driveTone": this.applyDrive(); break;
      case "eqLow": ramp(this.eqLow.gain, s.eqLow); break;
      case "eqMid": ramp(this.eqMid.gain, s.eqMid); break;
      case "eqHigh": ramp(this.eqHigh.gain, s.eqHigh); break;
      case "chorus": ramp(this.chorusWet.gain, s.chorus * 0.7); ramp(this.chorusDry.gain, 1 - s.chorus * 0.3); break;
      case "delayMix": ramp(this.delaySend.gain, s.delayMix * 0.8); break;
      case "delayFb": ramp(this.delayFbL.gain, s.delayFb); ramp(this.delayFbR.gain, s.delayFb); break;
      case "delayDiv": case "bpm": {
        const [a, b] = String(s.delayDiv).split("/").map(Number);
        const beats = (a / b) * 4;   // fraction of a whole note → beats
        const secs = clamp((60 / s.bpm) * beats, 0.02, 3.9);
        ramp(this.delayL.delayTime, secs, 0.05); ramp(this.delayR.delayTime, secs, 0.05);
        break;
      }
      case "reverbType": this.reverb.buffer = makeReverbIR(ctx, s.reverbType); break;
      case "reverbMix": ramp(this.reverbSend.gain, s.reverbMix * 0.9); break;
      case "volume": ramp(this.volume.gain, Math.pow(s.volume, 1.6)); break;
      case "clickVol": ramp(this.clickBus.gain, s.clickVol); break;
      case "bowPos":
        // live: every held bowed note follows the bow pad
        for (const h of this.handles.values()) if (h.bowed && !h.lockBow) this.updateVoices(h, { bowPos: this.bowPosFor(h.art) });
        break;
      case "pressure":
        for (const h of this.handles.values()) if (h.bowed) this.updateVoices(h, { pressure: this.pressureFor(h.art) });
        break;
      case "vibDepth":
        for (const h of this.handles.values()) this.updateVoices(h, { vibDepth: this.vibFor(h.art) });
        break;
    }
  }

  applyDrive() {
    const s = this.s, t = this.ctx.currentTime;
    const amt = s.articulation === "chug" ? Math.max(s.drive, CHUG_MIN_DRIVE) : s.drive;
    this.driveAmount = amt;
    const wet = clamp(amt * 5, 0, 1);
    this.driveWet.gain.setTargetAtTime(wet, t, 0.03);
    this.driveDry.gain.setTargetAtTime(1 - wet, t, 0.03);
    if (amt > 0.001) {
      this.shaper.curve = driveCurve(amt);
      this.drivePre.gain.setTargetAtTime(1 + amt * 3, t, 0.03);
      this.cabPost.gain.setTargetAtTime(0.5 - amt * 0.18, t, 0.03);
      this.cabLP.frequency.setTargetAtTime(2500 + s.driveTone * 5500, t, 0.03);
      this.driveTight.frequency.setTargetAtTime(60 + amt * 120, t, 0.03);
    }
  }

  openStrings() { return (TUNINGS[this.s.tuning] || TUNINGS.standard).strings.slice(); }

  post(m) { if (this.cello) this.cello.port.postMessage(m); }

  // ------------------------------------------------------------------ articulation → voice params

  bowPosFor(art) { return art === "ponti" ? 1 : art === "tasto" ? 0 : art === "chug" ? Math.max(0.6, this.s.bowPos) : art === "harmonic" ? 0.75 : this.s.bowPos; }
  pressureFor(art) {
    const p = this.s.pressure;
    return art === "spiccato" ? Math.min(1, p + 0.15) : art === "chug" ? Math.max(0.8, p) : art === "harmonic" ? 0.15 : art === "ponti" ? p * 0.6 : art === "tasto" ? p * 0.5 : p;
  }
  vibFor(art) { return art === "chug" || art === "spiccato" || art === "legno" ? 0 : art === "harmonic" ? this.s.vibDepth * 0.6 : this.s.vibDepth; }

  stepDur() { return 60 / this.s.bpm / 4; }

  voiceParams(art, vel) {
    const s = this.s;
    const p = {
      mode: "bow", vel, bowPos: this.bowPosFor(art), pressure: this.pressureFor(art), bright: s.bright,
      attack: 0.06 * s.attack * (1.2 - vel * 0.5), release: s.release,
      vibDepth: this.vibFor(art), vibRate: s.vibRate, vibDelay: s.vibDelay, rosin: 0.03, glide: s.glide,
    };
    switch (art) {
      case "spiccato": Object.assign(p, { attack: 0.005, hold: 0.06 + 0.05 * (1 - vel), release: 0.07 }); break;
      case "pizz": Object.assign(p, { mode: "pluck", t60: 0.9 + 1.4 * (1 - s.bright * 0.5), bright: s.bright * 0.8 + 0.1, release: Math.max(0.25, s.release * 3) }); break;
      case "tremolo": Object.assign(p, { trem: 9 + 5 * vel, attack: 0.02 }); break;
      case "chug": Object.assign(p, { attack: 0.003, hold: this.stepDur() * 0.72, release: 0.035, bright: Math.max(0.55, s.bright) }); break;
      case "harmonic": Object.assign(p, { bright: 0.25, attack: 0.09 * s.attack }); break;
      case "legno": Object.assign(p, { mode: "strike", t60: 0.5, bright: 0.9, release: 0.25 }); break;
      case "ponti": Object.assign(p, { bright: Math.min(1, s.bright + 0.25) }); break;
      case "tasto": Object.assign(p, { bright: s.bright * 0.5, attack: 0.1 * s.attack }); break;
    }
    return p;
  }

  // ------------------------------------------------------------------ notes

  /**
   * Start a note. key: unique id of whatever is holding it. midi may be
   * fractional. opts: {art, time, lockBow, noDouble, noSection, glide, source}
   */
  noteOn(key, midi, vel = 0.8, opts = {}) {
    if (!this.ready) return null;
    if (this.handles.has(key)) this.noteOff(key, { immediate: true });
    const art = opts.art || this.s.articulation;
    const time = opts.time != null ? opts.time : this.now;
    const m = midi + (opts.noTranspose ? 0 : this.s.transpose);
    const mono = this.s.voiceMode === "mono" && !opts.poly;

    // Mono legato: glide the sounding note instead of starting another.
    if (mono && (art === "arco" || art === "tremolo" || art === "ponti" || art === "tasto" || art === "harmonic")) {
      const cur = this.monoStack.length ? this.handles.get(this.monoStack[this.monoStack.length - 1]) : null;
      if (cur && !cur.released) {
        const h = { key, midi: m, vel, art, voices: cur.voices, samp: cur.samp, bowed: cur.bowed, alias: cur.key, time, lockBow: !!opts.lockBow };
        this.handles.set(key, h);
        this.monoStack.push(key);
        this.retune(h, m, this.s.glide);
        this.emit("noteon", { key, midi: m, vel, time, art, legato: true });
        return h;
      }
    } else if (mono) {
      for (const k of this.monoStack.slice()) this.noteOff(k, { immediate: true });
    }

    const h = { key, midi: m, vel, art, time, voices: [], samp: [], bowed: art !== "pizz" && art !== "legno", lockBow: !!opts.lockBow };
    const useModel = this.s.source !== "sampler" || !this.sampler || !this.sampler.hasSample();
    const useSampler = this.s.source !== "model" && this.sampler && this.sampler.hasSample();

    let notes = [art === "harmonic" ? m + 12 : m];
    if (!opts.noDouble) notes = notes.concat(doubleStopNotes(notes[0], this.s.doubleStop, this.s.keyRoot, this.s.scale));
    const n = opts.noSection ? 1 : clamp(this.s.section | 0, 1, 8);
    const base = this.voiceParams(art, vel);
    if (opts.params) Object.assign(base, opts.params);
    const secGain = 1 / Math.sqrt(n) / Math.sqrt(notes.length);

    notes.forEach((nm, ni) => {
      for (let i = 0; i < n; i++) {
        const detune = n === 1 ? 0 : this.s.sectionSpread * ((i / (n - 1)) * 2 - 1) * (0.6 + 0.4 * this.rand());
        const delay = i === 0 ? 0 : 0.004 + this.rand() * 0.022;
        const pan = n === 1 ? (ni ? 0.12 : -0.05) : ((i / (n - 1)) * 2 - 1) * 0.65;
        const off = nm - m + detune / 100;
        if (useModel) {
          const id = this.nextId++;
          const msg = Object.assign({}, base, { type: "noteOn", id, time: time + delay, freq: mtof(m + off), pan, gain: secGain * (this.s.source === "both" ? 1 - this.s.samplerMix * 0.5 : 1) });
          this.post(msg);
          h.voices.push({ id, off });
          this.voiceToHandle.set(id, key);
        }
        if (useSampler && i < 2) {
          const sv = this.sampler.play(m + off, vel, art, time + delay, { pan, gain: secGain * (this.s.source === "both" ? this.s.samplerMix : 1), hold: base.hold, release: base.release });
          if (sv) h.samp.push({ v: sv, off });
        }
      }
    });

    this.handles.set(key, h);
    if (mono) this.monoStack.push(key);
    if (art === "chug" && !opts.noRepeat) h.chugNext = this.nextGridStep(time + this.stepDur() * 0.5);
    this.emit("noteon", { key, midi: m, vel, time, art });
    return h;
  }

  noteOff(key, opts = {}) {
    const h = this.handles.get(key);
    if (!h) return;
    this.handles.delete(key);
    const time = opts.time != null ? opts.time : this.now;
    this.emit("noteoff", { key, midi: h.midi, time });

    if (h.alias || this.monoStack.includes(key)) {
      // mono legato bookkeeping
      const idx = this.monoStack.indexOf(key);
      const wasTop = idx === this.monoStack.length - 1;
      if (idx >= 0) this.monoStack.splice(idx, 1);
      const shared = h.voices;
      const stillUsed = [...this.handles.values()].some((o) => o.voices === shared);
      if (stillUsed && !opts.immediate) {
        if (wasTop) {
          const prev = this.handles.get(this.monoStack[this.monoStack.length - 1]);
          if (prev) this.retune(prev, prev.midi, this.s.glide);
        }
        return;
      }
    }
    this.releaseVoices(h, time, opts.immediate ? 0.03 : undefined);
  }

  releaseVoices(h, time, rel) {
    for (const v of h.voices) this.post({ type: "noteOff", id: v.id, time, release: rel });
    for (const sv of h.samp) sv.v.stop(time, rel);
    h.released = true;
  }

  /** Live per-note expression: {midi, pressure, bowPos, vel, bowSpeed, contact, glide} */
  noteUpdate(key, u) {
    const h = this.handles.get(key);
    if (!h) return;
    if (u.midi != null) { h.midi = u.midi + (u.noTranspose ? 0 : this.s.transpose); this.retune(h, h.midi, u.glide != null ? u.glide : 0.012); }
    const rest = {};
    for (const k of ["pressure", "bowPos", "beta", "vel", "bowSpeed", "contact", "vibDepth", "dir"]) if (u[k] != null) rest[k] = u[k];
    if (Object.keys(rest).length) this.updateVoices(h, rest);
    if (u.vel != null) for (const sv of h.samp) sv.v.setGain(u.vel);
  }

  retune(h, midi, glide) {
    const m0 = h.art === "harmonic" ? midi + 12 : midi;
    for (const v of h.voices) this.post({ type: "voice", id: v.id, freq: mtof(m0 + v.off), glide });
    for (const sv of h.samp) sv.v.setPitch(m0 + sv.off, glide);
  }

  updateVoices(h, u) { for (const v of h.voices) this.post(Object.assign({ type: "voice", id: v.id }, u)); }

  panic() {
    this.post({ type: "panic" });
    if (this.sampler) this.sampler.stopAll();
    this.handles.clear(); this.monoStack.length = 0; this.voiceToHandle.clear();
    this.drone = null;
    this.emit("panic");
  }

  heldKeys() { return [...this.handles.keys()]; }

  // ------------------------------------------------------------------ drone

  toggleDrone(midis) {
    if (this.drone) { this.stopDrone(); return false; }
    this.startDrone(midis);
    return true;
  }
  startDrone(midis) {
    this.stopDrone();
    this.droneMidis = midis;
    this.drone = midis.map((m, i) => {
      const id = this.nextId++;
      const p = this.voiceParams("arco", 0.45);
      this.post(Object.assign(p, { type: "noteOn", id, time: this.now, freq: mtof(m), vibDepth: 6, attack: 0.8, endless: true, pan: i ? 0.25 : -0.25, gain: 0.55, bowPos: 0.25, pressure: 0.35 }));
      return id;
    });
    this.emit("drone", true);
  }
  stopDrone() {
    if (!this.drone) return;
    for (const id of this.drone) this.post({ type: "noteOff", id, time: this.now, release: 1.2 });
    this.drone = null;
    this.emit("drone", false);
  }
  restartDrone() { if (this.droneMidis) this.startDrone(this.droneMidis); }

  // ------------------------------------------------------------------ transport, metronome, chug repeats

  beatDur() { return 60 / this.s.bpm; }
  barDur() { return this.beatDur() * 4; }
  /** Time of the next 16th-grid step at or after t. */
  nextGridStep(t) {
    const sd = this.stepDur();
    const k = Math.ceil((t - this.transport.t0) / sd - 1e-6);
    return this.transport.t0 + k * sd;
  }
  nextBar(t) {
    const bd = this.barDur();
    const k = Math.ceil((t - this.transport.t0) / bd - 1e-6);
    return this.transport.t0 + k * bd;
  }
  /** Re-anchor the grid so beat 1 lands at time t. */
  resetTransport(t) { this.transport.t0 = t; this.clickNext = 0; }

  setBpm(bpm, keepPhaseAt) {
    bpm = clamp(Math.round(bpm * 10) / 10, 30, 300);
    const now = keepPhaseAt != null ? keepPhaseAt : this.now;
    // keep the current beat position when tempo changes
    const beats = (now - this.transport.t0) / this.beatDur();
    this.s.bpm = bpm;
    this.transport.t0 = now - beats * this.beatDur();
    this.clickNext = 0;
    this.apply("bpm");
    this.emit("setting", { name: "bpm", value: bpm });
  }

  click(t, accent, vol = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = "square";
    o.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3 * vol, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = accent ? 2200 : 1500; f.Q.value = 3;
    o.connect(f).connect(g).connect(this.clickBus);
    o.start(t); o.stop(t + 0.06);
  }

  tick() {
    if (!this.ctx) return;
    const now = this.now, ahead = now + 0.12;
    // metronome / count-in clicks
    if (this.s.metronome || this.countInUntil > now) {
      const bd = this.beatDur();
      let k = Math.max(this.clickNext, Math.ceil((now - this.transport.t0) / bd - 1e-6));
      for (; this.transport.t0 + k * bd < ahead; k++) {
        const t = this.transport.t0 + k * bd;
        if (t >= now - 0.005) { this.click(t, ((k % 4) + 4) % 4 === 0); this.emit("beat", { t, beat: ((k % 4) + 4) % 4 }); }
      }
      this.clickNext = k;
    }
    // chug repeats for held chug notes
    const pat = (CHUG_PATTERNS[this.s.chugPattern] || CHUG_PATTERNS.gallop).steps;
    const sd = this.stepDur();
    for (const h of this.handles.values()) {
      if (h.art !== "chug" || h.alias || h.released || h.chugNext == null) continue;
      while (h.chugNext < ahead) {
        const t = h.chugNext;
        h.chugNext += sd;
        const step = ((Math.round((t - this.transport.t0) / sd) % 16) + 16) % 16;
        const lvl = +pat[step];
        if (!lvl) continue;
        this.chugHit(h, t, lvl === 2 ? h.vel : h.vel * 0.72);
      }
    }
    this.emit("tick", now);
  }

  chugHit(h, t, vel) {
    const base = this.voiceParams("chug", vel);
    const m0 = h.midi;
    const n = h.voices.length || 1;
    const offs = h.voices.length ? h.voices.map((v) => v.off) : h.samp.map((s) => s.off);
    const newVoices = [];
    for (const off of offs) {
      if (h.voices.length) {
        const id = this.nextId++;
        this.post(Object.assign({}, base, { type: "noteOn", id, time: t, freq: mtof(m0 + off), gain: 1 / Math.sqrt(n) }));
        this.voiceToHandle.set(id, h.key);
        newVoices.push({ id, off });
      }
    }
    if (this.sampler && h.samp.length) for (const s of h.samp) this.sampler.play(m0 + s.off, vel, "chug", t, { hold: base.hold, release: base.release, gain: 0.8 });
    if (newVoices.length) h.voices = newVoices;
    this.emit("chug", { t, key: h.key });
  }

  // ------------------------------------------------------------------ capture (looper + recorder)

  latency() {
    if (this.s.latencyMs >= 0) return this.s.latencyMs / 1000;
    const c = this.ctx;
    return (c.baseLatency || 0.01) + (c.outputLatency || 0.02);
  }

  /** Begin capturing a bus ("perf" = everything you play, "master" = final mix). */
  captureBegin(bus, start) {
    const node = bus === "master" ? this.masterTap : this.perfTap;
    if (!node) return null;
    const id = "c" + this.nextId++;
    node.port.postMessage({ cmd: "begin", id, start });
    let resolve; const p = new Promise((r) => (resolve = r));
    this.captures.set(id, { resolve, node });
    return { id, done: p };
  }
  captureEnd(cap, end) { if (cap) { const c = this.captures.get(cap.id); if (c) c.node.port.postMessage({ cmd: "end", id: cap.id, end }); } }
  captureCancel(cap) { if (cap) { const c = this.captures.get(cap.id); if (c) { c.node.port.postMessage({ cmd: "cancel", id: cap.id }); this.captures.delete(cap.id); c.resolve(null); } } }

  onCaptured(m) {
    if (m.type !== "captured") return;
    const c = this.captures.get(m.id);
    if (!c) return;
    this.captures.delete(m.id);
    c.resolve({ start: m.start, ch: m.ch });
  }

  // ------------------------------------------------------------------ worklet messages

  onWorkletMessage(m) {
    if (m.type === "levels") {
      const agg = new Map();
      for (let i = 0; i < m.v.length; i += 3) {
        const key = this.voiceToHandle.get(m.v[i]);
        if (key != null) agg.set(key, Math.max(agg.get(key) || 0, m.v[i + 1]));
      }
      this.levels = agg;
      this.emit("levels", agg);
    } else if (m.type === "dump") {
      this.emit("dump", m);
    } else if (m.type === "ended" || m.type === "stolen") {
      this.voiceToHandle.delete(m.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback for browsers without AudioWorklet (very old Safari, insecure http):
// a plain subtractive "cello-ish" voice per note, driven by the same messages.
class FallbackStrings {
  constructor(ctx, onMsg) {
    this.ctx = ctx; this.onMsg = onMsg;
    this.out = ctx.createGain(); this.out.gain.value = 0.5;
    this.voices = new Map();
    this.port = { postMessage: (m) => this.handle(m) };
  }
  connect(n) { return this.out.connect(n); }
  handle(m) {
    if (Array.isArray(m)) { m.forEach((x) => this.handle(x)); return; }
    const ctx = this.ctx, t = Math.max(ctx.currentTime, m.time || 0);
    if (m.type === "noteOn") {
      const o = ctx.createOscillator(); o.type = m.mode === "bow" ? "sawtooth" : "triangle";
      o.frequency.value = m.freq;
      const vib = ctx.createOscillator(); vib.frequency.value = m.vibRate || 5.5;
      const vg = ctx.createGain(); vg.gain.value = m.freq * ((m.vibDepth || 0) / 1731);
      vib.connect(vg).connect(o.frequency); vib.start(t);
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600 + 3000 * (m.bright || 0.5); f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0;
      const peak = 0.25 * (m.vel || 0.8) * (m.gain || 1);
      g.gain.setValueAtTime(0, t);
      if (m.mode === "bow") g.gain.linearRampToValueAtTime(peak, t + (m.attack || 0.05));
      else { g.gain.linearRampToValueAtTime(peak * 1.5, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, (m.t60 || 1) / 6); }
      o.connect(f).connect(g).connect(this.out);
      o.start(t);
      const v = { o, g, vib, freq: m.freq };
      this.voices.set(m.id, v);
      if (m.hold > 0) this.handle({ type: "noteOff", id: m.id, time: t + m.hold, release: m.release });
    } else if (m.type === "noteOff") {
      const v = this.voices.get(m.id); if (!v) return;
      const r = m.release || 0.2;
      v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, r / 3);
      v.o.stop(t + r * 2); v.vib.stop(t + r * 2);
      this.voices.delete(m.id);
      setTimeout(() => this.onMsg({ type: "ended", id: m.id }), (t - ctx.currentTime + r * 2) * 1000);
    } else if (m.type === "voice") {
      const v = this.voices.get(m.id); if (!v) return;
      if (m.freq) v.o.frequency.setTargetAtTime(m.freq, ctx.currentTime, Math.max(0.005, m.glide || 0.01));
    } else if (m.type === "panic") {
      for (const [id] of this.voices) this.handle({ type: "noteOff", id, release: 0.05 });
    }
  }
}

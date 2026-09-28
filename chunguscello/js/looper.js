// The loop station. Cellists like Zoë Keating build whole pieces from one
// instrument and a looper; this is that, in a browser tab.
//
// Everything is captured sample-accurately from the audio thread (the
// "chungus-recorder" worklet taps the performance bus, so loop playback is
// never re-recorded into the next layer). Each layer is folded into a buffer
// exactly one loop long, so overdubs can run across the loop point, wrap round
// and stack on themselves like tape.

import { clamp } from "./theory.js";

let nextLayerId = 1;

export class Looper {
  constructor(engine) {
    this.engine = engine;
    this.layers = [];
    this.state = "empty";          // empty | countin | recording | playing | overdub | stopped
    this.loopLen = 0;              // seconds (exactly N / sampleRate)
    this.loopStart = 0;            // audio time of loop position 0
    this.bars = "free";            // "free" | 1 | 2 | 4 | 8
    this.countIn = true;
    this.onePass = false;          // overdub stops itself after one loop
    this.tempoFromLoop = true;     // in free mode, the first loop sets the BPM
    this.cap = null;
    this.capStart = 0;
    this.timer = null;
    this.listeners = [];
    this.master = 1;
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() { for (const f of this.listeners) f(this); }
  get ctx() { return this.engine.ctx; }
  get now() { return this.engine.now; }
  get sr() { return this.ctx.sampleRate; }

  /** Position in the loop, 0..1 (or 0 when there's no loop). */
  phase(t = this.now) {
    if (!this.loopLen || (this.state !== "playing" && this.state !== "overdub")) return 0;
    const p = ((t - this.loopStart) % this.loopLen + this.loopLen) % this.loopLen;
    return p / this.loopLen;
  }

  // ---------------------------------------------------------------- the big button

  /** Record → play → overdub → play … (one-button looper, pedal friendly). */
  press() {
    if (!this.engine.ready) return;
    switch (this.state) {
      case "empty": return this.startFirst();
      case "countin": return this.cancelCountIn();
      case "recording": return this.bars === "free" ? this.finishFirst(this.now) : undefined;
      case "playing": return this.startOverdub();
      case "overdub": return this.finishOverdub(this.now);
      case "stopped": return this.layers.length ? this.play() : this.startFirst();
    }
  }

  stopPress() {
    if (this.state === "recording") return this.bars === "free" ? this.finishFirst(this.now) : this.cancelCountIn();
    if (this.state === "overdub") { this.finishOverdub(this.now); return; }
    if (this.state === "countin") return this.cancelCountIn();
    if (this.state === "playing") return this.stop();
    if (this.state === "stopped" && this.layers.length) return this.play();
  }

  // ---------------------------------------------------------------- first layer

  startFirst() {
    const e = this.engine;
    const now = this.now;
    if (this.bars === "free") {
      this.capStart = now;
      this.cap = e.captureBegin("perf", now);
      this.state = "recording";
    } else {
      const lead = 0.08;
      const bar = e.barDur();
      e.resetTransport(now + lead);
      const start = now + lead + (this.countIn ? bar : 0);
      e.countInUntil = this.countIn ? start - 0.01 : 0;
      this.capStart = start;
      const cap = e.captureBegin("perf", start);
      this.cap = cap;
      // quantised loops end themselves, exactly on the bar line
      cap.plannedEnd = start + +this.bars * bar;
      e.captureEnd(cap, cap.plannedEnd);
      this.state = this.countIn ? "countin" : "recording";
      if (this.countIn) this.timer = setTimeout(() => { if (this.state === "countin") { this.state = "recording"; this.changed(); } }, (start - now) * 1000);
      this.endTimer = setTimeout(() => { if (this.cap === cap) this.finishFirst(cap.plannedEnd); }, (cap.plannedEnd - now) * 1000);
    }
    this.changed();
  }

  cancelCountIn() {
    clearTimeout(this.timer); clearTimeout(this.endTimer);
    this.engine.captureCancel(this.cap);
    this.cap = null;
    this.engine.countInUntil = 0;
    this.state = this.layers.length ? "stopped" : "empty";
    this.changed();
  }

  async finishFirst(end) {
    const e = this.engine;
    const cap = this.cap;
    if (!cap) return;
    if (cap.plannedEnd && end < cap.plannedEnd - 0.001) return;   // quantised: wait for the bar line
    const len = (cap.plannedEnd || end) - this.capStart;
    if (!cap.plannedEnd && len < 0.25) { this.cancelCountIn(); return; }
    this.cap = null;
    if (!cap.plannedEnd) e.captureEnd(cap, end);
    this.state = "playing";
    this.changed();
    const res = await cap.done;
    if (!res) { if (!this.layers.length) { this.state = "empty"; this.changed(); } return; }
    const sr = this.sr;
    const N = Math.max(1, Math.round(len * sr));
    this.loopLen = N / sr;
    this.loopStart = this.capStart;
    // Quantised: the player was playing along to clicks they heard late, so
    // shift the take earlier by the output latency. Free: both ends of the
    // loop moved together, nothing to fix.
    const shift = this.bars === "free" ? 0 : e.latency();
    const layer = this.makeLayer(this.fold(res, N, shift, this.capStart), "Layer 1");
    this.layers.push(layer);
    if (this.bars === "free" && this.tempoFromLoop) {
      // pick the number of beats that keeps the tempo closest to the current one
      const raw = this.loopLen / e.beatDur();
      const cands = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
      const beats = cands.reduce((a, b) => (Math.abs(Math.log(b / raw)) < Math.abs(Math.log(a / raw)) ? b : a));
      const bpm = clamp((60 * beats) / this.loopLen, 30, 300);
      e.s.bpm = bpm; e.apply("bpm"); e.emit("setting", { name: "bpm", value: bpm });
    }
    e.resetTransport(this.loopStart);
    this.state = "playing";
    this.startSources();
    this.changed();
  }

  // ---------------------------------------------------------------- overdubs

  startOverdub() {
    const now = this.now;
    this.capStart = now;
    const cap = this.engine.captureBegin("perf", now);
    this.cap = cap;
    this.state = "overdub";
    if (this.onePass) {
      cap.plannedEnd = now + this.loopLen;
      this.engine.captureEnd(cap, cap.plannedEnd);
      this.endTimer = setTimeout(() => { if (this.cap === cap) this.finishOverdub(cap.plannedEnd); }, this.loopLen * 1000);
    }
    this.changed();
  }

  async finishOverdub(end) {
    const cap = this.cap;
    if (!cap) return;
    this.cap = null;
    clearTimeout(this.endTimer);
    if (!cap.plannedEnd || end < cap.plannedEnd) this.engine.captureEnd(cap, end);
    this.state = "playing";
    this.changed();
    const res = await cap.done;
    if (!res || !this.loopLen) return;
    const N = Math.round(this.loopLen * this.sr);
    const layer = this.makeLayer(this.fold(res, N, this.engine.latency(), this.loopStart), "Layer " + (this.layers.length + 1));
    if (!layer.silent) {
      this.layers.push(layer);
      if (this.state === "playing" || this.state === "overdub") this.playLayer(layer, this.now + 0.01);
    }
    this.changed();
  }

  /** Fold a capture into a loop-length stereo buffer, wrapping overlaps. */
  fold(res, N, shift, origin) {
    const [L, R] = res.ch;
    const outL = new Float32Array(N), outR = new Float32Array(N);
    const base = Math.round((res.start - shift - origin) * this.sr);
    for (let k = 0; k < L.length; k++) {
      const idx = (((base + k) % N) + N) % N;
      outL[idx] += L[k]; outR[idx] += R[k];
    }
    return [outL, outR];
  }

  makeLayer(ch, name) {
    const buf = this.ctx.createBuffer(2, ch[0].length, this.sr);
    buf.copyToChannel(ch[0], 0); buf.copyToChannel(ch[1], 1);
    const gain = this.ctx.createGain();
    gain.connect(this.engine.looperBus);
    let pk = 0; for (const d of ch) for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    return { id: nextLayerId++, name, buf, fwd: buf, gain, src: null, vol: 1, muted: false, reversed: false, half: false, silent: pk < 1e-4, peaks: peaksOf(ch, 120) };
  }

  // ---------------------------------------------------------------- playback

  playLayer(layer, when) {
    this.stopLayer(layer);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = layer.buf;
    src.loop = true;
    const rate = layer.half ? 0.5 : 1;
    src.playbackRate.value = rate;
    const period = this.loopLen / rate;
    const ph = (((when - this.loopStart) % period) + period) % period;
    src.connect(layer.gain);
    layer.gain.gain.value = layer.muted ? 0 : layer.vol;
    src.start(when, ph * rate);
    layer.src = src;
  }
  stopLayer(layer, when) {
    if (layer.src) { try { layer.src.stop(when || 0); } catch (e) { /* */ } layer.src.disconnect(); layer.src = null; }
  }
  startSources() { const w = this.now + 0.02; for (const l of this.layers) this.playLayer(l, w); }

  play() {
    if (!this.layers.length) return;
    const now = this.now + 0.03;
    this.loopStart = now;
    this.engine.resetTransport(now);
    for (const l of this.layers) this.playLayer(l, now);
    this.state = "playing";
    this.changed();
  }

  stop() {
    for (const l of this.layers) this.stopLayer(l);
    this.state = this.layers.length ? "stopped" : "empty";
    this.changed();
  }

  undo() {
    if (this.cap) {
      clearTimeout(this.endTimer); clearTimeout(this.timer);
      this.engine.captureCancel(this.cap); this.cap = null;
      if (this.state === "recording" || this.state === "countin") { this.state = this.layers.length ? "stopped" : "empty"; this.engine.countInUntil = 0; }
      else this.state = "playing";
      this.changed();
      return;
    }
    const l = this.layers.pop();
    if (l) { this.stopLayer(l); l.gain.disconnect(); }
    if (!this.layers.length) { this.state = "empty"; this.loopLen = 0; }
    this.changed();
  }

  clear() {
    if (this.cap) { this.engine.captureCancel(this.cap); this.cap = null; }
    clearTimeout(this.timer); clearTimeout(this.endTimer);
    this.engine.countInUntil = 0;
    for (const l of this.layers) { this.stopLayer(l); l.gain.disconnect(); }
    this.layers = [];
    this.loopLen = 0;
    this.state = "empty";
    this.changed();
  }

  setVol(layer, v) { layer.vol = v; if (!layer.muted) layer.gain.gain.setTargetAtTime(v, this.now, 0.02); this.changed(); }
  toggleMute(layer) { layer.muted = !layer.muted; layer.gain.gain.setTargetAtTime(layer.muted ? 0 : layer.vol, this.now, 0.01); this.changed(); }
  toggleReverse(layer) {
    layer.reversed = !layer.reversed;
    if (layer.reversed) {
      const b = this.ctx.createBuffer(2, layer.fwd.length, this.sr);
      for (let c = 0; c < 2; c++) { const d = layer.fwd.getChannelData(c).slice().reverse(); b.copyToChannel(d, c); }
      layer.buf = b;
    } else layer.buf = layer.fwd;
    if (layer.src) this.playLayer(layer, this.now + 0.01);
    this.changed();
  }
  toggleHalf(layer) {
    layer.half = !layer.half;
    if (layer.src) this.playLayer(layer, this.now + 0.01);
    this.changed();
  }
  remove(layer) {
    const i = this.layers.indexOf(layer);
    if (i < 0) return;
    this.stopLayer(layer); layer.gain.disconnect();
    this.layers.splice(i, 1);
    if (!this.layers.length) { this.state = "empty"; this.loopLen = 0; }
    this.changed();
  }

  // ---------------------------------------------------------------- export helpers

  /** Length (s) of one full cycle including half-speed layers. */
  cycleLen() { return this.loopLen * (this.layers.some((l) => l.half && !l.muted) ? 2 : 1); }

  /** Render one layer (or null = mix) as stereo Float32Arrays over the full cycle. */
  renderLayer(layer, repeats = 1) {
    const sr = this.sr;
    const N = Math.round(this.cycleLen() * sr) * repeats;
    const L = new Float32Array(N), R = new Float32Array(N);
    const src = [layer.buf.getChannelData(0), layer.buf.getChannelData(1)];
    const n = src[0].length;
    for (let i = 0; i < N; i++) {
      const pos = layer.half ? i * 0.5 : i;
      const a = Math.floor(pos) % n, b = (a + 1) % n, f = pos - Math.floor(pos);
      L[i] = (src[0][a] * (1 - f) + src[0][b] * f) * layer.vol;
      R[i] = (src[1][a] * (1 - f) + src[1][b] * f) * layer.vol;
    }
    return [L, R];
  }
  renderMix(repeats = 1) {
    const N = Math.round(this.cycleLen() * this.sr) * repeats;
    const L = new Float32Array(N), R = new Float32Array(N);
    for (const l of this.layers) {
      if (l.muted) continue;
      const [a, b] = this.renderLayer(l, repeats);
      for (let i = 0; i < N; i++) { L[i] += a[i]; R[i] += b[i]; }
    }
    return [L, R];
  }
}

function peaksOf(ch, n) {
  const d = ch[0], out = new Float32Array(n);
  const step = d.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = Math.floor(i * step); k < Math.floor((i + 1) * step); k++) { const v = Math.abs(d[k]) + Math.abs(ch[1][k]); if (v > m) m = v; }
    out[i] = m * 0.5;
  }
  return out;
}

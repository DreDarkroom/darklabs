// Pitch detection (YIN, de Cheveigné & Kawahara 2002) and the microphone:
// the tuner, sing-to-play and the Chungus sampler's recorder all use this.

/**
 * YIN on a Float32Array. Returns {freq, clarity (0..1), rms} — freq is 0 when
 * nothing periodic was found.
 */
export function yin(buf, sr, fmin = 50, fmax = 1400, threshold = 0.12) {
  const maxT = Math.min(Math.floor(sr / fmin), (buf.length >> 1) - 2);
  const minT = Math.max(2, Math.floor(sr / fmax));
  const W = buf.length - maxT - 1;
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (W < 32 || rms < 1e-4) return { freq: 0, clarity: 0, rms };
  // difference function (every other sample — plenty for pitch, half the cost)
  const d = new Float32Array(maxT + 2);
  for (let t = 1; t <= maxT + 1; t++) {
    let s = 0;
    for (let i = 0; i < W; i += 2) { const q = buf[i] - buf[i + t]; s += q * q; }
    d[t] = s;
  }
  // cumulative mean normalised difference
  const c = new Float32Array(maxT + 2);
  c[0] = 1;
  let run = 0;
  for (let t = 1; t <= maxT + 1; t++) { run += d[t]; c[t] = run > 0 ? (d[t] * t) / run : 1; }
  let T = -1;
  for (let t = minT; t <= maxT; t++) {
    if (c[t] < threshold) { while (t + 1 <= maxT && c[t + 1] < c[t]) t++; T = t; break; }
  }
  if (T < 0) {
    let best = 1e9;
    for (let t = minT; t <= maxT; t++) if (c[t] < best) { best = c[t]; T = t; }
    if (best > 0.35) return { freq: 0, clarity: 1 - best, rms };
  }
  const a = c[T - 1], b = c[T], e = c[T + 1];
  const den = a - 2 * b + e;
  const off = den !== 0 ? (a - e) / (2 * den) : 0;
  return { freq: sr / (T + Math.max(-1, Math.min(1, off))), clarity: Math.max(0, 1 - b), rms };
}

/** Median pitch of a longer mono buffer, from confident frames only. */
export function dominantPitch(data, sr, from = 0.2, to = 0.8) {
  const N = 2048, hop = 1024;
  const a = Math.floor(data.length * from), b = Math.floor(data.length * to) - N;
  const got = [];
  for (let i = a; i < b; i += hop) {
    const r = yin(data.subarray(i, i + N), sr, 45, 1500, 0.1);
    if (r.freq > 0 && r.clarity > 0.85) got.push(r.freq);
  }
  if (got.length < 2) return 0;
  got.sort((x, y) => x - y);
  return got[got.length >> 1];
}

/**
 * The microphone. One stream, shared by the tuner, sing-to-play and the
 * sampler's recorder. Echo cancellation etc. are off: they wreck pitch.
 */
export class Mic {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.analyser = null;
    this.buf = null;
  }
  get on() { return !!this.stream; }
  async open() {
    if (this.stream) return true;
    const ctx = this.engine.ctx;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser has no microphone access (needs https).");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.src.connect(this.analyser);
    this.buf = new Float32Array(2048);
    if (this.engine.worklet) {
      this.rec = new AudioWorkletNode(ctx, "chungus-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit" });
      this.rec.port.onmessage = (e) => { if (e.data.type === "captured" && this.pending) { const p = this.pending; this.pending = null; p(e.data); } };
      this.src.connect(this.rec);
      this.rec.connect(this.engine.silent);
    }
    return true;
  }
  close() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((t) => t.stop());
    try { this.src.disconnect(); } catch (e) { /* */ }
    try { if (this.rec) this.rec.disconnect(); } catch (e) { /* */ }
    this.stream = null; this.rec = null;
  }
  /** Current pitch reading. */
  read() {
    if (!this.analyser) return { freq: 0, clarity: 0, rms: 0 };
    this.analyser.getFloatTimeDomainData(this.buf);
    return yin(this.buf, this.engine.ctx.sampleRate, 55, 1300, 0.15);
  }
  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let r = 0; for (let i = 0; i < this.buf.length; i++) r += this.buf[i] * this.buf[i];
    return Math.sqrt(r / this.buf.length);
  }
  /** Start recording; returns stop() → Promise<Float32Array mono>. */
  startRecording() {
    if (!this.rec) throw new Error("Recording needs AudioWorklet support.");
    const id = "mic" + Date.now();
    this.rec.port.postMessage({ cmd: "begin", id, start: this.engine.now });
    const auto = setTimeout(() => stop(), 10000);
    const stop = () => new Promise((resolve) => {
      clearTimeout(auto);
      this.pending = (m) => {
        const [L, R] = m.ch; const out = new Float32Array(L.length);
        for (let i = 0; i < L.length; i++) out[i] = (L[i] + R[i]) * 0.5;
        resolve(out);
      };
      this.rec.port.postMessage({ cmd: "end", id, end: this.engine.now });
    });
    return stop;
  }
}

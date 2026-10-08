// BlueHeronBass audio thread.
//
// "bhb-bass": polyphonic plucked-string voices (Karplus–Strong: a delay line
// with a one-pole lowpass in the loop), one voice per sounding string, followed
// by an envelope-following resonant filter. Articulations differ only in how
// the string is excited and how bright / long-lived the loop is, so the whole
// instrument costs a few multiplies per voice per sample.
//
// The "heron" articulation excites the string with a slice of a croak instead
// of noise, so the bird's harsh harmonic structure becomes the string's tone.
//
// "bhb-rec": sample-accurate recorder tap (loops and takes).

const MASK = 4095; // delay buffer is 4096 samples (B0 needs ~1550 at 48 kHz)
const TWO_PI = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// fc: loop lowpass cutoff (Hz)   t60: decay time of the fundamental (s)
// exLp: excitation brightness    pos: pluck position (fraction of string)
// ck / ckHp: attack click level / how bright   knock: thumb thump level
const STYLES = {
  finger: { fc: 3200, t60: 2.6, exLp: 0.30, pos: 0.20, ck: 0,    ckHp: 0.2,  knock: 0,   gain: 1.0 },
  pick:   { fc: 5200, t60: 2.4, exLp: 0.65, pos: 0.10, ck: 0.10, ckHp: 0.35, knock: 0,   gain: 0.9 },
  slap:   { fc: 7500, t60: 1.4, exLp: 0.90, pos: 0.07, ck: 0.35, ckHp: 0.15, knock: 0.5, gain: 0.85 },
  pop:    { fc: 9500, t60: 1.1, exLp: 1.00, pos: 0.05, ck: 0.45, ckHp: 0.6,  knock: 0,   gain: 0.8 },
  tap:    { fc: 2600, t60: 2.2, exLp: 0.22, pos: 0.32, ck: 0.04, ckHp: 0.2,  knock: 0,   gain: 0.85 },
  mute:   { fc: 1000, t60: 0.35, exLp: 0.25, pos: 0.20, ck: 0,   ckHp: 0.2,  knock: 0,   gain: 1.1 },
  harm:   { fc: 6000, t60: 2.8, exLp: 0.70, pos: 0,    ck: 0,    ckHp: 0.2,  knock: 0,   gain: 0.8 },
  heron:  { fc: 4200, t60: 2.0, exLp: 1,    pos: 0.15, ck: 0,    ckHp: 0.2,  knock: 0,   gain: 0.8, src: "heron" },
};

class BassProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.heron = null;
    this.seed = 20240611;
    this.env = 0; this.low = 0; this.band = 0;
    this.fx = { envAmt: 0, envQ: 3, envBase: 220, envRange: 2600, envSens: 7 };
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }

  onMsg(m) {
    switch (m.t) {
      case "heron": this.heron = m.buf; break;
      case "fx": Object.assign(this.fx, m.fx); break;
      case "on": this.noteOn(m); break;
      case "off": {
        const v = this.voices.find((x) => x.id === m.id);
        if (v) v.relRate = Math.exp(-1 / ((m.mute ? 0.008 : m.tail || 0.14) * sampleRate));
        break;
      }
      case "bend": {
        const v = this.voices.find((x) => x.id === m.id);
        if (v) this.retune(v, m.f, m.glide);
        break;
      }
      case "panic": this.voices.length = 0; break;
    }
  }

  /** Loop parameters for a given pitch: {a, g, d}. */
  loopParams(st, f, vel) {
    const sr = sampleRate;
    let a = 1 - Math.exp((-TWO_PI * st.fc * (0.55 + 0.9 * vel)) / sr);
    // keep the filter's own delay a small part of the loop
    const maxFd = 0.4 * sr / f;
    if ((1 - a) / a > maxFd) a = 1 / (1 + maxFd);
    const t60 = st.t60 * clamp(Math.pow(110 / f, 0.35), 0.5, 1.8);
    const g = Math.pow(10, -3 / (t60 * f));
    const d = Math.max(2, sr / f - (1 - a) / a);
    return { a, g: Math.min(g, 0.99995), d };
  }

  noteOn(m) {
    const st = STYLES[m.style] || STYLES.finger;
    const vel = clamp(m.vel, 0.05, 1);
    const f = clamp(m.f, 24, 2500);
    const h = m.h || 1;
    const p = this.loopParams(st, f, vel);
    const L = Math.floor(p.d);
    const ex = new Float32Array(L);

    if (st.src === "heron" && this.heron) {
      // a slice of the croak (skipping its quiet attack), tiled if the string is longer than the slice
      const src = this.heron, off = Math.floor(src.length * (0.12 + 0.25 * Math.random()));
      for (let i = 0; i < L; i++) ex[i] = src[(off + i) % src.length];
    } else {
      const P = Math.max(2, Math.floor(L / h));
      const base = new Float32Array(P);
      let s = 0;
      for (let i = 0; i < P; i++) { s += st.exLp * (this.rand() - s); base[i] = s; }
      for (let i = 0; i < L; i++) ex[i] = base[i % P]; // h>1 tiles the burst → only every h-th partial rings (a harmonic)
    }
    // remove DC, then pluck-position comb (skipped for harmonics/heron, which shape themselves)
    let mean = 0; for (let i = 0; i < L; i++) mean += ex[i]; mean /= L;
    for (let i = 0; i < L; i++) ex[i] -= mean;
    if (st.pos > 0 && h === 1 && st.src !== "heron") {
      const P2 = Math.max(1, Math.floor(st.pos * L));
      for (let i = L - 1; i >= P2; i--) ex[i] -= ex[i - P2];
    }
    let pk = 1e-9; for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(ex[i]));
    const amp = (0.25 + 0.75 * Math.pow(vel, 1.5)) * st.gain * 1.7 / pk;

    const v = {
      id: m.id, st, vel, buf: new Float32Array(MASK + 1), w: 0,
      f, a: p.a, g: p.g, d: p.d, dT: p.d, dSlew: 0, lp: 0,
      rel: 1, relRate: 1, ea: 0, age: 0,
      ck: st.ck * vel, ckLp: 0, knock: st.knock * vel, kph: 0,
    };
    for (let i = 0; i < L; i++) v.buf[i] = ex[i] * amp;
    v.w = L;
    if (this.voices.length >= 16) this.voices.shift();
    this.voices.push(v);
  }

  retune(v, f, glideSec) {
    f = clamp(f, 24, 2500);
    const p = this.loopParams(v.st, f, v.vel);
    v.a = p.a; v.g = p.g; v.f = f;
    v.dT = p.d;
    v.dSlew = Math.abs(p.d - v.d) / Math.max(1, (glideSec || 0.03) * sampleRate);
  }

  process(_in, outputs) {
    const out = outputs[0][0];
    const n = out.length;
    out.fill(0);
    const kdec = Math.exp(-1 / (0.03 * sampleRate)), cdec = Math.exp(-1 / (0.005 * sampleRate));
    for (let vi = this.voices.length - 1; vi >= 0; vi--) {
      const v = this.voices[vi], buf = v.buf;
      let { w, d, lp, rel, ea, ck, ckLp, knock, kph } = v;
      const { a, g, dT, dSlew, relRate } = v;
      for (let i = 0; i < n; i++) {
        if (d !== dT) { const diff = dT - d; d += Math.abs(diff) <= dSlew ? diff : Math.sign(diff) * dSlew; }
        const rp = w - d, i0 = Math.floor(rp), fr = rp - i0;
        const x = buf[i0 & MASK] * (1 - fr) + buf[(i0 + 1) & MASK] * fr;
        lp += a * (x - lp);
        const y = lp * g;
        buf[w & MASK] = y; w++;
        let o = y;
        if (ck > 1e-4) { // attack click: highpassed noise
          const nz = this.rand();
          ckLp += v.st.ckHp * (nz - ckLp);
          o += (nz - ckLp) * ck; ck *= cdec;
        }
        if (knock > 1e-4) { o += Math.sin(kph) * knock * 0.6; kph += TWO_PI * 68 / sampleRate; knock *= kdec; }
        rel *= relRate;
        ea += (Math.abs(y) - ea) * 0.0004;
        out[i] += o * rel;
      }
      v.w = w; v.d = d; v.lp = lp; v.rel = rel; v.ea = ea; v.ck = ck; v.ckLp = ckLp; v.knock = knock; v.kph = kph;
      v.age += n;
      if (rel < 1e-3 || (v.age > 0.3 * sampleRate && ea < 2e-5)) this.voices.splice(vi, 1);
    }

    // envelope-following resonant lowpass (the "auto-wah" of the amp)
    const fx = this.fx, mix = fx.envAmt;
    const atk = 1 - Math.exp(-1 / (0.003 * sampleRate)), rls = 1 - Math.exp(-1 / (0.14 * sampleRate));
    const q = 1 / clamp(fx.envQ, 1, 9);
    for (let i = 0; i < n; i++) {
      let s = out[i];
      const ab = Math.abs(s);
      this.env += (ab > this.env ? atk : rls) * (ab - this.env);
      if (mix > 0.002) {
        const fc = fx.envBase + fx.envRange * Math.min(1, this.env * fx.envSens);
        const f1 = 2 * Math.sin(Math.PI * Math.min(fc, sampleRate / 6) / sampleRate);
        this.low += f1 * this.band;
        const high = s - this.low - q * this.band;
        this.band += f1 * high;
        s = s * (1 - mix) + this.low * mix;
      }
      out[i] = Math.tanh(s);
    }
    return true;
  }
}
registerProcessor("bhb-bass", BassProcessor);

class RecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = "idle"; // idle | armed | rec
    this.startF = 0; this.frames = 0; this.count = 0; this.actStart = 0; this.chunks = [];
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.t === "start") { this.state = "armed"; this.startF = m.startFrame; this.frames = m.frames || 0; this.chunks = []; this.count = 0; }
      else if (m.t === "stop") { if (this.state === "rec") this.finish(); else this.state = "idle"; }
      else if (m.t === "cancel") { this.state = "idle"; this.chunks = []; }
    };
  }
  finish() {
    const data = new Float32Array(this.count);
    let o = 0; for (const c of this.chunks) { data.set(c, o); o += c.length; }
    this.port.postMessage({ t: "done", data, start: this.actStart }, [data.buffer]);
    this.state = "idle"; this.chunks = [];
  }
  process(inputs) {
    if (this.state === "idle") return true;
    const inp = inputs[0] && inputs[0][0];
    const n = 128, f0 = currentFrame;
    let from = 0;
    if (this.state === "armed") {
      if (f0 + n <= this.startF) return true;
      from = Math.max(0, this.startF - f0);
      this.state = "rec"; this.actStart = f0 + from; this.count = 0;
    }
    let to = n;
    if (this.frames > 0) to = Math.min(n, from + (this.frames - this.count));
    const seg = new Float32Array(Math.max(0, to - from));
    if (inp) for (let k = 0; k < seg.length; k++) seg[k] = inp[from + k];
    this.chunks.push(seg); this.count += seg.length;
    if (this.frames > 0 && this.count >= this.frames) this.finish();
    return true;
  }
}
registerProcessor("bhb-rec", RecProcessor);

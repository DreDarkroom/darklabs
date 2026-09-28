// ChungusCello — the string engine. Runs on the audio thread as an AudioWorklet.
//
// Every note is a digital-waveguide string: two delay lines (bow→nut and
// bow→bridge round trips) with a reflection filter at the bridge and a
// nonlinear friction junction where the bow meets the string. It is the
// classic bowed-string model (McIntyre, Schumacher & Woodhouse, 1983; the
// same shape as Perry Cook's STK "Bowed"), written from scratch here with
// tuning compensation, tremolo, spiccato, plucks, strikes and four
// sympathetic open strings (C G D A) that ring along with whatever you play.
//
//   bow velocity ──► [ friction junction ] ◄── string velocity
//                     │              │
//            neck delay (−1 at nut)  bridge delay ─► reflection filter ─► out ─► body (main thread)
//
// A second processor, "chungus-recorder", captures exact sample ranges for the
// looper and streams the master bus for WAV recording.
"use strict";

const MAX_VOICES = 24;
const DL_SIZE = 8192;            // power of two — plenty for C1 at 96 kHz
const DL_MASK = DL_SIZE - 1;
const BLOCK = 128;
const TWO_PI = Math.PI * 2;
const BOW_COMP = 0.25;

// Open strings for the sympathetic resonators (C2 G2 D3 A3).
const OPEN_STRINGS = [65.406, 97.999, 146.832, 220.0];

// Normalised friction-curve width (slope × bow speed) for a bow position β
// and pressure 0..1, fitted offline against the model so that 0..1 stays
// inside the Helmholtz-motion window (see the notes in the repo history).
function forceWindow(beta, p) {
  const tight = beta < 0.08;              // near the bridge the window narrows
  const hi = tight ? 0.1 : 0.17;          // light bow (flautando side)
  const lo = tight ? 0.065 : 0.045;       // heavy bow (crunchy side)
  return hi * Math.pow(lo / hi, p);
}

// Bow position control 0 (sul tasto) … 1 (sul ponticello) → β, the bow's
// distance from the bridge as a fraction of the string. Moves quickly through
// β≈0.16–0.21, where the model likes to lock onto a higher mode.
function betaFromPosition(c) {
  c = clamp(c, 0, 1);
  if (c < 0.3) return 0.28 - 0.06 * (c / 0.3);            // 0.28 → 0.22
  if (c < 0.38) return 0.22 - 0.07 * ((c - 0.3) / 0.08);  // 0.22 → 0.15 (fast)
  return 0.15 * Math.pow(0.065 / 0.15, (c - 0.38) / 0.62); // 0.15 → 0.065
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Phase delay (in samples) of the bridge reflection filter y = g(1-p)x + p·y[n-1]
// at frequency f. Subtracted from the loop so notes land in tune.
function filterPhaseDelay(p, f, fs) {
  const w = TWO_PI * f / fs;
  return Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w;
}

// Magnitude of that filter at f, relative to DC. Dividing the loop gain by it
// keeps the decay of the fundamental the same whatever the pitch.
function filterMag(p, f, fs) {
  const w = TWO_PI * f / fs;
  return (1 - p) / Math.sqrt(1 - 2 * p * Math.cos(w) + p * p);
}

class Voice {
  constructor() {
    this.neck = new Float32Array(DL_SIZE);
    this.bridge = new Float32Array(DL_SIZE);
    this.w = 0;
    this.active = false;
    this.reset();
  }

  reset() {
    this.neck.fill(0); this.bridge.fill(0);
    this.w = 0;
    this.id = -1;
    this.filt = 0;
    this.logF = Math.log(110); this.logTarget = this.logF; this.glideCoef = 1;
    this.L = 100; this.beta = 0.127; this.betaTarget = 0.127;
    this.pressure = 0.5; this.pressureTarget = 0.5;
    this.bv = 0; this.bvTarget = 0; this.bvCoefUp = 0.01; this.bvCoefDown = 0.01;
    this.contact = 0; this.contactTarget = 0; this.contactCoef = 0.01;
    this.gain = 1; this.gainL = 0.707; this.gainR = 0.707;
    this.pole = 0.66; this.loss = 0.95; this.lossBase = 0.95; this.t60 = 1.4; this.freeT60 = 0.4;
    this.mode = 0;          // 0 bow, 1 pluck, 2 strike
    this.releasing = false;
    this.releaseAt = -1;    // frame at which an automatic release happens (one-shots)
    this.release = 0.25;
    this.age = 0;           // samples since note on
    this.quietRun = 0;
    this.lastOut = 0;
    this.level = 0;
    this.trem = 0; this.tremPhase = 0;
    this.vibDepth = 0; this.vibRate = 5.5; this.vibDelay = 0.3; this.vibPhase = Math.random() * TWO_PI;
    this.vibDrift = 1;
    this.exc = null; this.excPos = 0; this.excGain = 0;
    this.rosin = 0.03;
    this.startFrame = 0;
  }

  // Interpolated read of a delay line: returns x[n-d] where x[n-1] was the last write.
  static read(buf, w, d) {
    const pos = w - d;
    const i = Math.floor(pos);
    const frac = pos - i;
    return buf[i & DL_MASK] * (1 - frac) + buf[(i + 1) & DL_MASK] * frac;
  }
}

class ChungusCello extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fs = sampleRate;
    this.voices = Array.from({ length: MAX_VOICES }, () => new Voice());
    this.queue = [];
    this.g = {
      bend: 0,          // global semitones (MIDI pitch wheel)
      vibExtra: 0,      // extra vibrato cents (mod wheel / tilt)
      expr: 1,          // live bow-speed multiplier (dynamics)
      pressureMod: 0,   // added to every voice's pressure (aftertouch)
      betaMod: 0,       // bow-position shift in octaves of β (+ = toward the bridge)
      symp: 0.25,       // sympathetic string level
      maxVoices: 16,
      sympFreqs: OPEN_STRINGS.slice(), // open strings of the current tuning (Hz, already referenced to A4)
    };
    // Sympathetic strings: four lightly damped feedback combs.
    this.symp = OPEN_STRINGS.map((f) => ({ f, buf: new Float32Array(DL_SIZE), w: 0, lp: 0 }));
    this.dc = { x1L: 0, y1L: 0, x1R: 0, y1R: 0 };
    this.levelTick = 0;
    this.noiseSeed = 22222;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  noise() {
    // xorshift — cheap white noise in [-1, 1)
    let x = this.noiseSeed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.noiseSeed = x;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }

  onMessage(m) {
    if (!m) return;
    if (Array.isArray(m)) { for (const x of m) this.onMessage(x); return; }
    if (m.type === "global") { Object.assign(this.g, m.values); return; }
    if (m.type === "dump") {
      this.port.postMessage({ type: "dump", voices: this.voices.filter((v) => v.active).map((v) => ({ id: v.id, mode: v.mode, f: Math.exp(v.logF), loss: v.loss, t60: v.t60, freeT60: v.freeT60, releasing: v.releasing, contact: v.contact, bv: v.bv, bvT: v.bvTarget, level: v.level, age: v.age })), g: this.g });
      return;
    }
    if (m.type === "panic") { for (const v of this.voices) { v.active = false; v.reset(); } this.queue.length = 0; return; }
    // Everything else is a timed event.
    const frame = m.time != null ? Math.round(m.time * this.fs) : 0;
    m._frame = frame;
    // keep the queue sorted by frame (events arrive nearly in order)
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1]._frame > frame) i--;
    this.queue.splice(i, 0, m);
  }

  findVoice(id) {
    for (const v of this.voices) if (v.active && v.id === id) return v;
    return null;
  }

  allocVoice() {
    const limit = clamp(this.g.maxVoices | 0, 1, MAX_VOICES);
    let count = 0;
    for (let i = 0; i < limit; i++) {
      if (!this.voices[i].active) return this.voices[i];
      count++;
    }
    // Steal: prefer the oldest releasing voice, then the oldest voice.
    let best = null;
    for (let i = 0; i < limit; i++) {
      const v = this.voices[i];
      if (v.releasing && (!best || v.age > best.age)) best = v;
    }
    if (!best) for (let i = 0; i < limit; i++) { const v = this.voices[i]; if (!best || v.age > best.age) best = v; }
    return best;
  }

  apply(m, frameNow) {
    const fs = this.fs;
    switch (m.type) {
      case "noteOn": {
        const v = this.allocVoice();
        if (v.active) this.port.postMessage({ type: "stolen", id: v.id });
        const fresh = !v.active;
        v.reset();
        if (!fresh) { /* stolen voice — buffers cleared by reset() */ }
        v.active = true;
        v.id = m.id;
        v.startFrame = frameNow;
        v.mode = m.mode === "pluck" ? 1 : m.mode === "strike" ? 2 : 0;
        const f = Math.max(20, m.freq || 110);
        v.logF = v.logTarget = Math.log(f);
        v.glideCoef = m.glide > 0 ? 1 - Math.exp(-BLOCK / (m.glide * fs)) : 1;
        v.beta = v.betaTarget = m.bowPos != null ? betaFromPosition(m.bowPos) : clamp(m.beta != null ? m.beta : 0.127, 0.02, 0.48);
        v.pressure = v.pressureTarget = clamp(m.pressure != null ? m.pressure : 0.5, 0, 1);
        const bright = clamp(m.bright != null ? m.bright : 0.5, 0, 1);
        // Bridge filter pole: bowed 0.86 dark … 0.44 bright; plucks ring purer.
        v.pole = v.mode === 0 ? 0.86 - 0.42 * bright : 0.62 - 0.52 * bright;
        v.gain = m.gain != null ? m.gain : 1;
        const pan = clamp(m.pan || 0, -1, 1);
        v.gainL = Math.cos((pan + 1) * Math.PI / 4);
        v.gainR = Math.sin((pan + 1) * Math.PI / 4);
        v.release = Math.max(0.02, m.release != null ? m.release : 0.25);
        v.trem = m.trem || 0;
        v.tremPhase = 0;
        v.vibDepth = m.vibDepth || 0;
        v.vibRate = m.vibRate || 5.5;
        v.vibDelay = m.vibDelay != null ? m.vibDelay : 0.3;
        v.vibDrift = 0.94 + Math.random() * 0.12;
        v.rosin = m.rosin != null ? m.rosin : 0.03;
        v.releasing = false;
        v.releaseAt = m.hold > 0 ? frameNow + Math.round(m.hold * fs) : -1;
        v.endless = !!m.endless;

        const vel = clamp(m.vel != null ? m.vel : 0.8, 0, 1);
        if (v.mode === 0) {
          // Bowed: bow speed follows velocity, contact comes in fast.
          v.bvTarget = 0.03 + 0.2 * vel;
          const atk = Math.max(0.003, m.attack != null ? m.attack : 0.06);
          v.bvCoefUp = 1 - Math.exp(-3 / (atk * fs));
          v.bv = 0;
          v.contact = 0; v.contactTarget = 1; v.contactCoef = 1 - Math.exp(-3 / (0.004 * fs));
          v.lossBase = m.loss != null ? m.loss : 0.95;
        } else {
          // Pluck / strike: the bow never touches; a short pulse excites the loop.
          v.bvTarget = 0; v.bv = 0; v.contact = 0; v.contactTarget = 0;
          v.t60 = Math.max(0.05, m.t60 != null ? m.t60 : 1.4);
          const period = fs / f;
          const width = v.mode === 1
            ? Math.max(4, Math.round(period * (0.18 + 0.3 * (1 - bright))))
            : Math.max(2, Math.round(fs * 0.0004));
          const exc = new Float32Array(width + 64);
          for (let i = 0; i < width; i++) exc[i] = Math.sin(Math.PI * i / width);
          if (v.mode === 2) for (let i = 0; i < exc.length; i++) exc[i] = exc[i] * 0.6 + this.noise() * 0.5 * Math.exp(-i / 18);
          v.exc = exc; v.excPos = 0;
          v.excGain = (v.mode === 1 ? 0.55 : 1.3) * (0.25 + 0.75 * vel);
        }
        this.updateLength(v, 1);
        break;
      }
      case "noteOff": {
        for (const v of this.voices) if (v.active && v.id === m.id && !v.releasing) this.beginRelease(v, m.release);
        break;
      }
      case "voice": {
        // Live per-voice expression (fingerboard slides, XR bow).
        const v = this.findVoice(m.id);
        if (!v) break;
        if (m.freq) { v.logTarget = Math.log(Math.max(20, m.freq)); if (m.glide != null) v.glideCoef = m.glide > 0 ? 1 - Math.exp(-BLOCK / (m.glide * this.fs)) : 1; }
        if (m.pressure != null) v.pressureTarget = clamp(m.pressure, 0, 1);
        if (m.beta != null) v.betaTarget = clamp(m.beta, 0.02, 0.48);
        if (m.bowPos != null) v.betaTarget = betaFromPosition(m.bowPos);
        if (m.vel != null && v.mode === 0 && !v.releasing) v.bvTarget = (0.03 + 0.2 * clamp(m.vel, 0, 1)) * (m.dir < 0 ? -1 : 1);
        if (m.bowSpeed != null && v.mode === 0 && !v.releasing) {
          // Direct bow speed from a VR bow: signed, already scaled 0..~1.
          v.bvTarget = clamp(m.bowSpeed, -1.2, 1.2) * 0.23;
          v.bvCoefUp = 1 - Math.exp(-3 / (0.012 * this.fs));
        }
        if (m.contact != null) { v.contactTarget = clamp(m.contact, 0, 1); v.contactCoef = 1 - Math.exp(-3 / (0.01 * this.fs)); }
        if (m.gain != null) v.gain = m.gain;
        if (m.vibDepth != null) v.vibDepth = m.vibDepth;
        break;
      }
      case "pluckVoice": {
        // Re-excite an existing voice (e.g. chug re-attack without re-allocating).
        const v = this.findVoice(m.id);
        if (!v) break;
        const period = this.fs / Math.exp(v.logF);
        const width = Math.max(4, Math.round(period * 0.25));
        v.exc = new Float32Array(width + 8);
        for (let i = 0; i < width; i++) v.exc[i] = Math.sin(Math.PI * i / width);
        v.excPos = 0; v.excGain = 0.5 * clamp(m.vel != null ? m.vel : 0.8, 0, 1);
        break;
      }
    }
  }

  beginRelease(v, rel) {
    v.releasing = true;
    const r = Math.max(0.02, rel != null ? rel : v.release);
    v.release = r;
    v.bvTarget = 0;
    v.bvCoefDown = 1 - Math.exp(-3 / (r * 0.6 * this.fs));
    v.contactTarget = 0;
    v.contactCoef = 1 - Math.exp(-3 / (r * this.fs));
    // Once the bow leaves (or the finger lifts off a pluck) the string rings
    // down over roughly the release time.
    v.freeT60 = Math.max(0.08, r * 1.5);
  }

  updateLength(v, snap) {
    const f = Math.exp(v.logF) * Math.pow(2, this.g.bend / 12);
    const pd = filterPhaseDelay(v.pole, f, this.fs);
    // The friction junction shortens the bowed loop by about a quarter sample.
    const comp = v.mode === 0 ? BOW_COMP + 0.2 * clamp((f - 250) / 630, 0, 1) : 0;
    const L = clamp(this.fs / f - pd + comp, 4, DL_SIZE - 8);
    if (snap) v.L = L;
    // Loop gain for this pitch (see filterMag).
    const mag = filterMag(v.pole, f, this.fs);
    let base = v.mode === 0 ? v.lossBase : Math.pow(10, -3 / (v.t60 * f));
    if (v.releasing && v.contact < 0.05) base = Math.min(base, Math.pow(10, -3 / (v.freeT60 * f)));
    v.loss = Math.min(0.9995, base / mag);
    return L;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out[0], outR = out[1] || out[0];
    const n = outL.length;
    const fs = this.fs;
    const blockStart = currentFrame;
    outL.fill(0); if (outR !== outL) outR.fill(0);
    const sympIn = new Float32Array(n);
    const q = this.queue;

    // Split the block at event boundaries so events are sample-accurate.
    let s = 0;
    while (s < n) {
      while (q.length && q[0]._frame <= blockStart + s) this.apply(q.shift(), blockStart + s);
      let e = n;
      if (q.length && q[0]._frame < blockStart + n) e = Math.max(s + 1, q[0]._frame - blockStart);
      this.renderSpan(s, e, outL, outR, sympIn, blockStart);
      s = e;
    }

    // Sympathetic open strings, fed by everything that was played.
    const sg = this.g.symp;
    if (sg > 0.001) {
      for (let k = 0; k < this.symp.length; k++) {
        const st = this.symp[k];
        const f = (this.g.sympFreqs[k] || st.f) * Math.pow(2, this.g.bend / 12);
        const d = fs / f - 0.5;
        const buf = st.buf;
        const fb = Math.pow(10, -3 / (2.5 * f));   // open strings ring for ~2.5 s
        for (let i = 0; i < n; i++) {
          const y = Voice.read(buf, st.w, d);
          st.lp = st.lp * 0.35 + y * 0.65;
          const v = sympIn[i] * 0.012 + st.lp * fb;
          buf[st.w] = v; st.w = (st.w + 1) & DL_MASK;
          const o = y * sg * 0.5;
          outL[i] += o; if (outR !== outL) outR[i] += o;
        }
      }
    }

    // DC blocker on the mix.
    const dc = this.dc;
    for (let i = 0; i < n; i++) {
      const xl = outL[i]; const yl = xl - dc.x1L + 0.995 * dc.y1L; dc.x1L = xl; dc.y1L = yl; outL[i] = yl;
      if (outR !== outL) { const xr = outR[i]; const yr = xr - dc.x1R + 0.995 * dc.y1R; dc.x1R = xr; dc.y1R = yr; outR[i] = yr; }
    }

    // Report voice levels ~40 times a second for the visuals.
    if (++this.levelTick >= 8) {
      this.levelTick = 0;
      const lv = [];
      for (const v of this.voices) if (v.active) lv.push(v.id, v.level, Math.exp(v.logF));
      this.port.postMessage({ type: "levels", v: lv, t: currentTime });
    }
    return true;
  }

  renderSpan(s, e, outL, outR, sympIn, blockStart) {
    const fs = this.fs;
    const len = e - s;
    const g = this.g;
    for (const v of this.voices) {
      if (!v.active) continue;

      // Automatic release for one-shots.
      if (!v.releasing && v.releaseAt >= 0 && blockStart + s >= v.releaseAt) this.beginRelease(v);

      // Per-span control: glide, vibrato, bow position → target loop length.
      v.logF += (v.logTarget - v.logF) * (v.glideCoef * len / BLOCK);
      const ageSec = v.age / fs;
      const vibOn = clamp((ageSec - v.vibDelay) / 0.35, 0, 1);
      v.vibPhase += TWO_PI * v.vibRate * v.vibDrift * len / fs;
      if (v.vibPhase > TWO_PI) v.vibPhase -= TWO_PI;
      const cents = (v.vibDepth * vibOn + g.vibExtra) * Math.sin(v.vibPhase);
      const saveLog = v.logF;
      v.logF = saveLog + cents * Math.LN2 / 1200;
      const Lt = this.updateLength(v, 0);
      v.logF = saveLog;
      const L0 = v.L, dL = (Lt - L0) / len;
      const kb = Math.min(1, 0.02 * len / BLOCK * 8);
      // High notes won't speak right at the bridge: keep a minimum distance.
      const fNow = Math.exp(v.logF);
      const betaMin = clamp(0.065 + (fNow - 500) * 0.00005, 0.065, 0.09);
      v.beta += (clamp(v.betaTarget * Math.pow(2, -g.betaMod), betaMin, 0.3) - v.beta) * kb;
      v.pressure += (v.pressureTarget - v.pressure) * kb;
      // Bow force scales with bow speed (Schelleng): the friction curve's
      // width tracks the bow's speed so a given "pressure" behaves the same at
      // any dynamic. Pressure then walks the playable window for this bow
      // position, from airy flautando (0) to crunchy, scratchy (1).
      const pr = clamp(v.pressure + g.pressureMod, 0, 1);
      const expr = g.expr;
      const bvAmp = Math.max(0.03, Math.abs(v.bvTarget * expr));
      const sN = g.rawS > 0 ? g.rawS : forceWindow(v.beta, pr);
      const slope = sN / bvAmp;
      const beta = v.beta;
      const pole = v.pole, oneMinusPole = 1 - pole;
      const tremInc = TWO_PI * v.trem / fs;
      const gainL = v.gainL * v.gain, gainR = v.gainR * v.gain;
      const neck = v.neck, bridge = v.bridge;
      let w = v.w, filt = v.filt, bv = v.bv, contact = v.contact, L = L0;
      const loss = v.loss;
      let peak = 0;
      const exc = v.exc;

      for (let i = s; i < e; i++) {
        L += dL;
        const dN = L * (1 - beta), dB = L * beta;
        // Bridge side: reflection filter (lossy, inverting). Nut side: rigid, inverting.
        const bIn = Voice.read(bridge, w, dB);
        filt = loss * oneMinusPole * bIn + pole * filt;
        const bridgeRefl = -filt;
        const nutRefl = -Voice.read(neck, w, dN);
        const stringVel = bridgeRefl + nutRefl;

        let newVel = 0;
        if (contact > 0.0005) {
          // Bow envelope (+ tremolo reversals + a little rosin noise).
          const target = v.bvTarget * expr;
          bv += (target - bv) * (Math.abs(target) > Math.abs(bv) ? v.bvCoefUp : (v.releasing ? v.bvCoefDown : v.bvCoefUp));
          let bow = bv;
          if (v.trem > 0) { v.tremPhase += tremInc; bow *= Math.tanh(2.6 * Math.sin(v.tremPhase)); }
          bow *= 1 + v.rosin * this.noise();
          const dv = bow - stringVel;
          // Friction curve: sticks near zero relative velocity, slips beyond.
          let t = Math.abs(dv * slope) + 0.75; t *= t; let fr = 1 / (t * t);
          if (fr > 0.98) fr = 0.98; else if (fr < 0.01) fr = 0.01;
          newVel = dv * fr * contact;
        }
        contact += (v.contactTarget - contact) * v.contactCoef;

        // Plucks and strikes: inject the excitation pulse at the junction.
        if (exc && v.excPos < exc.length) { newVel += exc[v.excPos++] * v.excGain; }

        neck[w] = bridgeRefl + newVel;
        bridge[w] = nutRefl + newVel;
        w = (w + 1) & DL_MASK;

        const o = bIn * 0.9;
        outL[i] += o * gainL;
        outR[i] += o * gainR;
        sympIn[i] += o;
        const a = o < 0 ? -o : o; if (a > peak) peak = a;
      }
      v.w = w; v.filt = filt; v.bv = bv; v.contact = contact; v.L = L;
      v.age += len;
      v.level = v.level * 0.9 + peak * 0.1;

      // Free the voice once it has died away (or after a hard ceiling).
      if (v.releasing && contact < 0.01) {
        if (peak < 2e-4) v.quietRun += len; else v.quietRun = 0;
        if (v.quietRun > 2048 || v.age > fs * 30) {
          v.active = false;
          this.port.postMessage({ type: "ended", id: v.id });
        }
      } else if (!v.endless && v.age > fs * 600) {
        this.beginRelease(v, 0.3);
      }
    }
  }
}

registerProcessor("chungus-cello", ChungusCello);

// ---------------------------------------------------------------------------
// Sample-accurate capture for the looper and the WAV recorder.
//   {cmd:"begin", id, start}          start capturing at audio time `start` (s)
//   {cmd:"end", id, end}              stop at audio time `end` → {type:"captured", id, start, ch:[L,R]}
//   {cmd:"cancel", id}
// `start`/`end` may be in the past or future; capture begins when the block
// containing `start` is processed (past starts begin immediately).
class ChungusRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.jobs = new Map();
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === "begin") {
        this.jobs.set(m.id, { start: Math.round(m.start * sampleRate), end: Infinity, chunksL: [], chunksR: [], first: -1, n: 0 });
      } else if (m.cmd === "end") {
        const j = this.jobs.get(m.id); if (j) j.end = Math.round(m.end * sampleRate);
      } else if (m.cmd === "cancel") {
        this.jobs.delete(m.id);
      }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0];
    const L = inp && inp[0] ? inp[0] : null;
    const R = inp && inp[1] ? inp[1] : L;
    const n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
    const f0 = currentFrame;
    for (const [id, j] of this.jobs) {
      const a = Math.max(f0, j.start), b = Math.min(f0 + n, j.end);
      if (b > a) {
        if (j.first < 0) j.first = a;
        const cl = new Float32Array(b - a), cr = new Float32Array(b - a);
        for (let i = a; i < b; i++) { cl[i - a] = L ? L[i - f0] : 0; cr[i - a] = R ? R[i - f0] : 0; }
        j.chunksL.push(cl); j.chunksR.push(cr); j.n += b - a;
      }
      if (f0 + n >= j.end) {
        const outL = new Float32Array(j.n), outR = new Float32Array(j.n);
        let o = 0;
        for (let k = 0; k < j.chunksL.length; k++) { outL.set(j.chunksL[k], o); outR.set(j.chunksR[k], o); o += j.chunksL[k].length; }
        this.port.postMessage({ type: "captured", id, start: (j.first < 0 ? j.start : j.first) / sampleRate, ch: [outL, outR] }, [outL.buffer, outR.buffer]);
        this.jobs.delete(id);
      } else if (j.n > sampleRate * 600) {
        // ten-minute ceiling so a forgotten recording can't eat all memory
        j.end = f0 + n;
      }
    }
    return true;
  }
}

registerProcessor("chungus-recorder", ChungusRecorder);

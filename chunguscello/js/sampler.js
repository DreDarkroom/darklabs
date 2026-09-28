// The Chungus Sampler — the MeowSynth idea, grown up. Give it any sound (sing,
// hum, "chug" into the mic, drop in a file, or borrow a MeowSynth meow) and it:
//   1. trims the silence and normalises it,
//   2. finds its pitch,
//   3. finds a seamless sustain loop and crossfades it,
// then plays it chromatically through the same articulations, amp and effects
// as the string model — or layered with it.

import { clamp, ftom, mtof } from "./theory.js";
import { dominantPitch } from "./pitch.js";
import { kvGet, kvSet, kvDel } from "./store.js";

const SUSTAINED = new Set(["arco", "tremolo", "harmonic", "ponti", "tasto"]);
export const NUM_SLOTS = 4;

// Sounds borrowed from other Darklabs instruments (same site, same origin).
export const BORROW = [
  { id: "meow-classic", name: "MeowSynth — Classic Mew", url: "../samples/classic.mp3" },
  { id: "meow-swell", name: "MeowSynth — Rising Meow", url: "../samples/swell.mp3" },
  { id: "meow-yowl", name: "MeowSynth — Yowl", url: "../samples/yowl.mp3" },
  { id: "hum", name: "ThroatTapper — tonal hum", url: "../throattapper/assets/audio/tonal-hum.wav" },
];

export class Sampler {
  constructor(engine) {
    this.engine = engine;
    this.slots = new Array(NUM_SLOTS).fill(null);
    this.active = 0;
    this.live = new Set();
  }

  hasSample() { return !!this.slots[this.active]; }
  slot(i = this.active) { return this.slots[i]; }

  /** Analyse a mono Float32Array and install it in a slot. */
  async install(i, data, sr, name, meta = {}) {
    const ctx = this.engine.ctx;
    // 1. trim + normalise
    let pk = 0; for (let k = 0; k < data.length; k++) pk = Math.max(pk, Math.abs(data[k]));
    if (pk < 1e-4) throw new Error("That recording is silent — check the mic.");
    const th = pk * 0.02;
    let a = 0, b = data.length - 1;
    while (a < b && Math.abs(data[a]) < th) a++;
    while (b > a && Math.abs(data[b]) < th) b--;
    a = Math.max(0, a - Math.floor(sr * 0.005));
    b = Math.min(data.length, b + Math.floor(sr * 0.05));
    let d = data.slice(a, Math.min(b, a + sr * 8));
    const g = 0.9 / pk;
    for (let k = 0; k < d.length; k++) d[k] *= g;
    // short fades so the edges never click
    const fin = Math.min(d.length >> 2, Math.floor(sr * 0.003)), fout = Math.min(d.length >> 2, Math.floor(sr * 0.02));
    for (let k = 0; k < fin; k++) d[k] *= k / fin;
    for (let k = 0; k < fout; k++) d[d.length - 1 - k] *= k / fout;

    // 2. pitch
    const f0 = meta.rootHz || dominantPitch(d, sr);
    const pitched = f0 > 0;
    const root = pitched ? ftom(f0) : 60;

    // 3. loop
    let loopStart = 0, loopEnd = 0;
    const dur = d.length / sr;
    if (dur > 0.35) {
      const period = pitched ? sr / f0 : sr * 0.01;
      const s0 = Math.floor(d.length * 0.35);
      const want = Math.max(period, Math.round(Math.min(0.3, dur * 0.35) * sr / period) * period);
      const zc = (from) => { for (let k = from; k < d.length - 1; k++) if (d[k] <= 0 && d[k + 1] > 0) return k; return from; };
      const st = zc(s0);
      // search around the ideal end for the best-matching zero crossing
      let best = -Infinity, bestE = Math.floor(st + want);
      const W = Math.min(512, Math.floor(period * 2));
      for (let e = Math.floor(st + want - period); e <= st + want + period && e + W < d.length; e++) {
        if (!(d[e] <= 0 && d[e + 1] > 0)) continue;
        let c = 0, n1 = 0, n2 = 0;
        for (let k = 0; k < W; k++) { c += d[st + k] * d[e + k]; n1 += d[st + k] ** 2; n2 += d[e + k] ** 2; }
        const r = c / Math.sqrt(n1 * n2 + 1e-12);
        if (r > best) { best = r; bestE = e; }
      }
      if (bestE > st + period && bestE < d.length - 2) {
        // crossfade the loop tail into the material just before the loop start
        const xf = Math.min(Math.floor((bestE - st) / 3), Math.floor(sr * 0.04), st);
        const out = d.slice();
        for (let k = 0; k < xf; k++) {
          const t = k / xf;                  // 0 → 1 across the fade
          const iEnd = bestE - xf + k, iPre = st - xf + k;
          out[iEnd] = d[iEnd] * Math.cos(t * Math.PI / 2) + d[iPre] * Math.sin(t * Math.PI / 2);
        }
        d = out;
        loopStart = st / sr; loopEnd = bestE / sr;
      }
    }

    const buffer = ctx.createBuffer(1, d.length, sr);
    buffer.copyToChannel(d, 0);
    this.slots[i] = { name: name || "Chungus", buffer, root, pitched, loopStart, loopEnd, sr };
    await kvSet("slot" + i, { name: this.slots[i].name, root, pitched, loopStart, loopEnd, sr, data: d });
    this.engine.emit("sampler", { slot: i });
    return this.slots[i];
  }

  async fromArrayBuffer(i, arr, name, meta) {
    const ctx = this.engine.ctx;
    const ab = await ctx.decodeAudioData(arr.slice(0));
    const mono = new Float32Array(ab.length);
    for (let c = 0; c < ab.numberOfChannels; c++) { const ch = ab.getChannelData(c); for (let k = 0; k < mono.length; k++) mono[k] += ch[k] / ab.numberOfChannels; }
    return this.install(i, mono, ab.sampleRate, name, meta);
  }

  async borrow(i, id) {
    const b = BORROW.find((x) => x.id === id);
    if (!b) return null;
    const r = await fetch(new URL(b.url, document.baseURI));
    if (!r.ok) throw new Error(`Couldn't fetch ${b.name}`);
    return this.fromArrayBuffer(i, await r.arrayBuffer(), b.name);
  }

  async restore() {
    const ctx = this.engine.ctx;
    for (let i = 0; i < NUM_SLOTS; i++) {
      const s = await kvGet("slot" + i);
      if (!s || !s.data) continue;
      const buffer = ctx.createBuffer(1, s.data.length, s.sr || ctx.sampleRate);
      buffer.copyToChannel(s.data instanceof Float32Array ? s.data : new Float32Array(s.data), 0);
      this.slots[i] = { name: s.name, buffer, root: s.root, pitched: s.pitched, loopStart: s.loopStart, loopEnd: s.loopEnd, sr: s.sr };
    }
    this.engine.emit("sampler", {});
  }

  async clear(i) { this.slots[i] = null; await kvDel("slot" + i); this.engine.emit("sampler", { slot: i }); }

  setRoot(i, midi) {
    const s = this.slots[i]; if (!s) return;
    s.root = midi;
    kvGet("slot" + i).then((o) => { if (o) { o.root = midi; kvSet("slot" + i, o); } });
  }

  /** Play a note; returns a voice {stop, setPitch, setGain}. */
  play(midi, vel, art, time, opts = {}) {
    const s = this.slots[this.active];
    if (!s) return null;
    const ctx = this.engine.ctx;
    const t = Math.max(ctx.currentTime, time || 0);
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    const sustained = SUSTAINED.has(art);
    if (sustained && s.loopEnd > s.loopStart) { src.loop = true; src.loopStart = s.loopStart; src.loopEnd = s.loopEnd; }
    const m = art === "harmonic" ? midi + 12 : midi;
    src.playbackRate.value = clamp(Math.pow(2, (m - s.root) / 12), 0.0625, 16);

    // vibrato into detune, fading in after the delay
    const es = this.engine.s;
    let lfo = null;
    const vib = this.engine.vibFor(art);
    if (vib > 0 && sustained) {
      lfo = ctx.createOscillator(); lfo.frequency.value = es.vibRate;
      const depth = ctx.createGain(); depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(0, t + es.vibDelay); depth.gain.linearRampToValueAtTime(vib, t + es.vibDelay + 0.35);
      lfo.connect(depth).connect(src.detune); lfo.start(t);
    }
    const amp = ctx.createGain();
    const peak = (0.25 + 0.75 * vel) * (opts.gain != null ? opts.gain : 1);
    const atk = art === "arco" || art === "tasto" || art === "harmonic" ? 0.05 * es.attack : 0.004;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + atk);
    // tremolo = amplitude chop
    let trem = null;
    const out = ctx.createGain();
    if (art === "tremolo") {
      trem = ctx.createOscillator(); trem.frequency.value = 11;
      const tg = ctx.createGain(); tg.gain.value = 0.45;
      out.gain.value = 0.55;
      trem.connect(tg).connect(out.gain); trem.start(t);
    }
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = opts.pan || 0;
    src.connect(amp).connect(out).connect(pan).connect(this.engine.samplerBus);
    src.start(t);

    const voice = {
      stopped: false,
      stop: (when, rel) => {
        if (voice.stopped) return;
        voice.stopped = true;
        const w = Math.max(ctx.currentTime, when || 0);
        const r = Math.max(0.01, rel != null ? rel : (opts.release != null ? opts.release : 0.2));
        amp.gain.cancelScheduledValues(w);
        amp.gain.setValueAtTime(amp.gain.value, w);
        amp.gain.setTargetAtTime(0, w, r / 3);
        const end = w + r * 2 + 0.05;
        try { src.stop(end); } catch (e) { /* */ }
        if (lfo) lfo.stop(end); if (trem) trem.stop(end);
        setTimeout(() => this.live.delete(voice), (end - ctx.currentTime) * 1000 + 50);
      },
      setPitch: (mm, glide = 0.012) => {
        const target = clamp(Math.pow(2, (mm - s.root) / 12), 0.0625, 16);
        src.playbackRate.setTargetAtTime(target, ctx.currentTime, Math.max(0.002, glide / 3));
      },
      setGain: (v) => amp.gain.setTargetAtTime((0.25 + 0.75 * v) * (opts.gain != null ? opts.gain : 1), ctx.currentTime, 0.03),
    };
    // one-shots: stop themselves
    if (!sustained) {
      const dur = opts.hold > 0 ? opts.hold : art === "pizz" ? Math.min(s.buffer.duration / src.playbackRate.value, 2.5) : 0.25;
      voice.stop(t + dur, opts.release != null ? opts.release : 0.1);
    }
    src.onended = () => this.live.delete(voice);
    this.live.add(voice);
    return voice;
  }

  stopAll() { for (const v of [...this.live]) v.stop(0, 0.03); }
}

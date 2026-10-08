/* Groove engine: the lean player behind the home page, the mixing desk and MixingMagic.

   The signal path is deliberately short:
     hit -> one BufferSource -> one gain -> a layer bus (drums / bass / cello / meow) -> headroom -> limiter -> volume -> speakers
   No saturator, no reverb, no per-hit filters. Sounds are pre-rendered (see bank.js).
   Steps are scheduled a little ahead of the audio clock (a look-ahead), never "when the timer fires", so a slow frame cannot make a note late.
   A voice budget drops the least important hits (ghost notes, extra hats, meows) if the machine is ever overloaded, and keeps the beat.
   The scene (visuals) reads the same hits from a queue stamped in audio time, so what you see lands with what you hear. */
import { barPlan, tempoAt, clamp, CORE, MEOW_PITCHES } from './arrange.js';
import { renderDrums, renderBass, renderCello, loadMeows, mtof } from './bank.js';

export const LAYERS = ['drums', 'bass', 'cello', 'meow'];
/** MixingMagic adds two more: the monkey recordings and the PenrosePulse melody. */
export const ALL_LAYERS = [...LAYERS, 'monkey', 'melody'];
const LAYER_OF = (i) => (i === 'bass' || i === 'cello' || i === 'meow' || i === 'monkey' || i === 'melody' ? i : 'drums');
/** Level of each layer, and of each drum relative to the others. Chosen so the sum stays under the limiter's threshold. */
export const LAYER_GAIN = { drums: 0.85, bass: 0.85, cello: 0.5, meow: 0.42, monkey: 0.7, melody: 0.55 };
export const TRIM = { kick: 1, snare: 0.85, ghost: 1.1, hatC: 1.25, hatC2: 1.05, hatO: 1.1, hatP: 1, tomH: 0.8, tomL: 0.85, tomF: 0.9, ride: 0.85, bell: 0.7, splash: 0.75, china: 0.7, crash: 0.7 };
const CHOKES = new Set(['hatC', 'hatC2', 'hatP']);       // closing the hat stops an open hat ringing
const MAX_VOICES = 28;

/** The shared graph. Works on a live or an offline context. */
export function buildGraph(ctx, layers = LAYERS) {
  const comp = ctx.createDynamicsCompressor();             // a gentle safety limiter: it should almost never act
  comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 14; comp.attack.value = 0.003; comp.release.value = 0.16;
  const vol = ctx.createGain(); vol.gain.value = 0.8;
  const head = ctx.createGain(); head.gain.value = 0.62;
  head.connect(comp); comp.connect(vol); vol.connect(ctx.destination);
  const buses = {};
  for (const l of layers) { const g = ctx.createGain(); g.gain.value = LAYER_GAIN[l]; g.connect(head); buses[l] = g; }
  return { ctx, buses, vol, head, comp };
}

/** Steps through the arrangement, scheduling each hit on the audio clock. Shared by live play and offline renders. */
export class Sequencer {
  constructor(ctx, graph, bank, o = {}) {
    Object.assign(this, { ctx, graph, bank, seed: o.seed || 1, onHit: o.onHit || null, humanize: o.humanize !== false });
    this.bar = o.startBar || 0; this.step = 0; this.next = o.startTime || 0; this.plan = null;
    this.p = o.p || 0; this.maxVoices = o.maxVoices || MAX_VOICES; this.live = 0; this.dropped = 0; this.open = null; this.muted = new Set(); this.mutedInst = new Set(); this.solo = null; this.tempo = 0;
    this.rand = (() => { let a = 99; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  }
  get bpm() { return this.tempo || tempoAt(this.p); }          // the desk can pin the tempo; otherwise it follows the page
  audible(layer) { return this.solo ? this.solo === layer : !this.muted.has(layer); }

  /** Schedule every step that starts before `until` (audio time). */
  run(until, targetP = this.p, maxRate = 0.04) {
    while (this.next < until) {
      const stepDur = 60 / this.bpm / 4;
      const dp = clamp(targetP - this.p, -maxRate * stepDur * 4, maxRate * stepDur * 4);   // the page position is followed gradually, never in one jump
      this.p += dp;
      if (this.step === 0) this.plan = this.planFor(this.bar);
      const at = this.next + this.offset(this.step, stepDur);
      for (const e of this.eventsAt(this.step)) this.hit(e, at);
      this.next += stepDur;
      if (++this.step === 16) { this.step = 0; this.bar++; }
    }
  }

  /* Overridden by MixingMagic, which plays the pattern you drew instead of the page's arrangement. */
  planFor(bar) { return barPlan(this.p, bar, this.seed); }
  eventsAt(step) { return this.plan.filter((e) => e.s === step); }
  offset() { return 0; }

  hit(e, t) {
    const layer = LAYER_OF(e.i);
    if (!this.audible(layer) || this.mutedInst.has(e.i)) return;
    if (!CORE.has(e.i) && this.live >= this.maxVoices) { this.dropped++; return; }
    const jitter = this.humanize && !CORE.has(e.i) ? (this.rand() - 0.5) * 0.008 : 0;       // a drummer is never perfectly on the grid
    const when = Math.max(this.ctx.currentTime, t + jitter);
    const vel = clamp(e.v * (this.humanize ? 0.94 + this.rand() * 0.1 : 1), 0.05, 1);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    let buf = null, rate = 1, gain = vel;
    if (layer === 'drums') { buf = this.bank.drums && this.bank.drums[e.i]; gain *= TRIM[e.i] || 0.6; }
    else if (layer === 'bass') buf = this.bank.bass && this.bank.bass[e.n];
    else if (layer === 'cello') buf = this.bank.cello && this.bank.cello[e.n];
    else if (layer === 'monkey') buf = this.bank.monkey && this.bank.monkey[e.n];
    else if (layer === 'melody') buf = this.bank.melody && this.bank.melody[e.n];
    else { const m = this.bank.meow && this.bank.meow[e.v > 0.55 ? 'chirp' : 'classic'] || (this.bank.meow && Object.values(this.bank.meow)[0]); if (m) { buf = m.buf; rate = clamp(mtof(e.n) / m.hz, 0.5, 2); } }
    if (!buf) return;
    src.buffer = buf; src.playbackRate.value = rate;
    g.gain.value = gain;
    if (layer === 'cello') { g.gain.setValueAtTime(gain, when + 1.9 * (60 / this.bpm) * 0.5); g.gain.linearRampToValueAtTime(0, when + Math.min(2.6, 3.6 * (60 / this.bpm))); }
    src.connect(g); g.connect(this.graph.buses[layer]);
    if (e.i === 'hatO') this.open = g;
    else if (CHOKES.has(e.i) && this.open) { try { this.open.gain.setTargetAtTime(0, when, 0.006); } catch (err) { /* already gone */ } this.open = null; }
    src.start(when);
    this.live++;
    src.onended = () => { this.live--; src.disconnect(); g.disconnect(); };
    if (this.onHit) this.onHit({ t: when, i: e.i, v: vel, n: e.n, bar: this.bar, step: this.step });
  }
}

/** The live player. Needs a user gesture to start (browsers insist). */
export class Groove {
  constructor(o = {}) {
    this.base = o.base || new URL('./', import.meta.url);
    this.samples = o.samples || new URL('../../samples/', import.meta.url);
    this.seed = o.seed || 1;
    this.target = 0; this.queue = []; this.timer = 0; this.ctx = null; this.bank = {}; this.ready = false; this.playing = false;
    this.volume = clamp(o.volume == null ? 0.8 : o.volume, 0, 1);
    this.layerLevel = Object.assign({}, LAYER_GAIN);
    this.listeners = new Set();
    this._vis = () => this.onVisibility();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const f of this.listeners) { try { f(type, data); } catch (e) { /* a listener must not stop the music */ } } }

  async start() {
    if (this.playing) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'playback' });                       // bigger buffers: far less chance of crackle than the default
      this.graph = buildGraph(this.ctx);
      this.setVolume(this.volume, true);
      this.seq = new Sequencer(this.ctx, this.graph, this.bank, { seed: this.seed, onHit: (h) => { this.queue.push(h); if (this.queue.length > 200) this.queue.shift(); } });
      document.addEventListener('visibilitychange', this._vis);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.emit('loading', 'drums');
    const sr = this.ctx.sampleRate;
    if (!this.bank.drums) this.bank.drums = await renderDrums(sr);
    this.seq.p = this.target;
    this.seq.next = this.ctx.currentTime + 0.15;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), 25);
    this.emit('start');
    this.prepare();
  }

  /** The rest of the band is rendered a little before it is needed, in the background. */
  async prepare() {
    const sr = this.ctx.sampleRate, u = (f) => new URL(f, this.base).href;
    const jobs = [];
    if (!this.bank.bass && !this._b) jobs.push(this._b = renderBass(sr, u('worklets/bass-worklet.js')).then((b) => { this.bank.bass = b; }).catch(() => { this.emit('missing', 'bass'); }));
    if (!this.bank.meow && !this._m) jobs.push(this._m = loadMeows(this.ctx, this.samples).then((m) => { this.bank.meow = m; }).catch(() => {}));
    await Promise.all(jobs);
    if (!this.bank.cello && !this._c) await (this._c = renderCello(sr, u('worklets/cello-worklet.js')).then((b) => { this.bank.cello = b; }).catch(() => { this.emit('missing', 'cello'); }));
    this.ready = true; this.emit('ready');
  }

  tick() {
    if (!this.playing || !this.ctx) return;
    const behind = this.seq.next < this.ctx.currentTime - 0.05;           // a stall (a long frame): skip ahead rather than play a burst of late notes
    if (behind) this.seq.next = this.ctx.currentTime + 0.05;
    this.seq.run(this.ctx.currentTime + 0.22, this.target);
  }

  stop() {
    if (!this.playing) return;
    clearInterval(this.timer); this.playing = false;
    if (this.graph) this.graph.vol.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    setTimeout(() => { if (!this.playing && this.ctx) this.ctx.suspend(); }, 250);
    this.emit('stop');
  }
  async resume() { if (this.playing) return; await this.start(); this.graph.vol.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04); }

  onVisibility() {                                                          // timers slow down in hidden tabs, so rest rather than stutter
    if (!this.ctx || !this.playing) return;
    if (document.hidden) { clearInterval(this.timer); this.ctx.suspend(); }
    else { this.ctx.resume().then(() => { this.seq.next = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.tick(), 25); }); }
  }

  setProgress(p) { this.target = clamp(p, 0, 1); }
  /* the slider is squared so it feels even to the ear */
  setVolume(v, now) { this.volume = clamp(v, 0, 1); if (this.graph) this.graph.vol.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, now ? 0.001 : 0.03); this.emit('volume', this.volume); }
  setLayer(layer, level) { this.layerLevel[layer] = level; if (this.graph) this.graph.buses[layer].gain.setTargetAtTime(level, this.ctx.currentTime, 0.03); }
  setTempo(bpm) { if (this.seq) this.seq.tempo = bpm ? clamp(bpm, 60, 200) : 0; }
  muteInst(ids, on) { for (const i of ids) { if (on) this.seq.mutedInst.add(i); else this.seq.mutedInst.delete(i); } }
  solo(layer) { if (this.seq) this.seq.solo = layer || null; }
  /** One meow at (about) this MIDI note, snapped to the A minor pentatonic: the little note a hovered card plays. */
  ping(midi, vel = 0.5) {
    if (!this.playing || !this.bank.meow) return;
    const n = MEOW_PITCHES.reduce((b, m) => (Math.abs(m - midi) < Math.abs(b - midi) ? m : b), MEOW_PITCHES[0]);
    this.seq.hit({ s: 0, i: 'meow', v: vel, n }, this.ctx.currentTime + 0.01);
  }
  mute(layer, on) { if (on) this.seq.muted.add(layer); else this.seq.muted.delete(layer); }
  get state() { return { p: this.seq ? this.seq.p : 0, bpm: this.seq ? this.seq.bpm : tempoAt(0), bar: this.seq ? this.seq.bar : 0, step: this.seq ? this.seq.step : 0, live: this.seq ? this.seq.live : 0, dropped: this.seq ? this.seq.dropped : 0 }; }

  /** Hits that are now audible (taking the output delay into account), for the scene to draw. Also the ones about to happen, for the swing. */
  hits(ahead = 0.2) {
    if (!this.ctx) return { due: [], soon: [] };
    const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0, now = this.ctx.currentTime - lat, due = [], soon = [];
    const keep = [];
    for (const h of this.queue) { if (h.t <= now) due.push(h); else { keep.push(h); if (h.t - now <= ahead) soon.push(h); } }
    this.queue = keep;
    return { due, soon, now };
  }
}

/* ---------- offline: the same engine into a buffer, so the sound can be measured (and exported) ---------- */
export async function renderOffline({ seconds = 20, p = 0.5, seed = 1, sr = 44100, base, samples, startBar = 0, withBand = true, onHit } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const graph = buildGraph(ctx);
  const u = (f) => new URL(f, base).href;
  const bank = { drums: await renderDrums(sr) };
  if (withBand) {
    try { bank.bass = await renderBass(sr, u('worklets/bass-worklet.js')); } catch (e) { bank.bassError = String(e); }
    try { bank.cello = await renderCello(sr, u('worklets/cello-worklet.js')); } catch (e) { bank.celloError = String(e); }
    try { bank.meow = await loadMeows(ctx, samples); } catch (e) { bank.meowError = String(e); }
  }
  const seq = new Sequencer(ctx, graph, bank, { seed, p, startBar, humanize: true, onHit, maxVoices: Infinity });   // an offline render has no real-time limit to protect
  seq.run(seconds, p, 1);
  const buf = await ctx.startRendering();
  return { buf, bank, dropped: seq.dropped, bars: seq.bar, bpm: seq.bpm };
}

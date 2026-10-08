/* MixingMagic's player: the groove engine, playing the grid you drew instead of the page's arrangement.
   Same lean path as the home page: every sound is rendered once into a buffer, a hit is one buffer and one gain, and a look-ahead
   scheduler keeps time on the audio clock. The monkey recordings and the PenrosePulse piano are loaded the first time they are needed. */
import { buildGraph, Sequencer, ALL_LAYERS, LAYER_GAIN } from '../kit/groove/engine.js';
import { renderDrums, renderBass, renderCello, loadMeows, finish } from '../kit/groove/bank.js';
import { bakePiano } from '../kit/dsp.js';
import { eventsAt, MELODY_NOTES, TRACKS, encodeWav } from './logic.js';

class PatternSequencer extends Sequencer {
  constructor(ctx, graph, bank, o) { super(ctx, graph, bank, o); this.pattern = o.pattern; this.swing = o.swing || 0; this.tempo = o.bpm || 120; }
  planFor() { return []; }
  eventsAt(step) { return eventsAt(this.pattern, (this.bar % 2) * 16 + step); }
  offset(step, stepDur) { return step % 2 ? this.swing * stepDur : 0; }          // swing 0..0.5: every second sixteenth is played that fraction of a step late
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export class Magic {
  constructor({ pattern, bpm = 120, swing = 0, volume = 0.8, onStatus = () => {} }) {
    this.pattern = pattern; this.bpm = bpm; this.swing = swing; this.volume = volume; this.onStatus = onStatus;
    this.base = new URL('../kit/groove/', import.meta.url);
    this.samples = new URL('../samples/', import.meta.url);
    this.monkeyUrl = new URL('../monkeybeat/samples/', import.meta.url);
    this.bank = {}; this.ctx = null; this.playing = false; this.timer = 0; this.loading = {};
  }

  async ensure() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'playback' });
    this.graph = buildGraph(this.ctx, ALL_LAYERS);
    this.setVolume(this.volume, true);
    this.seq = new PatternSequencer(this.ctx, this.graph, this.bank, { pattern: this.pattern, swing: this.swing, bpm: this.bpm, humanize: true });
    this.onStatus('Rendering the drum kit...');
    this.bank.drums = await renderDrums(this.ctx.sampleRate);
    this.load('band'); this.load('melody');
    this.onStatus('Ready. The band and the melody are loading in the background.');
  }

  /** Each group of sounds loads once, the first time it is needed. */
  load(what) {
    if (this.loading[what]) return this.loading[what];
    const sr = this.ctx.sampleRate, u = (f) => new URL(f, this.base).href;
    const jobs = {
      band: async () => {
        await Promise.all([
          renderBass(sr, u('worklets/bass-worklet.js')).then((b) => { this.bank.bass = b; }).catch(() => this.onStatus('The bass could not load in this browser.')),
          loadMeows(this.ctx, this.samples).then((m) => { this.bank.meow = m; }).catch(() => {}),
        ]);
        await renderCello(sr, u('worklets/cello-worklet.js')).then((b) => { this.bank.cello = b; }).catch(() => this.onStatus('The cello could not load in this browser.'));
      },
      melody: async () => {                                                   // PenrosePulse's felt piano, baked a note at a time so the page never freezes
        const m = {};
        for (const n of MELODY_NOTES) {
          const d = bakePiano(n, sr).subarray(0, Math.floor(3.2 * sr));
          finish(d, sr, 0.8, 0.3);
          const b = this.ctx.createBuffer(1, d.length, sr); b.copyToChannel(d, 0); m[n] = b;
          await tick();
        }
        this.bank.melody = m;
      },
      monkey: async () => {
        this.onStatus('Loading the monkeys (about 0.7 MB)...');
        const m = {};
        await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (k, i) => {
          const name = ['pad1_kick', 'pad2_snare', 'pad3_clap', 'pad4_chat', 'pad5_ohat', 'pad6_tomhi', 'pad7_tomlo', 'pad8_rim'][i];
          try { const r = await fetch(new URL(`${name}.wav`, this.monkeyUrl)); if (r.ok) m[i] = await this.ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* that pad stays silent */ }
        }));
        this.bank.monkey = m; this.onStatus('The monkeys are ready.');
      },
    };
    return (this.loading[what] = jobs[what]());
  }

  async play() {
    await this.ensure();
    if (this.playing) return;
    this.seq.bar = 0; this.seq.step = 0; this.seq.next = this.ctx.currentTime + 0.12;
    this.playing = true;
    this.timer = setInterval(() => { if (this.seq.next < this.ctx.currentTime - 0.05) this.seq.next = this.ctx.currentTime + 0.05; this.seq.run(this.ctx.currentTime + 0.22); }, 25);
  }
  stop() { clearInterval(this.timer); this.playing = false; if (this.ctx) this.ctx.suspend(); }
  dispose() { this.stop(); if (this.ctx) this.ctx.close(); this.ctx = null; }

  get step() { return this.seq ? this.seq.step : 0; }
  get bar() { return this.seq ? this.seq.bar : 0; }
  setBpm(b) { this.bpm = b; if (this.seq) this.seq.tempo = b; }
  setSwing(s) { this.swing = s; if (this.seq) this.seq.swing = s; }
  setVolume(v, now) { this.volume = v; if (this.graph) this.graph.vol.gain.setTargetAtTime(v * v, this.ctx.currentTime, now ? 0.001 : 0.03); }
  setLevel(layer, v) { if (this.graph) this.graph.buses[layer].gain.setTargetAtTime(LAYER_GAIN[layer] * v, this.ctx.currentTime, 0.03); }
  mute(layer, on) { if (this.seq) { if (on) this.seq.muted.add(layer); else this.seq.muted.delete(layer); } }
  solo(layer) { if (this.seq) this.seq.solo = layer; }
  /** A single hit, to hear a cell as you draw it. */
  async preview(ev) { await this.ensure(); if (ev.i === 'monkey') this.load('monkey'); this.seq.hit(ev, this.ctx.currentTime + 0.01); }

  /** Render the loop `loops` times into a WAV. Uses the buffers already loaded; the pattern is played exactly (no humanising). */
  async exportWav(loops = 2) {
    await this.ensure(); await Promise.all([this.load('band'), this.load('melody'), this.bank.monkey || !hasMonkey(this.pattern) ? null : this.load('monkey')]);
    const sr = this.ctx.sampleRate, seconds = (60 / this.bpm / 4) * 32 * loops + 2.5;
    const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr), graph = buildGraph(off, ALL_LAYERS);
    for (const l of ALL_LAYERS) graph.buses[l].gain.value = this.graph.buses[l].gain.value;
    const seq = new PatternSequencer(off, graph, this.bank, { pattern: this.pattern, swing: this.swing, bpm: this.bpm, humanize: false, maxVoices: Infinity });
    seq.muted = new Set(this.seq.muted); seq.solo = this.seq.solo;
    seq.run((60 / this.bpm / 4) * 32 * loops);
    const buf = await off.startRendering();
    return encodeWav([buf.getChannelData(0), buf.getChannelData(1)], sr);
  }
}

const hasMonkey = (p) => Object.values(p.monkey).some((r) => r.some(Boolean));
export { TRACKS };

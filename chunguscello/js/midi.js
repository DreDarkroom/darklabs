// Web MIDI: play ChungusCello from a keyboard, an MPE controller, a wind
// controller or a pedal, and send what you play out to other gear.
//
//  note on/off ............ notes (velocity → bow speed)
//  pitch bend ............. ±range (per channel in MPE mode = per-note slides)
//  CC1 mod wheel .......... extra vibrato
//  CC2 breath / CC11 expr . dynamics (bow speed, live)
//  CC74 (MPE timbre) ...... bow position (tasto ↔ ponticello)
//  channel/poly pressure .. bow pressure
//  CC64 sustain ........... hold notes
//  program change ......... preset

import { clamp } from "./theory.js";

export class Midi {
  constructor(engine, { onProgram, onStatus } = {}) {
    this.engine = engine;
    this.access = null;
    this.inId = "";
    this.outId = "";
    this.mpe = false;
    this.bendRange = 2;
    this.sustain = false;
    this.sustained = new Set();
    this.chBend = new Array(16).fill(0);
    this.onProgram = onProgram || (() => {});
    this.onStatus = onStatus || (() => {});
    this.listeners = [];
    engine.on("noteon", (e) => this.echo(e, true));
    engine.on("noteoff", (e) => this.echo(e, false));
  }
  get supported() { return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator; }
  onPorts(fn) { this.listeners.push(fn); }

  async enable() {
    if (!this.supported) throw new Error("Web MIDI isn't available in this browser (try Chrome, Edge or Opera on desktop/Android).");
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.bind();
    this.bind();
    return true;
  }

  inputs() { return this.access ? [...this.access.inputs.values()] : []; }
  outputs() { return this.access ? [...this.access.outputs.values()] : []; }

  bind() {
    for (const i of this.inputs()) i.onmidimessage = (!this.inId || i.id === this.inId) ? (e) => this.onMessage(e.data) : null;
    for (const f of this.listeners) f(this);
  }
  setInput(id) { this.inId = id; this.bind(); }
  setOutput(id) { this.outId = id; }

  key(ch, note) { return `midi:${ch}:${note}`; }

  onMessage(d) {
    const e = this.engine;
    const st = d[0] & 0xf0, ch = d[0] & 0x0f;
    if (st === 0x90 && d[2] > 0) {
      const bend = this.mpe ? this.chBend[ch] : 0;
      e.noteOn(this.key(ch, d[1]), d[1] + bend, d[2] / 127, { fromMidi: true });
      this.sustained.delete(this.key(ch, d[1]));
      this.onStatus(`note ${d[1]} vel ${d[2]}`);
    } else if (st === 0x80 || (st === 0x90 && d[2] === 0)) {
      const k = this.key(ch, d[1]);
      if (this.sustain) this.sustained.add(k); else e.noteOff(k);
    } else if (st === 0xe0) {
      const v = ((d[2] << 7) | d[1]) - 8192;
      const semis = (v / 8192) * this.bendRange;
      if (this.mpe) {
        this.chBend[ch] = semis;
        for (const k of e.heldKeys()) {
          const p = k.split(":");
          if (p[0] === "midi" && +p[1] === ch) e.noteUpdate(k, { midi: +p[2] + semis, glide: 0.005 });
        }
      } else e.post({ type: "global", values: { bend: semis } });
    } else if (st === 0xb0) {
      const v = d[2] / 127;
      switch (d[1]) {
        case 1: e.post({ type: "global", values: { vibExtra: v * 40 } }); break;
        case 2: case 11: e.set("dynamics", v); break;
        case 74:
          if (this.mpe) { for (const k of e.heldKeys()) { const p = k.split(":"); if (p[0] === "midi" && +p[1] === ch) e.noteUpdate(k, { bowPos: v }); } }
          else e.set("bowPos", v);
          break;
        case 64:
          this.sustain = d[2] >= 64;
          if (!this.sustain) { for (const k of this.sustained) e.noteOff(k); this.sustained.clear(); }
          break;
        case 120: case 123: for (const k of e.heldKeys()) if (k.startsWith("midi:")) e.noteOff(k); break;
      }
    } else if (st === 0xd0) {
      const v = d[1] / 127;
      if (this.mpe) { for (const k of e.heldKeys()) { const p = k.split(":"); if (p[0] === "midi" && +p[1] === ch) e.noteUpdate(k, { pressure: clamp(0.3 + v * 0.7, 0, 1) }); } }
      else e.post({ type: "global", values: { pressureMod: v * 0.5 } });
    } else if (st === 0xa0) {
      e.noteUpdate(this.key(ch, d[1]), { pressure: clamp(0.3 + (d[2] / 127) * 0.7, 0, 1) });
    } else if (st === 0xc0) {
      this.onProgram(d[1]);
    }
  }

  echo(ev, on) {
    if (!this.outId || !this.access || String(ev.key).startsWith("midi:")) return;
    const o = this.access.outputs.get(this.outId);
    if (!o) return;
    const n = clamp(Math.round(ev.midi), 0, 127);
    // schedule against the audio clock
    const delay = Math.max(0, (ev.time - this.engine.now) * 1000);
    const t = performance.now() + delay;
    try {
      if (on) o.send([0x90, n, clamp(Math.round((ev.vel || 0.8) * 127), 1, 127)], t);
      else o.send([0x80, n, 64], t);
    } catch (e) { /* port went away */ }
  }
}

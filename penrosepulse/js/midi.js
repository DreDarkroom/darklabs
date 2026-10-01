// Web MIDI input. A progressive enhancement: GlowGrain is fully playable by touch,
// mouse and computer keyboard, and never asks for SysEx.
//
//   note on/off ........ plays the selected instrument (velocity honoured)
//   CC64 sustain ....... the pedal
//   CC1 mod wheel ...... Bloom
//   CC123 / CC120 ...... all notes off
//
// Adapted from chunguscello/js/midi.js (port selection, rebinding on hot-plug).

export class Midi {
  constructor({ onOn, onOff, onPedal, onBloom, onPanic, onPorts, onStatus } = {}) {
    this.cb = { onOn, onOff, onPedal, onBloom, onPanic, onPorts, onStatus };
    this.access = null; this.inId = "";
  }

  get supported() { return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator; }
  inputs() { return this.access ? [...this.access.inputs.values()] : []; }

  async enable() {
    if (!this.supported) throw new Error("This browser has no Web MIDI (Safari and some headset browsers). Touch and keyboard still work.");
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.bind();
    this.bind();
  }

  setInput(id) { this.inId = id; this.bind(); }

  bind() {
    for (const i of this.inputs()) i.onmidimessage = (!this.inId || i.id === this.inId) ? (e) => this.onMessage(e.data) : null;
    if (this.cb.onPorts) this.cb.onPorts(this.inputs().map((i) => ({ id: i.id, name: i.name })));
  }

  onMessage(d) {
    const st = d[0] & 0xf0, c = this.cb;
    if (st === 0x90 && d[2] > 0) c.onOn && c.onOn(d[1], d[2] / 127);
    else if (st === 0x80 || (st === 0x90 && d[2] === 0)) c.onOff && c.onOff(d[1]);
    else if (st === 0xb0) {
      if (d[1] === 64) c.onPedal && c.onPedal(d[2] >= 64);
      else if (d[1] === 1) c.onBloom && c.onBloom(d[2] / 127);
      else if (d[1] === 123 || d[1] === 120) c.onPanic && c.onPanic();
    }
  }
}

// Offline render of a recorded take. The same graph and voice code that plays live
// is built on an OfflineAudioContext and fed the take's note events, so what you
// export is what you played (reverb tail included). No worklets are involved.

import { buildGraph, Voices } from "./engine.js";

const MAX_SECONDS = 600;            // keeps a render within phone memory: ~46 MB of stereo float at 48 kHz

export function takeEnd(events) {
  let end = 0;
  for (const e of events) end = Math.max(end, e.t + (e.dur ?? 0.4) + (e.inst === "perc" ? 0.4 : 0));
  return end;
}

export async function renderTake(engine, events, { tail = 3.5, vowel = "ah" } = {}) {
  const sr = engine.ctx.sampleRate;
  const seconds = Math.min(MAX_SECONDS, takeEnd(events) + tail);
  const length = Math.ceil(seconds * sr);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(2, length, sr);
  const slow = (navigator.hardwareConcurrency || 4) <= 4;
  const g = buildGraph(off, { ...engine.params, bank: engine.bank, irSeconds: slow ? 1.8 : 2.6 });
  g.setVowel(vowel, 0, 0.01);
  const voices = new Voices(off, g, engine.bank, { felt: engine.params.felt });
  for (const e of events) {
    if (e.t > MAX_SECONDS) continue;
    if (e.inst === "perc") voices.perc(e.kind, e.vel, e.t, e.pan || 0, true);
    else voices.playTimed(e.inst, e.midi, e.vel, e.t, e.dur ?? 0.5);
  }
  const buf = await off.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

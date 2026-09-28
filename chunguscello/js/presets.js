// Built-in sounds. Each preset only lists what it changes from DEFAULTS.

import { DEFAULTS } from "./engine.js";

export const PRESETS = [
  { id: "concert", name: "Concert solo", desc: "warm hall, singing vibrato — the classic cello", s: {} },
  { id: "chamber", name: "Chamber quartet", desc: "four players, close room", s: { section: 4, sectionSpread: 7, reverbType: "chamber", reverbMix: 0.25, vibDepth: 14 } },
  { id: "section", name: "Film section", desc: "eight cellos in a big hall, slow swells", s: { section: 8, sectionSpread: 10, reverbType: "hall", reverbMix: 0.38, attack: 2.2, release: 0.6, chorus: 0.2, vibDepth: 12, dynamics: 0.55 } },
  { id: "chungus", name: "Chungus metal", desc: "the amp's on — hold notes to gallop at the tempo", s: { articulation: "chug", drive: 0.7, driveTone: 0.55, doubleStop: "fifth", chugPattern: "gallop", bpm: 140, reverbType: "darkroom", reverbMix: 0.12, eqLow: 3, eqMid: -3, eqHigh: 2, bodyMix: 0.6, tuning: "chungus" } },
  { id: "djent", name: "Djent cello", desc: "tight syncopated chugs, drop tuning", s: { articulation: "chug", drive: 0.85, driveTone: 0.45, doubleStop: "fifth_oct", chugPattern: "djent", bpm: 120, tuning: "chungus", reverbType: "plate", reverbMix: 0.1, eqLow: 4, eqMid: -5, eqHigh: 3, bodyMix: 0.5 } },
  { id: "pizzwalk", name: "Pizzicato jazz", desc: "plucked, round, a little room", s: { articulation: "pizz", bright: 0.35, reverbType: "chamber", reverbMix: 0.2, release: 0.5, bodyMix: 1 } },
  { id: "glass", name: "Glass ponticello", desc: "eerie, whistling, lots of space", s: { articulation: "ponti", reverbType: "church", reverbMix: 0.45, delayMix: 0.25, delayDiv: "3/16", vibDepth: 6, bright: 0.7 } },
  { id: "horror", name: "Tremolo horror", desc: "tremolo section in a cave", s: { articulation: "tremolo", section: 4, reverbType: "cave", reverbMix: 0.45, sectionSpread: 16, vibDepth: 0 } },
  { id: "cathedral", name: "Cathedral drone", desc: "slow, huge, sustained — hold low notes", s: { reverbType: "church", reverbMix: 0.55, attack: 3, release: 1.5, section: 2, vibDepth: 8, bowPos: 0.25, pressure: 0.35, dynamics: 0.5, symp: 0.6 } },
  { id: "baroque", name: "Baroque gut", desc: "A=415, gut strings, little vibrato", s: { a4: 415, body: "baroque", vibDepth: 5, vibDelay: 0.5, bright: 0.4, reverbType: "chamber", reverbMix: 0.28 } },
  { id: "electric", name: "Electric + delay", desc: "silent-cello body, dotted delay, chorus", s: { body: "electric", bodyMix: 0.6, chorus: 0.5, delayMix: 0.35, delayFb: 0.45, delayDiv: "3/16", reverbType: "plate", reverbMix: 0.25, bright: 0.65 } },
  { id: "lofi", name: "Cardboard cello", desc: "played on a box — lo-fi, dry, charming", s: { body: "cardboard", bodyMix: 1, reverbType: "darkroom", reverbMix: 0.15, bright: 0.3, eqHigh: -6, vibDepth: 22, vibRate: 4.4 } },
  { id: "meowcello", name: "MeowCello", desc: "the MeowSynth meow, bowed — borrows the meow for you", s: { source: "both", samplerMix: 0.75, reverbType: "chamber", reverbMix: 0.25 } },
];

/** Full settings object for a preset (defaults + preset changes). */
export function presetSettings(p, keep = {}) {
  const out = { ...DEFAULTS, ...p.s };
  // never reset these from a preset: they're about the room, not the sound
  for (const k of ["volume", "latencyMs", "clickVol", "metronome", "maxVoices"]) if (k in keep) out[k] = keep[k];
  return out;
}

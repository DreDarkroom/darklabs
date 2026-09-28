// Built-in phrases to play, loop and learn from. The classical ones are public
// domain compositions transcribed by hand; the rest are originals written for
// ChungusCello. Notes: [beat, length in beats, MIDI note, articulation?, velocity?]

const S = 0.25; // a sixteenth, in beats

function bach() {
  // J.S. Bach — Cello Suite No. 1 in G, BWV 1007: Prélude, bars 1–4.
  const bars = [
    [43, 50, 59, 57, 59, 50, 59, 50],
    [43, 52, 60, 59, 60, 52, 60, 52],
    [43, 54, 60, 59, 60, 54, 60, 54],
    [43, 55, 59, 57, 59, 55, 59, 55, 43, 55, 59, 57, 59, 55, 59, 54],
  ];
  const out = [];
  bars.forEach((b, i) => {
    const seq = b.length === 8 ? b.concat(b) : b;
    seq.forEach((m, k) => out.push([i * 4 + k * S, S * 0.98, m, "arco", k % 8 === 0 ? 0.8 : 0.62]));
  });
  return out;
}

function pachelbel() {
  // Johann Pachelbel — Canon in D: the ground bass the cellist plays 28 times.
  return [50, 45, 47, 42, 43, 38, 43, 45].map((m, i) => [i, 0.96, m, "arco", 0.7]);
}

function ode() {
  // Beethoven — Symphony No. 9, "Ode to Joy" theme, in D.
  const q = [54, 54, 55, 57, 57, 55, 54, 52, 50, 50, 52, 54];
  const out = [];
  let t = 0;
  const phrase = (endA, endB) => {
    q.forEach((m) => { out.push([t, 0.95, m, "arco", 0.7]); t += 1; });
    out.push([t, 1.45, endA, "arco", 0.75]); t += 1.5;
    out.push([t, 0.45, endB, "arco", 0.6]); t += 0.5;
    out.push([t, 1.9, endB, "arco", 0.7]); t += 2;
  };
  phrase(54, 52);
  phrase(52, 50);
  return out;
}

function chungusRiff() {
  // Original: a gallop riff on the open C string with a chromatic answer.
  const out = [];
  const hit = (bar, step, m, v = 0.85) => out.push([bar * 4 + step * S, S * 0.8, m, "chug", v]);
  [0, 2, 3, 4, 6, 7, 8, 10, 11].forEach((s) => hit(0, s, 36, s % 4 === 0 ? 1 : 0.8));
  hit(0, 12, 39, 1); hit(0, 14, 38, 1);
  [0, 2, 3, 4, 6, 7].forEach((s) => hit(1, s, 36, s % 4 === 0 ? 1 : 0.8));
  hit(1, 8, 42, 1); hit(1, 10, 43, 1); hit(1, 12, 46, 1); hit(1, 13, 45, 0.9); hit(1, 14, 43, 1); hit(1, 15, 42, 0.9);
  return out;
}

function pizzWalk() {
  // Original: a walking pizzicato line in A minor.
  const line = [45, 48, 52, 55, 41, 45, 48, 52, 50, 53, 45, 48, 40, 44, 47, 52];
  return line.map((m, i) => [i, 0.9, m, "pizz", i % 4 === 0 ? 0.9 : 0.7]);
}

function horror() {
  // Original: tremolo tritones, a ponticello shiver and col legno knocks.
  return [
    [0, 3.9, 50, "tremolo", 0.6], [0, 3.9, 56, "tremolo", 0.55],
    [4, 3.9, 51, "tremolo", 0.7], [4, 3.9, 57, "tremolo", 0.65],
    [8, 3.9, 49, "ponti", 0.7], [8, 3.9, 55, "ponti", 0.6],
    [12, 0.5, 36, "legno", 0.9], [13, 0.5, 36, "legno", 0.9], [14, 0.5, 36, "legno", 0.9], [15, 0.25, 36, "legno", 1], [15.5, 0.25, 37, "legno", 1],
  ];
}

function dScale() {
  // Practice: D major, two octaves up and down, in eighths.
  const up = [38, 40, 42, 43, 45, 47, 49, 50, 52, 54, 55, 57, 59, 61, 62];
  const seq = up.concat(up.slice(0, -1).reverse());
  return seq.map((m, i) => [i * 0.5, 0.48, m, "arco", i % 4 === 0 ? 0.75 : 0.62]);
}

function swanLike() {
  // Original: a slow, singing line in G with long bows (for vibrato practice).
  return [
    [0, 2, 55, "arco", 0.55], [2, 1, 59, "arco", 0.6], [3, 1, 57, "arco", 0.6],
    [4, 3, 62, "arco", 0.7], [7, 1, 60, "arco", 0.6],
    [8, 2, 59, "arco", 0.62], [10, 1, 57, "arco", 0.58], [11, 1, 55, "arco", 0.56],
    [12, 4, 57, "arco", 0.6],
  ];
}

export const PHRASES = [
  { id: "bach", name: "Bach — Suite No. 1 Prélude (bars 1–4)", credit: "J.S. Bach, BWV 1007 (public domain)", bpm: 66, bars: 4, notes: bach() },
  { id: "pachelbel", name: "Pachelbel — Canon ground bass", credit: "J. Pachelbel (public domain) — loop it and play the tune over the top", bpm: 60, bars: 2, notes: pachelbel() },
  { id: "ode", name: "Beethoven — Ode to Joy", credit: "L. van Beethoven, Symphony No. 9 (public domain)", bpm: 100, bars: 8, notes: ode() },
  { id: "chungus", name: "Chungus riff (metal gallop)", credit: "original — best with the Chug articulation's amp", bpm: 140, bars: 2, notes: chungusRiff() },
  { id: "pizz", name: "Pizzicato walk in A minor", credit: "original", bpm: 112, bars: 4, notes: pizzWalk() },
  { id: "horror", name: "Tremolo horror", credit: "original — tremolo, ponticello, col legno", bpm: 72, bars: 4, notes: horror() },
  { id: "swan", name: "Slow song for vibrato", credit: "original", bpm: 58, bars: 4, notes: swanLike() },
  { id: "scale", name: "D major scale, two octaves", credit: "practice", bpm: 80, bars: 8, notes: dScale() },
];

/** Plays a phrase through the engine, optionally looping, locked to its transport. */
export class PhrasePlayer {
  constructor(engine) {
    this.engine = engine;
    this.cur = null;
    this.listeners = [];
    engine.on("tick", () => this.tick());
  }
  onChange(fn) { this.listeners.push(fn); }
  changed() { for (const f of this.listeners) f(this); }

  get playing() { return !!this.cur; }

  play(phrase, { start, loop = true, transpose = 0, setTempo = true } = {}) {
    this.stop();
    const e = this.engine;
    if (setTempo && phrase.bpm) e.setBpm(phrase.bpm);
    const t0 = start != null ? start : e.now + 0.08;
    const lenBeats = phrase.bars * 4;
    this.cur = { phrase, t0, loop, transpose, lenBeats, idx: 0, cycle: 0, n: 0 };
    this.changed();
  }

  stop() {
    if (!this.cur) return;
    for (const k of this.engine.heldKeys()) if (k.startsWith("ph:")) this.engine.noteOff(k, { immediate: false });
    this.cur = null;
    this.changed();
  }

  tick() {
    const c = this.cur;
    if (!c) return;
    const e = this.engine;
    const bd = e.beatDur();
    const ahead = e.now + 0.15;
    const notes = c.phrase.notes;
    for (;;) {
      if (c.idx >= notes.length) {
        if (!c.loop) { if (e.now > c.t0 + (c.cycle + 1) * c.lenBeats * bd) { this.cur = null; this.changed(); } return; }
        c.idx = 0; c.cycle++;
      }
      const [beat, len, midi, art, vel] = notes[c.idx];
      const t = c.t0 + (c.cycle * c.lenBeats + beat) * bd;
      if (t > ahead) return;
      c.idx++;
      if (t < e.now - 0.05) continue;       // fell behind (tab was hidden) — skip
      const key = "ph:" + c.n++;
      e.noteOn(key, midi + c.transpose, vel != null ? vel : 0.7, { art: art || e.s.articulation, time: t, noRepeat: true, noDouble: art === "chug" ? false : undefined });
      e.noteOff(key, { time: t + len * bd });
      e.emit("phrasenote", { midi: midi + c.transpose, t, d: len * bd });
    }
  }
}

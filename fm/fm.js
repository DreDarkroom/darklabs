// Darklabs FM: a synth-generated radio. No samples, no recordings, no audio files.
// Every sound is computed from oscillators and noise with the Web Audio API. Every track is composed on the fly
// from a seed: the same seed always plays the same track, which is how feedback can point at exactly what you heard.
//
// The scheduling code (scheduleBar) works on ANY audio context, live or offline. The tests render tracks offline
// and measure them, so the music can be checked without a speaker.

const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const STATIONS = {
  dnbdark:  { id: "dnbdark",  name: "DnB · Dark",       genre: "Drum & Bass", blurb: "Rolling, heavy and dark. Reese bass and two-step drums.", bpm: [172, 176], roots: [28, 29, 31, 33], prog: [[0, 0, 3, -2], [0, -2, 3, 5], [0, 0, -4, -2]], chordBars: 2, hue: 350, trim: 1.0 },
  dnbliquid:{ id: "dnbliquid",name: "DnB · Liquid",     genre: "Drum & Bass", blurb: "Warm, rolling and melodic. Soft pads and rolling sub.", bpm: [170, 174], roots: [33, 34, 36, 31], prog: [[0, -4, -2, 3], [0, 5, -4, -2], [0, -2, -4, -5]], chordBars: 2, hue: 190, trim: 1.0 },
  breaks:   { id: "breaks",   name: "Breaks",           genre: "Breakbeat",   blurb: "Funky, chopped and swinging. Acid lines over broken drums.", bpm: [128, 138], roots: [33, 36, 38, 31], prog: [[0, 0, -2, 3], [0, 5, 3, -2], [0, 0, 5, 5]], chordBars: 2, hue: 35, trim: 1.55 },
  technodark:{id: "technodark",name: "Techno · Hard & Dark", genre: "Techno", blurb: "Hard, driving and dark. Distorted kick, rumbling bass.", bpm: [140, 146], roots: [26, 28, 29, 31], prog: [[0, 0, 0, -2], [0, 0, 3, 0], [0, 1, 0, -2]], chordBars: 4, hue: 0, trim: 0.62 },
  technosoft:{id: "technosoft",name: "Techno · Soft & Melodic", genre: "Techno", blurb: "Warm and melodic. Soft kick, plucks and long pads.", bpm: [120, 125], roots: [33, 36, 31, 38], prog: [[0, -4, -9, -2], [0, -2, -4, -5], [0, 3, -4, -2]], chordBars: 2, hue: 265, trim: 1.5 },
};
export const STATION_ORDER = ["dnbdark", "dnbliquid", "breaks", "technodark", "technosoft"];

const ADJ = ["Midnight", "Ghost", "Cold", "Neon", "Static", "Velvet", "Iron", "Hollow", "Signal", "Ember", "Glass", "Concrete", "Low", "Burnt", "Silent", "Electric", "Paper", "Black", "Slow", "Wired"];
const NOUN = ["Protocol", "Tide", "Engine", "Circuit", "Harbour", "Ritual", "Orbit", "Rain", "Frequency", "Furnace", "Cathedral", "Horizon", "Static", "Pulse", "Tunnel", "Lantern", "Reactor", "Skyline", "Echo", "Garden"];

/** Compose a track description (no audio yet) from a station and a seed. */
export function makeTrack(stationId, seed) {
  const S = STATIONS[stationId], r = mulberry32(seed >>> 0);
  const bpm = Math.round(S.bpm[0] + r() * (S.bpm[1] - S.bpm[0]));
  const root = pick(r, S.roots), prog = pick(r, S.prog);
  const title = pick(r, ADJ) + " " + pick(r, NOUN);
  const dnb = stationId.startsWith("dnb"), tech = stationId.startsWith("techno");
  const plan = dnb || stationId === "breaks"
    ? [["intro", 8], ["build", 8], ["drop", 32], ["break", 16], ["build", 8], ["drop", 32], ["outro", 8]]
    : [["intro", 16], ["groove", 32], ["break", 16], ["build", 8], ["groove", 32], ["outro", 16]];
  let start = 0; const sections = plan.map(([name, bars]) => { const s = { name, bars, start }; start += bars; return s; });
  // a motif for the melodic stations: 16 steps of scale degrees (or rests), fixed for the whole track
  const mr = mulberry32((seed ^ 0x9E3779B9) >>> 0), motif = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? mr() < 0.7 : mr() < 0.28) ? Math.floor(mr() * 7) : null);
  return { stationId, seed: seed >>> 0, bpm, root, prog, title, key: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][root % 12] + " minor",
    chordBars: S.chordBars, trim: S.trim, sections, totalBars: start, barDur: 240 / bpm, stepDur: 60 / bpm / 4, motif, dnb, tech };
}
export const sectionAt = (trk, bar) => { for (const s of trk.sections) if (bar < s.start + s.bars) return { ...s, secBar: bar - s.start }; const l = trk.sections[trk.sections.length - 1]; return { ...l, secBar: l.bars - 1 }; };
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const scaleNote = (root, deg) => root + 12 * Math.floor(deg / 7) + MINOR[((deg % 7) + 7) % 7];

// ───────────────────────────────────────────────────────────────── the sound
export function createVoices(ctx, B) {
  const sr = ctx.sampleRate;
  const noiseBuf = (() => { const n = sr * 2, b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), r = mulberry32(1337); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; return b; })();
  const env = (g, t, a, peak, d, end = 0.0008) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };
  const noise = (t, dur, dest, o = {}) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = o.type || "highpass"; f.frequency.value = o.f || 7000; f.Q.value = o.q || 0.7; const g = ctx.createGain(); env(g, t, o.a || 0.001, o.v || 0.3, dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t, (t * 7.13) % 1.5); s.stop(t + dur + 0.05); return { f, g }; };
  const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o; };
  const sends = (src, rev, dly) => { if (rev) { const g = ctx.createGain(); g.gain.value = rev; src.connect(g); g.connect(B.rev); } if (dly) { const g = ctx.createGain(); g.gain.value = dly; src.connect(g); g.connect(B.dly); } };
  const V = {};

  V.kick = (t, o = {}) => {
    const len = o.len || 0.3, d = ctx.createGain(), s = osc("sine", o.f0 || 150, t, len + 0.05);
    s.frequency.exponentialRampToValueAtTime(o.f1 || 46, t + (o.sweep || 0.08));
    env(d, t, 0.002, o.v ?? 0.95, len); s.connect(d); d.connect(o.dist ? B.kickDist : B.drums);
    noise(t, 0.012, o.dist ? B.kickDist : B.drums, { type: "bandpass", f: 3200, v: 0.35 * (o.v ?? 1) });
    if (o.duck !== false) B.duck(t, o.duckAmt ?? 0.55, o.duckRel ?? 0.16);
  };
  V.snare = (t, o = {}) => {
    const v = o.v ?? 0.8, d = ctx.createGain(), s = osc("triangle", o.tone || 190, t, 0.2); s.frequency.exponentialRampToValueAtTime((o.tone || 190) * 0.62, t + 0.1);
    env(d, t, 0.001, v * 0.5, o.ghost ? 0.05 : 0.14); s.connect(d); d.connect(B.drums);
    const n = noise(t, o.ghost ? 0.07 : 0.2, B.drums, { type: "bandpass", f: o.noiseF || 2200, q: 0.9, v: v * 0.75 }); sends(n.g, o.ghost ? 0 : 0.18, 0);
  };
  V.clap = (t, o = {}) => { const v = o.v ?? 0.6; for (let k = 0; k < 3; k++) noise(t + k * 0.011, 0.04, B.drums, { type: "bandpass", f: 1300, q: 1.1, v: v * 0.8 }); const n = noise(t + 0.033, 0.22, B.drums, { type: "bandpass", f: 1500, q: 0.9, v }); sends(n.g, o.rev ?? 0.35, 0); };
  V.hat = (t, o = {}) => { const n = noise(t, o.open ? 0.22 : 0.045, B.drums, { f: o.f || 8200, v: o.v ?? 0.25 }); if (o.open) sends(n.g, 0.08, 0); };
  V.rim = (t, o = {}) => { const d = ctx.createGain(), s = osc("square", 820, t, 0.05); env(d, t, 0.001, o.v ?? 0.25, 0.03); s.connect(d); d.connect(B.drums); };
  V.shaker = (t, o = {}) => noise(t, 0.05, B.drums, { type: "bandpass", f: 6500, q: 1.6, v: o.v ?? 0.12, a: 0.012 });
  V.tom = (t, f = 120, o = {}) => { const d = ctx.createGain(), s = osc("sine", f * 1.6, t, 0.3); s.frequency.exponentialRampToValueAtTime(f, t + 0.12); env(d, t, 0.002, o.v ?? 0.5, 0.22); s.connect(d); d.connect(B.drums); sends(d, 0.12, 0); };

  V.sub = (t, f, dur, o = {}) => { const d = ctx.createGain(), s = osc("sine", f, t, dur + 0.1); d.gain.setValueAtTime(0.0001, t); d.gain.linearRampToValueAtTime(o.v ?? 0.6, t + 0.008); d.gain.setValueAtTime(o.v ?? 0.6, t + Math.max(0.01, dur - 0.04)); d.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.04); s.connect(d); d.connect(B.bass); };
  V.reese = (t, f, dur, o = {}) => {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = -1 + (o.q ?? 5);                 // Q in dB: keep it modest
    const cut = o.cut || 900; lp.frequency.setValueAtTime(cut * 1.9, t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, cut), t + Math.max(0.05, dur * 0.8));
    for (const det of [-1, 0, 1]) { const s = osc("sawtooth", f, t, dur + 0.1); s.detune.value = det * (o.det ?? 14); s.connect(lp); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v ?? 0.3, t + 0.01); g.gain.setValueAtTime(o.v ?? 0.3, t + Math.max(0.02, dur - 0.05)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const ws = o.drive ? B.bassDrive : null; lp.connect(g); g.connect(ws || B.bass);
  };
  V.acid = (t, f, dur, o = {}) => { const s = osc(o.sq ? "square" : "sawtooth", f, t, dur + 0.05), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = "lowpass"; lp.Q.value = o.q ?? 9; lp.frequency.setValueAtTime(o.top || 2800, t); lp.frequency.exponentialRampToValueAtTime(o.bot || 220, t + dur * 0.9); env(g, t, 0.004, o.v ?? 0.3, dur); s.connect(lp); lp.connect(g); g.connect(B.bass); sends(g, 0, o.dly ?? 0); };
  V.pad = (t, freqs, dur, o = {}) => {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = "lowpass"; lp.Q.value = -2; lp.frequency.setValueAtTime(o.cut || 1400, t);
    const a = o.att ?? 0.5, rel = o.rel ?? 0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v ?? 0.07, t + a); g.gain.setValueAtTime(o.v ?? 0.07, t + Math.max(a, dur - rel)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const f of freqs) for (const det of [-7, 7]) { const s = osc(o.type || "sawtooth", f, t, dur + 0.1); s.detune.value = det; s.connect(lp); }
    lp.connect(g); g.connect(B.music); sends(g, o.rev ?? 0.4, o.dly ?? 0);
  };
  V.pluck = (t, f, o = {}) => { const s1 = osc("triangle", f, t, 0.6), s2 = osc("square", f, t, 0.6), lp = ctx.createBiquadFilter(), g = ctx.createGain(), m = ctx.createGain(); m.gain.value = 0.35; lp.type = "lowpass"; lp.Q.value = 0; lp.frequency.setValueAtTime(o.top || 3800, t); lp.frequency.exponentialRampToValueAtTime(o.bot || 500, t + (o.len || 0.3)); env(g, t, 0.003, o.v ?? 0.2, o.len || 0.3); s1.connect(lp); s2.connect(m); m.connect(lp); lp.connect(g); g.connect(B.music); sends(g, o.rev ?? 0.3, o.dly ?? 0.35); };
  V.stab = (t, freqs, dur, o = {}) => { const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = "lowpass"; lp.Q.value = 1; lp.frequency.setValueAtTime(o.top || 2400, t); lp.frequency.exponentialRampToValueAtTime(o.bot || 500, t + dur); env(g, t, 0.004, o.v ?? 0.12, dur); for (const f of freqs) { const s = osc("sawtooth", f, t, dur + 0.05); s.detune.value = (Math.random() - 0.5) * 6; s.connect(lp); } lp.connect(g); g.connect(B.music); sends(g, o.rev ?? 0.35, o.dly ?? 0.25); };
  V.lead = (t, f, dur, o = {}) => { const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = "lowpass"; lp.Q.value = 0; lp.frequency.setValueAtTime(o.cut || 2600, t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v ?? 0.1, t + 0.02); g.gain.setValueAtTime(o.v ?? 0.1, t + Math.max(0.03, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); for (const det of [-9, 9]) { const s = osc("sawtooth", f, t, dur + 0.1); s.detune.value = det; s.connect(lp); } lp.connect(g); g.connect(B.music); sends(g, 0.3, 0.4); };
  V.riser = (t, dur, o = {}) => { const n = noise(t, dur, B.music, { type: "bandpass", f: 400, q: 2.2, v: o.v ?? 0.22, a: dur * 0.9 }); n.f.frequency.setValueAtTime(400, t); n.f.frequency.exponentialRampToValueAtTime(7000, t + dur); const s = osc("sine", 180, t, dur), g = ctx.createGain(); s.frequency.exponentialRampToValueAtTime(1400, t + dur); env(g, t, dur * 0.9, 0.07, dur * 0.1); s.connect(g); g.connect(B.music); sends(n.g, 0.25, 0); };
  V.impact = (t, o = {}) => { const d = ctx.createGain(), s = osc("sine", 70, t, 1.2); s.frequency.exponentialRampToValueAtTime(30, t + 0.9); env(d, t, 0.003, o.v ?? 0.8, 0.9); s.connect(d); d.connect(B.drums); const n = noise(t, 0.5, B.music, { type: "lowpass", f: 900, v: 0.35 }); sends(n.g, 0.5, 0); };
  V.sweep = (t, dur, o = {}) => { const n = noise(t, dur, B.music, { type: "bandpass", f: o.f0 || 8000, q: 1.3, v: o.v ?? 0.1, a: dur * 0.5 }); n.f.frequency.setValueAtTime(o.f0 || 8000, t); n.f.frequency.exponentialRampToValueAtTime(o.f1 || 600, t + dur); sends(n.g, 0.3, 0); };
  return V;
}

// ───────────────────────────────────────────────────────────── the arrangements
const chordFor = (trk, bar, cb) => { const o = trk.prog[Math.floor(bar / cb) % trk.prog.length]; return trk.root + o; };
const triad = (r, ext = false) => (ext ? [r, r + 3, r + 7, r + 10, r + 14] : [r, r + 3, r + 7, r + 10]);

function barDnb(E, dark) {
  const { v, T, rnd, sec, secBar, secBars, trk, bar } = E, sn = sec.name, drop = sn === "drop", brk = sn === "break", bld = sn === "build", edge = sn === "intro" || sn === "outro";
  const root = chordFor(trk, bar, trk.chordBars) + 24 - 12;           // bass octave
  const chord = triad(chordFor(trk, bar, trk.chordBars) + 36);
  const lastBars = bld && secBar >= secBars - 2, finalBar = bld && secBar === secBars - 1;
  // drums: two-step
  if (!brk) {
    const ks = lastBars ? [0] : [0, 10, ...(drop && rnd() < 0.3 ? [7] : []), ...((secBar % 4 === 3 && drop) ? [13] : [])];
    ks.forEach((s) => v.kick(T(s), { f0: 155, f1: 47, len: 0.26, v: 0.95, duckAmt: dark ? 0.6 : 0.4 }));
    if (!lastBars) [4, 12].forEach((s) => v.snare(T(s), { v: 0.95, tone: dark ? 170 : 205, noiseF: dark ? 1900 : 2600 }));
    if (!lastBars) for (const s of [7, 9, 14, 15]) if (rnd() < (drop ? 0.34 : 0.14)) v.snare(T(s), { v: 0.2, ghost: true });
    if (drop || edge || bld) for (let s = 0; s < 16; s++) if (s % 2 === 0 || rnd() < (drop ? 0.5 : 0.2)) v.hat(T(s), { v: s % 4 === 2 ? 0.34 : 0.17 + rnd() * 0.07, open: drop && (s === 6 || s === 14) && rnd() < 0.4 });
  } else if (secBar % 2 === 0) { [0, 8].forEach((s) => v.hat(T(s), { v: 0.12 })); }
  // build: a snare roll that accelerates, riser, then silence before the drop
  if (bld && secBar === 0) v.riser(T(0), E.trk.barDur * secBars, { v: dark ? 0.2 : 0.14 });
  if (lastBars) { const dens = finalBar ? 16 : 8; for (let s = 0; s < 16; s += 16 / dens) v.snare(T(s), { v: 0.35 + 0.5 * (s / 16) + (finalBar ? 0.15 : 0), ghost: false, tone: 230 }); if (finalBar) v.tom(T(14), 150, { v: 0.5 }); }
  if (drop && secBar === 0) { v.impact(T(0)); v.sweep(T(0), E.trk.barDur * 0.5, { f0: 7000, f1: 500, v: 0.08 }); }
  // harmony: pad all the time except the drop in dark
  if (secBar % trk.chordBars === 0 && !(dark && drop)) v.pad(T(0), chord.map(mtof), trk.barDur * trk.chordBars, { v: dark ? 0.05 : 0.075, cut: dark ? 900 : 1700, att: 0.8, rel: 1.0, rev: 0.5 });
  if (dark && drop && secBar % trk.chordBars === 0) v.pad(T(0), [chord[0], chord[2]].map(mtof), trk.barDur * trk.chordBars, { v: 0.035, cut: 600, att: 1, rel: 1, rev: 0.4 });
  // bass: reese (dark) or rolling sub (liquid), in the drop; a sparse sub elsewhere
  const rhy = E.rhy;
  if (drop) {
    for (let i = 0; i < rhy.length; i++) {
      const s = rhy[i], nx = rhy[i + 1] ?? 16, dur = Math.max(0.1, (nx - s) * trk.stepDur * 0.92), f = mtof(root + (rnd() < 0.18 ? 12 : 0) + (i === rhy.length - 1 && rnd() < 0.4 ? 3 : 0));
      if (dark) { v.reese(T(s), f, dur, { cut: 650 + 450 * rnd(), det: 15, v: 0.26, drive: true }); v.sub(T(s), f, dur, { v: 0.4 }); }
      else { v.sub(T(s), f, dur, { v: 0.55 }); if (s % 4 === 3 || rnd() < 0.2) v.pluck(T(s), mtof(root + 24), { v: 0.07, len: 0.12, rev: 0.1, dly: 0.1 }); }
    }
  } else if (!brk && !bld && secBar % 2 === 0) v.sub(T(0), mtof(root), trk.barDur * 1.6, { v: 0.35 });
  // melodic bits: liquid keys arp / dark stab
  if (!dark && (drop || brk || edge)) for (let s = 0; s < 16; s += 2) if (rnd() < (brk ? 0.7 : 0.45)) v.pluck(T(s), mtof(chord[Math.floor(rnd() * 4)] + 12 * (rnd() < 0.3 ? 1 : 0)), { v: 0.1, len: 0.28, rev: 0.4, dly: 0.45 });
  if (dark && drop && secBar % 4 === 1) v.stab(T(3), chord.slice(0, 3).map((m) => mtof(m + 12)), 0.22, { v: 0.1 });
}

function barBreaks(E) {
  const { v, T, rnd, sec, secBar, secBars, trk, bar } = E, sn = sec.name, drop = sn === "drop", brk = sn === "break", bld = sn === "build", edge = sn === "intro" || sn === "outro";
  const root = chordFor(trk, bar, trk.chordBars) + 12, chord = triad(chordFor(trk, bar, trk.chordBars) + 36);
  const sw = (s) => T(s) + (s % 2 === 1 ? trk.stepDur * 0.18 : 0);
  const KSETS = [[0, 3, 10], [0, 6, 10, 13], [0, 3, 8, 11], [0, 5, 10]], ks = E.kset;
  if (!brk) {
    ks.forEach((s) => v.kick(sw(s), { f0: 140, f1: 52, len: 0.22, v: 0.95, duckAmt: 0.45 }));
    [4, 12].forEach((s) => v.snare(sw(s), { v: 0.9, tone: 200, noiseF: 2400 }));
    for (const s of [7, 9, 11, 15]) if (rnd() < (drop ? 0.4 : 0.15)) v.snare(sw(s), { v: 0.22, ghost: true });
    for (let s = 0; s < 16; s++) if (drop || edge || bld) v.hat(sw(s), { v: s % 4 === 2 ? 0.32 : 0.14 + rnd() * 0.08, open: s === 10 && rnd() < 0.5 });
    if (drop && secBar % 4 === 3) for (let s = 12; s < 16; s++) v.snare(sw(s), { v: 0.3 + (s - 12) * 0.1, tone: 230 });
  }
  if (bld && secBar === 0) v.riser(T(0), trk.barDur * secBars, { v: 0.16 });
  if (drop && secBar === 0) v.impact(T(0), { v: 0.6 });
  if (secBar % trk.chordBars === 0) v.pad(T(0), chord.map(mtof), trk.barDur * trk.chordBars, { v: 0.05, cut: 1100, att: 0.9, rel: 0.9, rev: 0.45 });
  if (drop || bld) for (const s of E.acidSteps) v.acid(sw(s), mtof(root + (E.acidNotes[s] ?? 0)), trk.stepDur * (rnd() < 0.3 ? 2.2 : 1.1), { v: 0.22, q: 9, top: 2600 + 800 * rnd(), bot: 200 + 150 * rnd(), dly: 0.18, sq: rnd() < 0.3 });
  if (drop && secBar % 2 === 1) v.stab(sw(10), chord.slice(0, 3).map((m) => mtof(m + 12)), 0.18, { v: 0.1 });
  if (!brk && drop) v.sub(T(0), mtof(root - 12), trk.stepDur * 3.5, { v: 0.45 });
}

function barTechno(E, dark) {
  const { v, T, rnd, sec, secBar, secBars, trk, bar } = E, sn = sec.name, groove = sn === "groove", brk = sn === "break", bld = sn === "build", edge = sn === "intro" || sn === "outro";
  const root = chordFor(trk, bar, trk.chordBars) + 12, chord = triad(chordFor(trk, bar, trk.chordBars) + 36);
  const lastBars = bld && secBar >= secBars - 1;
  if (!brk) {
    [0, 4, 8, 12].forEach((s) => v.kick(T(s), dark ? { f0: 170, f1: 44, len: 0.34, v: 1, dist: true, duckAmt: 0.7, duckRel: 0.2 } : { f0: 130, f1: 50, len: 0.24, v: 0.8, duckAmt: 0.4, duckRel: 0.15 }));
    if (!(edge && secBar < 2)) for (const s of [2, 6, 10, 14]) v.hat(T(s), { open: true, v: dark ? 0.34 : 0.16, f: dark ? 7500 : 9000 });
    if (groove || sn === "outro") for (let s = 0; s < 16; s++) if (s % 2 === 1 && rnd() < (dark ? 0.7 : 0.5)) v.hat(T(s), { v: (dark ? 0.16 : 0.08) + rnd() * 0.06 });
    if (groove || bld) [4, 12].forEach((s) => (dark ? v.clap(T(s), { v: 0.55, rev: 0.45 }) : v.rim(T(s), { v: 0.2 })));
    if (!dark && groove) for (let s = 0; s < 16; s++) if (rnd() < 0.6) v.shaker(T(s), { v: 0.08 + (s % 4 === 2 ? 0.05 : 0) });
  }
  if (bld && secBar === 0) v.riser(T(0), trk.barDur * secBars, { v: dark ? 0.2 : 0.13 });
  if (lastBars) for (let s = 0; s < 16; s += 2) v.tom(T(s), 100 + s * 6, { v: 0.35 });
  if (groove && secBar === 0) { v.impact(T(0), { v: dark ? 0.9 : 0.55 }); }
  // rumble / rolling bass on the off-beats
  if (groove || bld || (edge && secBar >= 2)) for (const s of [2, 6, 10, 14]) {
    const f = mtof(root - 12 + (dark && rnd() < 0.12 ? 12 : 0));
    if (dark) { v.reese(T(s), f, trk.stepDur * 3.2, { cut: 320 + 120 * rnd(), det: 8, v: 0.17, q: 3, drive: true }); v.sub(T(s), f, trk.stepDur * 3.2, { v: 0.2 }); }
    else v.acid(T(s), f, trk.stepDur * 2.8, { v: 0.2, q: 2, top: 900, bot: 180, sq: false });
  }
  // harmony and melody
  if (secBar % trk.chordBars === 0 && !(dark && groove)) v.pad(T(0), chord.map(mtof), trk.barDur * trk.chordBars, { v: dark ? 0.045 : 0.075, cut: dark ? 700 : 1500, att: dark ? 1.2 : 1.0, rel: 1.2, rev: 0.55 });
  if (dark && (groove || edge) && secBar % 4 === 2) v.stab(T(rnd() < 0.5 ? 3 : 11), chord.slice(0, 3).map((m) => mtof(m + 12)), 0.2, { v: 0.12, top: 1800 });
  if (dark && groove && secBar % 8 === 5) v.sweep(T(0), trk.barDur, { f0: 5000, f1: 300, v: 0.12 });
  if (!dark && (groove || brk || (edge && secBar >= 4))) for (let s = 0; s < 16; s++) { const d = trk.motif[s]; if (d !== null) { const m = scaleNote(root + 24, d + (E.shift || 0)); v.pluck(T(s), mtof(m), { v: groove ? 0.13 : 0.1, len: 0.34, rev: 0.45, dly: 0.5, top: 4200 }); } }
  if (!dark && groove && secBar % 2 === 1) for (const s of [0, 6, 10]) { const d = trk.motif[(s + 3) % 16] ?? 2; v.lead(T(s), mtof(scaleNote(root + 36, d)), trk.stepDur * 3, { v: 0.05, cut: 2200 }); }
}

const BARS = { dnbdark: (E) => barDnb(E, true), dnbliquid: (E) => barDnb(E, false), breaks: barBreaks, technodark: (E) => barTechno(E, true), technosoft: (E) => barTechno(E, false) };

/** Schedule one bar of a track at time t0 using the given voices. Deterministic from (seed, bar). Works on any audio context. */
export function scheduleBar(trk, bar, t0, V) {
  const sec = sectionAt(trk, bar), rnd = mulberry32((trk.seed * 2654435761 + bar * 7919) >>> 0), pr = mulberry32((trk.seed + Math.floor(bar / 2) * 104729) >>> 0);
  const rhyPool = [[0, 3, 6, 10, 11, 14], [0, 2, 6, 8, 10, 14], [0, 3, 7, 10, 12], [0, 6, 10, 12, 14], [0, 3, 6, 9, 11]];
  const kPool = [[0, 3, 10], [0, 6, 10, 13], [0, 3, 8, 11], [0, 5, 10]];
  const acidSteps = [0, 2, 3, 6, 7, 10, 12, 14, 15].filter(() => pr() < 0.7), acidNotes = {}; acidSteps.forEach((s) => (acidNotes[s] = pick(pr, [0, 0, 3, 7, 10, 12, -2])));
  const E = { v: V, trk, bar, sec, secBar: sec.secBar, secBars: sec.bars, rnd, T: (s) => t0 + s * trk.stepDur, rhy: pick(pr, rhyPool), kset: pick(pr, kPool), acidSteps, acidNotes, shift: sec.name === "break" ? 2 : 0 };
  BARS[trk.stationId](E);
}

// ───────────────────────────────────────────────────────────── buses, master and the live radio
export function makeMaster(ctx, dest) {
  const sat = ctx.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); } sat.curve = curve;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.14;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.06;
  const gain = ctx.createGain(); gain.gain.value = 0.85; const an = ctx.createAnalyser(); an.fftSize = 1024;
  const input = ctx.createGain();
  // shared room reverb (a procedural impulse: decaying stereo noise)
  const conv = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, n, ctx.sampleRate), rr = mulberry32(99);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (rr() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  conv.buffer = ir; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220; hp.Q.value = -3; const revIn = ctx.createGain(), revOut = ctx.createGain(); revOut.gain.value = 0.7; revIn.connect(hp); hp.connect(conv); conv.connect(revOut); revOut.connect(input);
  const dcb = ctx.createBiquadFilter(); dcb.type = "highpass"; dcb.frequency.value = 24; dcb.Q.value = -3;
  input.connect(sat); sat.connect(dcb); dcb.connect(comp); comp.connect(lim); lim.connect(gain); gain.connect(an); gain.connect(dest || ctx.destination);
  return { input, revIn, gain, analyser: an };
}
export function makeBuses(ctx, M, bpm, trim = 1) {
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const B = { drums: G(0.95), bass: G(0.9), music: G(0.9), rev: G(1), dly: G(1) }, duckG = G(1), master = G(trim);
  const dist = ctx.createWaveShaper(), dc = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; dc[i] = Math.tanh(x * 5) * 0.8; } dist.curve = dc; B.kickDist = dist; dist.connect(B.drums);
  const bd = ctx.createWaveShaper(), bc = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; bc[i] = Math.tanh(x * 2.2) * 0.85; } bd.curve = bc; B.bassDrive = bd; bd.connect(B.bass);
  B.bass.connect(duckG); B.music.connect(duckG); duckG.connect(master); B.drums.connect(master); master.connect(M.input);
  const rev = G(0.55); B.rev.connect(rev); rev.connect(M.revIn);
  const d = ctx.createDelay(2), fb = G(0.34), lp = ctx.createBiquadFilter(), wet = G(0.5); d.delayTime.value = (60 / bpm) * 0.75; lp.type = "lowpass"; lp.frequency.value = 2600; lp.Q.value = -3; B.dly.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(M.input); wet.connect(M.revIn);
  B.duck = (t, amt, rel) => { duckG.gain.setValueAtTime(1 - amt, t); duckG.gain.linearRampToValueAtTime(1, t + rel); };
  B.out = master; B.dispose = (t, fade = 0.12) => { master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + fade); setTimeout(() => { try { master.disconnect(); rev.disconnect(); wet.disconnect(); } catch (e) { /* already gone */ } }, (fade + 1.5) * 1000); };
  return B;
}

/** A radio that plays one station forever: a track, an ident, a new track with a new seed. */
export class Radio {
  constructor() { this.ctx = null; this.cb = {}; this.track = null; this.timer = null; this.station = null; }
  on(name, fn) { this.cb[name] = fn; return this; }
  async start(stationId, seed) {
    if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }); this.M = makeMaster(this.ctx); this.analyser = this.M.analyser; }
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.tune(stationId, seed);
  }
  tune(stationId, seed) {
    const ctx = this.ctx; if (this.B) this.B.dispose(ctx.currentTime, 0.18);
    this.station = stationId; this._begin(makeTrack(stationId, seed ?? ((Math.random() * 4294967296) >>> 0)), ctx.currentTime + 0.25);
  }
  _begin(trk, when) {
    const ctx = this.ctx; this.track = trk; this.B = makeBuses(ctx, this.M, trk.bpm, trk.trim); this.V = createVoices(ctx, this.B);
    this.nextBar = 0; this.nextT = when; this.startedAt = when; this.live = true; if (this.cb.track) this.cb.track(trk);
    this._clock(); 
  }
  _clock() {
    if (this.worker) return;
    try { this.worker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),40)"], { type: "text/javascript" }))); this.worker.onmessage = () => this._tick(); }
    catch (e) { this.timer = setInterval(() => this._tick(), 40); }                    // no Worker: fall back to a normal timer
  }
  _tick() {
    const ctx = this.ctx, trk = this.track; if (!trk || !this.live) return;
    while (this.nextT < ctx.currentTime + 0.9) {
      try {
        if (this.nextBar < trk.totalBars) { scheduleBar(trk, this.nextBar, this.nextT, this.V); if (this.cb.bar) this.cb.bar(this.nextBar, sectionAt(trk, this.nextBar), this.nextT); }
        else if (this.nextBar === trk.totalBars) { this._ident(this.nextT); }
      } catch (e) { console.error("FM bar failed (skipped):", e); }                 // a bad bar must never replay: always move on
      this.nextT += trk.barDur; this.nextBar++;
      if (this.nextBar > trk.totalBars + 1) { const old = this.B; old.dispose(this.nextT, 0.4); this._begin(makeTrack(this.station, (Math.random() * 4294967296) >>> 0), this.nextT); return; }
    }
  }
  _ident(t) { // a short station ident: a rising four-note figure and a sweep. Pure synthesis.
    const V = this.V, trk = this.track, base = trk.root + 36;
    [0, 3, 7, 12].forEach((n, i) => V.pluck(t + i * trk.stepDur * 2, mtof(base + n), { v: 0.16, len: 0.5, rev: 0.6, dly: 0.5 }));
    V.sweep(t, trk.barDur, { f0: 600, f1: 9000, v: 0.12 }); V.impact(t + trk.barDur, { v: 0.4 });
  }
  stop() { clearInterval(this.timer); if (this.worker) { this.worker.terminate(); this.worker = null; } this.live = false; if (this.B && this.ctx) this.B.dispose(this.ctx.currentTime, 0.25); }
  get elapsed() { return this.ctx && this.track ? Math.max(0, this.ctx.currentTime - this.startedAt) : 0; }
  level() { const a = this.analyser; if (!a) return 0; const b = new Uint8Array(a.fftSize); a.getByteTimeDomainData(b); let s = 0; for (const x of b) { const d = (x - 128) / 128; s += d * d; } return Math.sqrt(s / b.length); }
}

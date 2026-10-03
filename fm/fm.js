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
  // ---- the "Me" voices: Max Cooper-style FM bells and granular clouds, Noisia-style talking neuro bass
  V.fmbell = (t, f, o = {}) => {
    const len = o.len || 0.5, car = osc("sine", f, t, len + 0.1), mod = osc("sine", f * (o.ratio || 3.5), t, len + 0.1), mg = ctx.createGain(), g = ctx.createGain();
    mg.gain.setValueAtTime(f * (o.index || 1.6), t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + len * 0.8); mod.connect(mg); mg.connect(car.frequency);
    env(g, t, 0.002, o.v ?? 0.12, len); car.connect(g); g.connect(B.music); sends(g, o.rev ?? 0.45, o.dly ?? 0.4);
  };
  V.grain = (t, f, dur, o = {}) => {
    const s = osc(o.type || "sine", f, t, dur + 0.05), g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = o.pan || 0;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v ?? 0.05, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur); s.connect(g); g.connect(p); p.connect(B.music); sends(g, o.rev ?? 0.6, 0.1);
  };
  V.glitch = (t, n, gap, o = {}) => { for (let i = 0; i < n; i++) { const tt = t + i * gap * (1 - i / (n * 1.6)), f = (o.f || 2500) * (0.5 + ((i * 7919) % 13) / 13); noise(tt, 0.012, B.drums, { type: "bandpass", f, q: 4, v: (o.v ?? 0.18) * (0.6 + 0.4 * (i % 2)) }); } };
  V.dust = (t, o = {}) => { noise(t, 0.004, B.music, { type: "highpass", f: 2200 + ((t * 9973) % 1) * 3000, q: 0.7, v: o.v ?? 0.05 }); };
  V.neuro = (t, f, dur, o = {}) => {
    const end = dur + 0.08, car = osc("sawtooth", f, t, end), mod = osc("sine", f * (o.ratio || 2), t, end), mg = ctx.createGain(), lfo = osc("sine", o.rate || 6, t, end), lg = ctx.createGain();
    mg.gain.setValueAtTime(f * (o.index || 1.3), t); mod.connect(mg); mg.connect(car.frequency); lg.gain.value = f * (o.depth || 0.9); lfo.connect(lg); lg.connect(mg.gain);   // the FM index wobbles: that is the "talking"
    const sum = ctx.createGain(), low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 230; low.Q.value = -3; car.connect(low); low.connect(sum);
    for (const [fc, gv] of [[o.f1 || 420, 0.7], [o.f2 || 1250, 0.5]]) { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fc; bp.Q.value = o.q || 5; const lf2 = osc("sine", (o.rate || 6) * 0.5, t, end), lg2 = ctx.createGain(); lg2.gain.value = fc * 0.55; lf2.connect(lg2); lg2.connect(bp.frequency); const gg = ctx.createGain(); gg.gain.value = gv; car.connect(bp); bp.connect(gg); gg.connect(sum); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v ?? 0.26, t + 0.008); g.gain.setValueAtTime(o.v ?? 0.26, t + Math.max(0.02, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); sum.connect(g); g.connect(B.bassDrive);
    const sub = osc("sine", f, t, end), sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.4, t + 0.01); sg.gain.setValueAtTime(0.4, t + Math.max(0.02, dur - 0.05)); sg.gain.exponentialRampToValueAtTime(0.0008, t + dur); sub.connect(sg); sg.connect(B.bass);
  };
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
  B.setBpm = (bpm) => d.delayTime.setTargetAtTime(clamp((60 / bpm) * 0.75, 0.12, 1.9), ctx.currentTime, 0.4);
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
    try { const u = URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),40)"], { type: "text/javascript" })); this.worker = new Worker(u); URL.revokeObjectURL(u); this.worker.onmessage = () => this._tick(); }
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

// ───────────────────────────────────────────────── Journey: the homepage music. A ten-minute climb.
// It begins as gritty, dark ambience (a noise bed, a dirty drone, dust, distant metal) with almost no drums, and slowly
// accumulates: sparse ticks, then intricate interlocking rhythms, then breaks, then two-step, and finally a heavy
// Noisia-style drum & bass crescendo with a talking neuro bass. The tempo climbs the whole way, from 64 to 174 BPM.
// Max Cooper supplies the polyrhythmic FM bells, the granular clouds and the micro-edits; Noisia supplies the bass and the weight.
const PHRYG = [0, 1, 3, 5, 7, 8, 10];                                // Phrygian: the flat second is what makes it dark
const pscale = (root, deg) => root + 12 * Math.floor(deg / 7) + PHRYG[((deg % 7) + 7) % 7];
export const JOURNEY = { secs: 600, hold: 120, root: 28 };            // 10 min climb, 2 min at the peak, then it starts over
const BPM_PTS = [[0, 64], [0.15, 64], [0.3, 78], [0.5, 108], [0.7, 138], [0.9, 172], [1, 174]];
export function bpmAt(p) { for (let i = 1; i < BPM_PTS.length; i++) if (p <= BPM_PTS[i][0]) { const [p0, b0] = BPM_PTS[i - 1], [p1, b1] = BPM_PTS[i]; return b0 + (b1 - b0) * (p - p0) / (p1 - p0); } return 174; }
export function journeyAt(e) { const cyc = JOURNEY.secs + JOURNEY.hold, E = ((e % cyc) + cyc) % cyc; return { p: Math.min(1, E / JOURNEY.secs), cycle: Math.floor(e / cyc) }; }
export const stageOf = (p) => (p >= 0.9 ? 5 : p >= 0.7 ? 4 : p >= 0.5 ? 3 : p >= 0.28 ? 2 : p >= 0.12 ? 1 : 0);        // 0 ambient, 1 first pulse, 2 intricate, 3 breaks, 4 two-step build, 5 crescendo
const sstep = (x) => x * x * (3 - 2 * x);
// the overall volume curve of the climb, in dB (measured so the opening is a quiet, dark bed and the crescendo hits hard)
const GAIN_PTS = [[0, -8], [0.12, -8], [0.25, -6.5], [0.4, -6.5], [0.55, -5.5], [0.7, -4], [0.8, -2.4], [0.9, 0], [1, 0]];
export function gainDb(p) { for (let i = 1; i < GAIN_PTS.length; i++) if (p <= GAIN_PTS[i][0]) { const [p0, g0] = GAIN_PTS[i - 1], [p1, g1] = GAIN_PTS[i]; return g0 + (g1 - g0) * (p - p0) / (p1 - p0); } return 0; }
const euclid =(k, n) => { const r = []; for (let i = 0; i < k; i++) r.push(Math.floor(i * n / k)); return r; };
const rot = (arr, r) => arr.map((x) => (x + r) % 16);

/** The grit: continuous noise layers and a dirty drone that live under everything and change slowly with progress. */
export function createBed(ctx, B) {
  const sr = ctx.sampleRate, n = sr * 4, buf = ctx.createBuffer(2, n, sr), r = mulberry32(777);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; }
  const src = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, (r() * 3)); return s; };
  const G = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const rumble = G(), wind = G(), hiss = G(), drone = G(), subG = G();
  { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 110; f.Q.value = -3; const s = src(); s.connect(f); f.connect(rumble); }
  { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 600; f.Q.value = 1.1; const s = src(); s.connect(f); f.connect(wind); const l = ctx.createOscillator(), lg = G(380); l.frequency.value = 0.06; l.connect(lg); lg.connect(f.frequency); l.start(); }
  { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6500; f.Q.value = -3; const s = src(); s.connect(f); f.connect(hiss); }
  const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 180; dl.Q.value = -1;
  [-9, 0, 8].forEach((det) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(JOURNEY.root + 12); o.detune.value = det; o.connect(dl); o.start(); });
  { const l = ctx.createOscillator(), lg = G(90); l.frequency.value = 0.045; l.connect(lg); lg.connect(dl.frequency); l.start(); }
  const ws = ctx.createWaveShaper(), cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; cv[i] = Math.tanh(x * 3); } ws.curve = cv; dl.connect(ws); ws.connect(drone);
  { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(JOURNEY.root); o.connect(subG); o.start(); }
  for (const g of [rumble, wind, hiss, drone, subG]) g.connect(B.music);                       // through the music bus, so the bed breathes with the kick
  return { update(p, t = ctx.currentTime) {
    const sm = (lo, hi) => sstep(clamp((p - lo) / (hi - lo), 0, 1)), tc = 0.9;
    rumble.gain.setTargetAtTime(0.30 * (1 - 0.45 * sm(0.7, 1)), t, tc); wind.gain.setTargetAtTime(0.03 + 0.15 * (1 - sm(0.55, 0.92)), t, tc);
    hiss.gain.setTargetAtTime(0.035 * (1 - 0.5 * sm(0.8, 1)), t, tc); drone.gain.setTargetAtTime(0.11 * (0.5 + 0.5 * sm(0.05, 0.35)) * (1 - 0.55 * sm(0.88, 1)), t, tc);
    subG.gain.setTargetAtTime(0.07 * (1 - 0.6 * sm(0.7, 0.95)), t, tc); dl.frequency.setTargetAtTime(150 + 520 * sm(0.2, 0.95), t, 2.5);
  } };
}

/** One bar of the journey. p = how far along (0..1); bpm = the tempo for this bar. */
export function scheduleJourneyBar(p, bar, t0, V, bpm) {
  const sd = 60 / bpm / 4, barDur = sd * 16, T = (s) => t0 + s * sd, rnd = mulberry32((bar * 2654435761 + 777) >>> 0), ph = bar % 8, ch = Math.floor(bar / 2) % 4;
  const root = JOURNEY.root + [0, 1, 0, -2][ch], qual = [[0, 3, 7, 10], [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10]][ch], chord = qual.map((i) => root + 24 + i);
  const sm = (lo, hi) => sstep(clamp((p - lo) / (hi - lo), 0, 1)), st = stageOf(p), cres = sm(0.88, 0.95);
  // the grit on top of the bed: dust crackle and distant machinery (fades as the drums take over)
  const dust = Math.round(8 + 32 * (1 - sm(0.55, 0.9))); for (let i = 0; i < dust; i++) V.dust(T(rnd() * 16), { v: 0.025 + rnd() * 0.07 });
  if (rnd() < 0.24 * (1 - sm(0.45, 0.85))) V.fmbell(T(Math.floor(rnd() * 16)), mtof(JOURNEY.root + (rnd() < 0.5 ? 12 : 24)), { v: 0.07, len: 1.6, ratio: 5.19, index: 2.2, rev: 0.85, dly: 0.55 });
  // dark pad swells, a chord every four bars
  if (p >= 0.1 && bar % 4 === 0) V.pad(T(0), chord.map(mtof), barDur * 4.05, { v: 0.04 + 0.03 * sm(0.1, 0.4), cut: 280 + 1200 * sm(0.1, 0.9), att: barDur * 1.6, rel: barDur * 1.4, rev: 0.7, dly: 0.15 });
  // the granular cloud (thins out as the weight arrives)
  if (p > 0.04) for (let k = 0; k < 5; k++) if (rnd() < 0.7 * (1 - sm(0.6, 0.9))) V.grain(T(Math.floor(rnd() * 16)), mtof(pscale(root + 36, Math.floor(rnd() * 7))), 0.08 + rnd() * 0.14, { v: 0.03 * (0.5 + 0.5 * (1 - sm(0.6, 0.9))), pan: (rnd() - 0.5) * 1.6, type: rnd() < 0.3 ? "triangle" : "sine" });
  // Max Cooper: polyrhythmic FM bells (cycles of 3, 5 and 7 steps against the bar) from the first pulse on
  if (p >= 0.18) {
    const cyc = [[3, [0, 1, 4, 1], 36], [5, [1, 3, 5, 4, 2], 48], [7, [4, 6, 3, 5, 2, 6, 1], 36]], lv = sm(0.18, 0.4) * (1 - 0.35 * cres);
    for (let s = 0; s < 16; s++) { const gs = bar * 16 + s; cyc.forEach(([len, degs, oct], ci) => { if (gs % len === 0 && !(ci > 0 && st >= 4 && rnd() < 0.5)) V.fmbell(T(s), mtof(pscale(root + oct, degs[Math.floor(gs / len) % degs.length])), { v: (0.08 - 0.018 * ci) * lv, len: 0.32 + 0.2 * (ci === 1), rev: 0.5, dly: 0.45 }); }); }
  }
  // drums, by stage. Slow and sparse first, then more and more intricate
  if (st === 1) { if (bar % 2 === 0) V.kick(T(0), { f0: 105, f1: 42, len: 0.4, v: 0.18 + 0.4 * sm(0.12, 0.28), duckAmt: 0.3, duckRel: 0.28 }); for (const s of rot(euclid(3, 16), (bar * 5) % 16)) V.rim(T(s), { v: 0.08 + 0.06 * rnd() }); }
  if (st === 2) {
    V.kick(T(0), { f0: 115, f1: 44, len: 0.32, v: 0.7, duckAmt: 0.4, duckRel: 0.2 }); if (rnd() < 0.5) V.kick(T([6, 10, 11][Math.floor(rnd() * 3)]), { f0: 105, f1: 44, len: 0.22, v: 0.4, duck: false });
    V.snare(T(8), { v: 0.5, tone: 185, noiseF: 2200 }); for (const s of rot(euclid(5, 16), (bar * 3) % 16)) if (rnd() < 0.7) V.snare(T(s), { v: 0.12, ghost: true });
    for (const s of rot(euclid(9, 16), (bar * 7) % 16)) V.hat(T(s), { v: 0.08 + 0.1 * rnd(), f: 7500 + rnd() * 3000 }); for (const s of rot(euclid(7, 16), (bar * 5) % 16)) V.rim(T(s), { v: 0.1 + 0.08 * rnd() });
    for (let s = 0; s < 16; s++) if (rnd() < 0.3) V.shaker(T(s), { v: 0.03 }); if (rnd() < 0.3) V.glitch(T(8 + Math.floor(rnd() * 6)), 5 + Math.floor(rnd() * 4), sd * 0.55, { v: 0.12 });
  }
  if (st === 3) {
    const k = [[0, 3, 10], [0, 6, 10, 13], [0, 3, 8, 11]][ch % 3], two = p >= 0.6; for (const s of k) V.kick(T(s), { f0: 135, f1: 46, len: 0.26, v: 0.88, duckAmt: 0.5, duckRel: 0.15 });
    for (const s of two ? [4, 12] : [8]) V.snare(T(s), { v: 0.88, tone: 190, noiseF: 2300 }); for (const s of [7, 9, 15]) if (rnd() < 0.5) V.snare(T(s), { v: 0.2, ghost: true });
    for (let s = 0; s < 16; s++) if (s % 2 === 0 || rnd() < 0.5) V.hat(T(s), { v: s % 4 === 2 ? 0.26 : 0.12, open: s === 14 && rnd() < 0.4 }); if (rnd() < 0.3) V.glitch(T(8 + Math.floor(rnd() * 6)), 5 + Math.floor(rnd() * 5), sd * 0.55, { v: 0.14 });
  }
  if (st >= 4) {
    const fill = ph === 7; for (const s of [0, 10, ...(rnd() < 0.3 ? [7] : [])]) V.kick(T(s), { f0: 155, f1: 46, len: 0.26, v: 0.95, dist: st === 5, duckAmt: 0.6, duckRel: 0.15 });
    if (!fill) for (const s of [4, 12]) V.snare(T(s), { v: 1.0, tone: 175, noiseF: 2000 }); for (const s of [7, 9, 14, 15]) if (rnd() < 0.3 + 0.2 * cres) V.snare(T(s), { v: 0.22, ghost: true });
    if (fill) for (let s = 8; s < 16; s++) V.snare(T(s), { v: 0.3 + (s - 8) * 0.1, tone: 210 + s * 4 });
    for (let s = 0; s < 16; s++) if (s % 2 === 0 || rnd() < 0.5) V.hat(T(s), { v: s % 4 === 2 ? 0.28 : 0.13, open: (s === 6 || s === 14) && rnd() < 0.4 });
  }
  // the low end: a slow sine pulse, a rolling reese, and finally the talking neuro bass
  if (p >= 0.12 && st < 4) { V.sub(T(0), mtof(root + 12), barDur * 0.9, { v: 0.18 + 0.15 * sm(0.12, 0.4) }); if (p >= 0.3 && rnd() < 0.5) V.sub(T(10), mtof(root + 12), barDur * 0.3, { v: 0.2 }); }
  if (st === 3) for (const s of [0, 3, 6, 10, 11, 14]) { const nx = { 0: 3, 3: 6, 6: 10, 10: 11, 11: 14, 14: 16 }[s]; V.reese(T(s), mtof(root + 12), (nx - s) * sd * 0.9, { cut: 300 + 900 * sm(0.5, 0.7), det: 12, v: 0.16 * sm(0.5, 0.62), drive: true }); }
  if (st >= 4) {
    const pat = [[0, 6, 10, 14], [0, 3, 6, 10, 12], [0, 4, 8, 11, 14]][ch % 3], ne = sm(0.78, 0.9);
    for (let i = 0; i < pat.length; i++) { const s = pat[i], nx = pat[i + 1] ?? 16, dur = (nx - s) * sd * 0.92, n = root + 12 + (i === pat.length - 1 && rnd() < 0.4 ? 7 : 0) + (rnd() < 0.15 ? 12 : 0);
      if (ne > 0.05) V.neuro(T(s), mtof(n), dur, { v: 0.06 + 0.2 * ne + 0.1 * cres, rate: 2.5 + rnd() * 6, f1: 300 + rnd() * 500, f2: 900 + rnd() * 900, index: 1 + rnd() * 0.9 + 0.5 * cres, ratio: rnd() < 0.5 ? 2 : 1.5 });
      V.reese(T(s), mtof(n), dur, { cut: 400 + 800 * p, det: 14, v: 0.17 * (1 - 0.6 * ne), drive: true }); V.sub(T(s), mtof(n), dur, { v: 0.4 }); }
    if (ne > 0.3 && ph % 2 === 1) V.stab(T(3), chord.slice(0, 3).map((m) => mtof(m + 12)), 0.2, { v: 0.1 * ne });
  }
  // movement: a sweep at the start of each phrase, and a riser through the build
  if (p >= 0.3 && ph === 0) V.sweep(T(0), barDur, { f0: 6500, f1: 400, v: 0.05 });
  if (p >= 0.5 && p < 0.9 && ph === 6) V.riser(T(0), barDur * 2, { v: 0.12 * sm(0.5, 0.85) });
  if (p >= 0.55 && p < 0.7 && ph === 7) for (let s = 12; s < 16; s += 2) V.snare(T(s), { v: 0.3 + (s - 12) * 0.06, tone: 200 });
}

export class Journey {
  constructor() { this.ctx = null; this.live = false; this.cb = {}; this.offset = 0; this.startAt = 0; this.bar = 0; this.stage = -1; this.cycle = 0; this.last = 0; this.bpm = 64; }
  on(name, fn) { this.cb[name] = fn; return this; }
  get ready() { return !!this.ctx; }
  get elapsed() { return this.ctx ? this.ctx.currentTime - this.startAt + this.offset : 0; }
  get p() { return this.ctx && this.live ? journeyAt(this.elapsed).p : 0; }
  async start(p0 = 0) {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }); this.M = makeMaster(this.ctx); this.analyser = this.M.analyser;
      this.B = makeBuses(this.ctx, this.M, 64, 1.0); this.V = createVoices(this.ctx, this.B); this.bed = createBed(this.ctx, this.B);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.M.gain.gain.cancelScheduledValues(this.ctx.currentTime); this.M.gain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
    this.live = true; this.startAt = this.ctx.currentTime + 0.1; this.offset = p0 * JOURNEY.secs; this.nextT = this.startAt; this.bar = 0; this.stage = -1; this._clock();
  }
  seek(p) { if (!this.live) return; this.offset = clamp(p, 0, 1) * JOURNEY.secs - (this.ctx.currentTime - this.startAt); this.stage = -1; const t = this.ctx.currentTime + 0.05; this.V.sweep(t, 0.6, { f0: 9000, f1: 400, v: 0.08 }); this.V.glitch(t, 6, 0.04, { v: 0.12 }); }
  resume() { if (this.ctx && this.ctx.state !== "running") this.ctx.resume(); }
  _clock() {
    if (this.worker) return;
    try { this.worker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),40)"], { type: "text/javascript" }))); this.worker.onmessage = () => this._tick(); }
    catch (e) { this.timer = setInterval(() => this._tick(), 40); }
  }
  _tick() {
    if (!this.live) return;
    while (this.nextT < this.ctx.currentTime + 0.9) {
      const e = this.nextT - this.startAt + this.offset, { p, cycle } = journeyAt(e), bpm = bpmAt(p), st = stageOf(p); this.bpm = bpm;
      try {
        if (cycle !== this.cycle) { this.cycle = cycle; this.V.impact(this.nextT, { v: 0.7 }); this.V.sweep(this.nextT, 1.2, { f0: 400, f1: 9000, v: 0.08 }); }      // the loop restarts with a hit
        this.B.setBpm(bpm); this.bed.update(p, this.nextT); this.B.out.gain.setTargetAtTime(Math.pow(10, gainDb(p) / 20), this.nextT, 1.5);
        if (st !== this.stage) { if (this.stage >= 0 && st > this.stage) { this.V.impact(this.nextT, { v: 0.45 + 0.08 * st }); this.V.sweep(this.nextT, 60 / bpm * 4, { f0: 8000, f1: 500, v: 0.07 }); } if (st === 5 && this.cb.crescendo) this.cb.crescendo(); this.stage = st; if (this.cb.stage) this.cb.stage(st); }
        scheduleJourneyBar(p, this.bar, this.nextT, this.V, bpm);
      } catch (err) { console.error("Journey bar failed (skipped):", err); }                                         // never replay a bad bar
      this.nextT += 240 / bpm; this.bar++;
    }
  }
  pluck(midi) { if (!this.live) return; const pc = ((midi - JOURNEY.root) % 12 + 12) % 12, near = PHRYG.reduce((b, n) => (Math.abs(n - pc) < Math.abs(b - pc) ? n : b), 0); this.V.fmbell(this.ctx.currentTime + 0.01, mtof(midi - pc + near), { v: 0.11, len: 0.7, rev: 0.6 }); }
  tick() { if (this.live) this.V.rim(this.ctx.currentTime + 0.01, { v: 0.3 }); }
  stop() { this.live = false; if (this.worker) { this.worker.terminate(); this.worker = null; } clearInterval(this.timer); if (this.ctx) { this._stopAt = this.ctx.currentTime; this.M.gain.gain.cancelScheduledValues(this.ctx.currentTime); this.M.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); } }
  level() { const an = this.analyser; if (!an) return 0; const b = new Uint8Array(an.fftSize); an.getByteTimeDomainData(b); let s = 0; for (const x of b) { const d = (x - 128) / 128; s += d * d; } return Math.sqrt(s / b.length); }
}

// ───────────────────────────────────────────────── Ascent: the homepage music. One number (0..1) is the whole arrangement.
// Low = spacious, Max Cooper-ish: polyrhythmic FM bells, a granular cloud, sparse half-time pulse.
// Rising = breaks, then hard two-step drum & bass. The top = a Noisia-ish drop with a talking neuro bass.
export const ASCENT_TRK = { bpm: 174, stepDur: 60 / 174 / 4, barDur: 240 / 174, root: 29, trim: 1 };

export function scheduleAscentBar(a, bar, t0, V, trk = ASCENT_TRK, opts = {}) {
  const sd = trk.stepDur, T = (s) => t0 + s * sd, rnd = mulberry32(((bar + (opts.seed || 0) * 977) * 2654435761 + 12345) >>> 0), ph = bar % 8, ch = Math.floor(bar / 2) % 4;
  const off = [0, -4, -9, -2][ch], qual = [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 11], [0, 4, 7, 10]][ch], root = trk.root + off, chord = qual.map((i) => root + 24 + i);
  const sm = (lo, hi) => sstep(clamp((a - lo) / (hi - lo), 0, 1));
  const L = { amb: 1 - 0.55 * sm(0.45, 0.9), pulse: sm(0.1, 0.3), half: sm(0.2, 0.38), brk: sm(0.4, 0.58), dnb: sm(0.62, 0.78), drop: sm(0.88, 0.96), hat: sm(0.3, 0.5), arp: sm(0.05, 0.2), grain: 1 - sm(0.5, 0.85) };
  if (opts.full) { L.grain = 0.8; L.amb = 1; }                                                       // the end of the page: every part at once
  const stage = a >= 0.62 ? "dnb" : a >= 0.4 ? "brk" : "half";
  // the groove (the opening "pop"): a swung, rolling 16-step bass line over a soft kick, backbeat and offbeat hats, in the spirit of a looping instrument. It carries the intro, then hands over to the drums.
  const G = opts.full ? 0 : (0.55 + 0.45 * sm(0, 0.15)) * (1 - sm(0.52, 0.72));
  if (G > 0.02) {
    const GP = [0, -1, 0, 2, -1, 4, -1, 3, 0, -1, 5, -1, 4, 2, -1, 7], sw = 0.07 * 2 * sd;
    for (let k = 0; k < 8; k++) {
      const i = (bar % 2) * 8 + k, t = T(k * 2) + (k % 2 ? sw : 0), deg = GP[i];
      if (deg >= 0) { const f = mtof(scaleNote(root + 12, deg)); V.acid(t, f, sd * 2 * 0.85, { sq: true, q: 6, top: 1500 + 1800 * a, bot: 240, v: 0.17 * G }); if (deg === 0) V.sub(t, f, sd * 2 * 0.9, { v: 0.2 * G }); }
      if (k % 2) V.hat(t, { v: 0.1 * G, open: k === 3 });
      if (k === 2 || k === 6) V.clap(t, { v: 0.22 * G, rev: 0.4 });
    }
    if (stage === "half" && L.half < 0.6) for (const kk of [0, 8]) V.kick(T(kk), { f0: 118, f1: 46, len: 0.28, v: 0.55 * G * (1 - L.half), duckAmt: 0.3, duckRel: 0.2 });
  }
  // harmony: a slow cloud of pad, one chord per two bars
  if (bar % 2 === 0) V.pad(T(0), chord.map(mtof), trk.barDur * 2.04, { v: 0.05 * L.amb + 0.012, cut: 500 + 1500 * a, att: 1.0, rel: 1.0, rev: 0.55, dly: 0.1 });
  // the granular cloud (it thins out as the drums arrive)
  if (L.grain > 0.03) for (let k = 0; k < 7; k++) if (rnd() < 0.85 * L.grain) { const deg = Math.floor(rnd() * 7), n = scaleNote(root + 36 + 12 * Math.floor(rnd() * 2), deg); V.grain(T(Math.floor(rnd() * 8) * 2), mtof(n), 0.07 + rnd() * 0.12, { v: 0.032 * (0.5 + L.grain), pan: (rnd() - 0.5) * 1.6, type: rnd() < 0.3 ? "triangle" : "sine" }); }
  // Max Cooper: three cycles of different lengths against the bar (3, 5 and 7 steps), so the pattern keeps shifting
  if (L.arp > 0.03) {
    const cyc = [[3, [0, 2, 4, 2], 36], [5, [1, 3, 5, 4, 2], 48], [7, [4, 6, 3, 5, 2, 6, 1], 36]];
    for (let s = 0; s < 16; s++) { const gs = bar * 16 + s; cyc.forEach(([len, degs, oct], ci) => { if (gs % len === 0) { if ((ci === 1 && a < 0.15) || (ci === 2 && a < 0.3)) return; if (ci > 0 && L.dnb > 0.5 && L.drop < 0.5 && rnd() < 0.5) return; const deg = degs[Math.floor(gs / len) % degs.length]; V.fmbell(T(s), mtof(scaleNote(root + oct, deg)), { v: (0.085 - 0.02 * ci) * L.arp * (1 - 0.35 * L.drop), len: 0.32 + 0.2 * (ci === 1), rev: 0.5, dly: 0.45 }); } }); }
  }
  // sparse half-time pulse, then breaks, then two-step drum & bass
  if (L.half > 0.04 && stage === "half") { V.kick(T(0), { f0: 120, f1: 44, len: 0.3, v: 0.62 * L.half, duckAmt: 0.35, duckRel: 0.2 }); if (rnd() < 0.5) V.kick(T(10), { f0: 110, f1: 44, len: 0.25, v: 0.4 * L.half, duck: false }); V.rim(T(8), { v: 0.2 * L.half }); for (const s of [4, 12]) if (rnd() < 0.6) V.rim(T(s), { v: 0.1 * L.half }); }
  if (stage === "brk") { for (const s of [0, 10]) V.kick(T(s), { f0: 135, f1: 46, len: 0.26, v: 0.88, duckAmt: 0.5, duckRel: 0.15 }); V.snare(T(8), { v: 0.85, tone: 190 }); for (const s of [7, 15]) if (rnd() < 0.45) V.snare(T(s), { v: 0.2, ghost: true }); }
  if (stage === "dnb") {
    const fill = ph === 7;
    for (const s of [0, 10, ...(rnd() < 0.3 ? [7] : [])]) V.kick(T(s), { f0: 155, f1: 46, len: 0.26, v: 0.95, dist: L.drop > 0.5, duckAmt: 0.6, duckRel: 0.15 });
    if (!fill) for (const s of [4, 12]) V.snare(T(s), { v: 1.0, tone: 175, noiseF: 2000 });
    for (const s of [7, 9, 14, 15]) if (rnd() < 0.3 + 0.2 * L.drop) V.snare(T(s), { v: 0.22, ghost: true });
    if (fill) for (let s = 8; s < 16; s++) V.snare(T(s), { v: 0.3 + (s - 8) * 0.1, tone: 210 + s * 4 });
  }
  if (L.hat > 0.04) for (let s = 0; s < 16; s++) if (s % 2 === 0 || rnd() < 0.45 * L.hat) V.hat(T(s), { v: (s % 4 === 2 ? 0.28 : 0.13) * L.hat, open: stage === "dnb" && (s === 6 || s === 14) && rnd() < 0.4 });
  // a stutter of glitch clicks now and then (the micro-edits)
  if (a > 0.18 && rnd() < 0.18 + 0.2 * L.brk) V.glitch(T(8 + Math.floor(rnd() * 6)), 5 + Math.floor(rnd() * 5), sd * 0.55, { v: 0.14 });
  // the low end: a soft sine pulse, then a rolling reese, then the Noisia neuro drop
  if (a > 0.1 && stage !== "dnb") V.sub(T(0), mtof(root + 12), trk.barDur * 0.85, { v: 0.3 * (0.4 + 0.6 * L.pulse) });
  if (stage === "brk") for (const s of [0, 3, 6, 10, 11, 14]) { const nx = { 0: 3, 3: 6, 6: 10, 10: 11, 11: 14, 14: 16 }[s]; V.reese(T(s), mtof(root + 12), (nx - s) * sd * 0.9, { cut: 300 + 900 * a, det: 12, v: 0.15 * L.brk, drive: true }); }
  if (stage === "dnb") {
    const pat = [[0, 6, 10, 14], [0, 3, 6, 10, 12], [0, 4, 8, 11, 14]][ch % 3];
    for (let i = 0; i < pat.length; i++) {
      const s = pat[i], nx = pat[i + 1] ?? 16, dur = (nx - s) * sd * 0.92, n = root + 12 + (i === pat.length - 1 && rnd() < 0.4 ? 7 : 0) + (rnd() < 0.15 ? 12 : 0);
      if (L.drop > 0.3) V.neuro(T(s), mtof(n), dur, { v: 0.2 * L.drop + 0.04, rate: 2.5 + rnd() * 6, f1: 300 + rnd() * 500, f2: 900 + rnd() * 900, index: 1 + rnd() * 0.9, ratio: rnd() < 0.5 ? 2 : 1.5 });
      V.reese(T(s), mtof(n), dur, { cut: 400 + 800 * a, det: 14, v: 0.18 * (1 - 0.6 * L.drop), drive: true }); V.sub(T(s), mtof(n), dur, { v: 0.4 });
    }
    if (L.drop > 0.3 && ph % 2 === 1) V.stab(T(3), chord.slice(0, 3).map((m) => mtof(m + 12)), 0.2, { v: 0.1 * L.drop });
  }
  // movement: a sweep at the start of each phrase, a riser through the second half of every phrase while it is building
  if (a > 0.45 && ph === 0) V.sweep(T(0), trk.barDur, { f0: 6500, f1: 400, v: 0.06 });
  if (a > 0.5 && a < 0.92 && ph === 6) V.riser(T(0), trk.barDur * 2, { v: 0.12 * sm(0.5, 0.8) });
}

// The parts a listener can solo, mute and turn up at the end of the page. Every voice belongs to one stem.
export const ASCENT_STEMS = [
  { id: "drums", label: "Drums", voices: ["kick", "snare", "clap", "rim", "tom"] }, { id: "hats", label: "Hats", voices: ["hat", "shaker"] },
  { id: "bass", label: "Bass", voices: ["sub", "reese", "acid"] }, { id: "neuro", label: "Neuro", voices: ["neuro"] },
  { id: "bells", label: "Bells", voices: ["fmbell", "pluck", "lead"] }, { id: "pad", label: "Pad", voices: ["pad", "stab"] },
  { id: "texture", label: "Texture", voices: ["grain", "glitch", "dust"] }, { id: "fx", label: "FX", voices: ["sweep", "riser", "impact"] },
];
const STEM_OF = Object.fromEntries(ASCENT_STEMS.flatMap((s) => s.voices.map((v) => [v, s.id])));
function mixProxy(V, ctl) {
  return new Proxy(V, { get(t, k) {
    const f = t[k], id = STEM_OF[k]; if (typeof f !== "function" || !id) return f;
    return (...args) => { const m = ctl.stemGain(id); if (m <= 0) return; const o = args[args.length - 1]; if (m !== 1 && o && typeof o === "object" && typeof o.v === "number") args[args.length - 1] = { ...o, v: o.v * m }; return f(...args); };
  } });
}

export class Ascent {
  constructor() { this.ctx = null; this.target = 0.03; this.a = 0.03; this.live = false; this.bar = 0; this.last = 0; this.full = false; this.solo = new Set(); this.mute = new Set(); this.vol = {}; this.keyShift = 0; this.tempo = 174; this.seed = 0; }
  get ready() { return !!this.ctx; }
  async start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }); this.M = makeMaster(this.ctx); this.analyser = this.M.analyser;
      this.B = makeBuses(this.ctx, this.M, ASCENT_TRK.bpm, 1.0); this.V = createVoices(this.ctx, this.B); this.VM = mixProxy(this.V, this);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    const wait = this._stopAt && this.ctx.currentTime - this._stopAt < 1.0 ? 1.0 : 0;           // a quick off/on: let the old look-ahead notes finish first
    this.M.gain.gain.cancelScheduledValues(this.ctx.currentTime); this.M.gain.gain.setTargetAtTime(0.9, this.ctx.currentTime + wait, 0.05);
    this.live = true; this.nextT = this.ctx.currentTime + 0.12 + wait; this.bar = 0; this.last = performance.now(); this._clock();
  }
  setAscent(a) { this.target = clamp(a, 0, 1); }
  stemGain(id) { if (this.solo.size && !this.solo.has(id)) return 0; if (this.mute.has(id)) return 0; return this.vol[id] ?? 1; }
  setSolo(id, on) { on ? this.solo.add(id) : this.solo.delete(id); }
  setMute(id, on) { on ? this.mute.add(id) : this.mute.delete(id); }
  setVol(id, v) { this.vol[id] = clamp(v, 0, 1.5); }
  setKey(semis) { this.keyShift = clamp(Math.round(semis), -6, 6); }
  setTempo(bpm) { this.tempo = clamp(Math.round(bpm), 140, 190); if (this.B && this.B.setBpm) this.B.setBpm(this.tempo); }
  reshuffle() { this.seed = (this.seed + 1) % 1000; }
  resetMix() { this.solo.clear(); this.mute.clear(); this.vol = {}; this.keyShift = 0; this.setTempo(174); this.seed = 0; }
  resume() { if (this.ctx && this.ctx.state !== "running") this.ctx.resume(); }
  _clock() {
    if (this.worker) return;
    try { this.worker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),40)"], { type: "text/javascript" }))); this.worker.onmessage = () => this._tick(); }
    catch (e) { this.timer = setInterval(() => this._tick(), 40); }
  }
  _tick() {
    if (!this.live) return; const now = performance.now(), dt = Math.min(0.2, (now - this.last) / 1000); this.last = now;
    this.a += (this.target - this.a) * Math.min(1, dt * 1.6);                                   // the music follows you, a beat behind
    while (this.nextT < this.ctx.currentTime + 0.9) {
      const bd = 240 / this.tempo, trk = { ...ASCENT_TRK, bpm: this.tempo, stepDur: bd / 16, barDur: bd, root: ASCENT_TRK.root + this.keyShift };
      try { scheduleAscentBar(this.full ? 1 : this.a, this.bar, this.nextT, this.full ? this.VM : this.V, trk, { full: this.full, seed: this.seed }); } catch (e) { console.error("Ascent bar failed (skipped):", e); }       // never replay a bad bar
      this.nextT += bd; this.bar++;
    }
  }
  boom() { if (!this.live) return; const t = this.ctx.currentTime + 0.05; const W = this.full ? this.VM : this.V; W.impact(t, { v: 0.9 }); W.sweep(t, 0.9, { f0: 9000, f1: 300, v: 0.1 }); }
  pluck(midi) { if (!this.live) return; const pc = ((midi - ASCENT_TRK.root) % 12 + 12) % 12, MIN = [0, 2, 3, 5, 7, 8, 10], near = MIN.reduce((b, n) => (Math.abs(n - pc) < Math.abs(b - pc) ? n : b), 0); (this.full ? this.VM : this.V).fmbell(this.ctx.currentTime + 0.01, mtof(midi - pc + near), { v: 0.12, len: 0.6, rev: 0.5 }); }
  tick() { if (this.live) (this.full ? this.VM : this.V).rim(this.ctx.currentTime + 0.01, { v: 0.3 }); }
  stop() { this.live = false; if (this.worker) { this.worker.terminate(); this.worker = null; } clearInterval(this.timer); if (this.ctx) { this.M.gain.gain.cancelScheduledValues(this.ctx.currentTime); this.M.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06); } }
  level() { const an = this.analyser; if (!an) return 0; const b = new Uint8Array(an.fftSize); an.getByteTimeDomainData(b); let s = 0; for (const x of b) { const d = (x - 128) / 128; s += d * d; } return Math.sqrt(s / b.length); }
}

// Analysis + auto-rating. Turns a buffer into numbers, then into a 0-100 "ship-readiness" score
// measured against per-category game-audio norms (length, tail, headroom, loudness, spectrum...).
import { SR, db, peakOf, truePeak, kweight, spectrum, clamp } from './dsp.js';

export function analyze(chs, sr = SR) {
  const n = chs[0].length, x = chs[0];
  const mono = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < n; i++) mono[i] += c[i] / chs.length;

  const peak = Math.max(...chs.map(peakOf)), tp = Math.max(...chs.map(truePeak));
  let sq = 0, dc = 0, clip = 0;
  for (let i = 0; i < n; i++) { sq += mono[i] * mono[i]; dc += mono[i]; }
  for (const c of chs) for (let i = 0; i < n; i++) if (Math.abs(c[i]) >= 0.999) clip++;
  const rms = Math.sqrt(sq / n); dc /= n;

  // 5 ms RMS envelope -> attack / decay / tail behaviour
  const hop = Math.max(1, Math.round(0.005 * sr)), m = Math.floor(n / hop), e = new Float32Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < hop; j++) s += mono[i * hop + j] ** 2; e[i] = Math.sqrt(s / hop); }
  let pi = 0; for (let i = 0; i < m; i++) if (e[i] > e[pi]) pi = i;
  const ep = e[pi] || 1e-9;
  let first = 0; while (first < m && e[first] < ep * 0.1) first++;
  let lastLoud = m - 1; while (lastLoud > 0 && e[lastLoud] < ep * 0.01) lastLoud--;   // -40 dB
  let lastAudible = m - 1; while (lastAudible > 0 && e[lastAudible] < ep * 0.001) lastAudible--; // -60 dB
  let head = 0; while (head < m && e[head] < ep * 0.003) head++;
  const attackMs = Math.max(0, (pi - first) * hop / sr * 1000);
  const tail40Ms = Math.max(0, (lastLoud - pi) * hop / sr * 1000);
  const tail60Ms = Math.max(0, (lastAudible - pi) * hop / sr * 1000);
  const endDb = db((e[m - 1] || 0) / ep);            // how loud the very end still is vs peak
  const startAbs = Math.abs(x[0]) / Math.max(peak, 1e-9);

  // Loudness: K-weighted, loudest 400 ms window (short SFX never fill a 3 s integration window)
  const kw = chs.map((c) => kweight(c, sr)), W = Math.min(n, Math.round(0.4 * sr)), stp = Math.max(1, Math.round(0.05 * sr));
  let best = 0;
  for (let s = 0; s + W <= n; s += stp) { let t = 0; for (const k of kw) for (let i = s; i < s + W; i++) t += k[i] * k[i]; best = Math.max(best, t / W); }
  if (n <= W) { let t = 0; for (const k of kw) for (let i = 0; i < n; i++) t += k[i] * k[i]; best = t / n; }
  const lufs = -0.691 + 10 * Math.log10(Math.max(best, 1e-12));

  // Spectrum
  const sp = spectrum(mono, 2048), bin = sr / 2048;
  let tot = 0, cw = 0; const bands = { sub: 0, low: 0, mid: 0, pres: 0, air: 0 };
  for (let i = 1; i < sp.length; i++) {
    const f = i * bin, v = sp[i]; tot += v; cw += v * f;
    if (f < 90) bands.sub += v; else if (f < 300) bands.low += v; else if (f < 2000) bands.mid += v; else if (f < 6000) bands.pres += v; else bands.air += v;
  }
  const centroid = cw / Math.max(tot, 1e-20);
  for (const k in bands) bands[k] = bands[k] / Math.max(tot, 1e-20);

  // Stereo correlation
  let corr = 1;
  if (chs.length > 1) { let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += chs[0][i] * chs[1][i]; b += chs[0][i] ** 2; c += chs[1][i] ** 2; } corr = a / Math.sqrt(b * c + 1e-12); }

  // Loop seam: level + slope jump across the wrap point
  // compared with the signal's own sample-to-sample movement, so noisy loops aren't falsely flagged
  let mad = 0; for (let i = 1; i < n; i++) mad += Math.abs(x[i] - x[i - 1]); mad = mad / Math.max(1, n - 1) + 1e-6;
  const seam = Math.abs(x[0] - x[n - 1]) / mad;

  return {
    sr, ch: chs.length, dur: n / sr, durMs: n / sr * 1000, peakDb: db(peak), tpDb: db(tp), rmsDb: db(rms), lufs,
    crestDb: db(peak) - db(rms), dc, clip, attackMs, tail40Ms, tail60Ms, endDb, headMs: head * hop / sr * 1000, startAbs,
    centroid, bands, corr, seam,
  };
}

// ---------- category profiles (industry-ish norms for a one-shot / loop) ----------
// len: [min,max] ms of good length. tail: max ms to fall 40 dB below peak. lufs: loudest-400ms target.
// centroid: healthy spectral centre (Hz). attack: max ms to reach peak.
export const PROFILES = {
  ui:        { label: 'UI',              len: [40, 600],    tail: 250,  lufs: -14, centroid: [500, 7000],  attack: 25,  mono: true },
  pistol:    { label: 'Pistol',          len: [120, 650],   tail: 380,  lufs: -17, centroid: [300, 3500],  attack: 8,   mono: true },
  energy:    { label: 'Laser / Energy',  len: [100, 1200],  tail: 700,  lufs: -14, centroid: [400, 5500],  attack: 35,  mono: true },
  impact:    { label: 'Impact / Hit',    len: [80, 900],    tail: 500,  lufs: -19, centroid: [100, 3500],  attack: 12,  mono: true },
  explosion: { label: 'Explosion',       len: [600, 3500],  tail: 1900, lufs: -14, centroid: [80, 2500],   attack: 60,  mono: false },
  whoosh:    { label: 'Whoosh / Swish',  len: [250, 1800],  tail: 700,  lufs: -16, centroid: [500, 4500],  attack: 900, mono: false },
  sweep:     { label: 'Riser / Sweep',   len: [250, 1500],  tail: 600,  lufs: -15, centroid: [400, 4500],  attack: 900, mono: true },
  mech:      { label: 'Mechanical',      len: [100, 1500],  tail: 520,  lufs: -18, centroid: [300, 6000],  attack: 400, mono: true },
  pickup:    { label: 'Pickup / Power',  len: [150, 1200],  tail: 550,  lufs: -13, centroid: [900, 6500],  attack: 220, mono: true },
  loop:      { label: 'Loop (grind/amb)',len: [1200, 8000], tail: 99999, lufs: -16, centroid: [200, 4200], attack: 99999, mono: false, loop: true },
  misc:      { label: 'Misc',            len: [60, 2500],   tail: 900,  lufs: -15, centroid: [200, 6500],  attack: 400, mono: false },
};

export function guessCategory(name = '', tags = []) {
  const s = (name + ' ' + tags.join(' ')).toLowerCase();
  const rules = [
    [/pistol|gun|shot|fire_|revolver|shoot/, 'pistol'], [/loop|grind|rail|scrape|hum|engine/, 'loop'],
    [/explo|boom|blast/, 'explosion'], [/whoosh|swish|swipe|slide|thrust|flyby|riser|sweep/, 'whoosh'],
    [/laser|phaser|zap|plasma|beam|energy|shield|zwoosh/, 'energy'], [/impact|hit|punch|thud|metal|plate|glass|wood|soft|heavy|crash/, 'impact'],
    [/door|servo|engine|motor|lock|latch|mech|machine|gear|switch/, 'mech'], [/pickup|coin|power|upgrade|bonus|collect|select|confirm|pepper/, 'pickup'],
    [/click|tap|button|bong|toggle|error|back|open|close|maximize|minimize|drop|scroll|tick|ui/, 'ui'],
  ];
  for (const [re, c] of rules) if (re.test(s)) return c;
  return 'misc';
}

// score helper: 1 inside [lo,hi], linear falloff to 0 at (lo-soft) / (hi+soft)
const band = (v, lo, hi, soft) => v < lo ? clamp(1 - (lo - v) / soft, 0, 1) : v > hi ? clamp(1 - (v - hi) / soft, 0, 1) : 1;

export const DEFAULT_WEIGHTS = { length: 18, tail: 16, headroom: 14, loudness: 10, clean: 12, attack: 10, tone: 14, format: 6 };

/** How much each check matters for a category. Weights are relative; they get normalised. */
export function weightsFor(cat) {
  // TODO(human): tune the pistol (and any other) weighting. A pistol is judged on
  // crack/attack + tight tail far more than on loudness — decide how harshly to punish
  // a long tail or slow attack for `pistol`, and whether `loop` should ignore attack/tail.
  if (cat === 'pistol') return { ...DEFAULT_WEIGHTS, attack: 16, tail: 20, length: 16, loudness: 6 };
  if (cat === 'loop') return { ...DEFAULT_WEIGHTS, attack: 0, tail: 0, clean: 26, length: 14 };
  return DEFAULT_WEIGHTS;
}

export function rate(a, cat = 'misc') {
  const P = PROFILES[cat] || PROFILES.misc, W = weightsFor(cat), C = [];
  const push = (id, label, s, note) => C.push({ id, label, score: clamp(s, 0, 1), note, level: s >= 0.85 ? 'good' : s >= 0.55 ? 'warn' : 'bad' });

  push('length', 'Length', band(a.durMs, P.len[0], P.len[1], P.len[1] * 0.8),
    `${Math.round(a.durMs)} ms (good: ${P.len[0]}–${P.len[1]})`);
  if (!P.loop) push('tail', 'Tail / reverb', band(a.tail40Ms, 0, P.tail, P.tail * 1.2), `−40 dB in ${Math.round(a.tail40Ms)} ms (max ${P.tail})`);
  else push('tail', 'Tail', 1, 'n/a for loops');
  const over = a.tpDb - -1;
  push('headroom', 'Headroom', a.clip > 0 ? 0 : a.tpDb > -0.3 ? 0.35 : a.tpDb > -1.05 ? 0.9 : a.peakDb < -12 ? 0.5 : a.peakDb < -6 ? 0.8 : 1,
    a.clip ? `${a.clip} clipped samples` : `true peak ${a.tpDb.toFixed(1)} dBTP` + (over > 0 ? ' (over −1)' : ''));
  push('loudness', 'Loudness', band(a.lufs, P.lufs - 3, P.lufs + 3, 9), `${a.lufs.toFixed(1)} LUFS-400ms (target ${P.lufs})`);

  let clean = 1, note = 'clean start & end';
  if (Math.abs(a.dc) > 0.005) { clean -= 0.3; note = 'DC offset'; }
  if (!P.loop) {
    if (a.startAbs > 0.08) { clean -= 0.35; note = 'click at start (fade in)'; }
    if (a.endDb > -45) { clean -= 0.4; note = 'abrupt end (fade out)'; }
    if (a.headMs > 12) { clean -= 0.2; note = `${Math.round(a.headMs)} ms dead air at head`; }
  } else if (a.seam > 4) { clean -= clamp((a.seam - 4) / 10, 0.15, 0.7); note = `loop seam will click (${a.seam.toFixed(1)}� step)`; }
  push('clean', 'Cleanliness', clean, note);

  if (!P.loop) push('attack', 'Attack', band(a.attackMs, 0, P.attack, P.attack * 2 + 20), `${a.attackMs.toFixed(0)} ms to peak (max ${P.attack})`);
  else push('attack', 'Attack', 1, 'n/a for loops');

  const harsh = a.bands.pres + a.bands.air;
  let tone = band(a.centroid, P.centroid[0], P.centroid[1], P.centroid[1] * 0.6);
  if (cat === 'loop' && a.bands.air > 0.12) tone *= 0.7;
  push('tone', 'Tone', tone, `centre ${Math.round(a.centroid)} Hz · presence+air ${(harsh * 100).toFixed(0)}%`);

  const fmtOK = (a.sr === 44100 || a.sr === 48000) && (!P.mono || a.ch === 1 || a.corr > 0.98);
  push('format', 'Godot format', fmtOK ? 1 : 0.5, `${a.sr} Hz · ${a.ch} ch` + (P.mono && a.ch > 1 ? ' (mono better for 3D/2D positional)' : ''));

  let sw = 0, sc = 0;
  for (const c of C) { const w = W[c.id] ?? 0; sw += w; sc += w * c.score; }
  const score = Math.round((sc / Math.max(sw, 1)) * 100);
  const worst = C.some((c) => c.level === 'bad' && (W[c.id] ?? 0) > 0);
  const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  return { score, grade, checks: C, ship: score >= 80 && !worst, cat };
}

/** Blend of the machine score and the human star rating (stars 1-5 -> 20-100). */
export function combined(auto, stars) { return stars ? Math.round(auto * 0.6 + stars * 20 * 0.4) : auto; }

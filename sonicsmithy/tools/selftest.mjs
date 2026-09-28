// Generates one of everything, analyses + rates it, writes WAVs for listening. `node tools/selftest.mjs [outdir]`
import { KINDS, makeSfx, PISTOL_KINDS, makePistol, railLoop, railLand, railLeave } from '../js/synth.js';
import { analyze, rate, PROFILES } from '../js/analyze.js';
import { encodeWav } from '../js/io.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || './_selftest'; mkdirSync(out, { recursive: true });
const row = (name, x, cat) => {
  if (x.some((v) => !Number.isFinite(v))) throw new Error(name + ' has NaN');
  const a = analyze([x]), r = rate(a, cat);
  writeFileSync(`${out}/${name}.wav`, encodeWav([x], 48000, 16, cat === 'loop' ? { start: 0, end: x.length } : null));
  console.log(name.padEnd(18), `${Math.round(a.durMs)}ms`.padStart(7), `pk${a.tpDb.toFixed(1)}`.padStart(8), `${a.lufs.toFixed(1)}LU`.padStart(8), `tail${Math.round(a.tail40Ms)}`.padStart(9), `cen${Math.round(a.centroid)}`.padStart(9), r.grade, String(r.score).padStart(3), r.checks.filter((c) => c.level !== 'good').map((c) => c.id + ':' + c.note).join(' | '));
};
for (const k of Object.keys(KINDS)) row(k, makeSfx(k, {}, 7), KINDS[k].cat);
for (const k of Object.keys(PISTOL_KINDS)) row('pistol_' + k, makePistol(k, 7, 0.08, 0.5), 'pistol');
for (const s of [0.15, 0.5, 0.9]) row('rail_' + s, railLoop({ speed: s, seed: 3 }), 'loop');
row('rail_land', railLand(), 'impact'); row('rail_leave', railLeave(), 'impact');

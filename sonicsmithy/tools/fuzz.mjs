// NaN / range fuzz over seeds. `node tools/fuzz.mjs`
import { KINDS, makeSfx, PISTOL_KINDS, makePistol, railLoop } from '../js/synth.js';
let bad = 0;
const chk = (n, x) => { let m = 0; for (const v of x) { if (!Number.isFinite(v)) { console.log('NaN', n); bad++; return; } m = Math.max(m, Math.abs(v)); } if (m < 1e-4) { console.log('SILENT', n); bad++; } };
for (let s = 1; s <= 40; s++) {
  for (const k of Object.keys(KINDS)) chk(`${k}@${s}`, makeSfx(k, {}, s));
  for (const k of Object.keys(PISTOL_KINDS)) chk(`pistol_${k}@${s}`, makePistol(k, s, 0.08, 0.5));
  if (s <= 8) chk('rail@' + s, railLoop({ seed: s }));
}
console.log(bad ? bad + ' problems' : 'fuzz clean');

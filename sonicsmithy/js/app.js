// Sonic Smithy — control panel shell: tabs, master, scope, module wiring.
import { h, $, eng, hub, lib, loadIndex, on, css } from './core.js';
import * as audition from './mod_audition.js';
import * as layer from './mod_layer.js';
import * as edit from './mod_edit.js';
import * as gen from './mod_gen.js';
import * as pistol from './mod_pistol.js';
import * as rail from './mod_rail.js';
import * as exp from './mod_export.js';
import * as sources from './mod_sources.js';
import { init as fxInit } from './fx.js';

fxInit($('#fx'));

const MODS = [
  ['audition', 'Audition', audition], ['layer', 'Layer', layer], ['edit', 'Slice · Loop', edit],
  ['generate', 'Generate', gen], ['pistol', 'Pistol Lab', pistol], ['rail', 'Rail Lab', rail],
  ['export', 'Export', exp], ['sources', 'Sources', sources],
];
const tabs = $('#tabs'), mods = $('#mods'), inst = {};
let curId = null;

function go(id) {
  if (!inst[id]) return;
  curId = id;
  for (const [k] of MODS) { inst[k].root.hidden = k !== id; inst[k].btn.classList.toggle('on', k === id); }
  inst[id].onShow && inst[id].onShow();
  try { history.replaceState(null, '', '#' + id); } catch { /* file:// */ }
}
hub.go = go;

MODS.forEach(([id, label, m], i) => {
  const mod = m.init(); inst[id] = mod; mods.append(mod.root);
  const b = h('button', { class: 'tab', type: 'button', onclick: () => go(id), title: `${label} (alt+${i + 1})` }, h('span', { class: 'n' }, i + 1), label, h('span', { class: 'arr' }, '→'));
  inst[id].btn = b; tabs.append(b);
});
document.addEventListener('keydown', (e) => {
  if (e.altKey && /^[1-8]$/.test(e.key)) { go(MODS[+e.key - 1][0]); e.preventDefault(); }
  if (e.key === 'Escape') eng.stop();
});
$('#stop').onclick = () => eng.stop();
$('#vol').oninput = (e) => eng.setVol(+e.target.value);

// mini output spectrum in the header
const sc = $('#scope'), g = sc.getContext('2d');
(function loop() {
  requestAnimationFrame(loop);
  const W = sc.width, H = sc.height; g.clearRect(0, 0, W, H);
  if (!eng.analyser) return;
  const a = new Uint8Array(eng.analyser.frequencyBinCount); eng.analyser.getByteFrequencyData(a);
  const bars = 24, grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, css('--red-hot')); grd.addColorStop(.6, css('--purple')); grd.addColorStop(1, css('--teal'));
  g.fillStyle = grd;
  for (let i = 0; i < bars; i++) { const idx = Math.floor(Math.pow(i / bars, 1.8) * a.length * 0.6) + 1, v = a[idx] / 255; g.fillRect(i * (W / bars) + 1, H - v * H, W / bars - 2, Math.max(1, v * H)); }
})();

loadIndex();
go((location.hash || '#audition').slice(1) in inst ? location.hash.slice(1) : 'audition');
on('lib', () => {});

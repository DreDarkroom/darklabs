// Pistol Lab: acquire / build / edit / rate / export pistol fire. Eight stacked layers, each in its own band.
import { h, slider, panel, btn, arrowBtn, downBtn, toast, addMade, lib, emit, Wave, miniBrowser, SR } from './core.js';
import { PISTOL_KINDS, pistolLayers, renderLayers, makePistol } from './synth.js';
import { resultView, variantGrid } from './ui_result.js';
import { analyze, rate } from './analyze.js';
import { peakOf, mul, N } from './dsp.js';
import { NOTES } from './guide.js';

export function init() {
  let kind = 'sidearm', seed = 11, variation = 0.08, sci = 0.5, layers = [], armed = null;
  const M = { ceil: -1, glue: true, drive: 1.15 };
  const rv = resultView({ cat: 'pistol', name: 'pistol' });
  const grid = variantGrid({ onKeep: (c) => { const it = addMade(c.name, c.chs, 'pistol'); emit('item', it); toast('kept ' + c.name, 'ok'); } });
  const layerBox = h('div', { class: 'layers' }), kindBox = h('div', { class: 'kinds' });
  let deb;

  const render = (play = false) => {
    const x = renderLayers(layers, { ...M, maxMs: PISTOL_KINDS[kind].maxMs });
    rv.show([x], { cat: 'pistol', name: `pistol_${kind}_${String(seed).padStart(3, '0')}` }); if (play) rv.play();
  };
  const later = () => { clearTimeout(deb); deb = setTimeout(() => render(true), 100); };

  function regen(newSeed) {
    if (newSeed != null) seed = newSeed;
    layers = pistolLayers(kind, seed, variation, sci); paintLayers(); render(true);
  }
  function paintLayers() {
    layerBox.replaceChildren(...layers.map((l, i) => {
      const cv = h('canvas', { class: 'wave lw' }), w = new Wave(cv); requestAnimationFrame(() => w.set([l.data.subarray(0, N(0.4))], SR));
      const row = h('div', { class: 'lrow' + (armed === i ? ' armed' : '') + (l.mute ? ' muted' : '') },
        h('div', { class: 'lname', onclick: () => { armed = armed === i ? null : i; paintLayers(); }, title: 'click to arm: the next ＋ in the library picker replaces this layer' }, h('b', {}, l.label), h('small', {}, l.role), armed === i ? h('em', {}, 'armed ←') : null),
        cv,
        h('div', { class: 'lctl wide' },
          slider({ label: 'gain', min: -40, max: 6, step: 0.5, value: l.gainDb, fmt: (v) => v.toFixed(1) + ' dB', onInput: (v) => { l.gainDb = v; later(); } }),
          slider({ label: 'offset', min: 0, max: 300, step: 1, value: l.offsetMs, fmt: (v) => v + ' ms', onInput: (v) => { l.offsetMs = v; later(); } })),
        h('div', { class: 'lbtn' },
          h('button', { class: 'ico' + (l.mute ? ' on' : ''), title: 'mute', onclick: () => { l.mute = !l.mute; paintLayers(); render(true); } }, 'M'),
          h('button', { class: 'ico' + (l.solo ? ' on' : ''), title: 'solo', onclick: () => { l.solo = !l.solo; paintLayers(); render(true); } }, 'S'),
          h('button', { class: 'ico', title: 're-roll just this layer', onclick: () => { l.data = pistolLayers(kind, seed + 1000 + Math.floor(Math.random() * 9999), variation, sci)[i].data; paintLayers(); render(true); } }, '↻')));
      return row;
    }));
  }
  function paintKinds() {
    kindBox.replaceChildren(...Object.entries(PISTOL_KINDS).map(([k, p]) => h('button', { class: 'kind' + (k === kind ? ' on' : ''), onclick: () => { kind = k; paintKinds(); regen(); } }, h('b', {}, p.label), h('small', {}, `≤ ${p.maxMs} ms`))));
  }
  paintKinds();

  const picker = miniBrowser({
    filterCat: null, height: 220, pickLabel: '→ layer',
    onPick: (it) => {
      if (armed == null) { toast('arm a layer first (click its name)', 'bad'); return; }
      const mono = new Float32Array(Math.min(it.chs[0].length, N(0.7)));
      for (const c of it.chs) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / it.chs.length;
      const p = peakOf(mono) || 1; layers[armed].data = mul(mono, 0.9 / p); layers[armed].gainDb = Math.min(layers[armed].gainDb, -4);
      toast(`${it.name} → ${layers[armed].label}`, 'ok'); paintLayers(); render(true);
    },
  });

  const bestOf = () => {
    const pool = [];
    for (let i = 0; i < 24; i++) { const s = Math.floor(Math.random() * 1e6), x = makePistol(kind, s, variation, sci); pool.push({ chs: [x], name: `pistol_${kind}_${String(i + 1).padStart(2, '0')}`, cat: 'pistol', label: 'seed ' + s, s, sc: rate(analyze([x]), 'pistol').score }); }
    pool.sort((a, b) => b.sc - a.sc); grid.set(pool.slice(0, 8)); toast('best 8 of 24 shown', 'ok');
  };
  const roundRobin = () => {
    for (let i = 1; i <= 8; i++) { const x = makePistol(kind, seed * 97 + i * 13, variation, sci); const it = addMade(`pistol_${kind}_${String(i).padStart(2, '0')}`, [x], 'pistol'); lib.basket.add(it.id); emit('item', it); }
    emit('basket'); toast(`8 × ${PISTOL_KINDS[kind].label} → library + export basket`, 'ok');
  };

  const root = h('section', { class: 'mod', id: 'mod-pistol', hidden: true },
    h('div', { class: 'split wide' },
      h('div', { class: 'col-list' },
        panel('Pistol type', kindBox, { open: true }),
        panel('Layer stack', h('div', {}, layerBox,
          h('p', { class: 'hint' }, 'Each layer lives in its own band (HP/LP) so they stack without mud: click ≥2 kHz · crack 0.9–9 k · body 70–1.1 k · sub <150 · zap sci-fi sweetener · action · tink · tail ≤4 k.')), { open: true }),
        panel('Acquire — swap a layer for a library / imported sound', picker, { open: false }),
        h('div', { class: 'guide' }, h('b', {}, '◆ design note'), NOTES.pistol.map((t) => h('p', {}, t)))),
      h('div', { class: 'detail' },
        h('div', { class: 'bar-row' }, arrowBtn('Generate new', () => regen(1 + Math.floor(Math.random() * 9999))), btn('↻ Re-roll seed', () => regen(seed + 1), 'ghost'),
          slider({ label: 'variation', min: 0, max: 0.3, step: 0.01, value: variation, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { variation = v; clearTimeout(deb); deb = setTimeout(() => regen(), 200); } }),
          slider({ label: 'sci-fi', min: 0, max: 1, step: 0.01, value: sci, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { sci = v; clearTimeout(deb); deb = setTimeout(() => regen(), 200); } })),
        rv.el,
        panel('Master bus', h('div', { class: 'sliders' },
          slider({ label: 'drive', min: 1, max: 2.5, step: 0.05, value: M.drive, fmt: (v) => v.toFixed(2), onInput: (v) => { M.drive = v; later(); } }),
          slider({ label: 'ceiling', min: -6, max: -0.3, step: 0.1, value: M.ceil, fmt: (v) => v.toFixed(1) + ' dBTP', onInput: (v) => { M.ceil = v; later(); } }),
          h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { M.glue = e.target.checked; render(true); } }), ' glue compressor')), { open: false }),
        panel('Rate & pick — round-robin set', h('div', {}, h('div', { class: 'bar-row' }, downBtn('Best of 24', bestOf, 'teal'), downBtn('Keep 8-variant set → basket', roundRobin)), grid.el), { open: true }))));
  return { root, onShow() { if (!layers.length) regen(); } };
}

// SFX Generator: procedural sounds from scratch with pro defaults (short, dry-ish, mastered).
import { h, slider, panel, btn, arrowBtn, downBtn, toast, addMade, lib, emit, PROFILES } from './core.js';
import { KINDS, makeSfx, DEFAULT_P } from './synth.js';
import { NOTES, GENERAL } from './guide.js';
import { resultView, variantGrid } from './ui_result.js';
import { analyze, rate } from './analyze.js';

export function init() {
  let kind = 'blaster', seed = 1; const P = { ...DEFAULT_P };
  const rv = resultView({ cat: KINDS[kind].cat, name: 'blaster' });
  const grid = variantGrid({ onKeep: (c) => { const it = addMade(c.name, c.chs, c.cat); emit('item', it); toast('kept ' + c.name, 'ok'); } });
  const seedOut = h('span', { class: 'seed' });
  let deb;
  const noteBox = h('div');
  const paintNote = () => { const n = NOTES[kind] || []; noteBox.replaceChildren(n.length ? h('div', { class: 'guide' }, h('b', {}, '◆ design note'), n.map((t) => h('p', {}, t))) : ''); };
  const run = (play = true) => {
    const x = makeSfx(kind, P, seed);
    rv.show([x], { cat: KINDS[kind].cat, name: `${kind}_${String(seed).padStart(3, '0')}`, loop: false });
    seedOut.textContent = 'seed ' + seed; paintNote(); if (play) rv.play();
  };
  const later = () => { clearTimeout(deb); deb = setTimeout(run, 120); };
  const cards = h('div', { class: 'kinds' });
  const paintKinds = () => cards.replaceChildren(...Object.values(KINDS).map((k) => h('button', { class: 'kind' + (k.id === kind ? ' on' : ''), onclick: () => { kind = k.id; paintKinds(); run(); } },
    h('b', {}, k.label), h('small', {}, PROFILES[k.cat].label))));
  paintKinds(); paintNote();
  const sl = (label, key, min, max, step, fmt) => slider({ label, min, max, step, value: P[key], fmt, onInput: (v) => { P[key] = v; later(); } });
  const controls = h('div', { class: 'sliders' },
    sl('pitch', 'pitch', -12, 12, 1, (v) => (v > 0 ? '+' : '') + v + ' st'), sl('length', 'len', 0.5, 2, 0.05, (v) => '×' + v.toFixed(2)),
    sl('brightness', 'bright', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'), sl('grit', 'grit', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'),
    sl('sci-fi', 'scifi', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'), sl('space', 'space', 0, 1, 0.01, (v) => v < 0.05 ? 'dry' : Math.round(v * 100) + '%'));
  const variants = (n, best) => {
    const pool = []; const total = best ? 24 : n, base = Math.floor(Math.random() * 1e6);
    for (let i = 0; i < total; i++) { const s = base + i, x = makeSfx(kind, P, s), cat = KINDS[kind].cat; pool.push({ chs: [x], name: `${kind}_${String(i + 1).padStart(2, '0')}`, cat, label: 'seed ' + s, s, sc: rate(analyze([x]), cat).score }); }
    if (best) pool.sort((a, b) => b.sc - a.sc); grid.set(pool.slice(0, n));
    toast(best ? 'best 8 of 24 shown' : n + ' variations ready', 'ok');
  };
  const root = h('section', { class: 'mod', id: 'mod-generate', hidden: true },
    h('div', { class: 'split' },
      h('div', { class: 'col-list' },
        panel('Sound type', cards, { open: true }),
        panel('Shape', controls, { open: true }),
        h('div', { class: 'bar-row' }, arrowBtn('Generate', () => { seed = 1 + Math.floor(Math.random() * 999); run(); }), btn('↻ Re-roll', () => { seed++; run(); }, 'ghost'), seedOut),
        h('p', { class: 'hint' }, 'Defaults follow game-audio practice: fast attack, tail capped per category, gentle room (never a wash), −1 dBTP ceiling, loudness-matched.'),
        noteBox),
      h('div', { class: 'detail' }, rv.el,
        panel('Round-robin variations', h('div', {}, h('div', { class: 'bar-row' }, downBtn('Make 8 variations', () => variants(8, false)), downBtn('Best of 24', () => variants(8, true), 'teal')), grid.el), { open: true }))));
  return { root, onShow() { if (!rv.st.chs) run(false); } };
}

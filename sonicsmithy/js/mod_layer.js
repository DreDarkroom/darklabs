// Layer Lab: stack sounds the way sound designers do — one job per layer, each owning its own frequency band.
import { h, slider, panel, btn, arrowBtn, downBtn, toast, lib, hub, miniBrowser, Wave, ensureAudio, PROFILES, SR, catSelect } from './core.js';
import { renderLayers } from './synth.js';
import { resample as rs, semis, N, mul, peakOf } from './dsp.js';
import { resultView } from './ui_result.js';

// role -> { band, default gain/offset, what to look for in the library (target centroid Hz / duration ms) }
const ROLES = {
  transient: { label: 'Transient', hp: 2200, lp: 14000, gain: -8,  off: 0,  want: { cen: 5000, dur: 60 } },
  crack:     { label: 'Crack',     hp: 900,  lp: 9000,  gain: -3,  off: 0,  want: { cen: 2500, dur: 200 } },
  body:      { label: 'Body',      hp: 90,   lp: 1800,  gain: -3,  off: 0,  want: { cen: 500, dur: 300 } },
  sub:       { label: 'Sub',       hp: 30,   lp: 160,   gain: -8,  off: 0,  want: { cen: 90, dur: 350 } },
  sweetener: { label: 'Sweetener', hp: 400,  lp: 9000,  gain: -10, off: 0,  want: { cen: 2000, dur: 400 } },
  tail:      { label: 'Tail',      hp: 250,  lp: 4500,  gain: -14, off: 10, want: { cen: 1200, dur: 500 } },
  air:       { label: 'Air',       hp: 5000, lp: 16000, gain: -18, off: 0,  want: { cen: 7000, dur: 250 } },
};
const PRESETS = {
  'Impact stack':   { cat: 'impact', roles: ['transient', 'body', 'sub', 'tail'] },
  'Pistol stack':   { cat: 'pistol', roles: ['transient', 'crack', 'body', 'sub', 'tail'] },
  'Sci-fi zap':     { cat: 'energy', roles: ['transient', 'sweetener', 'sub', 'air'] },
  'Heavy explosion': { cat: 'explosion', roles: ['crack', 'body', 'sub', 'tail'] },
  'UI bloop':       { cat: 'ui', roles: ['transient', 'sweetener', 'air'] },
};

export function init() {
  let tracks = [], armed = null, cat = 'impact', maxMs = PROFILES.impact.len[1];
  const rv = resultView({ cat, name: 'layered' }), box = h('div', { class: 'layers' }), maxSl = slider({ label: 'max length', min: 60, max: 3500, step: 10, value: maxMs, fmt: (v) => v + ' ms', onInput: (v) => { maxMs = v; later(); } });
  let deb; const later = () => { clearTimeout(deb); deb = setTimeout(() => render(true), 100); };

  const mono = (it) => { const n = Math.min(it.chs[0].length, N(3.5)), m = new Float32Array(n); for (const c of it.chs) for (let i = 0; i < n; i++) m[i] += c[i] / it.chs.length; const p = peakOf(m) || 1; return mul(m, 0.9 / p); };
  function render(play = false) {
    const layers = tracks.filter((t) => t.data).map((t) => ({ ...t, data: t.pitch ? rs(t.data, semis(t.pitch)) : t.data }));
    if (!layers.length) { rv.show(null); return; }
    const x = renderLayers(layers, { maxMs, ceil: -1, glue: true, drive: 1.1 });
    rv.show([x], { cat, name: 'layered_' + cat }); if (play) rv.play();
  }
  function paint() {
    box.replaceChildren(...tracks.map((t, i) => {
      const cv = h('canvas', { class: 'wave lw' }), w = new Wave(cv); requestAnimationFrame(() => t.data && w.set([t.data], SR));
      return h('div', { class: 'lrow' + (armed === i ? ' armed' : '') + (t.mute ? ' muted' : '') },
        h('div', { class: 'lname', onclick: () => { armed = armed === i ? null : i; paint(); }, title: 'click to arm: ＋ in the picker fills this track' }, h('b', {}, t.label), h('small', {}, t.src || 'empty — arm & pick'), armed === i ? h('em', {}, 'armed ←') : null),
        cv,
        h('div', { class: 'lctl' },
          slider({ label: 'gain', min: -40, max: 6, step: 0.5, value: t.gainDb, fmt: (v) => v.toFixed(1) + ' dB', onInput: (v) => { t.gainDb = v; later(); } }),
          slider({ label: 'offset', min: 0, max: 400, step: 1, value: t.offsetMs, fmt: (v) => v + ' ms', onInput: (v) => { t.offsetMs = v; later(); } }),
          slider({ label: 'pitch', min: -24, max: 24, step: 1, value: t.pitch, fmt: (v) => (v > 0 ? '+' : '') + v + ' st', onInput: (v) => { t.pitch = v; later(); } })),
        h('div', { class: 'lctl' },
          slider({ label: 'high-pass', min: 20, max: 8000, step: 10, value: t.hp, fmt: (v) => v + ' Hz', onInput: (v) => { t.hp = v; later(); } }),
          slider({ label: 'low-pass', min: 200, max: 20000, step: 50, value: t.lp, fmt: (v) => v + ' Hz', onInput: (v) => { t.lp = v; later(); } })),
        h('div', { class: 'lbtn' },
          h('button', { class: 'ico' + (t.mute ? ' on' : ''), onclick: () => { t.mute = !t.mute; paint(); render(true); } }, 'M'),
          h('button', { class: 'ico' + (t.solo ? ' on' : ''), onclick: () => { t.solo = !t.solo; paint(); render(true); } }, 'S'),
          h('button', { class: 'ico', title: 'remove', onclick: () => { tracks.splice(i, 1); armed = null; paint(); render(); } }, '✕')));
    }));
    if (!tracks.length) box.append(h('div', { class: 'empty' }, 'Pick a preset (or add sounds from the library on the left)'));
  }
  const newTrack = (role = 'body', it = null) => {
    const R = ROLES[role]; return { role, label: R.label, hp: R.hp, lp: R.lp, gainDb: R.gain, offsetMs: R.off, pitch: 0, mute: false, solo: false, data: it ? mono(it) : null, src: it ? it.name : null };
  };
  const pickFor = (role) => {
    const w = ROLES[role].want, pool = lib.items.filter((i) => i.an && i.chs && i.rt && i.rt.score >= 60 && i.an.durMs < 1800);
    const sc = (i) => -Math.abs(Math.log((i.an.centroid + 30) / (w.cen + 30))) - 0.6 * Math.abs(Math.log((i.an.durMs + 40) / (w.dur + 40))) + i.rt.score / 300;
    const top = pool.sort((a, b) => sc(b) - sc(a)).slice(0, 5); return top[Math.floor(Math.random() * top.length)] || null;
  };
  const applyPreset = (name) => {
    const p = PRESETS[name]; cat = p.cat; maxMs = PROFILES[cat].len[1]; maxSl.set(maxMs); tracks = p.roles.map((r) => newTrack(r)); armed = null; paint(); fill();
  };
  const fill = () => {
    if (!lib.items.some((i) => i.an)) return toast('library still analysing — try again in a moment', 'bad');
    let hits = 0; for (const t of tracks) { if (t.src && t.locked) continue; const it = pickFor(t.role); if (it) { t.data = mono(it); t.src = it.name; hits++; } }
    paint(); render(true); toast(hits ? 'auto-filled ' + hits + ' layers — shuffle for another take' : 'no candidates yet', hits ? 'ok' : 'bad');
  };
  const picker = miniBrowser({ height: 260, pickLabel: '＋', onPick: (it) => {
    if (armed != null && tracks[armed]) { tracks[armed].data = mono(it); tracks[armed].src = it.name; tracks[armed].locked = true; }
    else { tracks.push(newTrack('body', it)); tracks[tracks.length - 1].locked = true; tracks[tracks.length - 1].label = 'Layer ' + tracks.length; }
    paint(); render(true);
  } });

  const root = h('section', { class: 'mod', id: 'mod-layer', hidden: true },
    h('div', { class: 'split wide' },
      h('div', { class: 'col-list' },
        panel('Presets — one job per layer', h('div', { class: 'kinds' }, Object.entries(PRESETS).map(([n, p]) => h('button', { class: 'kind', onclick: () => applyPreset(n) }, h('b', {}, n), h('small', {}, p.roles.map((r) => ROLES[r].label).join(' · '))))), { open: true }),
        h('div', { class: 'bar-row' }, arrowBtn('Auto-fill from library', fill), btn('⤳ Shuffle unlocked', fill, 'ghost'), btn('＋ Empty track', () => { tracks.push(newTrack('body')); paint(); }, 'ghost')),
        panel('Sound library', picker, { open: true })),
      h('div', { class: 'detail' },
        panel('Layer stack', box, { open: true }),
        h('div', { class: 'bar-row' }, maxSl, catSelect(cat, (c) => { cat = c; maxMs = PROFILES[c].len[1]; maxSl.set(maxMs); render(); })),
        rv.el,
        h('p', { class: 'hint' }, 'Pro layering: transient (>2 kHz, first ms) → body (mids) → sub (<160 Hz, nudged 0–5 ms) → tail (short, dark). Band-limit each layer, stagger onsets by a few ms, glue with a light compressor, soft-clip, then brickwall. Keep total length inside the category budget.'))));
  hub.layerAdd = (it) => { hub.go('layer'); ensureAudio(it).then(() => { tracks.push(newTrack('body', it)); tracks[tracks.length - 1].locked = true; tracks[tracks.length - 1].label = 'Layer ' + tracks.length; paint(); render(true); }); };
  paint();
  return { root, onShow() {} };
}

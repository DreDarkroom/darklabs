// Rail Lab: pleasant, singing rail-grind loops (slow / medium / fast) plus land & leave one-shots.
import { h, slider, panel, btn, arrowBtn, downBtn, toast, addMade, lib, emit, eng } from './core.js';
import { railLoop, railLand, railLeave, DEFAULT_RAIL } from './synth.js';
import { resultView } from './ui_result.js';
import { analyze } from './analyze.js';

export function init() {
  const P = { ...DEFAULT_RAIL }, rv = resultView({ cat: 'loop', name: 'rail_grind', loop: true, height: 150 });
  const harsh = h('div', { class: 'meter' }, h('i')), harshTxt = h('span', { class: 'dim' });
  let deb, oneShot = null;
  const run = (play = true) => {
    const x = railLoop(P); rv.show([x], { cat: 'loop', name: `rail_grind_s${Math.round(P.speed * 100)}`, loop: true, extra: { meta: { speed: P.speed } } });
    const a = analyze([x]), hf = (a.bands.pres + a.bands.air) * 100; // presence+air share = harshness proxy
    harsh.firstChild.style.width = Math.min(100, hf * 4) + '%'; harsh.className = 'meter ' + (hf < 8 ? 'ok' : hf < 16 ? 'warn' : 'bad');
    harshTxt.textContent = `harshness ${hf.toFixed(1)}% (presence+air) · ${hf < 8 ? 'silky' : hf < 16 ? 'a little bright' : 'too sharp — raise warmth'}`;
    if (play) rv.play();
  };
  const later = () => { clearTimeout(deb); deb = setTimeout(run, 160); };
  const sl = (label, key, min, max, step, fmt) => slider({ label, min, max, step, value: P[key], fmt, onInput: (v) => { P[key] = v; later(); } });
  const pct = (v) => Math.round(v * 100) + '%';
  const buildSet = () => {
    const kept = [];
    for (const [nm, sp] of [['slow', 0.15], ['med', 0.5], ['fast', 0.9]]) {
      const it = addMade(`rail_grind_${nm}`, [railLoop({ ...P, speed: sp })], 'loop', { loop: true, meta: { speed: sp } }); it.loop = { start: 0, end: it.chs[0].length }; kept.push(it);
    }
    kept.push(addMade('rail_land', [railLand(P)], 'impact'), addMade('rail_leave', [railLeave(P)], 'impact'));
    kept.forEach((it) => { lib.basket.add(it.id); emit('item', it); }); emit('basket');
    toast('rail set (3 loops + land + leave) → library + basket', 'ok');
  };
  const one = (fn, name) => () => { const x = fn(P); rv.show([x], { cat: 'impact', name, loop: false }); rv.play(); };
  const root = h('section', { class: 'mod', id: 'mod-rail', hidden: true },
    h('div', { class: 'split' },
      h('div', { class: 'col-list' },
        panel('Grind character', h('div', { class: 'sliders' },
          sl('speed', 'speed', 0, 1, 0.01, pct), sl('metal / ring', 'metal', 0, 1, 0.01, pct), sl('sparks', 'sparks', 0, 1, 0.01, pct),
          sl('warmth (pleasant)', 'warmth', 0, 1, 0.01, pct), sl('loop length', 'len', 1.5, 6, 0.1, (v) => v.toFixed(1) + ' s')), { open: true }),
        h('div', { class: 'bar-row' }, arrowBtn('Generate loop', () => { P.seed = 1 + Math.floor(Math.random() * 999); run(); }), btn('↻ Re-roll', () => { P.seed++; run(); }, 'ghost')),
        panel('Pleasantness meter', h('div', {}, harsh, harshTxt), { open: true }),
        panel('One-shots', h('div', { class: 'bar-row' }, arrowBtn('Land (clang + scrape-in)', one(railLand, 'rail_land'), 'purple'), arrowBtn('Leave (scrape-out + ping)', one(railLeave, 'rail_leave'), 'purple')), { open: true }),
        h('p', { class: 'hint' }, 'Recipe: band-passed pink noise with a wandering cutoff, stick-slip roughness, four open-fifth resonators (F–C) for a soft singing rail, sparse filtered sparks, then a 3.4 kHz scoop, high-shelf tilt and 24 dB/oct low-pass. Loop seam is equal-power crossfaded.')),
      h('div', { class: 'detail' }, rv.el,
        panel('Godot set', h('div', {}, h('p', { class: 'hint' }, 'In Godot drive AudioStreamPlayer.pitch_scale from player speed: slow ≈ 0.85, fast ≈ 1.2 (lerp). Crossfade the three loops by speed for a rich result; play Land on grind start and Leave on jump-off.'),
          downBtn('Build full set → basket', buildSet, 'teal')), { open: true }))));
  return { root, onShow() { if (!rv.st.chs) run(false); } };
}

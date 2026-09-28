// A reusable "result" block: waveform + stats + rating + keep/edit/basket actions for any generated buffer.
import { h, waveEl, eng, ratingPanel, statsRow, stars, catSelect, addMade, lib, emit, hub, arrowBtn, downBtn, btn, toast, panel, Wave, analyze, rate, SR, PROFILES } from './core.js';

export function resultView({ cat = 'misc', name = 'sound', loop = false, height = 130 } = {}) {
  const st = { chs: null, cat, name, star: 0, loop, extra: {} };
  const { cv, wave } = waveEl({ height, onSeek: (s) => st.chs && eng.play(st.chs, { wave, from: s, loop: st.loop, loopStart: 0, loopEnd: st.chs[0].length }) });
  const stats = h('div'), rt = h('div'), starHost = h('span'), catHost = h('span'), title = h('div', { class: 'dim' });
  const play = () => st.chs && eng.play(st.chs, { wave, loop: st.loop, loopStart: 0, loopEnd: st.chs[0].length });
  const keep = (basket) => {
    if (!st.chs) return;
    const it = addMade(st.name, st.chs, st.cat, { loop: st.loop ? { start: 0, end: st.chs[0].length } : null, ...st.extra });
    if (st.star) { it.stars = st.star; }
    if (basket) lib.basket.add(it.id);
    emit('item', it); if (basket) emit('basket'); toast(basket ? 'saved to library + export basket' : 'saved to library', 'ok'); return it;
  };
  const el = h('div', { class: 'result' }, title, cv, stats,
    h('div', { class: 'bar-row' }, arrowBtn('Play', play), btn('■', () => eng.stop(), 'ghost'), h('span', { class: 'sp' }), starHost, catHost),
    rt,
    h('div', { class: 'bar-row' }, arrowBtn('Keep in library', () => keep(false), 'red'), downBtn('Keep + basket', () => keep(true), 'teal'),
      arrowBtn('Edit', () => { const it = keep(false); it && hub.edit(it); }, 'purple')));
  function paint() {
    starHost.replaceChildren(stars(st.star, (n) => { st.star = st.star === n ? 0 : n; paint(); }));
    catHost.replaceChildren(catSelect(st.cat, (c) => { st.cat = c; show(st.chs, {}); }));
  }
  function show(chs, o = {}) {
    Object.assign(st, o); st.chs = chs; if (o.name) st.name = o.name;
    if (!chs) return;
    wave.set(chs, SR);
    const an = analyze(chs, SR), res = rate(an, st.cat); st.an = an; st.res = res;
    stats.replaceChildren(statsRow(an)); rt.replaceChildren(panel('Rating — ' + PROFILES[st.cat].label, ratingPanel(res, an), { open: true }));
    title.textContent = `${st.name}${st.loop ? ' · loop' : ''}`; paint();
  }
  paint();
  return { el, show, play, st, wave };
}

/** Grid of small candidate cards, each playable/keepable, sorted by score. */
export function variantGrid({ onKeep }) {
  const grid = h('div', { class: 'vgrid' });
  return {
    el: grid,
    set(cands) { // cands: [{chs, name, cat, label}]
      grid.replaceChildren();
      for (const c of cands) {
        const cv = h('canvas', { class: 'wave mini-wave' }), w = new Wave(cv);
        const res = rate(analyze(c.chs, SR), c.cat);
        const card = h('div', { class: 'vcard' }, cv,
          h('div', { class: 'vmeta' }, h('span', { class: 'gd g-' + res.grade }, res.grade), h('span', { class: 'dim' }, `${res.score} · ${c.label || ''}`)),
          h('div', { class: 'vact' }, h('button', { class: 'ico', title: 'play', onclick: () => eng.play(c.chs, { wave: w }) }, '→'), h('button', { class: 'ico add', title: 'keep', onclick: () => onKeep(c, res) }, '↓')));
        grid.append(card); requestAnimationFrame(() => w.set(c.chs, SR));
        cv.addEventListener('click', () => eng.play(c.chs, { wave: w }));
      }
    },
  };
}

// Audition: browse, hear, rate and triage the library.
import { h, lib, on, emit, eng, ensureAudio, waveEl, ratingPanel, statsRow, stars, catSelect, setCat, setStars, store, fmtMs, hub, panel, arrowBtn, downBtn, btn, slider, toast, addItem } from './core.js';
import { PROFILES } from './analyze.js';

export function init() {
  const rows = new Map();
  const f = { q: '', cat: '', pack: '', min: 0, sort: 'score', fmt: '' };
  const list = h('div', { class: 'rows' }), count = h('span', { class: 'dim' }), prog = h('div', { class: 'progress' }, h('i'));
  const q = h('input', { class: 'inp', placeholder: 'search name, pack, category…', oninput: (e) => { f.q = e.target.value.toLowerCase(); draw(); } });
  const cat = h('select', { class: 'sel', onchange: (e) => { f.cat = e.target.value; draw(); } }, h('option', { value: '' }, 'all categories'), Object.entries(PROFILES).map(([k, p]) => h('option', { value: k }, p.label)));
  const pack = h('select', { class: 'sel', onchange: (e) => { f.pack = e.target.value; draw(); } }, h('option', { value: '' }, 'all packs'));
  const sort = h('select', { class: 'sel', onchange: (e) => { f.sort = e.target.value; draw(); } }, [['score', 'best score'], ['stars', 'my stars'], ['name', 'name'], ['dur', 'length']].map(([v, l]) => h('option', { value: v }, 'sort: ' + l)));
  const fmt = h('select', { class: 'sel', onchange: (e) => { f.fmt = e.target.value; draw(); } }, h('option', { value: '' }, 'any format'), ['ogg', 'wav', 'mp3', 'gen'].map((v) => h('option', { value: v }, v)));
  const min = slider({ label: 'min score', min: 0, max: 100, step: 5, value: 0, fmt: (v) => v, onInput: (v) => { f.min = v; draw(); } });

  const detail = h('div', { class: 'detail' });
  let cur = null, wv = null;

  const fmtOf = (it) => { const s = it.src || {}; return s.format === 'gen' ? 'gen' : `${s.format || '?'}${s.bitrate_kbps ? ' ' + s.bitrate_kbps + 'k' : s.bitdepth ? ' ' + s.bitdepth + 'b' : ''}`; };
  function filtered() {
    const c = { score: (a, b) => (b.score || 0) - (a.score || 0), stars: (a, b) => b.stars - a.stars || (b.score || 0) - (a.score || 0), name: (a, b) => a.name.localeCompare(b.name), dur: (a, b) => (a.an?.dur || 0) - (b.an?.dur || 0) }[f.sort];
    return lib.items.filter((i) => (!f.q || (i.name + ' ' + i.pack + ' ' + i.cat + ' ' + i.tags.join(' ')).toLowerCase().includes(f.q)) && (!f.cat || i.cat === f.cat) && (!f.pack || i.pack === f.pack)
      && (!f.fmt || i.src?.format === f.fmt) && (i.score || 0) >= f.min).sort(c);
  }
  function row(it) {
    return h('div', { class: 'row' + (lib.sel === it.id ? ' sel' : ''), 'data-id': it.id, onclick: () => select(it, true) },
      h('button', { class: 'ico play', title: 'play', onclick: (e) => { e.stopPropagation(); select(it, true); } }, '→'),
      h('span', { class: 'nm', title: it.id }, it.name), h('span', { class: 'ct' }, PROFILES[it.cat]?.label || it.cat),
      h('span', { class: 'du' }, it.an ? fmtMs(it.an.durMs) : '…'), h('span', { class: 'ft' }, fmtOf(it)),
      it.rt ? h('span', { class: 'gd g-' + it.rt.grade, title: 'auto score ' + it.rt.score }, it.rt.grade) : h('span', { class: 'gd' }, '·'),
      stars(it.stars, (n) => setStars(it, n)),
      h('label', { class: 'bk', title: 'export basket', onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: lib.basket.has(it.id), onchange: (e) => { e.target.checked ? lib.basket.add(it.id) : lib.basket.delete(it.id); emit('basket'); } })));
  }

  let raf = 0;
  function draw() {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const packs = [...new Set(lib.items.map((i) => i.pack))], keep = pack.value;
      pack.replaceChildren(h('option', { value: '' }, 'all packs'), packs.map((p) => h('option', { value: p, selected: p === keep }, p)));
      const items = filtered(); list.replaceChildren(); rows.clear();
      const frag = document.createDocumentFragment();
      for (const it of items.slice(0, 400)) { const r = row(it); rows.set(it.id, r); frag.append(r); }
      list.append(frag); count.textContent = `${items.length} of ${lib.items.length} sounds`;
      if (!items.length) list.append(h('div', { class: 'empty' }, lib.items.length ? 'nothing matches these filters' : 'library is empty — run  python tools/fetch_cc0.py  or import files'));
    });
  }

  async function select(it, play) {
    lib.sel = it.id; cur = it; rows.forEach((r, id) => r.classList.toggle('sel', id === it.id));
    rows.get(it.id)?.scrollIntoView({ block: 'nearest' });
    await ensureAudio(it); renderDetail(it);
    if (play) eng.play(it.chs, { sr: it.sr, wave: wv });
  }
  function renderDetail(it) {
    const { cv, wave } = waveEl({ height: 150, onSeek: (s) => eng.play(it.chs, { sr: it.sr, wave, from: s }) }); wv = wave; wave.set(it.chs, it.sr);
    const tagsIn = h('input', { class: 'inp', value: it.tags.join(', '), placeholder: 'tags, comma separated', onchange: (e) => { it.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); store.set(it.id, { tags: it.tags }); } });
    const s = it.src || {}, info = s.format === 'gen' ? 'generated in Sonic Smithy' : `${it.pack} · ${s.format} ${s.bitrate_kbps ? s.bitrate_kbps + ' kbps · ' : ''}${s.samplerate || ''} Hz · ${s.channels || it.chs.length} ch · ${it.license || ''}`;
    detail.replaceChildren(
      h('div', { class: 'dh' }, h('h2', {}, it.name), h('div', { class: 'dim' }, info)),
      cv, statsRow(it.an),
      h('div', { class: 'bar-row' },
        arrowBtn('Play', () => eng.play(it.chs, { sr: it.sr, wave })), btn('Loop ↻', () => eng.play(it.chs, { sr: it.sr, wave, loop: true })), btn('■ Stop', () => eng.stop(), 'ghost'),
        h('span', { class: 'sp' }), stars(it.stars, (n) => setStars(it, n), 'big'), catSelect(it.cat, (c) => setCat(it, c))),
      h('div', { class: 'bar-row' }, tagsIn),
      panel('Rating — ' + (PROFILES[it.cat]?.label || it.cat), ratingPanel(it.rt, it.an), { open: true }),
      h('div', { class: 'bar-row' },
        arrowBtn('Slice / Loop', () => hub.edit(it), 'purple'), arrowBtn('Layer', () => hub.layerAdd(it), 'purple'),
        downBtn(lib.basket.has(it.id) ? 'In export basket' : 'Add to export basket', () => { lib.basket.add(it.id); emit('basket'); toast('added to export basket', 'ok'); renderDetail(it); }, 'teal')));
  }

  const fileIn = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true, onchange: (e) => importFiles(e.target.files) });
  async function importFiles(files) {
    for (const file of files) {
      const bytes = await file.arrayBuffer(), ext = (file.name.split('.').pop() || '').toLowerCase();
      const it = addItem({ name: file.name.replace(/\.[^.]+$/, ''), pack: 'Imported', bytes, src: { format: ext }, tags: [] });
      try { await ensureAudio(it); } catch { toast('could not decode ' + file.name, 'bad'); }
    }
    toast(`imported ${files.length} file(s)`, 'ok');
  }
  const root = h('section', { class: 'mod', id: 'mod-audition' },
    h('div', { class: 'split' },
      h('div', { class: 'col-list' },
        h('div', { class: 'filters' }, q, cat, pack, fmt, sort, min, h('div', { class: 'bar-row' }, count, h('span', { class: 'sp' }), btn('Import files…', () => fileIn.click(), 'ghost'), fileIn)),
        prog, list),
      detail));
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => { e.preventDefault(); importFiles(e.dataTransfer.files); });
  detail.append(h('div', { class: 'empty big' }, h('span', { class: 'bigarrow' }, '↓'), h('p', {}, 'Pick a sound to audition it'), h('p', { class: 'dim' }, '↑ ↓ browse · space replay · 1–5 rate · B basket · E edit · L layer')));

  on('lib', draw);
  on('item', (it) => { const old = rows.get(it.id); if (old) { const n = row(it); old.replaceWith(n); rows.set(it.id, n); } if (cur && cur.id === it.id) renderDetail(it); });
  on('progress', ({ done, total }) => { prog.classList.toggle('on', total > 0); prog.firstChild.style.width = total ? (done / total * 100) + '%' : '0'; if (done % 24 === 0) draw(); });
  on('basket', () => { rows.forEach((r, id) => { const c = r.querySelector('.bk input'); if (c) c.checked = lib.basket.has(id); }); });

  document.addEventListener('keydown', (e) => {
    if (root.hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const ids = [...rows.keys()], i = ids.indexOf(lib.sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) select(lib.byId.get(n), true); }
    else if (e.key === ' ' && cur) { e.preventDefault(); eng.play(cur.chs, { sr: cur.sr, wave: wv }); }
    else if (/^[1-5]$/.test(e.key) && cur) setStars(cur, +e.key);
    else if (e.key === 'b' && cur) { lib.basket.has(cur.id) ? lib.basket.delete(cur.id) : lib.basket.add(cur.id); emit('basket'); }
    else if (e.key === 'e' && cur) hub.edit(cur);
    else if (e.key === 'l' && cur) hub.layerAdd(cur);
  });
  hub.select = select;
  return { root };
}

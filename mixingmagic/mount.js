/* MixingMagic: the whole instrument, mounted into any element. The home page loads this inline when you open its mixing desk;
   mixingmagic/index.html mounts it on its own page. Built with DOM calls (no HTML strings), so nothing typed or loaded can become markup.
   export async function mount(host, { onClose })  ->  { close() } */
import { TRACKS, STEPS, emptyPattern, cycleCell, fromPlan, setMelody, serialise, deserialise, eventsAt, LEVEL_V } from './logic.js';
import { Magic } from './player.js';

const LEVELS = ['off', 'soft', 'medium', 'loud'];
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
let cssLoaded = false;

export async function mount(host, { onClose } = {}) {
  if (!cssLoaded) { cssLoaded = true; document.head.append(el('link', { rel: 'stylesheet', href: new URL('./mm.css', import.meta.url).href })); }
  host.replaceChildren();
  const saved = deserialise(store.get('mm.state') || '');
  const state = saved || { bpm: 124, swing: 0.1, pattern: Object.assign(emptyPattern(), fromPlan(0.45, 1)), mix: {} };
  state.mix = state.mix || {};
  if (!saved) setMelody(state.pattern, { seed: 3 });
  const magic = new Magic({ pattern: state.pattern, bpm: state.bpm, swing: state.swing, volume: +(store.get('mm.vol') || 0.8), onStatus: (t) => { status.textContent = t; } });

  const status = el('p', { className: 'mm-status' }); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const save = () => { store.set('mm.state', serialise(state)); };
  let saveT = 0; const later = () => { clearTimeout(saveT); saveT = setTimeout(save, 400); };

  /* ---------- the transport ---------- */
  const playBtn = el('button', { type: 'button', className: 'mm-play', textContent: 'Play' }); playBtn.setAttribute('aria-pressed', 'false');
  const slider = (min, max, step, value, label) => { const i = el('input', { type: 'range', min, max, step, value }); i.setAttribute('aria-label', label); return i; };
  const bpm = slider(60, 200, 1, state.bpm, 'Tempo in beats per minute'), bpmO = el('output', { textContent: `${state.bpm} BPM` });
  const swing = slider(0, 0.5, 0.01, state.swing, 'Swing'), swingO = el('output', { textContent: `${Math.round(state.swing * 200)}%` });
  const vol = slider(0, 100, 1, Math.round(magic.volume * 100), 'Master volume'), volO = el('output', { textContent: `${Math.round(magic.volume * 100)}` });
  const fillP = slider(0, 100, 1, 45, 'How far down the home page to copy the groove from'), fillO = el('output', { textContent: '45%' });
  const btn = (text, fn, cls = 'ghost') => { const b = el('button', { type: 'button', className: `mm-btn ${cls}`, textContent: text }); b.addEventListener('click', fn); return b; };
  const lab = (text, ...kids) => el('label', {}, text, ...kids);

  playBtn.addEventListener('click', async () => {
    if (magic.playing) { magic.stop(); playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); return; }
    try { await magic.play(); } catch (e) { status.textContent = 'The browser would not start the sound.'; return; }
    playBtn.textContent = 'Stop'; playBtn.setAttribute('aria-pressed', 'true');
  });
  bpm.addEventListener('input', () => { state.bpm = +bpm.value; bpmO.textContent = `${state.bpm} BPM`; magic.setBpm(state.bpm); later(); });
  swing.addEventListener('input', () => { state.swing = +swing.value; swingO.textContent = `${Math.round(state.swing * 200)}%`; magic.setSwing(state.swing); later(); });
  vol.addEventListener('input', () => { magic.setVolume(vol.value / 100); volO.textContent = vol.value; store.set('mm.vol', magic.volume); });
  fillP.addEventListener('input', () => { fillO.textContent = `${fillP.value}%`; });

  let seedN = 3;
  const grids = {};
  const replace = (pat) => { for (const t of TRACKS) for (const r of t.rows) { const a = pat[t.id][String(r[0])]; state.pattern[t.id][String(r[0])] = a; } magic.pattern = state.pattern; if (magic.seq) magic.seq.pattern = state.pattern; paintAll(); later(); };
  const actions = el('div', { className: 'mm-row' },
    btn('Copy a groove from the page', () => { const p = fromPlan(fillP.value / 100, 1, Math.floor(Math.random() * 8) * 2); const mel = state.pattern.melody, mon = state.pattern.monkey; replace(Object.assign(p, { melody: mel, monkey: mon })); status.textContent = `Filled the drums, bass, cello and meows from the page at ${fillP.value}%. Your melody and monkeys were kept.`; }),
    lab('From ', fillP, fillO),
    btn('New PenrosePulse melody', () => { seedN++; setMelody(state.pattern, { seed: seedN, density: 0.3 + Math.random() * 0.25 }); paintTrack('melody'); later(); status.textContent = 'A new melody: a rhythm that never quite repeats, walked along the A minor scale.'; }),
    btn('Clear all', () => { replace(emptyPattern()); status.textContent = 'Cleared.'; }),
  );
  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; const got = deserialise(await f.text()); if (!got) { status.textContent = 'That is not a MixingMagic file.'; return; } Object.assign(state, got); bpm.value = state.bpm; swing.value = state.swing; bpm.dispatchEvent(new Event('input')); swing.dispatchEvent(new Event('input')); replace(state.pattern); status.textContent = 'Loaded.'; file.value = ''; });
  const download = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const files = el('div', { className: 'mm-row' },
    btn('Save', () => download(new Blob([serialise(state)], { type: 'application/json' }), 'mixingmagic.json')),
    btn('Load', () => file.click()),
    btn('Export WAV', async (e) => { e.currentTarget.disabled = true; status.textContent = 'Rendering two loops...'; try { download(new Blob([await magic.exportWav(2)], { type: 'audio/wav' }), 'mixingmagic.wav'); status.textContent = 'Exported two loops as a WAV.'; } catch (err) { status.textContent = 'The export did not work in this browser.'; } e.currentTarget.disabled = false; }),
    file,
  );
  const top = el('div', { className: 'mm-top' },
    el('div', { className: 'mm-title' }, el('h3', { textContent: 'MixingMagic' }), el('p', { textContent: 'Drums, bass, cello, meows, monkey beats and a PenrosePulse melody on one desk. Click a square to draw, click again for louder, drag to paint.' })),
    el('div', { className: 'mm-row' }, playBtn, lab('Tempo ', bpm, bpmO), lab('Swing ', swing, swingO), lab('Volume ', vol, volO)),
    actions, files, status);
  if (onClose) top.querySelector('.mm-title').append(btn('Close', () => api.close(), 'ghost'));

  /* ---------- the grids ---------- */
  const board = el('div', { className: 'mm-tracks' });
  const cellLabel = (t, r, s, l) => `${t.label}, ${r[1]}, step ${s + 1}, ${LEVELS[l]}`;
  function track(t) {
    const d = el('section', { className: 'mm-trk' }); d.style.setProperty('--hue', t.hue);
    const level = slider(0, 100, 1, Math.round((state.mix[t.id] ? state.mix[t.id].level : 1) * 100), `${t.label} level`);
    const m = el('button', { type: 'button', textContent: 'M', className: 'mm-ms' }); m.setAttribute('aria-label', `Mute ${t.label}`); m.setAttribute('aria-pressed', String(!!(state.mix[t.id] && state.mix[t.id].mute)));
    const so = el('button', { type: 'button', textContent: 'S', className: 'mm-ms' }); so.setAttribute('aria-label', `Solo ${t.label}`); so.setAttribute('aria-pressed', 'false');
    const sum = el('button', { type: 'button', className: 'mm-fold' }, el('b', { textContent: t.label }), el('small', { textContent: t.from }));
    sum.setAttribute('aria-label', `${t.label}, from ${t.from}. Show or hide the grid.`);
    const head = el('div', { className: 'mm-head' }, sum, el('div', { className: 'mm-mix' }, so, m, level));
    const grid = el('div', { className: 'mm-grid', role: 'group' }); grid.setAttribute('aria-label', `${t.label} pattern`); grid.style.touchAction = 'none';
    const cells = {};
    for (const r of t.rows) {
      const row = el('div', { className: 'mm-r' }, el('span', { className: 'mm-n', textContent: r[1] }));
      cells[r[0]] = [];
      for (let s = 0; s < STEPS; s++) {
        const c = el('button', { type: 'button', className: 'mm-c' }); c.dataset.r = r[0]; c.dataset.s = s; c.dataset.l = '0'; c.setAttribute('aria-label', cellLabel(t, r, s, 0));
        if (s % 4 === 0) c.classList.add('beat'); if (s === 16) c.classList.add('bar');
        row.append(c); cells[r[0]].push(c);
      }
      grid.append(row);
    }
    const head2 = el('div', { className: 'mm-ph' }); grid.append(head2);                          // the playhead: one thin bar, moved, never re-drawn
    const scroll = el('div', { className: 'mm-scroll' }, grid);
    d.append(head, scroll);
    const fold = (open) => { d.classList.toggle('closed', !open); sum.setAttribute('aria-expanded', String(open)); scroll.hidden = !open; if (open && t.id === 'monkey' && magic.ctx) magic.load('monkey'); };
    sum.addEventListener('click', () => fold(scroll.hidden));
    fold(t.id !== 'monkey');
    grids[t.id] = { t, d, cells, ph: head2, grid, scroll };
    // painting: the first press sets the level (cycling), dragging over other squares paints the same level
    let painting = null;
    grid.addEventListener('pointerdown', (e) => { const c = e.target.closest('.mm-c'); if (!c) return; e.preventDefault(); if (e.target.releasePointerCapture) { try { e.target.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ } } painting = cycleCell(state.pattern, t.id, c.dataset.r, +c.dataset.s); touched(t, c); preview(t, c, painting); });
    grid.addEventListener('pointerover', (e) => { if (painting == null || !(e.buttons & 1)) return; const c = e.target.closest('.mm-c'); if (!c || +c.dataset.l === painting) return; cycleCell(state.pattern, t.id, c.dataset.r, +c.dataset.s, painting); touched(t, c); });
    addEventListener('pointerup', () => { painting = null; });
    grid.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.mm-c')) { e.preventDefault(); const c = e.target.closest('.mm-c'); const l = cycleCell(state.pattern, t.id, c.dataset.r, +c.dataset.s); touched(t, c); preview(t, c, l); } });
    level.addEventListener('input', () => { state.mix[t.id] = Object.assign(state.mix[t.id] || {}, { level: level.value / 100 }); if (magic.ctx) magic.setLevel(t.id, level.value / 100); later(); });
    m.addEventListener('click', () => { const on = !(state.mix[t.id] && state.mix[t.id].mute); state.mix[t.id] = Object.assign(state.mix[t.id] || { level: 1 }, { mute: on }); m.setAttribute('aria-pressed', String(on)); applyMix(); later(); });
    so.addEventListener('click', () => { soloed = soloed === t.id ? null : t.id; applyMix(); });
    board.append(d);
  }
  let soloed = null;
  function applyMix() {
    for (const { t, d } of Object.values(grids)) {
      const mu = !!(state.mix[t.id] && state.mix[t.id].mute);
      d.classList.toggle('off', soloed ? soloed !== t.id : mu);
      d.querySelector('.mm-ms').setAttribute('aria-pressed', String(soloed === t.id));
      magic.mute(t.id, mu);
    }
    magic.solo(soloed);
  }
  function touched(t, c) { setCell(t, c, state.pattern[t.id][c.dataset.r][+c.dataset.s]); if (!t.poly) paintTrack(t.id); later(); }     // a mono track may have cleared another row of this step
  function setCell(t, c, l) { c.dataset.l = String(l); c.setAttribute('aria-label', cellLabel(t, t.rows.find((r) => String(r[0]) === c.dataset.r), +c.dataset.s, l)); }
  function paintTrack(id) { const g = grids[id]; for (const r of g.t.rows) g.cells[r[0]].forEach((c, s) => setCell(g.t, c, state.pattern[id][String(r[0])][s])); }
  function paintAll() { for (const id of Object.keys(grids)) paintTrack(id); }
  function preview(t, c, l) {
    if (!l) return;
    const r = t.rows.find((x) => String(x[0]) === c.dataset.r);
    magic.preview(t.id === 'drums' ? { i: r[0], v: LEVEL_V[l] } : { i: t.id, n: r[0], v: LEVEL_V[l] }).catch(() => {});
  }
  for (const t of TRACKS) track(t);
  paintAll(); applyMix();

  /* ---------- the playhead ---------- */
  let raf = 0, lastCol = -1;
  function loop() {
    if (magic.playing) {
      const col = (magic.bar % 2) * 16 + magic.step;
      if (col !== lastCol) {
        lastCol = col;
        for (const g of Object.values(grids)) { const first = g.cells[g.t.rows[0][0]][col]; if (first && !g.scroll.hidden) { g.ph.style.transform = `translateX(${first.offsetLeft}px)`; g.ph.style.width = `${first.offsetWidth}px`; g.ph.hidden = false; } }
      }
    } else if (lastCol !== -1) { lastCol = -1; for (const g of Object.values(grids)) g.ph.hidden = true; }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  addEventListener('keydown', keys);
  function keys(e) { if (e.code === 'Space' && !/^(INPUT|BUTTON|SUMMARY|TEXTAREA|SELECT)$/.test(e.target.tagName) && host.isConnected) { e.preventDefault(); playBtn.click(); } }

  host.classList.add('mm'); host.append(top, board);
  status.textContent = saved ? 'Welcome back: your last pattern is loaded.' : 'A starting groove is in the grid. Press Play.';
  const api = {
    close() { cancelAnimationFrame(raf); removeEventListener('keydown', keys); clearTimeout(saveT); save(); magic.dispose(); host.classList.remove('mm'); if (onClose) onClose(); },
    magic, state,
  };
  return api;
}

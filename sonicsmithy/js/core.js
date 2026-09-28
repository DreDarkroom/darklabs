// Shared app plumbing: DOM helpers, audio engine, library store, waveform, widgets.
import { SR, N, peakOf } from './dsp.js';
import { analyze, rate, guessCategory, PROFILES, combined } from './analyze.js';

// ---------------------------------------------------------------- DOM
export const h = (tag, a = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
};
export const $ = (s, r = document) => r.querySelector(s);
export const fmtMs = (ms) => ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
export const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

let toastT;
export function toast(msg, kind = '') {
  let t = $('#toast'); if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + kind; clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 2600);
}

export const bus = new EventTarget();
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
export const on = (n, f) => bus.addEventListener(n, (e) => f(e.detail));

// ---------------------------------------------------------------- persistence (ratings, categories, tags)
const KEY = 'sonicsmithy.v1';
export const store = (() => {
  let d = { items: {} }; try { d = JSON.parse(localStorage.getItem(KEY)) || d; } catch { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } };
  return { get: (id) => d.items[id] || {}, set: (id, patch) => { d.items[id] = { ...d.items[id], ...patch }; save(); } };
})();

// ---------------------------------------------------------------- audio engine
export const eng = {
  ac: null, master: null, analyser: null, cur: null, vol: 0.8,
  ensure() {
    if (!this.ac) {
      this.ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
      this.master = this.ac.createGain(); this.master.gain.value = this.vol;
      this.analyser = this.ac.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.8;
      this.master.connect(this.analyser); this.analyser.connect(this.ac.destination);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    return this.ac;
  },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
  stop() {
    if (this.cur) { try { this.cur.src.onended = null; this.cur.src.stop(); } catch { /* already stopped */ } this.cur.wave && (this.cur.wave.playhead = null, this.cur.wave.draw()); cancelAnimationFrame(this.cur.raf); this.cur = null; emit('playstate', false); }
  },
  /** chs: Float32Array[]; opts: {loop, loopStart, loopEnd (samples), wave, from (samples), sr} */
  play(chs, opts = {}) {
    const ac = this.ensure(); this.stop();
    const sr = opts.sr || SR, buf = ac.createBuffer(chs.length, chs[0].length, sr);
    chs.forEach((c, i) => buf.copyToChannel(c, i));
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(this.master);
    if (opts.loop) { src.loop = true; src.loopStart = (opts.loopStart || 0) / sr; src.loopEnd = (opts.loopEnd || chs[0].length) / sr; }
    const t0 = ac.currentTime, from = (opts.from || 0) / sr, cur = { src, wave: opts.wave, raf: 0 };
    src.start(0, from);
    src.onended = () => { if (this.cur === cur) this.stop(); opts.onend && opts.onend(); };
    this.cur = cur; emit('playstate', true);
    if (opts.wave) {
      const tick = () => {
        if (this.cur !== cur) return;
        let p = ac.currentTime - t0 + from; const dur = chs[0].length / sr;
        if (opts.loop) { const ls = (opts.loopStart || 0) / sr, le = (opts.loopEnd || chs[0].length) / sr; if (p > le) p = ls + ((p - ls) % (le - ls)); } else p = Math.min(p, dur);
        opts.wave.playhead = p * sr; opts.wave.draw(); cur.raf = requestAnimationFrame(tick);
      };
      tick();
    }
    return cur;
  },
};
document.addEventListener('pointerdown', () => eng.ensure(), { once: true });

// ---------------------------------------------------------------- library
export const lib = { items: [], byId: new Map(), sel: null, basket: new Set(), queue: [], analysed: 0, running: false };

function decorate(it) {
  const st = store.get(it.id);
  it.stars = st.stars || 0; it.tags = st.tags || it.tags || [];
  it.cat = st.cat || it.cat || guessCategory(it.name, it.tags);
  return it;
}
export function addItem(it) {
  it.id ||= 'ws/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  decorate(it); lib.items.push(it); lib.byId.set(it.id, it);
  if (it.chs) refresh(it);
  emit('lib', it); return it;
}
export function refresh(it) {
  it.an = analyze(it.chs, it.sr || SR);
  if (it.src?.samplerate) { it.an.sr = it.src.samplerate; it.an.ch = it.src.channels || it.an.ch; } // judge the file's real format, not our 48k decode
  it.rt = rate(it.an, it.cat); it.score = combined(it.rt.score, it.stars);
}
export function setCat(it, cat) { it.cat = cat; store.set(it.id, { cat }); if (it.an) { it.rt = rate(it.an, cat); it.score = combined(it.rt.score, it.stars); } emit('item', it); }
export function setStars(it, s) { it.stars = it.stars === s ? 0 : s; store.set(it.id, { stars: it.stars }); if (it.rt) it.score = combined(it.rt.score, it.stars); emit('item', it); }
export const isEdited = (it) => !!it.made;

export async function ensureAudio(it) {
  if (it.chs) return it;
  const ac = eng.ensure(); // builds the shared graph; a suspended context can still decode
  const bytes = it.bytes || await (await fetch(it.url)).arrayBuffer();
  it.bytes = it.bytes || bytes.slice(0);
  const ab = await ac.decodeAudioData(bytes.slice(0));
  it.chs = Array.from({ length: ab.numberOfChannels }, (_, i) => Float32Array.from(ab.getChannelData(i)));
  it.sr = ab.sampleRate; refresh(it); return it;
}

export async function loadIndex() {
  try {
    const j = await (await fetch('library/cc0/index.json', { cache: 'no-store' })).json();
    for (const s of j.sounds) addItem({ id: s.id, name: s.name, pack: s.pack, url: s.url, src: s.src, license: s.license, source: s.source, tags: s.tags });
  } catch (e) { console.warn('no CC0 index', e); }
  emit('lib');
  analyseAll();
}
export async function analyseAll() {
  if (lib.running) return; lib.running = true;
  const todo = lib.items.filter((i) => !i.an);
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const it = todo.shift();
      try { await ensureAudio(it); } catch (e) { it.err = true; }
      done++; emit('progress', { done, total: done + todo.length });
      if (done % 8 === 0) await new Promise((r) => setTimeout(r));
    }
  };
  await Promise.all([worker(), worker()]);
  lib.running = false; emit('progress', { done: 0, total: 0 }); emit('lib');
}

/** Add a generated/edited buffer to the library as a workshop item. */
export function addMade(name, chs, cat, extra = {}) {
  const it = addItem({ name, pack: 'Workshop', chs, sr: SR, cat, made: true, src: { format: 'gen' }, ...extra });
  return it;
}

// ---------------------------------------------------------------- waveform canvas
export class Wave {
  constructor(canvas, o = {}) {
    Object.assign(this, { canvas, chs: null, sr: SR, sel: null, loop: null, marks: [], playhead: null, select: !!o.select, onSelect: o.onSelect, onSeek: o.onSeek, mode: 'wave' });
    this.ctx = canvas.getContext('2d');
    new ResizeObserver(() => this.draw()).observe(canvas);
    if (this.select) this.bind();
  }
  set(chs, sr = SR) { this.chs = chs; this.sr = sr; this.sel = null; this.peaks = null; this.draw(); }
  get len() { return this.chs ? this.chs[0].length : 0; }
  bind() {
    const c = this.canvas; let a = null, dragging = false;
    const at = (e) => Math.round(Math.min(1, Math.max(0, (e.clientX - c.getBoundingClientRect().left) / c.clientWidth)) * this.len);
    c.addEventListener('pointerdown', (e) => { if (!this.chs) return; c.setPointerCapture(e.pointerId); a = at(e); dragging = true; });
    c.addEventListener('pointermove', (e) => { if (!dragging) return; const b = at(e); if (Math.abs(b - a) > this.len * 0.002) { this.sel = { a: Math.min(a, b), b: Math.max(a, b) }; this.draw(); this.onSelect && this.onSelect(this.sel); } });
    c.addEventListener('pointerup', (e) => { if (!dragging) return; dragging = false; if (!this.sel || Math.abs(at(e) - a) <= this.len * 0.002) { this.sel = null; this.draw(); this.onSelect && this.onSelect(null); this.onSeek && this.onSeek(a); } });
  }
  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); this.peaks = null; }
    const g = this.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, H / 2, W, 1);
    if (!this.chs) return;
    const n = this.len, x = this.chs[0];
    if (!this.peaks || this.peaks.w !== W || this.peaks.n !== n) {
      const mn = new Float32Array(W), mx = new Float32Array(W), step = Math.max(1, Math.floor(n / W / 48));
      for (let i = 0; i < W; i++) { const s = Math.floor(i * n / W), e = Math.min(n, Math.floor((i + 1) * n / W) + 1); let lo = 1, hi = -1; for (let j = s; j < e; j += step) { const v = x[j]; if (v < lo) lo = v; if (v > hi) hi = v; } mn[i] = lo > hi ? 0 : lo; mx[i] = hi < lo ? 0 : hi; }
      this.peaks = { w: W, n, mn, mx };
    }
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, css('--red-hot')); gr.addColorStop(0.55, css('--purple')); gr.addColorStop(1, css('--teal'));
    g.fillStyle = gr; const m = H / 2 - 3;
    for (let i = 0; i < W; i++) { const y0 = H / 2 - this.peaks.mx[i] * m, y1 = H / 2 - this.peaks.mn[i] * m; g.fillRect(i, y0, 1, Math.max(1, y1 - y0)); }
    const X = (s) => s / n * W;
    if (this.loop) { g.fillStyle = 'rgba(34,211,192,.10)'; g.fillRect(X(this.loop.a), 0, X(this.loop.b) - X(this.loop.a), H); g.fillStyle = css('--teal'); g.fillRect(X(this.loop.a), 0, 2, H); g.fillRect(X(this.loop.b) - 2, 0, 2, H); }
    if (this.sel) { g.fillStyle = 'rgba(139,92,246,.28)'; g.fillRect(X(this.sel.a), 0, X(this.sel.b) - X(this.sel.a), H); g.fillStyle = css('--purple'); g.fillRect(X(this.sel.a), 0, 1, H); g.fillRect(X(this.sel.b), 0, 1, H); }
    g.fillStyle = css('--white'); for (const mk of this.marks) g.fillRect(X(mk), 0, 1, H);
    if (this.playhead != null) { g.fillStyle = '#fff'; g.fillRect(X(this.playhead), 0, 1.5, H); }
  }
}
export const waveEl = (o = {}) => { const cv = h('canvas', { class: 'wave', style: o.height ? `height:${o.height}px` : '' }); return { cv, wave: new Wave(cv, o) }; };

// ---------------------------------------------------------------- widgets
export function slider({ label, min = 0, max = 1, step = 0.01, value = 0.5, fmt = (v) => v.toFixed(2), onInput, title }) {
  const inp = h('input', { type: 'range', min, max, step, value }), out = h('output', {}, fmt(+value));
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); onInput && onInput(+inp.value); });
  const el = h('label', { class: 'sl', title: title || '' }, h('span', {}, label), inp, out);
  el.set = (v) => { inp.value = v; out.textContent = fmt(+v); }; el.get = () => +inp.value; el.inp = inp;
  return el;
}
export function panel(title, body, { open = true, cls = '' } = {}) {
  const arr = h('span', { class: 'arr' }, '→'), head = h('button', { class: 'ph', type: 'button' }, arr, h('span', {}, title));
  const box = h('section', { class: 'panel ' + cls + (open ? ' open' : '') }, head, h('div', { class: 'pb' }, body));
  head.addEventListener('click', () => box.classList.toggle('open'));
  return box;
}
export const btn = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label);
export const arrowBtn = (label, fn, cls = 'red') => btn([label, h('span', { class: 'arr-r' }, ' →')], fn, cls);
export const downBtn = (label, fn, cls = 'purple') => btn([label, h('span', { class: 'arr-d' }, ' ↓')], fn, cls);
export const stars = (n, on, cls = '') => {
  const el = h('span', { class: 'stars ' + cls });
  for (let i = 1; i <= 5; i++) el.append(h('button', { type: 'button', class: i <= n ? 'on' : '', onclick: (e) => { e.stopPropagation(); on(i); } }, '★'));
  return el;
};
export const catSelect = (val, on) => { const s = h('select', { class: 'sel', onchange: (e) => on(e.target.value) }, Object.entries(PROFILES).map(([k, p]) => h('option', { value: k, selected: k === val }, p.label))); return s; };

/** Big grade + weighted checks. res = rate() result, an = analyze() result. */
export function ratingPanel(res, an) {
  const wrap = h('div', { class: 'rating' });
  wrap.append(h('div', { class: 'grade g-' + res.grade }, h('b', {}, res.grade), h('small', {}, res.score)),
    h('div', { class: 'rt-main' },
      h('div', { class: 'pill ' + (res.ship ? 'ok' : 'no') }, res.ship ? '✓ ship-ready' : 'needs work'),
      ...res.checks.filter((c) => c.note !== 'n/a for loops').map((c) => h('div', { class: 'chk ' + c.level, title: c.note },
        h('span', { class: 'cl' }, c.label), h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(c.score * 100)}%` })), h('span', { class: 'cn' }, c.note)))));
  return wrap;
}
export function statsRow(an) {
  const t = (k, v) => h('div', { class: 'stat' }, h('small', {}, k), h('b', {}, v));
  return h('div', { class: 'stats' }, t('length', fmtMs(an.durMs)), t('true peak', an.tpDb.toFixed(1) + ' dB'), t('loudness', an.lufs.toFixed(1) + ' LU'),
    t('tail −40', fmtMs(an.tail40Ms)), t('centre', Math.round(an.centroid) + ' Hz'), t('attack', an.attackMs.toFixed(0) + ' ms'), t('crest', an.crestDb.toFixed(1) + ' dB'));
}

/** Compact library browser used inside modules. onPick(item) on ＋, audition on ▸. */
export function miniBrowser({ onPick, pickLabel = '＋', filterCat = null, height = 300 } = {}) {
  const q = h('input', { class: 'inp', placeholder: 'search library…' }), list = h('div', { class: 'mini', style: `max-height:${height}px` });
  const draw = () => {
    const s = q.value.toLowerCase(); list.textContent = '';
    const items = lib.items.filter((i) => (!s || i.name.toLowerCase().includes(s) || i.cat.includes(s) || (i.pack || '').includes(s)) && (!filterCat || filterCat(i)))
      .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 120);
    for (const it of items) list.append(h('div', { class: 'mrow' },
      h('button', { class: 'ico', title: 'audition', onclick: async () => { await ensureAudio(it); eng.play(it.chs, { sr: it.sr }); } }, '▸'),
      h('span', { class: 'nm', title: it.id }, it.name), h('span', { class: 'ct' }, it.an ? fmtMs(it.an.durMs) : '…'),
      it.rt ? h('span', { class: 'gd g-' + it.rt.grade }, it.rt.grade) : h('span', { class: 'gd' }, '·'),
      h('button', { class: 'ico add', title: 'use this sound', onclick: async () => { await ensureAudio(it); onPick(it); } }, pickLabel)));
  };
  q.addEventListener('input', draw); on('lib', draw); draw();
  return h('div', { class: 'mb' }, q, list);
}
export { N, SR, peakOf, PROFILES, rate, analyze, combined, guessCategory };

/** Cross-module hooks; each module registers what it offers (edit, layerAdd, go, ...). */
export const hub = {};

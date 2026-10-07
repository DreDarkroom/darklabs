/* KlartextKit: the shell. It draws the header and the home screen, picks a module from the address (#/comms?game=rts), loads it on demand,
   and cleans up when you leave. Everything else is in modules/. This file is the only code the first page has to run. */
import { h, $, clear, icon, put, fill } from './dom.js';
import { store } from './store.js';
import { tts } from './tts.js';
import { createAttend } from './attend.js';
import { createVR } from './vr.js';
import { createMeter, createHud } from './perf.js';
import { loadBrand } from './brand.js';
import { onColor } from './color.js';
import { CATS } from '../data/cats.js';
import { MODULES, GROUPS, QUICK, byId, visible } from './registry.js';
import * as progress from './progress.js';
import { applyPrefs } from './prefs.js';

const attend = createAttend(store);
const vr = createVR(store);
const meter = createMeter();
const hud = createHud(meter);
const bus = new EventTarget();
const timings = [];          // how long each module took to load and mount (the Break Lab shows this)
let brand, stage, cleanup = null, current = null;

const ctx = {
  store, tts, attend, vr, meter, hud, bus, progress, h, icon, CATS, timings,
  get brand() { return brand; },
  go(id, params) { location.hash = '#/' + id + (params ? '?' + new URLSearchParams(params) : ''); },
  say(msg) { const l = $('#live'); if (l) { l.textContent = ''; setTimeout(() => (l.textContent = msg), 30); } },
  modules: () => visible(brand),
};

/* ---------- colours: one source of truth (cats.js) feeds the stylesheet ---------- */
function paintVars() {
  const r = document.documentElement.style;
  for (const [id, c] of Object.entries(CATS)) { r.setProperty(`--c-${id}`, c.hue); r.setProperty(`--on-${id}`, onColor(c.hue)); }
  r.setProperty('--brand', brand.accent); r.setProperty('--on-brand', onColor(brand.accent));
}

/* ---------- header ---------- */
const LBL = { vr: { auto: 'VR: Auto', on: 'VR: An', off: 'VR: Aus' }, attn: { off: 'Bewegung: Aus', gentle: 'Bewegung: Sanft', wild: 'Bewegung: Wild' } };
function header() {
  const logo = h('img', { src: brand.logo, alt: '', width: 44, height: 44, class: 'logo' });
  const vrBtn = h('button', { class: 'ctl', type: 'button', title: 'Switch between automatic, on and off for the big VR layout', onclick: () => { vr.cycle(); sync(); } });
  const atBtn = h('button', { class: 'ctl', type: 'button', title: 'How much the page moves: off, gentle or wild. It only moves when something needs you.', onclick: () => { attend.cycle(); sync(); attend.flash(atBtn, 'info'); } });
  const hudBtn = h('button', { class: 'ctl', type: 'button', 'aria-pressed': 'false', title: 'Show or hide the live performance readout', onclick: () => { hud.toggle(); store.set('hud', hud.on); sync(); } }, icon('bolt'), h('span', { class: 'lbl' }, 'fps'));
  const sync = () => {
    vrBtn.replaceChildren(icon('vr'), h('span', { class: 'lbl' }, LBL.vr[vr.pref()]));
    atBtn.replaceChildren(icon('bolt'), h('span', { class: 'lbl' }, LBL.attn[attend.level]));
    hudBtn.setAttribute('aria-pressed', String(hud.on));
  };
  sync();
  return h('div', { class: 'bar-in' },
    h('a', { class: 'brand', href: '#/', 'aria-label': `${brand.name}: home` }, logo, h('span', { class: 'bname' }, brand.name)),
    h('nav', { class: 'ctls', 'aria-label': 'Settings' }, vrBtn, atBtn, hudBtn));
}

/* ---------- home ---------- */
function tile(m, big) {
  const c = CATS[m.hue];
  return h('a', { class: 'tile' + (big ? ' big' : ''), href: '#/' + m.id, 'data-cat': m.hue },
    icon(c.shape, 'ic shape'),
    h('span', { class: 'tt' }, m.de), h('span', { class: 'ts' }, m.en),
    big ? h('span', { class: 'td' }, m.desc) : null);
}

function home(root) {
  const mods = visible(brand);
  const quick = QUICK.map(byId).filter((m) => mods.includes(m));
  const today = h('div', { class: 'today panel', 'aria-live': 'polite' }, h('b', null, 'Heute'), ' ', h('span', { id: 'todayText' }, '…'));
  put(root, 
    h('div', { class: 'hero' },
      h('img', { class: 'herologo', src: brand.logo, alt: `${brand.owner} logo`, width: 120, height: 120 }),
      h('div', null, h('h1', { tabindex: '-1' }, brand.name), h('p', { class: 'lead' }, brand.tagline), h('p', { class: 'fine' }, `von ${brand.owner}`))),
    vr.on() ? h('p', { class: 'panel note vrnote' }, 'VR-Modus ist an: große Tasten, mehr Platz. ', h('span', { class: 'en' }, 'VR mode is on: big buttons, more space. Change it at the top.')) : null,
    today,
    quick.length ? h('section', { 'aria-label': 'Schnellstart' }, h('h2', null, 'Schnellstart ', h('span', { class: 'en' }, 'Quick start')), h('div', { class: 'grid quick' }, quick.map((m) => tile(m, true)))) : null,
    ...Object.entries(GROUPS).map(([gid, g]) => {
      const list = mods.filter((m) => m.group === gid);
      return list.length ? h('section', { 'aria-labelledby': 'g-' + gid }, h('h2', { id: 'g-' + gid }, g.de, ' ', h('span', { class: 'en' }, g.en)), h('div', { class: 'grid' }, list.map((m) => tile(m)))) : null;
    }),
  );
  fillToday();
}

async function fillToday() {
  const el = $('#todayText'); if (!el) return;
  try {
    const [{ PHRASES }, srs] = await Promise.all([import('../data/phrases.js'), import('./srs.js')]);
    const st = srs.stats(PHRASES.map((p) => p.id), store.get('srs', {}));
    const streak = progress.current(store);
    if (el.isConnected) el.textContent = `${st.due} fällig · ${st.fresh} neu · ${st.mastered} gemeistert · Serie: ${streak} ${streak === 1 ? 'Tag' : 'Tage'}`;
  } catch (err) { if (el.isConnected) el.textContent = ''; }
}

/* ---------- routing ---------- */
function parse() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, q] = raw.split('?');
  return { id: path || '', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

async function route() {
  const { id, params } = parse();
  try { cleanup?.(); } catch (err) { /* a module's cleanup must never block navigation */ }
  cleanup = null; tts.stop(); current = id;
  clear(stage); stage.setAttribute('aria-busy', 'true');
  const root = h('div', { class: 'view', 'data-mod': id || 'home' });
  stage.append(root);
  const def = id ? byId(id) : null;
  if (!id || !def || !visible(brand).includes(def)) { document.title = brand.name + ' · DreDarkroom'; home(root); finish(root); return; }
  const t0 = performance.now();
  try {
    const mod = (await def.load()).default; const t1 = performance.now();
    if (current !== id) return;                                  // the user already moved on
    const out = await mod.mount(root, { ...ctx, params });
    if (current !== id) { try { out?.(); } catch (err) { /* ignore */ } return; }
    cleanup = typeof out === 'function' ? out : null;
    timings.push({ id, loadMs: +(t1 - t0).toFixed(1), mountMs: +(performance.now() - t1).toFixed(1), nodes: root.getElementsByTagName('*').length });
    document.title = `${def.de} · ${brand.name}`;
  } catch (err) {
    root.replaceChildren(h('h1', { tabindex: '-1' }, 'Das hat nicht geklappt'), h('p', null, 'This tool did not load. Check your connection and try again.'), h('p', { class: 'fine' }, String(err?.message || err)), h('a', { class: 'btn', href: '#/' }, 'Zurück'));
  }
  finish(root);
}

function finish(root) {
  stage.removeAttribute('aria-busy');
  const first = root.querySelector('h1'); first?.focus?.({ preventScroll: true });
  scrollTo(0, 0);
}

/* ---------- start ---------- */
async function boot() {
  brand = await loadBrand();
  paintVars();
  applyPrefs(store);
  document.title = brand.name + ' · DreDarkroom';
  if (store.get('hud', false) || /[?&]perf=1/.test(location.search)) hud.show();
  $('#bar').replaceChildren(header());
  stage = $('#stage');
  const f = $('#foot-extra'); if (f) f.textContent = brand.footer || '';
  const cr = $('#credit'); if (cr) cr.hidden = !brand.credit;
  addEventListener('hashchange', route);
  addEventListener('keydown', (e) => { if (e.shiftKey && e.key === 'P' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { hud.toggle(); store.set('hud', hud.on); } });
  await route();
  if (store.get('guard.on', false)) import('../modules/guard.js').then((m) => m.start?.(ctx)).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

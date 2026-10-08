/* Darklabs hub: the small always-on part. It (1) notices whether you are on a phone, in a headset or on a desktop and moves what suits you to the front,
   (2) draws the page settings (a gear that stays put and can be hidden down to a dot), and (3) loads each optional feature only when it is switched on:
     robots   ../robots.js        the little companions
     fx       ./fx.js            the safelight beam, dust, and drift/tilt
     icons3d  ../hub3d.js         real 3D card icons (about 700 KB of three.js)
   With everything off (the default) this file is all the script the page runs. */
import { prefs, FX } from '../kit/prefs.js';
import { detectDevice, boostOrder } from './logic.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

/* ---------- what suits this device ---------- */
const device = detectDevice({ ua: navigator.userAgent, coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, touchPoints: navigator.maxTouchPoints || 0 });
root.dataset.device = device;
const FLAG = { mobile: 'Best on your phone', vr: 'Made for your headset' };
const WHO = { mobile: 'a phone', vr: 'a headset' };

function applyBoost() {
  $$('.reco-flag').forEach((n) => n.remove()); $$('.reco').forEach((n) => n.classList.remove('reco')); $('.devnote')?.remove();
  for (const row of $$('.line')) {
    const cards = $$(':scope > .hang', row);
    const items = cards.map((el) => ({ el, boost: prefs.get('boost') && el.dataset.boost ? JSON.parse(el.dataset.boost) : null, i: +el.dataset.i }));
    const ordered = prefs.get('boost') ? boostOrder(items, device) : [...items].sort((a, b) => a.i - b.i);
    ordered.forEach((it) => row.append(it.el));
    if (prefs.get('boost') && device !== 'desktop') {
      const top = ordered[0];
      if (top && top.boost && top.boost[device]) {
        const p = $('.print', top.el); p.classList.add('reco');
        p.insertBefore(Object.assign(document.createElement('span'), { className: 'reco-flag', textContent: FLAG[device] }), $('h3', p));
      }
    }
  }
  if (device !== 'desktop' && prefs.get('boost') && $('.reco-flag')) {
    const n = document.createElement('p'); n.className = 'devnote';
    n.append(`You are using ${WHO[device]}, so the things made for it come first. `);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Show the usual order'; b.addEventListener('click', () => prefs.set('boost', false));
    n.append(b); $('header').append(n);
  }
}

/* ---------- optional features, loaded on demand ---------- */
let fxMod = null, robotsMod = null;
async function applyFeatures() {
  const calm = prefs.get('calm');
  const wantFx = !calm && (prefs.get('beam') || prefs.get('dust') || prefs.get('motion'));
  if (wantFx || fxMod) {                                                              // only fetched the first time something wants it; afterwards it is told to stop
    fxMod = fxMod || (await import('./fx.js'));
    fxMod.set({ beam: !calm && prefs.get('beam'), dust: !calm && prefs.get('dust'), motion: !calm && prefs.get('motion') });
  }
  try {
    if (prefs.get('robots') && !calm) { robotsMod = robotsMod || (await import('../robots.js')); robotsMod.init(); }
    else if (robotsMod) robotsMod.stop();
  } catch (e) { /* robots are optional: the page works without them */ }
}
let icons = false;
function applyIcons() {
  if (prefs.get('icons3d') && !icons) { icons = true; import('../hub3d.js').catch(() => { icons = false; }); }
}

/* ---------- the page settings ---------- */
const ROWS = [
  ['robots', 'Little robots', 'Companions that roll along as you scroll and teach you words. They load only when this is on.'],
  ['motion', 'Extra motion', 'Swaying cards, flickering neon, a spinning kaleidoscope, cards that lean toward your pointer.'],
  ['beam', 'Safelight beam', 'A dark room with a light that follows your pointer. Moody, but harder to read.'],
  ['dust', 'Dust in the light', 'Specks drifting through the light. Uses a little graphics power.'],
  ['icons3d', '3D card icons', 'Real 3D models for the card icons. About 700 KB and a busy graphics chip. Turning it off reloads the page.'],
  ['boost', 'Show what suits my device first', 'On a phone or in a headset, the things made for it move to the front.'],
  ['cursor', 'Custom pointer', 'A crimson pointer that matches the page.'],
  ['easy', 'Easy reading', 'Plainer letters and wider spacing.'],
  ['hc', 'High contrast', 'Brighter text and links.'],
  ['calm', 'Calm: no animation at all', 'Stops every movement. On by default if your device asks for less motion.'],
];
let panel = null, gear = null, dot = null;

function build() {
  gear = Object.assign(document.createElement('button'), { id: 'fxbtn', type: 'button', textContent: '⚙ Page settings' });
  gear.setAttribute('aria-expanded', 'false'); gear.setAttribute('aria-controls', 'fxpanel');
  gear.addEventListener('click', () => toggle());
  panel = Object.assign(document.createElement('div'), { id: 'fxpanel', hidden: true });
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Page settings');
  const h = Object.assign(document.createElement('h2'), { textContent: 'Page settings' });
  const lead = Object.assign(document.createElement('p'), { className: 'lead', textContent: 'The page starts plain and light. Switch on the extras you like. Kept on this device only.' });
  panel.append(h, lead);
  for (const [key, title, hint] of ROWS) {
    const row = document.createElement('div'); row.className = 'fxrow';
    const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'sw'; sw.dataset.k = key; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', title);
    sw.addEventListener('click', () => { if (key === 'icons3d' && prefs.get('icons3d')) { prefs.set(key, false); location.reload(); return; } prefs.toggle(key); });
    const t = document.createElement('div'); const b = Object.assign(document.createElement('b'), { textContent: title }), s = Object.assign(document.createElement('span'), { textContent: hint }); t.append(b, s);
    row.append(sw, t); panel.append(row);
  }
  const foot = document.createElement('div'); foot.className = 'fxfoot';
  const reset = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Back to the plain default' });
  reset.addEventListener('click', () => { for (const k of Object.keys(FX)) prefs.set(k, FX[k]); if (prefs.get('icons3d') === false && icons) location.reload(); });
  const hide = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Hide this button' });
  hide.addEventListener('click', () => prefs.set('ui', 'hidden'));
  foot.append(reset, hide); panel.append(foot);
  dot = Object.assign(document.createElement('button'), { className: 'fxdot', type: 'button', textContent: '⚙', title: 'Show the page settings button' });
  dot.setAttribute('aria-label', 'Show the page settings button'); dot.addEventListener('click', () => prefs.set('ui', 'shown'));
  document.body.append(gear, panel, dot);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); gear.focus(); } });
  addEventListener('pointerdown', (e) => { if (!panel.hidden && !e.target.closest('#fxpanel, #fxbtn')) toggle(false); }, true);
}
function toggle(open = panel.hidden) { panel.hidden = !open; gear.setAttribute('aria-expanded', String(open)); }
function paint() {
  const hidden = prefs.get('ui') === 'hidden';
  gear.hidden = hidden; dot.hidden = !hidden; if (hidden) toggle(false);
  for (const sw of $$('.sw', panel)) sw.setAttribute('aria-checked', String(!!prefs.get(sw.dataset.k)));
}

build(); paint(); applyBoost(); applyFeatures(); applyIcons();
addEventListener('darklabs:prefs', (e) => {
  paint();
  const k = e.detail && e.detail.key;
  if (k === 'boost') applyBoost();
  if (['beam', 'dust', 'motion', 'robots', 'calm'].includes(k)) applyFeatures();
  if (k === 'icons3d') applyIcons();
});

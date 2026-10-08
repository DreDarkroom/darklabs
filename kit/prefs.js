/* Darklabs: reading, motion and feature preferences, shared by the hub, the Word Lab and the VR Lab.
   calm   stops animation, glitching and the robots' movement (also on by default when the device asks for reduced motion)
   easy   an easier reading style: plainer letters, wider spacing, more line height, no italics
   hc     higher contrast
   size   text size, 100 / 125 / 150 (percent)
   ctx    'off' means: use the browser's own right-click menu everywhere
   The optional features (FX below) are OFF unless someone switches them on, so a visit costs almost nothing: robots, beam, dust, motion, icons3d.
   boost (show what suits my device first) and cursor (the subtle custom pointer) are on, and can be switched off.
   Choices are kept on this device only. Anything that wants to react listens for the 'darklabs:prefs' event. */
const KEY = (k) => `darklabs.${k}`;
const root = document.documentElement;
export const FX = { robots: false, beam: false, dust: false, motion: false, icons3d: false, boost: true, cursor: true };

function read(k) { try { return localStorage.getItem(KEY(k)); } catch (err) { return null; } }
function write(k, v) { try { if (v == null) localStorage.removeItem(KEY(k)); else localStorage.setItem(KEY(k), v); } catch (err) { /* private mode: it just will not be remembered */ } }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSwitch = (k) => k === 'calm' || k === 'easy' || k === 'hc' || k in FX;

export const prefs = {
  /** true / false for the switches; a string for ui and ctx; a number for size. */
  get(k) {
    if (k === 'calm') { const v = read('calm'); return v == null ? reducedMotion() : v === '1'; }
    if (k in FX) { const v = read(k); return v == null ? FX[k] : v === '1'; }
    if (k === 'easy' || k === 'hc') return read(k) === '1';
    if (k === 'size') return +read('size') || 100;
    return read(k);
  },
  set(k, v) {
    if (isSwitch(k)) write(k, v ? '1' : '0'); else write(k, v == null ? null : String(v));
    apply();
    dispatchEvent(new CustomEvent('darklabs:prefs', { detail: { key: k, value: v } }));
  },
  toggle(k) { this.set(k, !this.get(k)); return this.get(k); },
};

function apply() {
  root.classList.toggle('calm', prefs.get('calm'));
  root.classList.toggle('easy', prefs.get('easy'));
  root.classList.toggle('hc', prefs.get('hc'));
  root.classList.toggle('fx-motion', prefs.get('motion') && !prefs.get('calm'));
  root.dataset.cursor = prefs.get('cursor') ? 'on' : 'off';
  root.style.fontSize = prefs.get('size') === 100 ? '' : `${prefs.get('size')}%`;
}

const css = document.createElement('style');
css.id = 'dl-prefs-css';
css.textContent = `
html.calm *, html.calm *::before, html.calm *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
html.calm .hang, html.calm .print { opacity: 1 !important; clip-path: none !important; }
html.easy body, html.easy button, html.easy input, html.easy textarea { font-family: Verdana, Tahoma, "Trebuchet MS", system-ui, sans-serif !important; letter-spacing: .02em; word-spacing: .12em; line-height: 1.75; }
html.easy *, html.easy *::before { font-style: normal !important; text-transform: none !important; letter-spacing: .02em !important; text-shadow: none !important; }
html.easy p, html.easy li { max-width: 62ch; text-align: left; }
html.hc { --text: #fff; --dim: #f2e8e8; filter: contrast(1.08); }
html.hc a { text-decoration: underline; }
/* the Darklabs pointer: your normal arrow, in crimson with a white edge; white with a crimson edge over anything you can press. Off in the page settings. */
html[data-cursor="on"], html[data-cursor="on"] body { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 2v16l4.5-4 3 7 2.5-1-3-7h6z' fill='%23d1122b' stroke='%23ffffff' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E") 3 2, auto; }
html[data-cursor="on"] a, html[data-cursor="on"] button, html[data-cursor="on"] summary, html[data-cursor="on"] label, html[data-cursor="on"] select, html[data-cursor="on"] [role="button"], html[data-cursor="on"] [role="switch"], html[data-cursor="on"] input[type="range"], html[data-cursor="on"] input[type="checkbox"] { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 2v16l4.5-4 3 7 2.5-1-3-7h6z' fill='%23ffffff' stroke='%23d1122b' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E") 3 2, pointer; }
`;
document.head.append(css);
apply();

/* Darklabs: reading and motion preferences, shared by the hub, the Word Lab and the VR Lab.
   calm   stops animation, glitching and the robots' movement (also on by default when the device asks for reduced motion)
   easy   an easier reading style: plainer letters, wider spacing, more line height, no italics
   hc     higher contrast
   size   text size, 100 / 125 / 150 (percent)
   ctx    'off' means: use the browser's own right-click menu everywhere
   Choices are kept on this device only. Anything that wants to react listens for the 'darklabs:prefs' event. */
const KEY = (k) => `darklabs.${k}`;
const root = document.documentElement;

function read(k) { try { return localStorage.getItem(KEY(k)); } catch (err) { return null; } }
function write(k, v) { try { if (v == null) localStorage.removeItem(KEY(k)); else localStorage.setItem(KEY(k), v); } catch (err) { /* private mode: it just will not be remembered */ } }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const prefs = {
  /** true / false for the switches (calm, easy, hc); a string for size and ctx. */
  get(k) {
    if (k === 'calm') { const v = read('calm'); return v == null ? reducedMotion() : v === '1'; }
    if (k === 'easy' || k === 'hc') return read(k) === '1';
    if (k === 'size') return +read('size') || 100;
    return read(k);
  },
  set(k, v) {
    if (k === 'calm' || k === 'easy' || k === 'hc') write(k, v ? '1' : '0'); else write(k, v == null ? null : String(v));
    apply();
    dispatchEvent(new CustomEvent('darklabs:prefs', { detail: { key: k, value: v } }));
  },
  toggle(k) { this.set(k, !this.get(k)); return this.get(k); },
};

function apply() {
  root.classList.toggle('calm', prefs.get('calm'));
  root.classList.toggle('easy', prefs.get('easy'));
  root.classList.toggle('hc', prefs.get('hc'));
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
html.hc { --text: #fff; --dim: #e6dada; filter: contrast(1.08); }
html.hc a { text-decoration: underline; }
`;
document.head.append(css);
apply();

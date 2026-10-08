/* Darklabs: the little robots. Optional and lazy: nothing here runs until someone switches "Little robots" on in the page settings
   (hub/hub.js then imports this file and calls init()). The Word Lab and the desk import only the data (ROBOTS, botSVG) and cost nothing.

   Six characters, each named with a portmanteau: two simple words joined into one, with a capital letter in the middle (ClankCog = Clank + Cog).
   One companion rolls along the bottom of the page as you scroll, naps when you stop, and changes with the section you are in.
   Press a robot to hear what it says. Every robot teaches one word and links to it in the Word Lab.
   They always face forward (no 2D swivelling). Calm mode, or reduced motion, keeps them still. */
import { prefs } from './kit/prefs.js';
import { ROBOTS, botSVG } from './robots-data.js';
export { ROBOTS, botSVG };

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LEARN = new URL('./learn/', import.meta.url).href;
const label = (r) => `${r.id}, a little ${r.role} robot. ${r.parts[0]} plus ${r.parts[1]}. Press to hear what it says.`;

let bubble = null, bubbleTimer = 0, sayN = 0;
function say(robot, anchor) {
  const i = (sayN = (sayN + 1) % robot.lines.length);
  bubble = bubble || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'bot-say', role: 'status' }));
  bubble.replaceChildren();
  const who = Object.assign(document.createElement('b'), { textContent: robot.id });
  const p = Object.assign(document.createElement('p'), { textContent: robot.lines[i] });
  const a = Object.assign(document.createElement('a'), { href: `${LEARN}#${robot.term}`, textContent: `Learn the word “${robot.term}” →` });
  bubble.append(who, p, a);
  bubble.classList.add('on');
  const r = anchor.getBoundingClientRect();
  bubble.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 270))}px`;
  bubble.style.top = `${Math.max(8, r.top - bubble.offsetHeight - 10)}px`;
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble && bubble.classList.remove('on'), 9000);
}

/* A link whose only difference from the current address is the hash does not make the Word Lab re-read it once it has been opened that way.
   So a "Learn the word" link to the Word Lab, pressed while you are in the Word Lab, is handled here: set the hash and tell the page to show it. */
function onLink(e) {
  const a = e.target.closest && e.target.closest('#bot-say a');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const to = new URL(a.href);
  if (to.pathname !== location.pathname) return;
  e.preventDefault();
  history.replaceState(null, '', to.hash);
  dispatchEvent(new CustomEvent('wordlab:open', { detail: to.hash.slice(1) }));
  if (bubble) bubble.classList.remove('on');
}
function onPointer(e) { if (bubble && !e.target.closest('#bot-say, .bot')) bubble.classList.remove('on'); }
function onKey(e) { if (e.key === 'Escape' && bubble) bubble.classList.remove('on'); }

let wrap = null, comp = null, name = null, cur = -1, headTops = [], heads = [], lastY = 0, ticking = false, napT = 0, ro = null, on = false;

function setRobot(i) {
  if (i === cur) return;
  cur = i;
  comp.innerHTML = botSVG(ROBOTS[i]);
  comp.setAttribute('aria-label', label(ROBOTS[i]));
  name.textContent = ROBOTS[i].id;
}
const measure = () => { headTops = heads.map((h) => h.getBoundingClientRect().top + scrollY); };

function update() {
  ticking = false;
  if (!on) return;
  if (prefs.get('calm')) { wrap.style.transform = 'none'; comp.classList.remove('rolling', 'working'); comp.classList.add('nap'); return; }
  const y = scrollY, moving = Math.abs(y - lastY) > 0.5;
  lastY = y;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  wrap.style.transform = `translateX(${((y / max) * Math.max(0, innerWidth - 120)).toFixed(1)}px)`;
  if (moving) {
    comp.classList.remove('nap'); comp.classList.add('rolling', 'working');
    clearTimeout(napT); napT = setTimeout(() => { if (comp) { comp.classList.remove('rolling', 'working'); comp.classList.add('nap'); } }, 650);
  }
  const target = y + innerHeight * 0.55;
  let k = -1; headTops.forEach((top, i) => { if (top < target) k = i; });
  setRobot(k < 0 ? 4 : (k + 1) % ROBOTS.length);                 // the nearest heading above the middle of the screen picks the robot
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
const onResize = () => { measure(); onScroll(); };

export function init() {
  if (on || document.documentElement.dataset.robots === 'off') return;
  on = true;
  comp = document.createElement('button');
  comp.type = 'button'; comp.className = 'bot companion nap';
  comp.setAttribute('aria-label', label(ROBOTS[4])); comp.innerHTML = botSVG(ROBOTS[4]); cur = 4;
  name = Object.assign(document.createElement('span'), { className: 'bot-name', textContent: ROBOTS[4].id });
  wrap = Object.assign(document.createElement('div'), { className: 'companion-wrap' });
  wrap.append(comp, name);
  document.body.append(wrap);
  comp.addEventListener('click', () => { say(ROBOTS[cur], comp); comp.classList.add('glitch'); setTimeout(() => comp && comp.classList.remove('glitch'), 380); });
  heads = $$('h2.sect'); lastY = scrollY; measure();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('load', onResize);
  addEventListener('pointerdown', onPointer, true);
  addEventListener('keydown', onKey);
  addEventListener('click', onLink, true);
  if (typeof ResizeObserver === 'function') { let t = 0; ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(onResize, 150); }); ro.observe(document.body); }
  update();
}

/* Everything init() set up is taken down again, so switching the robots off leaves nothing running. */
export function stop() {
  if (!on) return;
  on = false;
  removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('load', onResize);
  removeEventListener('pointerdown', onPointer, true); removeEventListener('keydown', onKey); removeEventListener('click', onLink, true);
  clearTimeout(napT); clearTimeout(bubbleTimer);
  if (ro) ro.disconnect();
  ro = null;
  if (wrap) wrap.remove();
  if (bubble) bubble.remove();
  wrap = comp = name = bubble = null; cur = -1;
}

/* Pages that load this file directly (the Word Lab, the crate) get the robots only if they were switched on. */
const wanted = () => prefs.get('robots') && !prefs.get('calm');
addEventListener('darklabs:prefs', (e) => { const k = e.detail && e.detail.key; if (k === 'robots' || k === 'calm') { if (wanted()) init(); else stop(); } });
const start = () => { if (wanted()) init(); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

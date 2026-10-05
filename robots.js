/* Darklabs: the little robots, and the glitchy way things build themselves as you scroll.

   Six characters, each named with a portmanteau: two simple words joined into one, with a capital letter in the middle (ClankCog = Clank + Cog).
   - A companion rolls along the bottom of the page as you scroll (forward as you go down, back as you go up), hammers while you scroll, and naps when you stop.
   - Each row of projects has a worker on its line. When a project scrolls into view the worker stops, hammers, and the project builds itself in glitchy slices.
   - Headings scramble into place when they arrive.
   - Press a robot to hear what it says. Every robot teaches one word, and links to it in the Word Lab.
   Nothing here is needed to use the page: with Calm mode on (or reduced motion), or without JavaScript, everything is simply there and still. */
import { prefs } from './kit/prefs.js';

export const ROBOTS = [
  { id: 'ClankCog', parts: ['Clank', 'Cog'], role: 'builder', body: '#6b5a5e', accent: '#ff7a3d', head: 'box', term: 'portmanteau',
    lines: ['Clank! I join parts together. Clank + Cog = ClankCog. That is a portmanteau.', 'I build things one piece at a time.', 'A portmanteau is a new word made from two words. Press the link to learn more.'] },
  { id: 'WobbleWire', parts: ['Wobble', 'Wire'], role: 'cable keeper', body: '#566a6a', accent: '#40f0d0', head: 'round', term: 'offline',
    lines: ['I plug everything in. I wobble a lot, but it works.', 'No internet? Many labs still work. That is called offline.', 'Wires, wires, everywhere!'] },
  { id: 'SparkSprocket', parts: ['Spark', 'Sprocket'], role: 'sound maker', body: '#6a6350', accent: '#ffe14d', head: 'tall', term: 'synthesiser',
    lines: ['Spark! I make sounds from nothing. No recordings.', 'A machine that makes sound from numbers is a synthesiser.', 'Every sound in these labs is made live.'] },
  { id: 'PixelPatch', parts: ['Pixel', 'Patch'], role: 'picture fixer', body: '#5e5670', accent: '#9670ff', head: 'visor', term: 'pixel',
    lines: ['I paint pictures with tiny dots. Each dot is a pixel.', 'I fix the little holes in the picture.', 'Look closely at your screen. Dots, dots, dots.'] },
  { id: 'GlitchGizmo', parts: ['Glitch', 'Gizmo'], role: 'mischief maker', body: '#6b4e5c', accent: '#ff2f6d', head: 'box', term: 'glitch',
    lines: ['A glitch is a small mistake that looks strange. I do it on purpose.', 'Did you see that? Zzzt!', 'Do not worry. It is only style.'] },
  { id: 'BeepBolt', parts: ['Beep', 'Bolt'], role: 'tester', body: '#4f6070', accent: '#6ab8ff', head: 'round', term: 'bpm',
    lines: ['Beep. I count the beat. BPM means beats per minute.', 'Fast music has more beats in a minute.', 'Beep beep. Test passed!'] },
];

/* ---------- drawing a robot (plain SVG, no images) ---------- */
export function botSVG(r) {
  const head = { box: '<rect x="17" y="14" width="30" height="23" rx="6"/>', round: '<rect x="17" y="13" width="30" height="25" rx="13"/>', tall: '<rect x="19" y="10" width="26" height="29" rx="7"/>', visor: '<rect x="15" y="15" width="34" height="21" rx="9"/>' }[r.head];
  const eyes = r.head === 'visor' ? `<rect class="b-eye" x="21" y="23" width="22" height="5" rx="2.5" fill="${r.accent}"/>`
    : `<rect class="b-eye" x="23" y="23" width="5" height="7" rx="2" fill="${r.accent}"/><rect class="b-eye" x="36" y="23" width="5" height="7" rx="2" fill="${r.accent}"/>`;
  return `<svg class="botsvg" viewBox="0 0 64 80" aria-hidden="true" focusable="false">
<g class="b-ant"><path d="M32 12 V4" stroke="#8a7a7e" stroke-width="2"/><circle class="b-bulb" cx="32" cy="4" r="3" fill="${r.accent}"/></g>
<g class="b-arm-l"><rect x="9" y="42" width="8" height="16" rx="4" fill="#8a7a7e"/></g>
<g class="b-arm-r"><rect x="47" y="42" width="8" height="16" rx="4" fill="#8a7a7e"/><rect x="45" y="56" width="12" height="6" rx="2" fill="${r.accent}"/></g>
<g fill="${r.body}" stroke="#1a0d10" stroke-width="1.5">${head}<rect x="20" y="39" width="24" height="22" rx="5"/></g>
${eyes}
<circle cx="32" cy="50" r="4" fill="${r.accent}" opacity=".85"/>
<g class="b-wheels"><g class="b-wheel" style="transform-origin:24px 69px"><circle cx="24" cy="69" r="7" fill="#1a0d10" stroke="#8a7a7e" stroke-width="2"/><path d="M24 63v12M18 69h12" stroke="#8a7a7e" stroke-width="1.5"/></g>
<g class="b-wheel" style="transform-origin:40px 69px"><circle cx="40" cy="69" r="7" fill="#1a0d10" stroke="#8a7a7e" stroke-width="2"/><path d="M40 63v12M34 69h12" stroke="#8a7a7e" stroke-width="1.5"/></g></g>
</svg>`;
}

const calm = () => prefs.get('calm');
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LEARN = new URL('./learn/', import.meta.url).href;
const learnHref = (id) => `${LEARN}#${id}`;
let bubble = null, bubbleTimer = 0;

function say(robot, anchor) {
  const i = (say.n = ((say.n || 0) + 1) % robot.lines.length);
  bubble = bubble || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'bot-say', role: 'status' }));
  bubble.replaceChildren();
  const who = document.createElement('b'); who.textContent = robot.id;
  const p = document.createElement('p'); p.textContent = robot.lines[i];
  const a = document.createElement('a'); a.href = learnHref(robot.term); a.textContent = `Learn the word “${robot.term}” →`;
  bubble.append(who, p, a);
  const r = anchor.getBoundingClientRect();
  bubble.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 270))}px`;
  bubble.style.top = `${Math.max(8, r.top - bubble.offsetHeight - 10)}px`;
  bubble.classList.add('on');
  bubble.style.top = `${Math.max(8, r.top - bubble.offsetHeight - 10)}px`;
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('on'), 9000);
}
addEventListener('pointerdown', (e) => { if (bubble && !e.target.closest('#bot-say, .bot')) bubble.classList.remove('on'); }, true);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && bubble) bubble.classList.remove('on'); });

function makeBot(robot, cls) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `bot ${cls || ''}`;
  b.setAttribute('aria-label', `${robot.id}, a little ${robot.role} robot. ${robot.parts[0]} plus ${robot.parts[1]}. Press to hear what it says.`);
  b.innerHTML = botSVG(robot);
  b.addEventListener('click', () => { say(robot, b); b.classList.add('glitch'); setTimeout(() => b.classList.remove('glitch'), 380); });
  return b;
}

/* ---------- headings: scramble into place ---------- */
const NOISE = '▒▓░#%&@$*+=/<>?01';
function scramble(h) {
  if (calm() || h.dataset.done) return;
  h.dataset.done = '1';
  const final = h.textContent;
  h.setAttribute('aria-label', final);
  const t0 = performance.now(), dur = 700;
  (function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    h.textContent = [...final].map((ch, i) => (ch === ' ' || i < p * final.length * 1.15 ? ch : NOISE[(Math.random() * NOISE.length) | 0])).join('');
    if (p < 1) requestAnimationFrame(tick); else h.textContent = final;
  })(t0);
  setTimeout(() => { h.textContent = final; }, dur + 150);                   // if the page was not drawing (a hidden tab), still end with the real words
}

/* ---------- the page ---------- */
function init() {
  const root = document.documentElement;
  if (root.dataset.robots === 'off') return;

  /* glitch text: a heading gets a data-text copy that the stylesheet slices and shifts, now and then and on hover */
  const glitchy = $$('h2.sect, .print h3, .hero-text h2, .glitch-me');
  glitchy.forEach((h) => { h.classList.add('glitch-text'); h.dataset.text = h.textContent; });
  const burst = () => {
    if (!calm() && !document.hidden && glitchy.length) {
      const h = glitchy[(Math.random() * glitchy.length) | 0], r = h.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) { h.classList.add('glitching'); setTimeout(() => h.classList.remove('glitching'), 320); }
    }
    setTimeout(burst, 5000 + Math.random() * 7000);
  };
  setTimeout(burst, 3500);

  /* a row of projects: a worker on the line, and each project builds itself when it arrives */
  const rows = $$('.line, .trays, .sheet');
  const workers = rows.map((row, i) => {
    const robot = ROBOTS[(i + 1) % ROBOTS.length], w = makeBot(robot, 'rowbot');
    w.tabIndex = -1; w.setAttribute('aria-hidden', 'true');
    row.append(w);
    return { row, w, robot };
  });
  const prints = $$('.hang');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const p = e.target.querySelector('.print'), host = workers.find((x) => x.row.contains(e.target));
      if (!p || calm()) { e.target.classList.add('built'); continue; }
      if (host) { host.w.classList.add('working'); setTimeout(() => host.w.classList.remove('working'), 1300); }
      p.classList.add('assembling');
      setTimeout(() => { p.classList.remove('assembling'); e.target.classList.add('built'); }, 900);
    }
  }, { threshold: 0.18 });
  prints.forEach((h) => { if (!calm() && h.getBoundingClientRect().top > innerHeight * 0.9) { h.classList.add('unbuilt'); io.observe(h); } else h.classList.add('built'); });

  const heads = $$('h2.sect');
  const hio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { hio.unobserve(e.target); scramble(e.target); } }), { threshold: 0.6 });
  heads.forEach((h) => hio.observe(h));

  /* the companion: rolls along the bottom as you scroll */
  const comp = makeBot(ROBOTS[0], 'companion');
  const label = document.createElement('span'); label.className = 'bot-name'; label.textContent = ROBOTS[0].id;
  const wrap = document.createElement('div'); wrap.className = 'companion-wrap'; wrap.append(comp, label);
  document.body.append(wrap);
  let cur = 0, lastY = scrollY, idleT = 0, x = 0, dir = 1, ticking = false, speed = 0, lastT = performance.now();
  const setRobot = (i) => {
    if (i === cur) return;
    cur = i;
    const r = ROBOTS[i];
    comp.innerHTML = botSVG(r);
    comp.setAttribute('aria-label', `${r.id}, a little ${r.role} robot. ${r.parts[0]} plus ${r.parts[1]}. Press to hear what it says.`);
    comp.onclick = () => { say(r, comp); comp.classList.add('glitch'); setTimeout(() => comp.classList.remove('glitch'), 380); };
    label.textContent = r.id;
    comp.classList.add('glitch'); setTimeout(() => comp.classList.remove('glitch'), 380);
  };
  comp.onclick = () => { say(ROBOTS[cur], comp); comp.classList.add('glitch'); setTimeout(() => comp.classList.remove('glitch'), 380); };

  function update() {
    ticking = false;
    const y = scrollY, dy = y - lastY, now = performance.now(), dt = Math.max(1, now - lastT);
    lastY = y; lastT = now; idleT = now;
    if (calm()) { wrap.style.transform = 'translateX(0)'; comp.classList.remove('rolling', 'working', 'nap'); return; }
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const travel = Math.max(0, innerWidth - 120);
    x = (y / max) * travel;
    if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1;
    speed = Math.abs(dy) / dt;
    wrap.style.transform = `translateX(${x.toFixed(1)}px)`;
    comp.style.setProperty('--dir', dir);
    comp.classList.remove('nap');
    comp.classList.add('rolling', 'working');
    comp.classList.toggle('fast', speed > 2.2);
    if (speed > 3.2 && !comp.classList.contains('glitch')) { comp.classList.add('glitch'); setTimeout(() => comp.classList.remove('glitch'), 380); }
    /* which section are we in? the nearest heading above the middle of the screen picks the robot */
    let k = -1; heads.forEach((h, i) => { if (h.getBoundingClientRect().top < innerHeight * 0.55) k = i; });
    setRobot(k < 0 ? 4 : (k + 1) % ROBOTS.length);
    clearTimeout(update.t);
    update.t = setTimeout(() => { comp.classList.remove('rolling', 'working', 'fast'); comp.classList.add('nap'); }, 650);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  addEventListener('darklabs:prefs', () => { if (!calm()) { $$('.hang.unbuilt').forEach((h) => io.observe(h)); } update(); });
  setRobot(4); update(); comp.classList.add('nap');

  /* the footer: the portmanteau, plainly */
  const foot = document.querySelector('footer');
  if (foot && !foot.querySelector('.bot-credit')) {
    const p = document.createElement('p'); p.className = 'bot-credit';
    p.innerHTML = `The robots are named with <a href="${LEARN}#portmanteau">portmanteaus</a>: two words joined into one, with a capital letter in the middle. ${ROBOTS.map((r) => r.id).join(', ')}.`;
    foot.append(p);
    const q = document.createElement('p'); q.className = 'bot-credit';
    q.innerHTML = `<a href="${LEARN}">Word Lab</a> &middot; <button type="button" class="linklike" data-calm-toggle>Calm mode</button> &middot; <button type="button" class="linklike" data-easy-toggle>Easy reading</button> &middot; <a href="#" data-ctx-toggle>Use the browser’s right-click menu</a>`;
    foot.append(q);
    const sync = () => { q.querySelector('[data-calm-toggle]').textContent = `Calm mode: ${prefs.get('calm') ? 'on' : 'off'}`; q.querySelector('[data-easy-toggle]').textContent = `Easy reading: ${prefs.get('easy') ? 'on' : 'off'}`; };
    q.querySelector('[data-calm-toggle]').addEventListener('click', () => prefs.toggle('calm'));
    q.querySelector('[data-easy-toggle]').addEventListener('click', () => prefs.toggle('easy'));
    addEventListener('darklabs:prefs', sync); sync();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

/* Darklabs hub: the optional atmosphere. Nothing here loads unless someone switches it on in the page settings.
   set({ beam, dust, motion }) starts or stops each part; with all three off the frame loop is not even running.
     beam    a dark room with a light that follows your pointer (a heavy lantern: see chase() in logic.js)
     dust    specks drifting in that light
     motion  the room's layers drift as you move, cards lean toward your pointer */
import { chase } from './logic.js';

const root = document.documentElement;
const on = { beam: false, dust: false, motion: false };
const st = { x: { x: innerWidth * 0.5, v: 0 }, y: { x: innerHeight * 0.35, v: 0 }, tx: innerWidth * 0.5, ty: innerHeight * 0.35, idle: 0, t: 0 };
let raf = 0, last = 0, slow = 0, dust = null, layers = [], dark = null, glow = null, bound = false;

function ensureBeam(want) {
  if (want && !dark) {
    dark = Object.assign(document.createElement('div'), { id: 'dark' }); glow = Object.assign(document.createElement('div'), { id: 'glow' });
    dark.setAttribute('aria-hidden', 'true'); glow.setAttribute('aria-hidden', 'true'); document.body.append(dark, glow);
  } else if (!want && dark) { dark.remove(); glow.remove(); dark = glow = null; }
}

function ensureDust(want) {
  if (want && !dust) {
    const cv = Object.assign(document.createElement('canvas'), { id: 'dust' }); cv.setAttribute('aria-hidden', 'true'); document.body.append(cv);
    const cx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 1.5), parts = [];
    const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    for (let i = 0; i < 40; i++) parts.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 9, r: 0.5 + Math.random() * 1.6, p: Math.random() * 6 });
    dust = { cv, cx, parts, size };
  } else if (!want && dust) { removeEventListener('resize', dust.size); dust.cv.remove(); dust = null; }
}

function bind() {
  if (bound) return; bound = true;
  const move = (x, y) => { st.tx = x; st.ty = y; st.idle = 0; };
  addEventListener('pointermove', (e) => move(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
  // cards lean toward the pointer: one listener on the page, not one per card
  addEventListener('pointermove', (e) => {
    if (!on.motion) return;
    const p = e.target.closest && e.target.closest('.print'); if (!p) return;
    const r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    p.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg'); p.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
  }, { passive: true });
  addEventListener('pointerout', (e) => { const p = e.target.closest && e.target.closest('.print'); if (p && !p.contains(e.relatedTarget)) { p.style.setProperty('--ry', '0deg'); p.style.setProperty('--rx', '0deg'); } }, { passive: true });
}

function frame(now) {
  raf = 0;
  if (!on.beam && !on.dust && !on.motion) return;                                  // nothing to do: the loop stops itself
  const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt; st.idle += dt;
  slow = dt > 0.034 ? slow + 1 : Math.max(0, slow - 1);                            // the page is struggling: shed the dust first
  let tx = st.tx, ty = st.ty;
  if (st.idle > 4.5) { tx = innerWidth * (0.5 + 0.3 * Math.sin(st.t * 0.33)); ty = innerHeight * (0.42 + 0.26 * Math.sin(st.t * 0.27 + 1)); }   // nobody is moving the light: let it wander
  st.x = chase(st.x, tx, dt); st.y = chase(st.y, ty, dt);
  if (on.beam || on.dust) { root.style.setProperty('--mx', st.x.x.toFixed(1) + 'px'); root.style.setProperty('--my', st.y.x.toFixed(1) + 'px'); }
  if (on.motion) {
    const nx = st.x.x / innerWidth - 0.5, ny = st.y.x / innerHeight - 0.5, sy = scrollY;
    for (const L of layers) { const d = +L.dataset.depth; L.style.transform = `translate3d(${(-nx * d * 90).toFixed(1)}px,${(-ny * d * 60 - sy * d * 0.25).toFixed(1)}px,0)`; }
  }
  if (dust && slow < 12) {
    const { cx, parts } = dust; cx.clearRect(0, 0, innerWidth, innerHeight); cx.globalCompositeOperation = 'lighter';
    for (const q of parts) {
      q.x += q.vx * dt + Math.sin(st.t * 0.6 + q.p) * 0.15; q.y += q.vy * dt;
      if (q.y < -10) { q.y = innerHeight + 10; q.x = Math.random() * innerWidth; } if (q.x < -10) q.x = innerWidth + 10; if (q.x > innerWidth + 10) q.x = -10;
      const dx = q.x - st.x.x, dy = q.y - st.y.x, a = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 330);
      if (a > 0.02) { cx.fillStyle = `rgba(255,120,130,${(a * 0.55).toFixed(3)})`; cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, 6.283); cx.fill(); }
    }
  }
  raf = requestAnimationFrame(frame);
}

export function set(next) {
  Object.assign(on, next);
  bind();
  layers = on.motion ? [...document.querySelectorAll('#bg .layer')] : (layers.forEach((L) => { L.style.transform = ''; }), []);
  ensureBeam(on.beam); ensureDust(on.dust);
  root.classList.toggle('fx-beam', on.beam);
  if ((on.beam || on.dust || on.motion) && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

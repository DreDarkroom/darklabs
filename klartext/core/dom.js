/* KlartextKit: tiny DOM helpers. No framework: h('button', {class:'btn', onclick}, 'text') builds an element. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const clear = (el) => { el.textContent = ''; return el; };
/** Like el.append(...) but skips null, false and undefined (the native one would write the word "null" into the page). */
export function put(el, ...kids) { add(el, kids); return el; }
/** Like el.replaceChildren(...) with the same safety. */
export function fill(el, ...kids) { el.replaceChildren(); add(el, kids); return el; }

/** An icon from the sprite in index.html: <svg class="ic"><use href="#i-star"/></svg> */
export function icon(id, cls = 'ic') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.setAttribute('viewBox', '0 0 24 24');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#i-${id}`);
  s.append(u);
  return s;
}

/** One listener on a parent instead of one per child: cheaper, and it keeps working when children are replaced. */
export function delegate(root, type, sel, fn) {
  root.addEventListener(type, (e) => { const t = e.target.closest?.(sel); if (t && root.contains(t)) fn(e, t); });
}

/** Unbiased random integer in [0, n) from the browser's crypto source. */
export function randInt(n) {
  if (n <= 1) return 0;
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return Math.floor(Math.random() * n);
  const max = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
  do { c.getRandomValues(a); } while (a[0] >= max);
  return a[0] % n;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

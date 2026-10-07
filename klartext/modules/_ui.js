/* KlartextKit: small UI pieces shared by the modules. (The leading underscore means this file is a helper, not a tool.) */
import { h, icon, put, fill } from '../core/dom.js';
import { CATS, GAMES, REG } from '../data/cats.js';

/** The top of every tool: a way home, the title in German with English beside it, and one plain line about it. */
export const head = (de, en, desc) => h('header', { class: 'mhead' },
  h('a', { class: 'back', href: '#/' }, icon('home'), h('span', null, 'Start')),
  h('h1', { tabindex: '-1' }, de, ' ', h('span', { class: 'en' }, en)),
  desc ? h('p', { class: 'lead' }, desc) : null);

/** A row of choice buttons where one is selected. opts: [{id, text, cat}]. Calls onpick(id). Returns the element. */
export function chips(label, opts, value, onpick) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  const draw = () => wrap.replaceChildren(...opts.map((o) => h('button', {
    type: 'button', class: 'chip', 'data-cat': o.cat || null, 'aria-pressed': String(o.id === value),
    onclick: () => { value = o.id; draw(); onpick(o.id); },
  }, o.cat ? icon(CATS[o.cat].shape, 'ic sm') : null, o.text, o.sub ? h('span', { class: 'sub' }, o.sub) : null)));
  draw();
  return wrap;
}

export const catOpts = () => [{ id: 'all', text: 'Alle' }, ...Object.entries(CATS).map(([id, c]) => ({ id, text: c.de, cat: id }))];
export const gameOpts = () => [{ id: 'all', text: 'Alle Spiele' }, ...Object.entries(GAMES).map(([id, g]) => ({ id, text: g.de }))];

/** A switch you can press: label on the left, state shown in words (not only colour). */
export function toggle(label, on, onchange) {
  const b = h('button', { type: 'button', class: 'tog', role: 'switch', 'aria-checked': String(!!on) });
  const draw = () => { b.setAttribute('aria-checked', String(!!on)); b.replaceChildren(h('span', { class: 'knob', 'aria-hidden': 'true' }), h('span', null, label), h('b', { class: 'st' }, on ? 'An' : 'Aus')); };
  b.addEventListener('click', () => { on = !on; draw(); onchange(on); });
  draw();
  return b;
}

export const regTag = (reg) => h('span', { class: 'reg reg-' + reg, title: REG[reg].en }, reg === 'crude' ? '⚠ ' : '', REG[reg].de);

/** The ISO-style "Nur verstehen" warning shown wherever a rude phrase appears. */
export const crudeNote = () => h('p', { class: 'warn' }, '⚠ Nur verstehen, nicht sagen. ', h('span', { class: 'en' }, 'Understand it, do not say it.'));

export const speakButton = (tts, text, label = 'Hören', rate = 1) => h('button', {
  type: 'button', class: 'btn ghost', onclick: () => tts.speak(text, { rate }), title: tts.supported ? 'Read it aloud' : 'This device has no speech voice',
}, icon('sound'), h('span', null, label));

/* Los (picker): coin, dice, pick-one-from-a-list, and a team splitter. Randomness comes from the browser's crypto source, with no bias (see core/dom.js randInt). */
import { h, randInt, shuffle, put, fill } from '../core/dom.js';
import { head, chips } from './_ui.js';

export const rollDice = (count, sides, rnd = randInt) => Array.from({ length: count }, () => rnd(sides) + 1);
/** Split names into two teams as evenly as possible (the first team gets the extra person if the count is odd). */
export function splitTeams(names, shuf = shuffle) {
  const all = shuf(names.map((n) => n.trim()).filter(Boolean));
  const half = Math.ceil(all.length / 2);
  return [all.slice(0, half), all.slice(half)];
}
export const lines = (text) => String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export default {
  mount(root, ctx) {
    const { store, tts, attend } = ctx;
    let tab = 'coin', sides = 6, count = 1;
    const body = h('div');
    const out = (el, big, small) => { fill(el, h('p', { class: 'tcount' }, big), small ? h('p', { class: 'fine' }, small) : null); attend.flash(el, 'info'); };

    function draw() {
      if (tab === 'coin') {
        const res = h('div', { class: 'panel bigsay', 'aria-live': 'polite' }, h('p', { class: 'hint' }, 'Tippe auf die Münze.'));
        fill(body, res, h('button', { class: 'btn big', type: 'button', onclick: () => { const k = randInt(2) ? 'Kopf' : 'Zahl'; out(res, k, k === 'Kopf' ? 'Heads' : 'Tails'); tts.speak(k); } }, 'Münze werfen'));
      } else if (tab === 'dice') {
        const res = h('div', { class: 'panel bigsay', 'aria-live': 'polite' }, h('p', { class: 'hint' }, 'Tippe auf Würfeln.'));
        fill(body, 
          chips('Seiten', [6, 20, 100].map((n) => ({ id: n, text: `W${n}` })), sides, (v) => { sides = v; }),
          chips('Anzahl', [1, 2, 3, 4].map((n) => ({ id: n, text: `${n}×` })), count, (v) => { count = v; }),
          res, h('button', { class: 'btn big', type: 'button', onclick: () => { const r = rollDice(count, sides); out(res, r.join('  '), r.length > 1 ? `Summe ${r.reduce((a, b) => a + b, 0)}` : ''); tts.speak(String(r.reduce((a, b) => a + b, 0))); } }, 'Würfeln'));
      } else {
        const ta = h('textarea', { class: 'field', rows: 6, 'aria-label': 'Eine Zeile pro Name oder Auswahl', placeholder: 'Eine Zeile pro Name' }, store.get('picker.names', ''));
        ta.value = store.get('picker.names', '');
        const res = h('div', { class: 'panel bigsay', 'aria-live': 'polite' }, h('p', { class: 'hint' }, 'Schreib Namen auf, eine Zeile pro Name.'));
        const read = () => { store.set('picker.names', ta.value); return lines(ta.value); };
        const pickBtn = h('button', { class: 'btn big', type: 'button', onclick: () => { const l = read(); if (!l.length) return; const w = l[randInt(l.length)]; out(res, w, 'Gewählt'); tts.speak(w); } }, 'Einen auslosen');
        const teamBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
          const l = read(); if (l.length < 2) { res.replaceChildren(h('p', { class: 'warn' }, 'Mindestens zwei Namen.')); return; }
          const [a, b] = splitTeams(l);
          res.replaceChildren(h('div', { class: 'teams' },
            h('div', { class: 'team', 'data-cat': 'attack' }, h('h2', null, '▲ Team Rot'), h('ul', { class: 'plain' }, a.map((n) => h('li', null, n)))),
            h('div', { class: 'team', 'data-cat': 'defend' }, h('h2', null, '■ Team Blau'), h('ul', { class: 'plain' }, b.map((n) => h('li', null, n))))));
          attend.flash(res, 'info');
        } }, 'In zwei Teams teilen');
        fill(body, ta, h('div', { class: 'row' }, pickBtn, teamBtn), res);
      }
    }
    put(root, head('Los', 'Coin, dice, teams', 'Münze, Würfel, Auslosen, Teams.'),
      chips('Werkzeug', [{ id: 'coin', text: 'Münze' }, { id: 'dice', text: 'Würfel' }, { id: 'list', text: 'Auslosen & Teams' }], tab, (v) => { tab = v; draw(); }), body);
    draw();
    return () => tts.stop();
  },
};

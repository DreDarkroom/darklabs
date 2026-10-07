/* Bauen (builder): snap a callout together from parts and see the grammar behind it; or turn an English game verb into German.
   Both halves are small pure functions (data/build.js, core/german.js) with tests. */
import { h, icon, put, fill } from '../core/dom.js';
import { CATS } from '../data/cats.js';
import { PLACES, TEMPLATES, compose } from '../data/build.js';
import { conjugateWeak } from '../core/german.js';
import { head, chips } from './_ui.js';

export default {
  mount(root, ctx) {
    const { tts, store, attend, params } = ctx;
    let tab = params.tab === 'verbs' ? 'verbs' : 'calls', tplId = TEMPLATES[0].id;
    const picks = {};
    const body = h('div');

    function drawCalls() {
      const tpl = TEMPLATES.find((t) => t.id === tplId);
      const out = compose(tpl, picks);
      const result = h('div', { class: 'bigsay panel', 'data-cat': tpl.cat, 'aria-live': 'polite' },
        h('div', { class: 'say-de' }, icon(CATS[tpl.cat].shape, 'ic shape'), out),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { tts.speak(out); attend.flash(result, 'info'); } }, icon('sound'), h('span', null, 'Hören')),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => navigator.clipboard?.writeText(out).catch(() => {}) }, 'Kopieren')),
        h('p', { class: 'fine' }, tpl.hint));
      const slots = tpl.slots.map((s) => h('div', { class: 'panel' }, h('h2', null, s.label),
        chips(s.label, s.opts.map((o) => ({ id: o.v, text: o.v, sub: o.en })), picks[s.id] ?? s.opts[0].v, (v) => { picks[s.id] = v; drawCalls(); })));
      const table = tpl.slots.some((s) => s.opts.some((o) => PLACES.some((p) => p.at === o.v || p.to === o.v || p.acc === o.v || p.nom === o.v)))
        ? h('details', { class: 'panel' }, h('summary', null, 'Alle vier Formen jedes Ortes (nom / acc / wo / wohin)'),
          h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['', 'Wer/Was', 'Wen/Was', 'Wo?', 'Wohin?'].map((t) => h('th', null, t)))),
            h('tbody', null, PLACES.map((p) => h('tr', null, h('th', null, p.en), h('td', null, p.nom), h('td', null, p.acc), h('td', null, p.at), h('td', null, p.to))))))
        : null;
      fill(body, 
        chips('Vorlage', TEMPLATES.map((t) => ({ id: t.id, text: t.de, cat: t.cat })), tplId, (v) => { tplId = v; drawCalls(); }),
        result, ...slots, table);
    }

    function drawVerbs() {
      const inp = h('input', { type: 'text', class: 'field', 'aria-label': 'Verb auf -en', placeholder: 'z. B. pushen, campen, boosten', value: params.v || 'pushen', autocapitalize: 'off', spellcheck: 'false' });
      const out = h('div', { 'aria-live': 'polite' });
      const run = () => {
        const r = conjugateWeak(inp.value);
        if (r.error) return out.replaceChildren(h('p', { class: 'panel warn' }, r.error));
        out.replaceChildren(h('div', { class: 'panel' },
          h('h2', null, r.inf), h('table', { class: 'tbl' }, h('tbody', null, r.rows.map(([p, f]) => h('tr', null, h('th', null, p), h('td', null, f))))),
          h('p', null, h('b', null, 'Perfekt: '), r.perfect, '.'),
          h('p', null, h('b', null, 'Befehl: '), r.imperative.map(([p, f]) => `${f} (${p})`).join(' · ')),
          h('button', { class: 'btn', type: 'button', onclick: () => tts.speak(`${r.rows[0][0]} ${r.rows[0][1]}. ${r.rows[1][0]} ${r.rows[1][1]}. ${r.perfect}`) }, icon('sound'), h('span', null, 'Hören')),
          h('p', { class: 'fine' }, 'Gilt für regelmäßige Verben auf -en. Verben mit Vorsilbe (angreifen) oder auf -eln / -ern sind anders. Im Zweifel: Duden.')));
      };
      inp.addEventListener('input', run);
      fill(body, h('div', { class: 'panel' }, h('p', null, 'Englisches Spielverb + -en = deutsches Verb. ', h('span', { class: 'en' }, 'English game verb + -en = a German verb.')), inp), out);
      run();
    }

    const tabs = chips('Bereich', [{ id: 'calls', text: 'Funk bauen' }, { id: 'verbs', text: 'Verben' }], tab, (v) => { tab = v; (tab === 'calls' ? drawCalls : drawVerbs)(); });
    put(root, head('Bauen', 'Build calls, verbs', 'Teile zusammenstecken. Die Grammatik siehst du dabei gleich mit.'), tabs, body);
    (tab === 'calls' ? drawCalls : drawVerbs)();
    return () => tts.stop();
  },
};

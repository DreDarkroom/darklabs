/* Lexikon: search every phrase and word; read the short grammar notes. Results are plain text (no hover tricks), long lists skip off-screen work. */
import { h, icon, put, fill } from '../core/dom.js';
import { CATS, REG } from '../data/cats.js';
import { PHRASES } from '../data/phrases.js';
import { TERMS } from '../data/terms.js';
import { RULES } from '../data/grammar.js';
import { filterPhrases } from '../core/select.js';
import { head, chips, catOpts, gameOpts, regTag, crudeNote } from './_ui.js';

const ART = { der: 'm', die: 'f', das: 'n' };

export default {
  mount(root, ctx) {
    const { tts, params } = ctx;
    let tab = params.tab || 'phrases', cat = params.cat || 'all', game = params.game || 'all', reg = 'all', q = params.q || '';
    const list = h('div', { class: 'lexlist' });
    const count = h('p', { class: 'fine', 'aria-live': 'polite' });
    const speak = (t) => h('button', { type: 'button', class: 'btn ghost sm', onclick: () => tts.speak(t), 'aria-label': `Hören: ${t}` }, icon('sound'));
    const like = (s, n) => String(s).toLowerCase().includes(n);

    function draw() {
      const needle = q.toLowerCase().trim();
      if (tab === 'phrases') {
        const items = filterPhrases(PHRASES, { cat, game, q }).filter((p) => reg === 'all' || p.reg === reg);
        count.textContent = `${items.length} Sätze`;
        list.replaceChildren(...items.map((p) => h('article', { class: 'lex', 'data-cat': p.cat },
          h('div', { class: 'lexmain' }, icon(CATS[p.cat].shape, 'ic shape sm'), h('div', null, h('p', { class: 'lde' }, p.de), h('p', { class: 'len' }, p.en), p.note ? h('p', { class: 'fine' }, p.note) : null, h('p', { class: 'meta' }, regTag(p.reg)), p.reg === 'crude' ? crudeNote() : null)),
          speak(p.say || p.de))));
      } else if (tab === 'words') {
        const items = TERMS.filter((t) => !needle || like(t.de, needle) || like(t.en, needle) || like(t.note || '', needle));
        count.textContent = `${items.length} Wörter`;
        list.replaceChildren(...items.map((t) => {
          const art = t.type === 'noun' ? t.de.split(' ')[0] : null;
          return h('article', { class: 'lex' },
            h('div', { class: 'lexmain' }, h('div', null,
              h('p', { class: 'lde' }, art ? h('span', { class: 'art art-' + ART[art], title: { der: 'masculine', die: 'feminine', das: 'neuter' }[art] }, art) : null, art ? ' ' + t.de.slice(art.length + 1) : t.de, t.pl && t.pl !== '-' ? h('span', { class: 'pl' }, ` · ${t.pl}`) : null),
              h('p', { class: 'len' }, t.en), t.note ? h('p', { class: 'fine' }, t.note) : null,
              t.type === 'verb' ? h('p', { class: 'meta' }, regTag(t.reg), ' ', h('a', { href: '#/builder?tab=verbs&v=' + t.de }, 'Alle Formen →')) : null)),
            speak(t.de.replace(/^(der|die|das) /, '')));
        }));
      } else {
        count.textContent = `${RULES.length} Regeln`;
        list.replaceChildren(...RULES.map((r) => h('article', { class: 'lex rule', id: 'r-' + r.id },
          h('div', { class: 'lexmain' }, h('div', null, h('h2', null, r.title), r.body.map((b) => h('p', null, b)),
            h('ul', { class: 'plain' }, r.ex.map((e) => h('li', null, h('b', null, e.de), ' ', h('span', { class: 'en' }, e.en), ' ', speak(e.de)))))))));
      }
    }

    const search = h('input', { type: 'search', class: 'field', 'aria-label': 'Suchen', placeholder: 'Suchen: Deutsch oder Englisch', value: q, oninput: (e) => { q = e.target.value; draw(); } });
    const filters = h('div', { class: 'panel filters' });
    function drawFilters() {
      fill(filters, 
        chips('Bereich', [{ id: 'phrases', text: 'Sätze' }, { id: 'words', text: 'Wörter' }, { id: 'rules', text: 'Regeln' }], tab, (v) => { tab = v; drawFilters(); draw(); }),
        tab === 'rules' ? null : search,
        tab === 'phrases' ? h('div', null, chips('Spiel', gameOpts(), game, (v) => { game = v; draw(); }), chips('Art', catOpts(), cat, (v) => { cat = v; draw(); }),
          chips('Stil', [{ id: 'all', text: 'Alle' }, ...Object.entries(REG).map(([id, r]) => ({ id, text: r.de }))], reg, (v) => { reg = v; draw(); })) : null);
    }
    put(root, head('Lexikon', 'Phrasebook and rules', 'Suchen, nachlesen, anhören.'),
      h('p', { class: 'panel note' }, 'Geschrieben von einer KI und noch nicht von Muttersprachlern geprüft. Fehler gefunden? Unter Info kannst du sie melden. ', h('span', { class: 'en' }, 'Written by an AI, not yet checked by native speakers. Report mistakes under Info.')),
      filters, count, list);
    drawFilters(); draw();
    return () => tts.stop();
  },
};

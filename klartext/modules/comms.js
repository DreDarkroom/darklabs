/* Funk (callouts): the in-game panel. Big colour-coded buttons; each one also has its own shape and its German + English words, so colour is never the only clue.
   Tap = hear it and see it huge. Built to be used in the Quest browser with the laser pointer: no hover-only controls, no tiny targets. */
import { h, icon, delegate, put, fill } from '../core/dom.js';
import { CATS } from '../data/cats.js';
import { PHRASES } from '../data/phrases.js';
import { filterPhrases } from '../core/select.js';
import { head, chips, catOpts, gameOpts, toggle, regTag, crudeNote } from './ui.js';

export default {
  mount(root, ctx) {
    const { store, tts, params, vr } = ctx;
    let cat = params.cat || 'all', game = params.game || 'all', favOnly = false;
    let showEn = store.get('comms.en', true), slow = store.get('comms.slow', false);
    const favs = new Set(store.get('comms.fav', []));
    const say = h('div', { class: 'bigsay panel', 'aria-live': 'polite' }, h('p', { class: 'hint' }, 'Tippe eine Taste: du hörst das Deutsch. ', h('span', { class: 'en' }, 'Tap a button to hear it.')));
    const grid = h('div', { class: 'pgrid' });
    const count = h('p', { class: 'fine', 'aria-live': 'polite' });

    function draw() {
      let list = filterPhrases(PHRASES, { cat, game });
      if (favOnly) list = list.filter((p) => favs.has(p.id));
      count.textContent = `${list.length} ${list.length === 1 ? 'Satz' : 'Sätze'}` + (favOnly && !list.length ? ': tippe den Stern bei einem Satz, um ihn hier zu sammeln.' : '');
      grid.replaceChildren(...list.map((p) => h('div', { class: 'pcell', 'data-cat': p.cat },
        h('button', { type: 'button', class: 'pbtn', 'data-id': p.id },
          icon(CATS[p.cat].shape, 'ic shape sm'), h('span', { class: 'pde' }, p.de), showEn ? h('span', { class: 'pen' }, p.en) : null),
        h('button', { type: 'button', class: 'star', 'data-star': p.id, 'aria-pressed': String(favs.has(p.id)), 'aria-label': `Favorit: ${p.de}` }, favs.has(p.id) ? '★' : '☆'))));
    }

    delegate(grid, 'click', '.pbtn', (e, b) => {
      const p = PHRASES.find((x) => x.id === b.dataset.id); if (!p) return;
      fill(say, 
        h('div', { class: 'say-de', 'data-cat': p.cat }, icon(CATS[p.cat].shape, 'ic shape'), p.de),
        h('div', { class: 'say-en' }, p.en),
        h('p', { class: 'meta' }, regTag(p.reg), ' ', p.note || ''),
        p.reg === 'crude' ? crudeNote() : null);
      tts.speak(p.say || p.de, { rate: slow ? 0.6 : 1 });
    });
    delegate(grid, 'click', '.star', (e, b) => {
      const id = b.dataset.star; favs.has(id) ? favs.delete(id) : favs.add(id);
      store.set('comms.fav', [...favs]);
      b.setAttribute('aria-pressed', String(favs.has(id))); b.textContent = favs.has(id) ? '★' : '☆';
      if (favOnly) draw();
    });

    put(root, 
      head('Funk', 'Callouts', 'Große, bunte Tasten für den Funk im Spiel. Form, Farbe und Wort gehören zusammen.'),
      say,
      h('details', { class: 'panel filters', open: !vr.on() },
        h('summary', null, 'Filter und Optionen ', h('span', { class: 'en' }, 'Filters and options')),
        chips('Spiel', gameOpts(), game, (v) => { game = v; draw(); }),
        chips('Art', catOpts(), cat, (v) => { cat = v; draw(); }),
        h('div', { class: 'togs' },
          toggle('Englisch zeigen', showEn, (v) => { showEn = v; store.set('comms.en', v); draw(); }),
          toggle('Langsam sprechen', slow, (v) => { slow = v; store.set('comms.slow', v); }),
          toggle('Nur Favoriten ★', favOnly, (v) => { favOnly = v; draw(); }))),
      !tts.supported ? h('p', { class: 'panel warn' }, 'Dieses Gerät hat keine Sprachausgabe: du siehst die Wörter, hörst sie aber nicht.') : (!tts.hasGerman ? h('p', { class: 'panel note' }, 'Hinweis: Es wurde keine deutsche Stimme gefunden. Das Gerät liest vielleicht mit einer anderen Stimme vor. ', h('span', { class: 'en' }, 'No German voice found on this device.')) : null),
      count, grid);
    draw();
  },
};

/* Karten (flashcards): spaced repetition. Cards you know come back later; cards you miss come back soon. Keys: Space = show, 1 / 2 / 3 = rate, S = say it.
   Progress is stored on this device only (store key "srs"). Rating never animates harshly: a miss is shown as information, not as a failure. */
import { h, icon, shuffle, put, fill } from '../core/dom.js';
import { CATS } from '../data/cats.js';
import { PHRASES } from '../data/phrases.js';
import { filterPhrases } from '../core/select.js';
import { schedule, buildQueue, stats } from '../core/srs.js';
import { head, chips, catOpts, gameOpts, toggle, regTag, crudeNote } from './_ui.js';

export default {
  mount(root, ctx) {
    const { store, tts, attend, progress, params } = ctx;
    let cat = params.cat || 'all', game = params.game || 'all';
    const states = store.get('srs', {});
    let pool = [], queue = [], idx = 0, shown = false, practice = false, tally = { know: 0, almost: 0, miss: 0 };
    let auto = store.get('cards.auto', true);
    const stat = h('p', { class: 'fine', 'aria-live': 'polite' });
    const area = h('div', { class: 'cardarea' });

    function build() {
      pool = filterPhrases(PHRASES, { cat, game });
      const ids = pool.map((p) => p.id);
      queue = buildQueue(ids, states, { newLimit: store.get('cards.new', 10) });
      practice = false; idx = 0; shown = false; tally = { know: 0, almost: 0, miss: 0 };
      const s = stats(ids, states);
      stat.textContent = `${s.due} fällig · ${s.fresh} neu · ${s.learning} am Lernen · ${s.mastered} gemeistert (${s.total} Karten)`;
      draw();
    }

    function finish() {
      const total = tally.know + tally.almost + tally.miss;
      area.replaceChildren(h('div', { class: 'panel done' },
        h('h2', null, total ? 'Geschafft!' : 'Alles erledigt!'),
        total ? h('p', null, `${tally.know} gewusst · ${tally.almost} fast · ${tally.miss} nicht gewusst`) : h('p', null, 'Heute ist nichts mehr fällig. Come back later, or practise anyway.'),
        h('p', { class: 'fine' }, `Serie: ${progress.current(store)} ${progress.current(store) === 1 ? 'Tag' : 'Tage'}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { queue = shuffle(pool.map((p) => p.id)).slice(0, 10); practice = true; idx = 0; tally = { know: 0, almost: 0, miss: 0 }; shown = false; draw(); } }, 'Trotzdem üben (10 Karten)'),
          h('a', { class: 'btn ghost', href: '#/quiz' }, 'Quiz'),
          h('a', { class: 'btn ghost', href: '#/' }, 'Start'))));
      if (total) attend.flash(area.firstChild, 'ok');
    }

    function draw() {
      if (idx >= queue.length) return finish();
      const p = PHRASES.find((x) => x.id === queue[idx]); const c = CATS[p.cat];
      const front = h('div', { class: 'face', 'data-cat': p.cat },
        h('p', { class: 'ctag' }, icon(c.shape, 'ic shape sm'), c.de, ' · ', regTag(p.reg)),
        h('p', { class: 'cde' }, p.de),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => tts.speak(p.say || p.de) }, icon('sound'), h('span', null, 'Hören (S)'))));
      const back = h('div', { class: 'reveal' },
        h('p', { class: 'cen' }, p.en), p.note ? h('p', { class: 'cnote' }, p.note) : null, p.reg === 'crude' ? crudeNote() : null);
      const controls = shown
        ? h('div', { class: 'rate', role: 'group', 'aria-label': 'Wie gut wusstest du es?' },
          h('button', { class: 'btn miss', type: 'button', onclick: () => rate('miss') }, h('b', null, '1'), ' Nicht gewusst ', h('span', { class: 'en' }, 'Missed')),
          h('button', { class: 'btn almost', type: 'button', onclick: () => rate('almost') }, h('b', null, '2'), ' Fast ', h('span', { class: 'en' }, 'Almost')),
          h('button', { class: 'btn know', type: 'button', onclick: () => rate('know') }, h('b', null, '3'), ' Gewusst ', h('span', { class: 'en' }, 'Knew it')))
        : h('button', { class: 'btn big', type: 'button', onclick: reveal }, 'Zeigen ', h('span', { class: 'en' }, 'Show (Space)'));
      area.replaceChildren(h('p', { class: 'fine' }, `${idx + 1} / ${queue.length}${practice ? ' · Übungsmodus' : ''}`), h('div', { class: 'card panel' }, front, shown ? back : null), controls);
      if (auto && !shown) tts.speak(p.say || p.de);
    }

    function reveal() { shown = true; draw(); area.querySelector('.rate .know')?.focus({ preventScroll: true }); }
    function rate(result) {
      const id = queue[idx];
      if (!practice) { states[id] = schedule(states[id], result); store.set('srs', states); }
      progress.touch(store); tally[result]++;
      const card = area.querySelector('.card');
      attend.flash(card, result === 'know' ? 'ok' : 'info');
      idx++; shown = false; draw();
      const s = stats(pool.map((p) => p.id), states);
      stat.textContent = `${s.due} fällig · ${s.fresh} neu · ${s.learning} am Lernen · ${s.mastered} gemeistert (${s.total} Karten)`;
    }

    const onKey = (e) => {
      if (e.target !== document.body || e.ctrlKey || e.metaKey || e.altKey) return;
      if (idx >= queue.length) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
      else if (shown && ['1', '2', '3'].includes(e.key)) rate(['miss', 'almost', 'know'][+e.key - 1]);
      else if (e.key === 's' || e.key === 'S') { const p = PHRASES.find((x) => x.id === queue[idx]); tts.speak(p.say || p.de); }
    };
    addEventListener('keydown', onKey);

    put(root, 
      head('Karten', 'Flashcards', 'Wiederholen mit Abstand: Schwere Karten kommen früher zurück.'),
      h('div', { class: 'panel filters' },
        chips('Spiel', gameOpts(), game, (v) => { game = v; build(); }),
        chips('Art', catOpts(), cat, (v) => { cat = v; build(); }),
        chips('Neue Karten pro Sitzung', [5, 10, 20].map((n) => ({ id: n, text: `${n} neu` })), store.get('cards.new', 10), (n) => { store.set('cards.new', n); build(); }),
        toggle('Deutsch automatisch vorlesen', auto, (v) => { auto = v; store.set('cards.auto', v); })),
      stat, area);
    build();
    return () => removeEventListener('keydown', onKey);
  },
};

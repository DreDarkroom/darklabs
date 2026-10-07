/* Quiz: ten questions, four ways to answer. A wrong answer is not a fail: it is shown, explained and the card goes back into the flashcard queue.
   There is no timer and nothing auto-advances: you press Weiter when you are ready (calmer for people who get overwhelmed by speed). */
import { h, icon, shuffle, put, fill } from '../core/dom.js';
import { PHRASES } from '../data/phrases.js';
import { filterPhrases, makeQuestion, isCorrect, MODES } from '../core/select.js';
import { schedule } from '../core/srs.js';
import { head, chips, catOpts, gameOpts } from './ui.js';

export default {
  mount(root, ctx) {
    const { store, tts, attend, progress, params } = ctx;
    let mode = params.mode && MODES[params.mode] ? params.mode : 'de-en', cat = params.cat || 'all', game = params.game || 'all';
    const area = h('div', { class: 'quizarea' });
    const modeOpts = Object.entries(MODES).map(([id, m]) => ({ id, text: m.de })).filter((o) => o.id !== 'hoeren' || tts.supported);

    function setup() {
      area.replaceChildren(
        h('div', { class: 'panel filters' },
          h('h2', null, 'Wie willst du üben?'),
          chips('Art der Fragen', modeOpts, mode, (v) => { mode = v; hint.textContent = MODES[mode].en; }),
          chips('Spiel', gameOpts(), game, (v) => { game = v; }),
          chips('Art', catOpts(), cat, (v) => { cat = v; })),
        hint, h('button', { class: 'btn big', type: 'button', onclick: start }, 'Start'));
    }
    const hint = h('p', { class: 'fine' }, MODES[mode].en);

    function start() {
      const pool = filterPhrases(PHRASES, { cat, game, crude: false });
      if (pool.length < 4) { area.replaceChildren(h('p', { class: 'panel warn' }, 'Zu wenige Sätze für diese Auswahl. Wähle "Alle".'), h('button', { class: 'btn', type: 'button', onclick: setup }, 'Zurück')); return; }
      const targets = shuffle(pool).slice(0, 10);
      let i = 0, score = 0; const wrong = [];
      const next = () => { if (i >= targets.length) return end(); ask(makeQuestion(pool, targets[i], mode)); };

      function ask(q) {
        let answered = false;
        const result = h('div', { class: 'result', 'aria-live': 'polite' });
        const finish = (ok, shownAnswer) => {
          if (answered) return; answered = true;
          if (ok) score++; else { wrong.push(q.target); const st = store.get('srs', {}); st[q.target.id] = schedule(st[q.target.id], 'miss'); store.set('srs', st); }
          progress.touch(store);
          fill(result, 
            h('p', { class: ok ? 'is-ok' : 'is-bad' }, ok ? '✔ Richtig!' : '✘ Nicht ganz.', ' ', h('b', null, q.target.de), ' = ', q.target.en),
            q.target.note ? h('p', { class: 'fine' }, q.target.note) : null,
            h('button', { class: 'btn big', type: 'button', onclick: () => { i++; next(); } }, i + 1 >= targets.length ? 'Ergebnis' : 'Weiter'));
          attend.flash(box, ok ? 'ok' : 'info');
          result.querySelector('button').focus({ preventScroll: true });
        };
        const label = (p) => (q.show === 'en' ? p.en : p.de);
        let body;
        if (q.mode === 'tippen') {
          const inp = h('input', { type: 'text', class: 'field', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Deutsch eintippen', placeholder: 'Deutsch eintippen (ä = ae geht auch)' });
          const go = () => finish(isCorrect(q, inp.value), inp.value);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
          body = h('div', { class: 'typing' }, inp, h('button', { class: 'btn', type: 'button', onclick: go }, 'Prüfen'));
        } else {
          body = h('div', { class: 'opts' }, q.options.map((o, n) => h('button', {
            type: 'button', class: 'opt', onclick: (e) => { const ok = isCorrect(q, o.id); e.currentTarget.classList.add(ok ? 'is-ok' : 'is-bad'); finish(ok); body.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (q.options[k].id === q.target.id) b.classList.add('is-ok'); }); },
          }, h('b', null, 'ABCD'[n]), ' ', label(o))));
        }
        const prompt = q.mode === 'hoeren'
          ? h('div', null, h('p', { class: 'qprompt' }, 'Was hast du gehört?'), h('button', { class: 'btn', type: 'button', onclick: () => tts.speak(q.target.say || q.target.de) }, icon('sound'), h('span', null, 'Nochmal hören')))
          : h('p', { class: 'qprompt' }, q.prompt);
        const box = h('div', { class: 'panel qbox' }, h('p', { class: 'fine' }, `Frage ${i + 1} von ${targets.length} · ${score} richtig`), prompt, body, result);
        area.replaceChildren(box);
        if (q.mode === 'hoeren') tts.speak(q.target.say || q.target.de);
        else if (q.mode === 'tippen') box.querySelector('input').focus({ preventScroll: true });
      }

      function end() {
        const best = Math.max(store.get('quiz.best', 0), score); store.set('quiz.best', best);
        const box = h('div', { class: 'panel done' },
          h('h2', null, `${score} von ${targets.length}`),
          h('p', null, score >= 9 ? 'Stark! Wirklich stark.' : score >= 6 ? 'Gut gemacht.' : 'Das wird. Übe die Karten, dann nochmal.'),
          h('p', { class: 'fine' }, `Bestes Ergebnis: ${best}`),
          wrong.length ? h('div', null, h('h3', null, 'Das kommt in deine Karten zurück:'), h('ul', { class: 'plain' }, wrong.map((p) => h('li', null, h('b', null, p.de), ' – ', p.en)))) : null,
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: start }, 'Nochmal'), h('button', { class: 'btn ghost', type: 'button', onclick: setup }, 'Andere Auswahl'), h('a', { class: 'btn ghost', href: '#/cards' }, 'Zu den Karten')));
        area.replaceChildren(box);
        if (score >= 6) attend.flash(box, 'ok');
      }
      next();
    }

    put(root, head('Quiz', 'Quiz', 'Zehn Fragen, ohne Zeitdruck.'), area);
    setup();
  },
};

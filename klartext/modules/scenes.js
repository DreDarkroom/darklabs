/* Szenen (chat practice): a teammate says something; you pick the reply that fits, and the page says why. Calm by design: no timer, no score pressure. */
import { h, icon, shuffle, put, fill } from '../core/dom.js';
import { SCENES } from '../data/scenes.js';
import { GAMES } from '../data/cats.js';
import { head, chips } from './ui.js';

export default {
  mount(root, ctx) {
    const { tts, attend, progress, store } = ctx;
    let game = 'all';
    const area = h('div', { class: 'scenearea' });

    function run() {
      const list = shuffle(SCENES.filter((s) => game === 'all' || s.game === game || s.game === 'any'));
      let i = 0, right = 0;
      const next = () => (i >= list.length ? end() : show(list[i]));

      function show(s) {
        let enShown = false, done = false;
        const en = h('p', { class: 'say-en', hidden: true }, s.en);
        const fb = h('div', { class: 'result', 'aria-live': 'polite' });
        const opts = h('div', { class: 'opts' }, shuffle(s.opts).map((o) => h('button', {
          type: 'button', class: 'opt',
          onclick: (e) => {
            if (done) return; done = true;
            e.currentTarget.classList.add(o.ok ? 'is-ok' : 'is-bad'); if (o.ok) right++;
            opts.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; });
            fill(fb, 
              h('p', { class: o.ok ? 'is-ok' : 'is-bad' }, o.ok ? '✔ Passt!' : '✘ Eher nicht.', ' ', o.why),
              !o.ok ? h('p', null, 'Besser: ', h('b', null, s.opts.find((x) => x.ok).de)) : null,
              h('p', { class: 'fine' }, 'Tipp: ', s.tip),
              h('button', { class: 'btn big', type: 'button', onclick: () => { i++; next(); } }, i + 1 >= list.length ? 'Ergebnis' : 'Weiter'));
            progress.touch(store);
            attend.flash(box, o.ok ? 'ok' : 'info');
            fb.querySelector('button').focus({ preventScroll: true });
          },
        }, h('span', null, o.de), h('span', { class: 'pen' }, o.en))));
        const box = h('div', { class: 'panel qbox' },
          h('p', { class: 'fine' }, `Szene ${i + 1} von ${list.length} · ${GAMES[s.game]?.de || 'Chat'} · ${s.ctx}`),
          h('p', { class: 'qprompt' }, s.says),
          h('div', { class: 'row' },
            h('button', { class: 'btn ghost', type: 'button', onclick: () => tts.speak(s.says) }, icon('sound'), h('span', null, 'Hören')),
            h('button', { class: 'btn ghost', type: 'button', onclick: (e) => { enShown = !enShown; en.hidden = !enShown; e.currentTarget.textContent = enShown ? 'Englisch verbergen' : 'Englisch zeigen'; } }, 'Englisch zeigen')),
          en, h('h2', { class: 'sr' }, 'Deine Antwort'), opts, fb);
        area.replaceChildren(box);
        tts.speak(s.says);
      }

      function end() {
        const box = h('div', { class: 'panel done' }, h('h2', null, `${right} von ${list.length} passend`), h('p', null, 'Übe weiter, bis die Antworten von allein kommen.'),
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: run }, 'Nochmal'), h('a', { class: 'btn ghost', href: '#/cards' }, 'Karten'), h('a', { class: 'btn ghost', href: '#/' }, 'Start')));
        area.replaceChildren(box); if (right >= Math.ceil(list.length * 0.7)) attend.flash(box, 'ok');
      }
      next();
    }
    put(root, head('Szenen', 'Chat practice', 'Jemand sagt etwas. Welche Antwort passt?'),
      h('div', { class: 'panel filters' }, chips('Spiel', [{ id: 'all', text: 'Alle' }, ...Object.entries(GAMES).map(([id, g]) => ({ id, text: g.de }))], game, (v) => { game = v; run(); })),
      area);
    run();
    return () => tts.stop();
  },
};

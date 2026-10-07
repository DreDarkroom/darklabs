/* Pause (VR break guard): a break reminder that works on any page of the kit. When it is time, a big overlay appears and calls for you (this is exactly the
   moment the attention system is for). It keeps the screen awake while you play if the browser allows it. General comfort advice only: not medical advice.
   `start(ctx)` is also called at boot when the guard is switched on, so it keeps running while you use other tools. */
import { h, put, fill } from '../core/dom.js';
import { head, chips, toggle } from './ui.js';

export const nextBreak = (since, minutes) => since + minutes * 60000;
export const clock = (ms) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

let svc = null;

export function start(ctx) {
  if (svc) return svc;
  const { store, attend } = ctx;
  let since = store.get('guard.since', 0); const t0 = Date.now();
  if (!since || t0 - since > 3 * 3600000) { since = t0; store.set('guard.since', since); }
  let due = nextBreak(since, store.get('guard.min', 30)), overlay = null, stopAlarm = null, beeper = 0, lock = null;
  const minutes = () => store.get('guard.min', 30);

  async function wake() {
    if (!store.get('guard.wake', true) || !('wakeLock' in navigator) || lock) return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (err) { lock = null; }
  }
  const onVis = () => { if (document.visibilityState === 'visible') wake(); };
  document.addEventListener('visibilitychange', onVis); wake();

  function show() {
    if (overlay) return;
    const card = h('div', { class: 'overlay-card', role: 'alertdialog', 'aria-labelledby': 'g-t', 'aria-describedby': 'g-d' },
      h('h2', { id: 'g-t', tabindex: '-1' }, 'Zeit für eine Pause!'),
      h('p', { id: 'g-d' }, 'Brille ab, Wasser trinken, in die Ferne schauen, Hände strecken.'),
      h('p', { class: 'en' }, 'Time for a break! Headset off, drink some water, look into the distance, stretch your hands.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn big', type: 'button', onclick: () => done(minutes()) }, 'Ich mache Pause'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done(5) }, '5 Minuten später')));
    overlay = h('div', { class: 'overlay' }, card);
    document.body.append(overlay);
    stopAlarm = attend.alarm(card);
    let n = 0; beeper = setInterval(() => { attend.beep(520, 220, 0.12); if (++n >= 5) clearInterval(beeper); }, 3000); attend.beep(520, 220, 0.12);
    card.querySelector('h2').focus();
  }
  function done(nextMin) {
    clearInterval(beeper); stopAlarm?.(); stopAlarm = null; overlay?.remove(); overlay = null;
    due = Date.now() + nextMin * 60000;
    if (nextMin === minutes()) { since = Date.now(); store.set('guard.since', since); }
  }
  const timer = setInterval(() => { if (!overlay && Date.now() >= due) show(); }, 1000);

  svc = {
    status() { return { elapsed: Date.now() - since, left: due - Date.now(), min: minutes(), lock: !!lock }; },
    test: show, reset() { since = Date.now(); store.set('guard.since', since); due = nextBreak(since, minutes()); },
    retime() { due = nextBreak(since, minutes()); },
    wake,
    stop() { clearInterval(timer); clearInterval(beeper); stopAlarm?.(); overlay?.remove(); overlay = null; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); lock = null; svc = null; },
  };
  return svc;
}

export default {
  mount(root, ctx) {
    const { store } = ctx;
    const live = h('p', { class: 'tcount', 'aria-live': 'off' }, '');
    const info = h('p', { class: 'fine' }, '');
    let on = store.get('guard.on', false), tick = 0;
    function paint() {
      const s = svc?.status();
      live.textContent = s ? `Nächste Pause in ${clock(s.left)}` : 'Aus';
      info.textContent = s ? `Sitzung: ${clock(s.elapsed)} · Erinnerung alle ${s.min} Minuten · Bildschirm wach: ${s.lock ? 'ja' : ('wakeLock' in navigator ? 'nein' : 'nicht möglich auf diesem Gerät')}` : 'Die Erinnerung ist aus.';
    }
    const draw = () => {
      fill(body, 
        toggle('Pausen-Erinnerung', on, (v) => { on = v; store.set('guard.on', v); if (v) start(ctx); else svc?.stop(); paint(); }),
        chips('Alle wie viele Minuten?', [20, 30, 45, 60].map((n) => ({ id: n, text: `${n} min` })), store.get('guard.min', 30), (n) => { store.set('guard.min', n); svc?.retime(); paint(); }),
        toggle('Bildschirm wach halten', store.get('guard.wake', true), (v) => { store.set('guard.wake', v); if (v) svc?.wake(); }),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { (svc || start(ctx)).test(); } }, 'Jetzt ausprobieren'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { svc?.reset(); paint(); } }, 'Sitzung neu starten')));
    };
    const body = h('div', { class: 'panel' });
    put(root, head('Pause', 'VR break guard', 'Eine sanfte Erinnerung: erst ruhig, dann unübersehbar.'), h('div', { class: 'panel bigsay' }, live, info), body,
      h('p', { class: 'fine' }, 'Allgemeine Komfort-Hinweise, keine medizinische Beratung. Wenn dir schwindlig, übel oder zu warm wird: sofort Pause. Die Erinnerung läuft nur, solange diese Seite offen ist.'));
    if (on) start(ctx);
    draw(); paint(); tick = setInterval(paint, 1000);
    return () => clearInterval(tick);       // the guard itself keeps running while you use other tools
  },
};

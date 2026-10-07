/* Zeit (timers): countdowns that call out in German, and a stopwatch with laps. Times are stored as end-moments (not "ticks left"), so a slow or throttled
   tab can never drift. The page only ticks while something is running (one interval, switched off when idle). Needs this page open to ring. */
import { h, icon, delegate, put, fill } from '../core/dom.js';
import { head, toggle } from './ui.js';

export const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};
export const fmtLap = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms / 100) % 10)}`;
/** "90" = 90 seconds, "1:30" = 90 seconds. Returns ms, or 0 if it is not a time. */
export function parseTime(s) {
  const t = String(s).trim();
  let m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (m) return (+m[1] * 60 + +m[2]) * 1000;
  m = /^(\d{1,5})$/.exec(t);
  return m ? +m[1] * 1000 : 0;
}
const SAY = { 10: 'Zehn Sekunden', 3: 'Drei', 2: 'Zwei', 1: 'Eins', 0: 'Zeit ist um!' };
const PRESETS = [[10, '10 s'], [30, '30 s'], [45, '45 s'], [60, '1:00'], [120, '2:00'], [180, '3:00'], [300, '5:00'], [600, '10:00']];

export default {
  mount(root, ctx) {
    const { store, tts, attend } = ctx;
    let speak = store.get('timers.speak', true), seq = 0, tick = 0;
    /** @type {{id:number,total:number,left:number,end:number,state:string,said:number[],stop?:Function}[]} */
    let list = (store.get('timers.list', []) || []).map((t) => ({ ...t, said: [] }));
    seq = list.reduce((m, t) => Math.max(m, t.id), 0);
    const save = () => store.set('timers.list', list.map(({ id, total, left, end, state }) => ({ id, total, left, end, state })));
    const holder = h('div', { class: 'timerlist' });
    const now = () => Date.now();
    list.forEach((t) => { if (t.state === 'run' && t.end <= now()) { t.state = 'done'; t.left = 0; } });

    function view(t) {
      const left = t.state === 'run' ? Math.max(0, t.end - now()) : t.left;
      return h('div', { class: 'panel timer ' + t.state, 'data-id': t.id },
        h('p', { class: 'tcount', 'aria-label': `${fmt(left)} übrig` }, fmt(left)),
        h('p', { class: 'fine' }, `von ${fmt(t.total)} · ${t.state === 'run' ? 'läuft' : t.state === 'pause' ? 'Pause' : t.state === 'done' ? 'abgelaufen' : 'bereit'}`),
        h('div', { class: 'row' },
          t.state === 'done' ? h('button', { class: 'btn big', type: 'button', 'data-act': 'ok' }, 'OK') : null,
          t.state !== 'done' ? h('button', { class: 'btn', type: 'button', 'data-act': t.state === 'run' ? 'pause' : 'go' }, t.state === 'run' ? 'Pause' : 'Start') : null,
          h('button', { class: 'btn ghost', type: 'button', 'data-act': 'reset' }, 'Neu'),
          h('button', { class: 'btn ghost', type: 'button', 'data-act': 'del', 'aria-label': 'Timer löschen' }, '✕')));
    }
    function draw() {
      holder.replaceChildren(...list.map(view));
      list.filter((t) => t.state === 'done' && t.stop).forEach((t) => { const el = holder.querySelector(`[data-id="${t.id}"]`); /* keep ringing cue on the new element */ t.stop(); t.stop = attend.alarm(el); });
      const running = list.some((t) => t.state === 'run');
      if (running && !tick) tick = setInterval(step, 200);
      if (!running && tick) { clearInterval(tick); tick = 0; }
    }
    function step() {
      let changed = false;
      for (const t of list) if (t.state === 'run') {
        const left = t.end - now(), s = Math.ceil(left / 1000);
        const el = holder.querySelector(`[data-id="${t.id}"] .tcount`); if (el) el.textContent = fmt(left);
        if (speak && s in SAY && s > 0 && !t.said.includes(s) && s <= t.total / 1000) { t.said.push(s); tts.speak(SAY[s]); }
        if (left <= 0) {
          t.state = 'done'; t.left = 0; changed = true;
          if (speak) tts.speak(SAY[0]);
          t.stop = () => {};                        // marker: draw() starts the alarm on the fresh element
          let n = 0; const beeper = setInterval(() => { attend.beep(n % 2 ? 660 : 880, 160, 0.12); if (++n >= 6 || t.state !== 'done') clearInterval(beeper); }, 700);
        }
      }
      if (changed) { save(); draw(); ctx.say('Timer abgelaufen'); }
    }
    delegate(holder, 'click', 'button[data-act]', (e, b) => {
      const t = list.find((x) => x.id === +b.closest('.timer').dataset.id); if (!t) return;
      const a = b.dataset.act;
      if (a === 'go') { t.end = now() + t.left; t.state = 'run'; t.said = []; }
      else if (a === 'pause') { t.left = Math.max(0, t.end - now()); t.state = 'pause'; }
      else if (a === 'reset' || a === 'ok') { t.stop?.(); t.stop = null; t.left = t.total; t.state = 'idle'; t.said = []; }
      else if (a === 'del') { t.stop?.(); list = list.filter((x) => x !== t); }
      save(); draw();
    });
    const add = (ms, go = true) => {
      if (!ms) return; if (list.length >= 8) list.shift();
      const t = { id: ++seq, total: ms, left: ms, end: go ? now() + ms : 0, state: go ? 'run' : 'idle', said: [] };
      list.push(t); save(); draw();
    };

    /* stopwatch */
    let sw = { run: false, t0: 0, acc: 0, laps: [] }, swTick = 0;
    const swOut = h('p', { class: 'tcount' }, '0:00.0'), swLaps = h('ol', { class: 'plain laps' });
    const swNow = () => sw.acc + (sw.run ? performance.now() - sw.t0 : 0);
    const swBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (sw.run) { sw.acc = swNow(); sw.run = false; clearInterval(swTick); swBtn.textContent = 'Weiter'; }
      else { sw.t0 = performance.now(); sw.run = true; swTick = setInterval(() => (swOut.textContent = fmtLap(swNow())), 100); swBtn.textContent = 'Stopp'; }
    } }, 'Start');
    const lapBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!sw.run) return; const t = swNow(); sw.laps.unshift(t); swLaps.replaceChildren(...sw.laps.map((l, i) => h('li', null, `Runde ${sw.laps.length - i}: ${fmtLap(l)}`))); } }, 'Runde');
    const swReset = h('button', { class: 'btn ghost', type: 'button', onclick: () => { clearInterval(swTick); sw = { run: false, t0: 0, acc: 0, laps: [] }; swOut.textContent = '0:00.0'; swLaps.replaceChildren(); swBtn.textContent = 'Start'; } }, 'Neu');

    const custom = h('input', { type: 'text', class: 'field short', inputmode: 'numeric', 'aria-label': 'Eigene Zeit, zum Beispiel 1:30 oder 90', placeholder: '1:30', onkeydown: (e) => { if (e.key === 'Enter') { add(parseTime(custom.value)); custom.value = ''; } } });
    put(root, 
      head('Zeit', 'Timers', 'Countdowns, die auf Deutsch ansagen, und eine Stoppuhr.'),
      h('div', { class: 'panel' }, h('h2', null, 'Neuer Timer ', h('span', { class: 'en' }, 'New timer')),
        h('div', { class: 'chips' }, PRESETS.map(([s, l]) => h('button', { class: 'chip', type: 'button', onclick: () => add(s * 1000) }, l))),
        h('div', { class: 'row' }, custom, h('button', { class: 'btn', type: 'button', onclick: () => { add(parseTime(custom.value)); custom.value = ''; } }, 'Start')),
        toggle('Auf Deutsch ansagen', speak, (v) => { speak = v; store.set('timers.speak', v); }),
        h('p', { class: 'fine' }, 'Lass diese Seite offen: der Alarm braucht sie.')),
      holder,
      h('div', { class: 'panel' }, h('h2', null, 'Stoppuhr ', h('span', { class: 'en' }, 'Stopwatch')), swOut, h('div', { class: 'row' }, swBtn, lapBtn, swReset), swLaps));
    draw();
    return () => { clearInterval(tick); clearInterval(swTick); list.forEach((t) => t.stop?.()); tts.stop(); };
  },
};

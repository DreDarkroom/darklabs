/* DarkDesk: a private desk for remembering and organising the Darklabs projects.
   Nothing here publishes, uploads or changes anything: it only reads its own list and keeps your notes on this device (encrypted if you set a passcode).
   There is no network code in this file. Your notes are only ever put on the page as text (never as HTML), so a note can never run as code.
   The one innerHTML is the robot's own fixed drawing. */
import { SEEDS } from './projects.js';
import * as L from './logic.js';
import * as V from './vault.js';
import { prefs } from '../kit/prefs.js';
import { botSVG } from '../robots.js';

const KEY = 'darkdesk.v1', FAILS = 'darkdesk.fails';
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const BOT = { id: 'TidyTick', body: '#6a5a5e', accent: '#ff5a6a', head: 'visor' };

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(2)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const store = { get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (err) { return null; } }, set: (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (err) { return false; } } };

/* ================= the data, and keeping it safe ================= */
let S = null, key = null, record = null, saveTimer = 0, idleTimer = 0, hiddenAt = 0;
const mode = () => (record && record.mode === 'locked' ? 'locked' : 'plain');

async function persist() {
  clearTimeout(saveTimer);
  if (!S) return;
  if (mode() === 'locked') { if (!key) return; const box = await V.seal(S, key); record = { ...record, ...box }; store.set(record); }
  else { record = { v: 1, mode: 'plain', value: S }; if (!store.set(record)) toast('The browser would not save. Export a backup from the Vault.'); }
}
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); };

function touch(id, patch) {
  const r = S.projects[id] || (S.projects[id] = {});
  Object.assign(r, patch, { touched: Date.now() });
  save();
}
const P = () => L.allViews(S, SEEDS);
const find = (id) => P().find((p) => p.id === id);

function lockNow(msg) {
  if (mode() !== 'locked') return;
  key = null; S = null; clearTimeout(idleTimer);
  location.hash = '';
  showLock(msg);
}
const bumpIdle = () => {
  clearTimeout(idleTimer);
  const m = S && S.settings.autolock;
  if (mode() === 'locked' && key && m) idleTimer = setTimeout(() => lockNow('Locked after a quiet while.'), m * 60000);
};
['pointerdown', 'keydown', 'scroll'].forEach((t) => addEventListener(t, bumpIdle, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (mode() === 'locked' && key && S && S.settings.autolock && Date.now() - hiddenAt > Math.min(S.settings.autolock, 1) * 60000) lockNow('Locked while you were away.');
});

/* ================= small pieces ================= */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3400);
}
function spark(x, y) {
  if (document.documentElement.classList.contains('calm')) return;
  for (let i = 0; i < 10; i++) {
    const s = h('i', { class: 'spark' }); const a = (i / 10) * 6.283 + Math.random() * 0.5, d = 24 + Math.random() * 30;
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.append(s); s.addEventListener('animationend', () => s.remove());
  }
}
const ago = (ts) => { const d = L.daysSince(ts); return d == null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const dueLabel = (due) => { const d = L.daysUntil(due); return d == null ? '' : d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d}d`; };
const download = (name, text, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const go = (hash) => { location.hash = hash; };

function chips(options, value, onPick, label) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label }, options.map(([v, t]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, t)));
}
const robot = () => h('div', { class: 'tick', 'aria-hidden': 'true' }, Object.assign(document.createElement('div'), { innerHTML: botSVG(BOT) }).firstElementChild);

function projectCard(p) {
  const heat = L.heat(p, Date.now(), S.settings.staleDays), d = L.daysUntil(p.due);
  return h('button', { type: 'button', class: `pcard s-${p.status.toLowerCase()}`, onclick: () => go(`#p/${p.id}`), 'aria-label': `${p.title}, ${p.status}${p.next ? `. Next: ${p.next}` : ''}` },
    h('span', { class: 'ptop' }, h('b', { text: p.title }), h('span', { class: 'status', text: p.status })),
    p.next ? h('span', { class: 'pnext', text: `Next: ${p.next}` }) : h('span', { class: 'pnext dim', text: p.blurb.slice(0, 90) + (p.blurb.length > 90 ? '…' : '') }),
    p.blocked ? h('span', { class: 'pwarn', text: `Waiting on: ${p.blocked}` }) : null,
    h('span', { class: 'pfoot' }, h('span', { class: 'heat', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(heat * 100)}%` })),
      h('span', { class: 'dim', text: p.touched ? `touched ${ago(p.touched)}` : 'not touched yet' }), d != null && p.status !== 'Done' ? h('span', { class: `due${d <= 1 ? ' hot' : ''}`, text: dueLabel(p.due) }) : null));
}

/* ================= the screens ================= */
let tip = 0;
function today() {
  const sug = L.suggest(S, SEEDS), top = sug[tip % Math.max(1, sug.length)];
  const bubble = h('div', { class: 'bubble', role: 'status', 'aria-live': 'polite' },
    h('b', { text: 'TidyTick says' }), h('p', { text: top ? top.text : 'Everything is quiet. Nothing needs you right now.' }),
    h('div', { class: 'row' },
      top && top.project ? h('button', { type: 'button', class: 'btn primary', onclick: () => go(`#p/${top.project}`) }, 'Open it') : null,
      top && top.kind === 'review' ? h('button', { type: 'button', class: 'btn primary', onclick: () => go('#review') }, 'Start the review') : null,
      sug.length > 1 ? h('button', { type: 'button', class: 'btn', onclick: () => { tip++; render(); } }, `Next tip (${(tip % sug.length) + 1}/${sug.length})`) : null));
  const three = L.focus(S, SEEDS), soon = [];
  for (const p of P()) { const d = L.daysUntil(p.due); if (d != null && d <= 14 && p.status !== 'Done') soon.push({ d, text: p.title, go: `#p/${p.id}`, due: p.due }); }
  for (const i of S.inbox) { const d = L.daysUntil(i.due); if (!i.done && d != null && d <= 14) soon.push({ d, text: i.text, due: i.due }); }
  soon.sort((a, b) => a.d - b.d);
  const recent = P().filter((p) => p.touched).sort((a, b) => b.touched - a.touched).slice(0, 4);
  const inbox = S.inbox.filter((i) => !i.done);
  return [
    banner(),
    h('section', { class: 'assistant' }, robot(), bubble),
    h('h2', { class: 'sect glitch-text', 'data-text': 'Today’s three', text: 'Today’s three' }),
    three.length ? h('div', { class: 'stack' }, three.map(projectCard)) : h('p', { class: 'dim', text: 'Nothing to focus on yet. Add a project’s next step to see it here.' }),
    soon.length ? [h('h2', { class: 'sect', text: 'Coming up' }), h('ul', { class: 'plain' }, soon.map((s) => h('li', null, h('span', { class: `due${s.d <= 1 ? ' hot' : ''}`, text: dueLabel(s.due) }), ' ', s.go ? h('a', { href: s.go, text: s.text }) : s.text)))] : null,
    inbox.length ? [h('h2', { class: 'sect', text: `Inbox (${inbox.length})` }), h('ul', { class: 'plain inbox' }, inbox.map(inboxRow))] : null,
    recent.length ? [h('h2', { class: 'sect', text: 'Where was I?' }), h('ul', { class: 'plain' }, recent.map((p) => h('li', null, h('a', { href: `#p/${p.id}`, text: p.title }), h('span', { class: 'dim', text: ` · ${ago(p.touched)}${p.log.length ? ` · “${p.log[p.log.length - 1].text.slice(0, 70)}”` : ''}` }))))] : null,
  ];
}
function inboxRow(i) {
  const sel = h('select', { 'aria-label': 'Move this note into a project', onchange: (e) => { const id = e.target.value; if (!id) return; const r = S.projects[id] || (S.projects[id] = {}); (r.log = r.log || []).push({ at: Date.now(), text: i.text }); touch(id, {}); S.inbox = S.inbox.filter((x) => x !== i); save(); toast('Moved into the project’s log.'); render(); } },
    h('option', { value: '', text: 'Move to…' }), P().map((p) => h('option', { value: p.id, text: p.title })));
  return h('li', null, h('span', { class: `kind k-${i.kind}`, text: i.kind }), ' ', i.text, i.due ? h('span', { class: 'due', text: ` ${dueLabel(i.due)}` }) : null,
    h('span', { class: 'row' }, sel, h('button', { type: 'button', class: 'btn', onclick: (e) => { i.done = true; spark(e.clientX, e.clientY); save(); render(); } }, 'Done'), h('button', { type: 'button', class: 'btn', 'aria-label': 'Delete this note', onclick: () => { S.inbox = S.inbox.filter((x) => x !== i); save(); render(); } }, '✕')));
}

let pfilter = 'all', pquery = '', psort = 'touched', pview = 'list';
function projects() {
  const all = P(), q = pquery.trim().toLowerCase();
  let list = all.filter((p) => (pfilter === 'all' || p.status === pfilter) && (!q || `${p.title} ${p.blurb} ${p.next} ${p.tags.join(' ')} ${p.notes}`.toLowerCase().includes(q)));
  list.sort(psort === 'prio' ? (a, b) => b.prio - a.prio || a.title.localeCompare(b.title) : psort === 'name' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.touched - a.touched || a.title.localeCompare(b.title));
  const body = pview === 'board'
    ? h('div', { class: 'board' }, L.STATUSES.map((s) => h('section', { class: 'col' }, h('h3', { text: `${s} (${list.filter((p) => p.status === s).length})` }), list.filter((p) => p.status === s).map(projectCard))))
    : h('div', { class: 'stack' }, list.map(projectCard));
  return [
    banner(),
    h('div', { class: 'toolrow' },
      h('input', { type: 'search', placeholder: 'Search projects and notes', 'aria-label': 'Search projects and notes', value: pquery, oninput: (e) => { pquery = e.target.value; clearTimeout(projects.t); projects.t = setTimeout(() => { render(); const i = $('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } }),
      h('button', { type: 'button', class: 'btn', onclick: () => go('#new') }, '+ Project')),
    chips([['all', 'All'], ...L.STATUSES.map((s) => [s, s])], pfilter, (v) => { pfilter = v; render(); }, 'Show only'),
    h('div', { class: 'toolrow' },
      chips([['list', 'List'], ['board', 'Board']], pview, (v) => { pview = v; render(); }, 'View'),
      h('label', { class: 'sel' }, 'Sort ', h('select', { onchange: (e) => { psort = e.target.value; render(); } }, [['touched', 'Recently touched'], ['prio', 'Priority'], ['name', 'Name']].map(([v, t]) => h('option', { value: v, text: t, selected: v === psort }))))),
    h('p', { class: 'dim', text: `${list.length} of ${all.length} projects` }),
    body,
  ];
}

function sheetProject(id) {
  const p = find(id);
  if (!p) return h('div', { class: 'sheet-body' }, h('p', { text: 'That project was not found.' }), h('a', { class: 'btn', href: '#projects', text: 'Back to projects' }));
  const set = (patch) => { touch(id, patch); };
  const field = (label, k, ph, max) => h('label', { class: 'field' }, label, h('input', { type: 'text', value: p[k], placeholder: ph, maxlength: max, oninput: (e) => set({ [k]: e.target.value }) }));
  const items = h('ul', { class: 'plain check' });
  const paintItems = () => items.replaceChildren(...p.checklist.map((c, i) => h('li', null,
    h('label', { class: 'tick-row' }, h('input', { type: 'checkbox', checked: c.done, onchange: (e) => { c.done = e.target.checked; if (c.done) { const r = e.target.getBoundingClientRect(); spark(r.left + 10, r.top + 10); } set({ checklist: p.checklist }); paintItems(); } }), h('span', { class: c.done ? 'done' : '', text: c.t })),
    h('button', { type: 'button', class: 'btn', 'aria-label': `Remove ${c.t}`, onclick: () => { p.checklist.splice(i, 1); set({ checklist: p.checklist }); paintItems(); } }, '✕'))));
  paintItems();
  const add = h('input', { type: 'text', placeholder: 'Add a step', maxlength: L.LIMITS.item, 'aria-label': 'Add a step' });
  const addStep = () => { const t = add.value.trim(); if (!t) return; p.checklist.push({ t, done: false }); add.value = ''; set({ checklist: p.checklist }); paintItems(); };
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } });
  const log = h('ul', { class: 'plain log' });
  const paintLog = () => log.replaceChildren(...p.log.slice().reverse().map((l) => h('li', null, h('span', { class: 'dim', text: `${new Date(l.at).toLocaleDateString()} · ` }), l.text)));
  paintLog();
  const note = h('input', { type: 'text', placeholder: 'What happened? (a short line)', maxlength: L.LIMITS.log, 'aria-label': 'Add a log entry' });
  const addLog = () => { const t = note.value.trim(); if (!t) return; p.log.push({ at: Date.now(), text: t }); note.value = ''; set({ log: p.log }); paintLog(); };
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLog(); } });
  const title = p.custom ? h('label', { class: 'field' }, 'Name', h('input', { type: 'text', value: p.title, maxlength: L.LIMITS.title, oninput: (e) => { const c = S.custom.find((x) => x.id === id); c.title = e.target.value || 'Untitled'; save(); } })) : null;
  const blurb = p.custom ? h('label', { class: 'field' }, 'What it does', h('textarea', { rows: 3, maxlength: L.LIMITS.blurb, oninput: (e) => { S.custom.find((x) => x.id === id).blurb = e.target.value; save(); } }, p.blurb)) : h('p', { class: 'blurb', text: p.blurb });
  const head = h('div', { class: 'sheet-head' }, h('a', { class: 'btn', href: '#projects', text: '← Projects' }), h('h2', { text: p.title }));
  return h('div', { class: 'sheet-body' }, head, title, blurb,
    p.url ? h('a', { class: 'btn wide', href: p.url, target: '_blank', rel: 'noopener', text: 'Open the project page (only opens a link)' }) : null,
    h('h3', { text: 'Status' }), chips(L.STATUSES.map((s) => [s, s]), p.status, (v) => { set({ status: v }); render(); }, 'Status'),
    h('h3', { text: 'Priority' }), chips([[1, 'Low'], [2, 'Normal'], [3, 'High']], p.prio, (v) => { set({ prio: v }); render(); }, 'Priority'),
    field('Next step', 'next', 'The very next small thing', L.LIMITS.next), field('Waiting on', 'blocked', 'Something that is stopping it (leave empty if nothing)', L.LIMITS.blocked),
    h('label', { class: 'field' }, 'Remind me on', h('input', { type: 'date', value: p.due, onchange: (e) => { set({ due: e.target.value }); render(); } })),
    p.due ? h('button', { type: 'button', class: 'btn wide', onclick: () => { download(`${p.id}-reminder.ics`, L.toICS([{ uid: `${p.id}-${p.due}`, date: p.due, title: `${p.title}: ${p.next || 'check in'}`, note: p.blurb }]), 'text/calendar'); toast('A calendar file was saved. Open it to add the reminder to your calendar.'); } }, 'Save as a calendar reminder (.ics)') : null,
    h('label', { class: 'field' }, 'Tags (separate with commas)', h('input', { type: 'text', value: p.tags.join(', '), maxlength: 120, onchange: (e) => { set({ tags: e.target.value.split(',').map((t) => t.trim().slice(0, 24)).filter(Boolean).slice(0, 12) }); } })),
    h('h3', { text: 'Steps' }), items, h('div', { class: 'row' }, add, h('button', { type: 'button', class: 'btn', onclick: addStep }, 'Add')),
    h('h3', { text: 'Notes' }), h('textarea', { rows: 6, maxlength: L.LIMITS.notes, 'aria-label': 'Notes', placeholder: 'Anything you want to remember', oninput: (e) => set({ notes: e.target.value }) }, p.notes),
    h('h3', { text: 'Log' }), h('div', { class: 'row' }, note, h('button', { type: 'button', class: 'btn', onclick: addLog }, 'Add')), log,
    p.custom ? h('button', { type: 'button', class: 'btn danger wide', onclick: () => { if (confirm(`Delete “${p.title}” and its notes from this desk? (Nothing outside the desk changes.)`)) { S.custom = S.custom.filter((c) => c.id !== id); delete S.projects[id]; save(); go('#projects'); } } }, 'Delete this project') : null);
}

function sheetNew() {
  const name = h('input', { type: 'text', maxlength: L.LIMITS.title, placeholder: 'Name', 'aria-label': 'Name' }), what = h('textarea', { rows: 3, maxlength: L.LIMITS.blurb, placeholder: 'What does it do?', 'aria-label': 'What does it do' });
  return h('div', { class: 'sheet-body' }, h('div', { class: 'sheet-head' }, h('a', { class: 'btn', href: '#projects', text: '← Projects' }), h('h2', { text: 'New project' })),
    h('p', { class: 'dim', text: 'Kept only on this device. Private projects are encrypted too, if you set a passcode.' }), h('label', { class: 'field' }, 'Name', name), h('label', { class: 'field' }, 'What it does', what),
    h('button', { type: 'button', class: 'btn primary wide', onclick: () => { const t = name.value.trim(); if (!t) { toast('Give it a name first.'); return; } const id = `c-${Date.now().toString(36)}`; S.custom.push({ id, title: t, blurb: what.value.trim(), url: '', status: 'Idea' }); touch(id, {}); go(`#p/${id}`); } }, 'Create'));
}

function sheetCapture() {
  let kind = 'note', proj = '', due = '';
  const text = h('textarea', { rows: 4, maxlength: L.LIMITS.text, placeholder: 'Type it before you forget…', 'aria-label': 'What to remember' });
  const holder = h('div');
  const paint = () => holder.replaceChildren(
    chips([['note', 'Note'], ['idea', 'Idea'], ['todo', 'To-do'], ['reminder', 'Reminder']], kind, (v) => { kind = v; paint(); }, 'What kind'),
    h('label', { class: 'field' }, 'For which project? (optional)', h('select', { onchange: (e) => { proj = e.target.value; } }, h('option', { value: '', text: 'No project: put it in my inbox' }), P().map((p) => h('option', { value: p.id, text: p.title, selected: p.id === proj })))),
    kind === 'reminder' ? h('label', { class: 'field' }, 'Remind me on', h('input', { type: 'date', value: due, onchange: (e) => { due = e.target.value; } })) : null);
  paint();
  return h('div', { class: 'sheet-body' }, h('div', { class: 'sheet-head' }, h('a', { class: 'btn', href: '#today', text: '← Back' }), h('h2', { text: 'Capture' })), text, holder,
    h('button', { type: 'button', class: 'btn primary wide', onclick: () => {
      const t = text.value.trim(); if (!t) { toast('Write something first.'); return; }
      if (kind === 'reminder' && !due) { toast('Choose a date for the reminder.'); return; }
      if (proj && kind !== 'reminder') { const r = S.projects[proj] || (S.projects[proj] = {}); (r.log = r.log || []).push({ at: Date.now(), text: `${kind === 'todo' ? 'To-do: ' : kind === 'idea' ? 'Idea: ' : ''}${t}` }); touch(proj, {}); }
      else { S.inbox.push({ id: `i${Date.now().toString(36)}`, at: Date.now(), text: t, kind, project: proj, due: kind === 'reminder' ? due : '', done: false }); save(); }
      toast('Saved.'); go('#today');
    } }, 'Save'));
}

let rstep = 0;
function review() {
  const list = P().filter((p) => L.active(p) || p.status === 'Idea' || p.blocked).filter((p) => p.status !== 'Done');
  if (!list.length) return [banner(), h('p', { class: 'dim', text: 'Nothing in progress to review. Mark a project Building or Testing to see it here.' })];
  if (rstep >= list.length) {
    S.lastReview = Date.now(); save(); rstep = 0;
    return [banner(), h('section', { class: 'assistant' }, robot(), h('div', { class: 'bubble' }, h('b', { text: 'Review done' }), h('p', { text: 'All reviewed. Your next steps are saved. See you next week.' }), h('a', { class: 'btn primary', href: '#today', text: 'Back to Today' })))];
  }
  const p = list[rstep], next = h('input', { type: 'text', value: p.next, maxlength: L.LIMITS.next, placeholder: 'The very next small thing', 'aria-label': 'Next step', oninput: (e) => { touch(p.id, { next: e.target.value }); } });
  const adv = () => { rstep++; render(); };
  return [banner(), h('p', { class: 'dim', text: `Review ${rstep + 1} of ${list.length}` }), h('div', { class: 'progress' }, h('i', { style: `width:${(rstep / list.length) * 100}%` })),
    h('article', { class: 'rcard' }, h('h2', { text: p.title }), h('p', { class: 'blurb', text: p.blurb }), h('p', { class: 'dim', text: `${p.status} · touched ${ago(p.touched)}${p.blocked ? ` · waiting on: ${p.blocked}` : ''}` }),
      p.log.length ? h('p', { class: 'dim', text: `Last note: “${p.log[p.log.length - 1].text}”` }) : null, h('label', { class: 'field' }, 'What is the next step?', next),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { touch(p.id, {}); adv(); } }, 'Still going'), h('button', { type: 'button', class: 'btn', onclick: () => { touch(p.id, { status: 'Paused' }); adv(); } }, 'Pause it'),
        h('button', { type: 'button', class: 'btn', onclick: (e) => { spark(e.clientX, e.clientY); touch(p.id, { status: 'Done' }); adv(); } }, 'It is done'), h('button', { type: 'button', class: 'btn', onclick: adv }, 'Skip')))];
}

/* ================= the vault: locking, backups, settings ================= */
async function setPasscode(pass) {
  const { key: k, record: r } = await V.lockWith(pass, S);
  key = k; record = r; store.set(record); bumpIdle(); toast('Locked with your passcode. Remember it: it cannot be recovered.');
}
function vault() {
  const locked = mode() === 'locked', can = V.available();
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: locked ? 'New passcode' : 'Choose a passcode', 'aria-label': 'Passcode' }), p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Type it again', 'aria-label': 'Passcode again' });
  const meter = h('p', { class: 'dim', role: 'status' });
  p1.addEventListener('input', () => { meter.textContent = p1.value ? `Strength: ${V.strength(p1.value).label}` : ''; });
  const cur = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Current passcode', 'aria-label': 'Current passcode' });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try {
      if (f.size > 3e6) throw new Error('That file is too large to be a backup.');
      const doc = JSON.parse(await f.text());
      if (doc && doc.mode === 'locked') {
        const pass = prompt('This backup is locked. Type its passcode:'); if (pass == null) return;
        const { key: k, value } = await V.unlockWith(pass, doc);
        S = L.sanitize(value); key = k; record = doc; store.set(record);
      } else {
        const v = doc && doc.mode === 'plain' ? doc.value : doc;
        if (!confirm('Replace everything on this desk with this backup?')) return;
        S = L.sanitize(v); if (mode() === 'locked' && key) await persist(); else { record = { v: 1, mode: 'plain', value: S }; store.set(record); }
      }
      toast('Backup loaded.'); render();
    } catch (err) { toast(err.message.includes('decrypt') || err.name === 'OperationError' ? 'Wrong passcode, or the file was changed.' : err.message || 'That file could not be read.'); }
  });
  const row = (label, sub, ctl) => h('div', { class: 'srow' }, h('span', null, label, sub ? h('small', { text: sub }) : null), ctl);
  const sw = (k) => h('input', { type: 'checkbox', checked: prefs.get(k), onchange: () => prefs.set(k, !prefs.get(k)) });
  return [banner(),
    h('h2', { class: 'sect', text: 'Vault' }),
    h('div', { class: `lockstate ${locked ? 'on' : 'off'}` }, h('b', { text: locked ? '🔒 Locked with a passcode' : '🔓 Not locked' }), h('p', { class: 'dim', text: locked ? 'Your notes are encrypted on this device. Only your passcode opens them. If you forget it, nothing can bring them back, so keep a backup you trust.' : 'Your notes are stored on this device in plain text. Anyone who can use this phone’s browser could read them. Set a passcode to encrypt them.' })),
    can ? h('div', { class: 'card' }, h('h3', { text: locked ? 'Change or remove the passcode' : 'Set a passcode' }),
      locked ? h('label', { class: 'field' }, 'Current passcode', cur) : null, h('label', { class: 'field' }, locked ? 'New passcode' : 'Passcode', p1), meter, h('label', { class: 'field' }, 'Again', p2),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        if (p1.value.length < 6) return toast('Use at least 6 characters. A few words is better than one.');
        if (p1.value !== p2.value) return toast('The two passcodes are different.');
        try { if (locked) await V.unlockWith(cur.value, record); await setPasscode(p1.value); render(); } catch (err) { toast('The current passcode is wrong.'); }
      } }, locked ? 'Change passcode' : 'Lock with this passcode'),
      locked ? h('button', { type: 'button', class: 'btn', onclick: async () => { try { await V.unlockWith(cur.value, record); } catch (err) { return toast('Type the current passcode first.'); } if (!confirm('Remove the passcode? Your notes will be stored unlocked.')) return; record = { v: 1, mode: 'plain', value: S }; key = null; store.set(record); toast('Passcode removed.'); render(); } }, 'Remove passcode') : null)) : h('p', { class: 'dim', text: 'This browser has no encryption support here, so a passcode cannot be set. Use a current browser over https.' }),
    locked ? h('button', { type: 'button', class: 'btn wide', onclick: () => lockNow('Locked.') }, 'Lock now') : null,
    locked ? row('Lock itself after', 'When you stop touching it, or leave the page.', h('select', { 'aria-label': 'Auto-lock', onchange: (e) => { S.settings.autolock = +e.target.value; save(); bumpIdle(); } }, [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [15, '15 minutes'], [0, 'Never']].map(([v, t]) => h('option', { value: v, text: t, selected: S.settings.autolock === v })))) : null,
    h('h3', { text: 'Backup' }), h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: async () => { await persist(); download(`darkdesk-backup-${stamp()}.json`, JSON.stringify(record, null, 1), 'application/json'); toast(locked ? 'Saved: the file is encrypted.' : 'Saved. This file is NOT encrypted: keep it somewhere private.'); } }, 'Save a backup file'), h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, 'Load a backup'), file),
    h('h3', { text: 'Settings' }),
    row('Call a project “stale” after', 'The assistant nags about in-progress projects not touched for this long.', h('select', { 'aria-label': 'Stale after', onchange: (e) => { S.settings.staleDays = +e.target.value; save(); } }, [7, 14, 21, 30].map((v) => h('option', { value: v, text: `${v} days`, selected: S.settings.staleDays === v })))),
    row('Calm (no movement)', 'Stops the glitch, sparks and robots.', sw('calm')), row('Easy reading', 'Plainer letters and wider spacing.', sw('easy')), row('High contrast', null, sw('hc')),
    h('h3', { text: 'What this desk does and does not do' }),
    h('ul', { class: 'plain' }, [
      'It only reminds. It cannot publish, upload, commit, deploy or change any project. Links just open the project’s page.',
      'It makes no network requests of its own. Your notes never leave this device unless you save a backup file and move it yourself.',
      'The built-in project list is the public list from the Darklabs home page. Anything you add is private to this device.',
      'A passcode protects against someone picking up your phone or reading the browser’s storage. It cannot protect against a phone that already has spyware, or a passcode that is easy to guess.',
      'Clearing the browser’s site data erases the desk. Save a backup first.',
    ].map((t) => h('li', { text: t }))),
    h('button', { type: 'button', class: 'btn danger wide', onclick: () => { if (prompt('This erases every note on this desk, for good. Type ERASE to continue.') === 'ERASE') { localStorage.removeItem(KEY); localStorage.removeItem(FAILS); S = null; key = null; record = null; location.hash = ''; boot(); } } }, 'Erase everything on this desk')];
}

function banner() {
  if (mode() === 'locked' || S.settings.dismissedBanner) return null;
  return h('div', { class: 'warnbar', role: 'note' }, h('span', { text: '🔓 Your notes are not locked.' }), h('a', { class: 'btn', href: '#vault', text: 'Set a passcode' }), h('button', { type: 'button', class: 'btn', 'aria-label': 'Hide this reminder', onclick: () => { S.settings.dismissedBanner = true; save(); render(); } }, '✕'));
}

/* ================= the frame ================= */
const VIEWS = { today, projects, review, vault };
function render() {
  if (!S) return;
  const hash = location.hash.slice(1) || 'today', [name, arg] = hash.split('/');
  const tab = name === 'p' || name === 'new' ? 'projects' : name === 'capture' ? 'today' : VIEWS[name] ? name : 'today';
  document.querySelectorAll('#nav [data-v]').forEach((b) => { const on = b.dataset.v === tab; b.setAttribute('aria-current', on ? 'page' : 'false'); });
  const sheet = name === 'p' ? sheetProject(arg) : name === 'new' ? sheetNew() : name === 'capture' ? sheetCapture() : null;
  document.body.classList.toggle('sheet-open', !!sheet);
  const sh = $('#sheet'); sh.hidden = !sheet; sh.replaceChildren(...(sheet ? [sheet] : []));
  app.replaceChildren(...[VIEWS[tab]()].flat(2).filter(Boolean));
  if (sheet) sh.scrollTop = 0;
}
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

/* ================= unlocking ================= */
function showLock(msg) {
  const box = $('#lock'); box.hidden = false; app.replaceChildren(); $('#sheet').hidden = true; $('#nav').hidden = true;
  const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passcode', 'aria-label': 'Passcode', autofocus: true }), err = h('p', { class: 'err', role: 'alert', text: msg || '' });
  const f = h('form', { class: 'lockcard', onsubmit: async (e) => {
    e.preventDefault();
    const st = JSON.parse(localStorage.getItem(FAILS) || '{"n":0,"until":0}');
    if (Date.now() < st.until) { err.textContent = `Too many tries. Wait ${Math.ceil((st.until - Date.now()) / 1000)} seconds.`; return; }
    f.querySelector('button').disabled = true; err.textContent = 'Opening…';
    try { const { key: k, value } = await V.unlockWith(input.value, record); key = k; S = L.sanitize(value); localStorage.removeItem(FAILS); box.hidden = true; $('#nav').hidden = false; bumpIdle(); render(); }
    catch (ex) { st.n++; st.until = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(st.n, 9)); localStorage.setItem(FAILS, JSON.stringify(st)); err.textContent = st.n >= 3 ? `Wrong passcode. Wait a moment before the next try.` : 'Wrong passcode.'; input.value = ''; }
    f.querySelector('button').disabled = false;
  } }, robot(), h('h1', { class: 'glitch-text', 'data-text': 'DarkDesk', text: 'DarkDesk' }), h('p', { class: 'dim', text: 'Locked. Your notes are encrypted on this device.' }), input, h('button', { class: 'btn primary wide', type: 'submit' }, 'Unlock'), err);
  box.replaceChildren(f); input.focus();
}

async function boot() {
  record = store.get();
  if (record && record.mode === 'locked') { showLock(); return; }
  try { S = record && record.mode === 'plain' ? L.sanitize(record.value) : L.blank(); } catch (err) { S = L.blank(); toast('The saved desk could not be read, so a fresh one was started.'); }
  if (!record) { record = { v: 1, mode: 'plain', value: S }; store.set(record); }
  $('#lock').hidden = true; $('#nav').hidden = false; render();
}

document.querySelectorAll('#nav [data-v]').forEach((b) => b.addEventListener('click', () => go(`#${b.dataset.v}`)));
$('#fab').addEventListener('click', () => go('#capture'));
$('#lockbtn').addEventListener('click', () => { if (mode() === 'locked') lockNow('Locked.'); else go('#vault'); });
addEventListener('darklabs:prefs', () => { if (S) render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();

/* DarkDesk: the pure parts (no browser needed, so they can be tested). The data model, what the assistant suggests, calendar files, and checking a backup before it is trusted. */
export const STATUSES = ['Idea', 'Building', 'Testing', 'Live', 'Paused', 'Done'];
export const PRIOS = ['Low', 'Normal', 'High'];
export const DAY = 86400000;
const LIM = { title: 120, blurb: 600, url: 300, next: 200, blocked: 200, notes: 6000, tag: 24, item: 200, log: 600, text: 600 };

export const blank = () => ({ v: 1, projects: {}, custom: [], inbox: [], settings: { staleDays: 14, autolock: 2 }, lastReview: 0, created: Date.now() });

/** A project as the screens see it: the built-in facts, with the person's own edits on top. */
export function view(seed, rec = {}) {
  return { id: seed.id, title: seed.title, blurb: seed.blurb || '', url: seed.url || '', custom: !!seed.custom, status: seed.status || 'Live', prio: 2, next: '', blocked: '', notes: '', tags: [], due: '', checklist: [], log: [], touched: 0, ...rec };
}
export const allSeeds = (state, seeds) => seeds.concat(state.custom.map((c) => ({ ...c, custom: true, status: c.status || 'Idea' })));
export const allViews = (state, seeds) => allSeeds(state, seeds).map((s) => view(s, state.projects[s.id]));

export const today = (now = Date.now()) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : null; };
export const daysUntil = (s, now = Date.now()) => { const t = parseDay(s); return t == null ? null : Math.round((t - today(now)) / DAY); };
export const daysSince = (ts, now = Date.now()) => (ts ? Math.floor((now - ts) / DAY) : null);
export const active = (p) => p.status === 'Building' || p.status === 'Testing';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What the assistant says. Plain rules, no guessing and no network: every line comes from something you wrote down. Most urgent first. */
export function suggest(state, seeds, now = Date.now()) {
  const out = [], P = allViews(state, seeds), stale = state.settings.staleDays || 14;
  for (const p of P) {
    const d = daysUntil(p.due, now);
    if (d != null && p.status !== 'Done' && d <= 7) out.push({ kind: 'due', score: 100 - d, project: p.id, text: d < 0 ? `${p.title} was due ${plural(-d, 'day')} ago.` : d === 0 ? `${p.title} is due today.` : d === 1 ? `${p.title} is due tomorrow.` : `${p.title} is due in ${d} days.` });
  }
  for (const it of state.inbox) {
    const d = daysUntil(it.due, now);
    if (!it.done && d != null && d <= 7) out.push({ kind: 'due', score: 98 - d, inbox: it.id, text: d < 0 ? `Reminder overdue: ${it.text}` : d === 0 ? `Reminder today: ${it.text}` : `Reminder in ${plural(d, 'day')}: ${it.text}` });
  }
  for (const p of P) if (p.blocked && p.status !== 'Done' && p.status !== 'Paused') out.push({ kind: 'blocked', score: 70 + p.prio, project: p.id, text: `${p.title} is waiting on: ${p.blocked}` });
  for (const p of P.filter(active)) {
    const s = daysSince(p.touched, now);
    if (!p.next) out.push({ kind: 'next', score: 60 + p.prio * 3, project: p.id, text: `${p.title} has no next step. What is the very next small thing?` });
    if (s != null && s >= stale) out.push({ kind: 'stale', score: 50 + Math.min(20, s - stale) + p.prio * 3, project: p.id, text: `${p.title} has not been touched for ${plural(s, 'day')}.` });
    if (p.touched === 0 && p.next) out.push({ kind: 'fresh', score: 30, project: p.id, text: `${p.title} is in progress. Next: ${p.next}` });
  }
  const open = state.inbox.filter((i) => !i.done && !i.due).length;
  if (open) out.push({ kind: 'inbox', score: 45, text: `${plural(open, 'note')} in your inbox to sort.` });
  if (daysSince(state.lastReview, now) == null || daysSince(state.lastReview, now) >= 7) out.push({ kind: 'review', score: 40, text: state.lastReview ? 'It has been a week since your last review. Five quiet minutes?' : 'You have not done a review yet. It takes about five minutes.' });
  const week = P.filter((p) => p.touched && now - p.touched < 7 * DAY).length;
  if (week >= 2) out.push({ kind: 'win', score: 5, text: `You touched ${plural(week, 'project')} this week. Nice.` });
  return out.sort((a, b) => b.score - a.score);
}

/** The three to look at today: priority, whether it is in progress, how long since it was touched, and whether it is due. */
export function focus(state, seeds, now = Date.now(), n = 3) {
  return allViews(state, seeds).filter((p) => p.status !== 'Done' && p.status !== 'Paused')
    .map((p) => { const d = daysUntil(p.due, now), s = daysSince(p.touched, now); return { p, score: (active(p) ? 40 : 0) + p.prio * 10 + (d != null && d <= 7 ? 30 - d : 0) + (s == null ? 3 : Math.min(25, s)) + (p.next ? 4 : 0) - (p.blocked ? 12 : 0) - (p.status === 'Live' ? 25 : 0) }; })
    .sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.p);
}

/** How warm a project is, 0 (cold) to 1 (just touched): the heat bar. */
export const heat = (p, now = Date.now(), stale = 14) => (p.touched ? Math.max(0, 1 - (now - p.touched) / (stale * 2 * DAY)) : 0);

/* ---------- a calendar file for reminders (a file you open yourself; nothing is sent) ---------- */
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => { const out = []; let rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); };
export function toICS(items, now = Date.now()) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DarkDesk//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    if (!parseDay(it.date)) continue;
    lines.push('BEGIN:VEVENT', `UID:${esc(it.uid)}@darkdesk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${it.date.replace(/-/g, '')}`, fold(`SUMMARY:${esc(it.title)}`));
    if (it.note) lines.push(fold(`DESCRIPTION:${esc(it.note)}`));
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(it.title)}`), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ---------- checking what comes in (a backup file, a saved copy): never trust it ---------- */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? v : 0);
const day = (v) => (parseDay(v) ? v : '');
const safeUrl = (u) => { u = str(u, LIM.url); return /^(https?:\/\/|\/|\.\.?\/)/.test(u) ? u : ''; };
export function sanitize(doc) {
  if (!doc || typeof doc !== 'object' || doc.v !== 1) throw new Error('This is not a DarkDesk backup.');
  const s = blank();
  s.created = num(doc.created) || s.created; s.lastReview = num(doc.lastReview);
  const st = doc.settings || {};
  s.settings = { staleDays: Math.min(90, Math.max(3, num(st.staleDays) || 14)), autolock: [0, 1, 2, 5, 15].includes(st.autolock) ? st.autolock : 2 };
  for (const c of Array.isArray(doc.custom) ? doc.custom.slice(0, 100) : []) if (c && typeof c.id === 'string' && /^c-[\w-]{1,30}$/.test(c.id)) s.custom.push({ id: c.id, title: str(c.title, LIM.title) || 'Untitled', blurb: str(c.blurb, LIM.blurb), url: safeUrl(c.url), status: STATUSES.includes(c.status) ? c.status : 'Idea' });
  const ids = Object.keys(doc.projects && typeof doc.projects === 'object' ? doc.projects : {}).slice(0, 400);
  for (const id of ids) {
    if (!/^[\w-]{1,40}$/.test(id)) continue;
    const r = doc.projects[id] || {};
    s.projects[id] = {
      ...(STATUSES.includes(r.status) ? { status: r.status } : {}), prio: [1, 2, 3].includes(r.prio) ? r.prio : 2,
      next: str(r.next, LIM.next), blocked: str(r.blocked, LIM.blocked), notes: str(r.notes, LIM.notes), due: day(r.due), touched: num(r.touched),
      tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t, LIM.tag)).filter(Boolean).slice(0, 12),
      checklist: (Array.isArray(r.checklist) ? r.checklist : []).slice(0, 100).map((c) => ({ t: str(c && c.t, LIM.item), done: !!(c && c.done) })).filter((c) => c.t),
      log: (Array.isArray(r.log) ? r.log : []).slice(-200).map((l) => ({ at: num(l && l.at), text: str(l && l.text, LIM.log) })).filter((l) => l.text),
    };
  }
  s.inbox = (Array.isArray(doc.inbox) ? doc.inbox : []).slice(0, 300).map((i, n) => ({ id: str(i && i.id, 30) || `i${n}`, at: num(i && i.at), text: str(i && i.text, LIM.text), kind: ['note', 'idea', 'todo', 'reminder'].includes(i && i.kind) ? i.kind : 'note', project: /^[\w-]{1,40}$/.test((i && i.project) || '') ? i.project : '', due: day(i && i.due), done: !!(i && i.done) })).filter((i) => i.text);
  return s;
}
export const LIMITS = LIM;

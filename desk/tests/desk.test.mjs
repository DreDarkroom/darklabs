import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, suggest, focus, toICS, sanitize, daysUntil, parseDay, view, allViews, DAY } from '../logic.js';
import { lockWith, unlockWith, strength, deriveKey, seal } from '../vault.js';

const seeds = [{ id: 'a', title: 'Alpha', blurb: '', status: 'Building' }, { id: 'b', title: 'Beta', blurb: '', status: 'Live' }, { id: 'c', title: 'Gamma', blurb: '', status: 'Testing' }];
const NOW = new Date(2026, 9, 5, 12).getTime();

test('days are counted from the local midnight, and bad dates are refused', () => {
  assert.equal(daysUntil('2026-10-06', NOW), 1);
  assert.equal(daysUntil('2026-10-05', NOW), 0);
  assert.equal(daysUntil('2026-10-01', NOW), -4);
  assert.equal(parseDay('2026-13-45'), null);
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('tomorrow'), null);
  assert.equal(daysUntil('', NOW), null);
});

test('the assistant puts what is due first, then what is blocked, then what has no next step', () => {
  const s = blank();
  s.projects.a = { status: 'Building', next: 'ship it', touched: NOW - 2 * DAY, due: '2026-10-06' };
  s.projects.c = { status: 'Testing', next: '', touched: NOW - 30 * DAY, blocked: 'a licence decision' };
  const out = suggest(s, seeds, NOW);
  assert.equal(out[0].kind, 'due');
  assert.match(out[0].text, /Alpha is due tomorrow/);
  assert.ok(out.findIndex((x) => x.kind === 'blocked') < out.findIndex((x) => x.kind === 'next'));
  assert.ok(out.some((x) => x.kind === 'stale' && /30 days/.test(x.text)));
  assert.ok(out.some((x) => x.kind === 'review'));
});

test('a paused or finished project is never nagged about', () => {
  const s = blank();
  s.projects.a = { status: 'Paused', next: '', touched: NOW - 90 * DAY, blocked: 'x', due: '2026-10-01' };
  s.projects.c = { status: 'Done' };
  const out = suggest(s, seeds, NOW).filter((x) => x.project === 'a' || x.project === 'c');
  assert.deepEqual(out.map((x) => x.kind), ['due'].slice(0, out.length));            // an overdue date on a paused project may still show; nothing else does
});

test('today\'s three prefer high priority, in progress, and long untouched; they skip paused and done', () => {
  const s = blank();
  s.projects.a = { status: 'Building', prio: 3, touched: NOW - 10 * DAY, next: 'x' };
  s.projects.b = { status: 'Paused' };
  s.projects.c = { status: 'Done' };
  const f = focus(s, seeds, NOW);
  assert.deepEqual(f.map((p) => p.id), ['a']);
});

test('a calendar file has all-day events, escapes text, and skips bad dates', () => {
  const ics = toICS([{ uid: 'p1', date: '2026-10-06', title: 'Renew, then; check', note: 'line1\nline2' }, { uid: 'p2', date: 'nope', title: 'x' }], NOW);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261006/);
  const BS = String.fromCharCode(92);                                   // one backslash: iCalendar escapes , ; and new lines with it
  assert.ok(ics.includes(`SUMMARY:Renew${BS}, then${BS}; check`));
  assert.ok(ics.includes(`DESCRIPTION:line1${BS}nline2`));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, 'lines are folded');
});

test('a backup is cleaned: wrong shapes, long text, odd links and unknown fields do not get through', () => {
  assert.throws(() => sanitize(null), /not a DarkDesk/);
  assert.throws(() => sanitize({ v: 2 }), /not a DarkDesk/);
  const s = sanitize({ v: 1, evil: '<script>', settings: { staleDays: 9999, autolock: 7 },
    custom: [{ id: 'c-1', title: 'T'.repeat(500), url: 'javascript:alert(1)' }, { id: '../x', title: 'bad' }],
    projects: { a: { status: 'Hacked', prio: 9, notes: 'n'.repeat(99999), due: 'soon', tags: ['ok', 5, 'x'.repeat(100)], checklist: [{ t: 'one', done: 1 }, { t: '' }], log: [{ at: 1, text: 'hello' }] }, '__proto__': { status: 'Done' }, 'bad id!': {} },
    inbox: [{ text: 'a note', kind: 'weird', project: '../../x', due: 'x' }, { text: '' }] });
  assert.equal(s.settings.staleDays, 90); assert.equal(s.settings.autolock, 2);
  assert.equal(s.custom.length, 1); assert.equal(s.custom[0].title.length, 120); assert.equal(s.custom[0].url, '');
  assert.equal(s.projects.a.status, undefined); assert.equal(s.projects.a.prio, 2); assert.equal(s.projects.a.notes.length, 6000); assert.equal(s.projects.a.due, '');
  assert.deepEqual(s.projects.a.tags.map((t) => t.length), [2, 24]); assert.equal(s.projects.a.checklist.length, 1);
  assert.equal(Object.keys(s.projects).length, 1);
  assert.equal(s.inbox.length, 1); assert.equal(s.inbox[0].kind, 'note'); assert.equal(s.inbox[0].project, ''); assert.equal(s.inbox[0].due, '');
  assert.equal(s.evil, undefined);
});

test('built-in facts and the person\'s edits are kept apart', () => {
  const s = blank(); s.projects.a = { next: 'do it' };
  const v = allViews(s, seeds).find((p) => p.id === 'a');
  assert.equal(v.title, 'Alpha'); assert.equal(v.next, 'do it'); assert.equal(v.status, 'Building');
  assert.equal(view(seeds[0]).prio, 2);
});

test('the vault round-trips, rejects the wrong passcode, and detects tampering', async () => {
  const value = { v: 1, notes: 'secret ünïcode ✓' };
  const { record } = await lockWith('correct horse', value);
  assert.equal(record.mode, 'locked'); assert.ok(!JSON.stringify(record).includes('secret'));
  const ok = await unlockWith('correct horse', record);
  assert.deepEqual(ok.value, value);
  await assert.rejects(unlockWith('wrong', record));
  const bad = { ...record, data: record.data.slice(0, -4) + 'AAAA' };
  await assert.rejects(unlockWith('correct horse', bad));
  await assert.rejects(unlockWith('correct horse', { ...record, iter: 1 }), /cannot be read/);
  const again = await lockWith('correct horse', value);
  assert.notEqual(again.record.data, record.data, 'a fresh salt and number every time');
});

test('passcode strength is only a hint', () => {
  assert.match(strength('abc').label, /Weak/);
  assert.match(strength('correct horse battery staple').label, /Strong/);
});

test('an older, weaker record still opens, and says it wants upgrading; a new one does not', async () => {
  const salt = new Uint8Array(16).fill(7), key = await deriveKey('old passcode', salt, 310000), box = await seal({ v: 1, hello: 'there' }, key);
  const old = { v: 1, mode: 'locked', salt: Buffer.from(salt).toString('base64'), iter: 310000, ...box };
  const res = await unlockWith('old passcode', old);
  assert.equal(res.value.hello, 'there'); assert.equal(res.needsUpgrade, true);
  const fresh = await lockWith('new passcode', { v: 1 });
  assert.equal(fresh.record.iter, 600000); assert.equal((await unlockWith('new passcode', fresh.record)).needsUpgrade, false);
});

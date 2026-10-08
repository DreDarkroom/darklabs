/* KlartextKit tests: content integrity, contrast, the pure logic of every module, privacy (no unexpected hosts), and size budgets.
   Run from the repo root:  node --test tests/klartext.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { CATS, GAMES, REG } from '../klartext/data/cats.js';
import { PHRASES } from '../klartext/data/phrases.js';
import { TERMS } from '../klartext/data/terms.js';
import { RULES } from '../klartext/data/grammar.js';
import { SCENES } from '../klartext/data/scenes.js';
import { PLACES, TEMPLATES, NUMBERS, compose } from '../klartext/data/build.js';
import { ratio, onColor } from '../klartext/core/color.js';
import { schedule, buildQueue, stats, isDue, WAIT_DAYS, BOXES, DAY } from '../klartext/core/srs.js';
import * as progress from '../klartext/core/progress.js';
import { createStore } from '../klartext/core/store.js';
import { mergeBrand, BRAND, loadBrand } from '../klartext/core/brand.js';
import { MODULES, visible, byId, QUICK, GROUPS } from '../klartext/core/registry.js';
import { conjugateWeak, normalize, matches } from '../klartext/core/german.js';
import { filterPhrases, makeQuestion, isCorrect } from '../klartext/core/select.js';
import { summarize, percentile } from '../klartext/core/perf.js';
import { isQuestUA } from '../klartext/core/vr.js';
import { fmt, parseTime } from '../klartext/modules/timers.js';
import { rollDice, splitTeams, lines } from '../klartext/modules/picker.js';
import { clock, nextBreak } from '../klartext/modules/guard.js';
import { nextLevel, budget, isBroken } from '../klartext/modules/breaklab.js';
import { layout, regionAt, W, H } from '../klartext/modules/vrroom.js';

const ROOT = 'klartext';
const walk = (dir, out = []) => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk(ROOT).filter((f) => /\.(js|css|html|json|webmanifest|md)$/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

/* ---------------- every file is valid module code (the browser is stricter than a plain `node --check`) ---------------- */
test('every kit script parses as an ES module', () => {
  for (const f of files.filter((x) => x.endsWith('.js') && !x.endsWith('sw.js'))) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(f), encoding: 'utf8' });
    assert.equal(r.status, 0, `${f} does not parse:\n${r.stderr.split('\n').slice(0, 4).join('\n')}`);
  }
});

/* GitHub Pages builds with Jekyll, which silently SKIPS any file or folder whose name starts with an underscore or a dot.
   The kit worked locally and failed live once because of a file called _ui.js: this test makes that impossible to repeat. */
test('no file or folder in the kit has a name Pages would skip', () => {
  for (const f of walk(ROOT)) for (const part of path.relative(ROOT, f).split(path.sep)) assert.ok(!/^[_.]/.test(part), `${f}: GitHub Pages (Jekyll) skips names starting with "_" or "."`);
});

test('every file a module imports exists on disk', () => {
  for (const f of files.filter((x) => x.endsWith('.js') && !x.endsWith('sw.js'))) {
    for (const m of read(f).matchAll(/(?:from\s+|import\()\s*['"`](\.{1,2}\/[^'"`$]+)['"`]/g)) {
      const target = path.join(path.dirname(f), m[1]);
      assert.ok(fs.existsSync(target), `${f} imports ${m[1]}, which does not exist`);
    }
  }
  for (const m of MODULES) assert.ok(read('klartext/core/registry.js').includes(`../modules/${m.id}.js`), `${m.id} is not loaded from the right place`);
  const sw = read('klartext/sw.js');
  for (const m of sw.matchAll(/"((?:core|data|modules)\/[\w.-]+\.js)"/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), `sw.js pre-caches ${m[1]}, which does not exist`);
});

/* ---------------- content ---------------- */
test('phrases: unique ids, valid tags, no stray whitespace', () => {
  const ids = new Set();
  for (const p of PHRASES) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`); ids.add(p.id);
    assert.ok(CATS[p.cat], `bad category in ${p.id}`);
    assert.ok(REG[p.reg], `bad register in ${p.id}`);
    assert.ok(p.games.length && p.games.every((g) => GAMES[g]), `bad games in ${p.id}`);
    assert.ok([1, 2, 3].includes(p.lvl), `bad level in ${p.id}`);
    for (const k of ['de', 'en']) { assert.ok(p[k] && p[k] === p[k].trim() && !/\s{2,}/.test(p[k]), `whitespace in ${k} of ${p.id}`); }
    assert.ok(!/andreas/i.test(JSON.stringify(p)), 'a real name must never appear in the kit');
  }
  assert.ok(PHRASES.length >= 120, `expected a real phrasebook, got ${PHRASES.length}`);
});

test('phrases: every category is used, rude phrases are explained, notes are short', () => {
  for (const c of Object.keys(CATS)) assert.ok(PHRASES.some((p) => p.cat === c), `category ${c} is empty`);
  for (const g of Object.keys(GAMES)) assert.ok(PHRASES.filter((p) => p.games.includes(g)).length >= 25, `game ${g} has too few phrases`);
  for (const p of PHRASES.filter((x) => x.reg === 'crude')) assert.ok(p.note && /understand|mute|ignore|not say|do not/i.test(p.note), `rude phrase ${p.id} needs a warning note`);
  for (const p of PHRASES) assert.ok(p.note.length <= 260, `note too long in ${p.id}`);
  assert.ok(PHRASES.filter((p) => p.reg === 'crude').length <= 5, 'keep the rude list short; there are no slurs here');
});

test('terms, grammar and scenes are well formed', () => {
  assert.equal(new Set(TERMS.map((t) => t.id)).size, TERMS.length, 'duplicate term ids');
  for (const t of TERMS) { assert.ok(t.de && t.en, t.id); if (t.type === 'noun') assert.match(t.de, /^(der|die|das) /, `noun without article: ${t.de}`); }
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const r of RULES) assert.ok(r.body.length && r.ex.length && r.ex.every((e) => e.de && e.en), r.id);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length);
  for (const s of SCENES) { assert.equal(s.opts.filter((o) => o.ok).length, 1, `scene ${s.id} must have exactly one good answer`); assert.ok(s.opts.length >= 3 && s.says && s.en && s.tip, s.id); for (const o of s.opts) assert.ok(o.why, `scene ${s.id} option needs a reason`); }
});

/* ---------------- colour and accessibility ---------------- */
test('every category colour: readable text on it, and a visible edge on black', () => {
  for (const [id, c] of Object.entries(CATS)) {
    assert.ok(ratio(c.hue, onColor(c.hue)) >= 4.5, `${id}: text on the fill is under 4.5:1`);
    assert.ok(ratio(c.hue, '#000000') >= 3, `${id}: colour against the black page is under 3:1`);
    assert.ok(c.shape, `${id} needs its own shape (colour is never the only signal)`);
  }
  assert.equal(new Set(Object.values(CATS).map((c) => c.shape)).size, Object.keys(CATS).length, 'each category needs a different shape');
  assert.ok(ratio(BRAND.accent, onColor(BRAND.accent)) >= 4.5);
  assert.ok(ratio('#c4c4d0', '#0e0e12') >= 7, 'dim text on panels');
});

test('stylesheet and page follow the accessibility and motion rules', () => {
  const css = read('klartext/kk.css'), html = read('klartext/index.html');
  assert.match(css, /html\[data-attn="off"\]/, 'an "off" motion level must stop animation');
  assert.match(css, /--tap: 60px/); assert.match(css, /html\[data-vr="on"\] \{ --tap: 76px/);
  assert.match(html, /<html lang="de"/); assert.match(html, /name="viewport"/); assert.match(html, /class="skip"/);
  for (const c of Object.keys(CATS)) assert.match(css, new RegExp(`data-cat="${c}"`), `stylesheet missing ${c}`);
  for (const c of Object.values(CATS)) assert.match(html, new RegExp(`id="i-${c.shape}"`), `sprite missing shape ${c.shape}`);
  for (const id of ['home', 'vr', 'bolt', 'sound']) assert.match(html, new RegExp(`id="i-${id}"`));
});

/* ---------------- core logic ---------------- */
test('srs: know moves up, miss goes back, almost stays; queue and stats', () => {
  const now = 1_000_000;
  let c = schedule(undefined, 'know', now); assert.equal(c.b, 1); assert.equal(c.d, now + WAIT_DAYS[1] * DAY); assert.equal(c.n, 1);
  c = schedule(c, 'know', now); assert.equal(c.b, 2);
  assert.equal(schedule(c, 'almost', now).b, 2);
  assert.equal(schedule(c, 'miss', now).b, 0);
  assert.equal(schedule({ b: BOXES - 1, d: 0, n: 3 }, 'know', now).b, BOXES - 1, 'top box is a ceiling');
  assert.equal(schedule(undefined, 'miss', now).d, now + 10 * 60 * 1000, 'a miss comes back in ten minutes');
  const states = { a: { b: 1, d: now - 5, n: 1 }, b: { b: 2, d: now + DAY, n: 1 }, c: { b: 0, d: now - 50, n: 1 } };
  assert.deepEqual(buildQueue(['a', 'b', 'c', 'x', 'y', 'z'], states, { now, newLimit: 2 }), ['c', 'a', 'x', 'y'], 'due first (oldest first), then new, capped');
  assert.ok(isDue(states.a, now) && !isDue(states.b, now) && !isDue(undefined, now));
  assert.deepEqual(stats(['a', 'b', 'c', 'x'], states, now), { total: 4, fresh: 1, due: 2, learning: 3, mastered: 0 });
});

test('progress: streak counts consecutive days and resets after a gap', () => {
  const store = createStore(memBackend());
  const at = (d) => new Date(2026, 9, d, 15).getTime();
  progress.touch(store, at(1)); assert.equal(progress.current(store, at(1)), 1);
  progress.touch(store, at(2)); progress.touch(store, at(2)); assert.equal(progress.current(store, at(2)), 2, 'same day twice counts once');
  progress.touch(store, at(3)); assert.equal(progress.current(store, at(3)), 3);
  assert.equal(progress.current(store, at(4)), 3, 'still alive the day after');
  assert.equal(progress.current(store, at(5)), 0, 'a missed day ends it');
  progress.touch(store, at(5)); assert.equal(progress.current(store, at(5)), 1);
  assert.equal(store.get('streak').best, 3);
});

function memBackend() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null }; }

test('store: namespaced, survives bad data and a broken backend', () => {
  const be = memBackend(), s = createStore(be);
  assert.equal(s.get('x', 7), 7); s.set('x', { a: 1 }); assert.deepEqual(s.get('x'), { a: 1 }); assert.ok(be.getItem('kk.x'));
  be.setItem('kk.bad', '{oops'); assert.equal(s.get('bad', 'fallback'), 'fallback');
  be.setItem('other.key', '1'); assert.deepEqual(Object.keys(s.dump()), ['x'], 'dump skips other apps and unreadable values');
  assert.equal(s.load({ y: 2, z: [3] }), 2); assert.equal(s.get('y'), 2);
  s.wipe(); assert.deepEqual(s.dump(), {}); assert.equal(be.getItem('other.key'), '1', 'wipe only touches kk.*');
  const broken = createStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }, length: 0, key() { return null; } });
  assert.equal(broken.get('a', 'ok'), 'ok'); assert.equal(broken.set('a', 1), false); broken.del('a');
});

test('brand: white-label file is validated, bad values are ignored', async () => {
  assert.deepEqual(mergeBrand(null), BRAND); assert.deepEqual(mergeBrand('x'), BRAND);
  const b = mergeBrand({ name: 'Clan Coach', accent: '#00B7FF', logo: 'my-logo.png', modules: ['comms', 'cards'], credit: false, footer: 'Hi', feedbackUrl: '' });
  assert.equal(b.name, 'Clan Coach'); assert.equal(b.accent, '#00b7ff'); assert.equal(b.logo, 'my-logo.png'); assert.deepEqual(b.modules, ['comms', 'cards']); assert.equal(b.credit, false); assert.equal(b.feedbackUrl, '');
  const bad = mergeBrand({ name: 5, accent: 'red', logo: '../../etc/passwd', modules: 'comms', credit: 'no', feedbackUrl: 'http://evil.example/x', footer: 'x'.repeat(500) });
  assert.deepEqual(bad, BRAND, 'every bad value falls back to the default');
  assert.deepEqual(mergeBrand({ logo: 'https://evil.example/x.png' }).logo, BRAND.logo, 'no remote logos');
  assert.deepEqual(mergeBrand(JSON.parse(read('klartext/brand.json'))), BRAND, 'the shipped brand.json must equal the built-in defaults');
  assert.deepEqual(await loadBrand('brand.json', async () => ({ ok: false })), BRAND);
  assert.deepEqual(await loadBrand('brand.json', async () => { throw new Error('offline'); }), BRAND);
  assert.equal((await loadBrand('brand.json', async () => ({ ok: true, json: async () => ({ name: 'Mine' }) }))).name, 'Mine');
});

test('registry: every module exists on disk, hues are real, white-label can pick and order', () => {
  assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length);
  for (const m of MODULES) {
    assert.ok(CATS[m.hue], `${m.id} hue`); assert.ok(GROUPS[m.group], `${m.id} group`);
    assert.ok(fs.existsSync(`${ROOT}/modules/${m.id}.js`), `modules/${m.id}.js is missing`);
    assert.match(read(`${ROOT}/modules/${m.id}.js`), /export default/, `${m.id} must export default`);
    assert.ok(m.de && m.en && m.desc);
  }
  assert.ok(QUICK.every((id) => byId(id)));
  assert.equal(visible(BRAND).length, MODULES.length);
  assert.deepEqual(visible({ modules: ['timers', 'nope', 'comms'] }).map((m) => m.id), ['timers', 'comms']);
  assert.ok(MODULES.length >= 14, 'the toolkit should have its full set of tools');
});

test('german: conjugating English game verbs', () => {
  const row = (r, p) => r.rows.find(([x]) => x === p)[1];
  const push = conjugateWeak('pushen');
  assert.equal(row(push, 'ich'), 'pushe'); assert.equal(row(push, 'du'), 'pushst'); assert.equal(row(push, 'er / sie / es'), 'pusht'); assert.equal(row(push, 'wir'), 'pushen'); assert.equal(push.perfect, 'ich habe gepusht'); assert.deepEqual(push.imperative, [['du', 'Push!'], ['ihr', 'Pusht!']]);
  assert.equal(row(conjugateWeak('campen'), 'du'), 'campst'); assert.equal(conjugateWeak('campen').participle, 'gecampt');
  const boost = conjugateWeak('boosten'); assert.equal(row(boost, 'du'), 'boostest'); assert.equal(row(boost, 'er / sie / es'), 'boostet'); assert.equal(boost.participle, 'geboostet');
  assert.equal(row(conjugateWeak('mixen'), 'du'), 'mixt', 'after x the du ending is -t');
  assert.equal(row(conjugateWeak('spawnen'), 'du'), 'spawnst'); assert.equal(row(conjugateWeak('zoomen'), 'du'), 'zoomst');
  assert.equal(row(conjugateWeak('downloaden'), 'du'), 'downloadest'); assert.equal(conjugateWeak('downloaden').participle, 'gedownloadet');
  assert.equal(row(conjugateWeak('öffnen'), 'du'), 'öffnest'); assert.equal(row(conjugateWeak('atmen'), 'du'), 'atmest'); assert.equal(row(conjugateWeak('lernen'), 'du'), 'lernst');
  assert.equal(conjugateWeak('trainieren').participle, 'trainiert', 'no ge- on -ieren verbs');
  assert.equal(conjugateWeak('verteidigen').participle, 'verteidigt', 'no ge- after ver-');
  for (const bad of ['', 'push', 'x', 'sammeln', 'ändern', '123en', null]) assert.ok(conjugateWeak(bad).error, `should reject ${bad}`);
  assert.match(conjugateWeak('sammeln').error, /-eln or -ern/, 'the helpful message must be reachable');
  assert.match(conjugateWeak('ändern').error, /-eln or -ern/);
});

test('german: typed answers are compared kindly', () => {
  assert.ok(matches('Gegner links', 'Gegner links!')); assert.ok(matches('  gegner   LINKS ', 'Gegner links!'));
  assert.ok(matches('Zurueckfallen', 'Zurückfallen!')); assert.ok(matches('Dreissig Sekunden', 'dreißig Sekunden'));
  assert.ok(!matches('', 'x')); assert.ok(!matches('Gegner rechts', 'Gegner links!'));
  assert.equal(normalize('Ärger, Öl & Übung!'), 'aerger oel uebung');
});

test('builder: every template and every place form composes proper sentences', () => {
  for (const t of TEMPLATES) {
    const s = compose(t, {}); assert.ok(s.length > 6 && !s.includes('undefined') && /[!?]$/.test(s), `${t.id}: ${s}`);
    for (const slot of t.slots) for (const o of slot.opts) { const x = compose(t, { [slot.id]: o.v }); assert.ok(!x.includes('undefined') && x.includes(o.v), `${t.id}/${o.v}`); }
  }
  assert.equal(compose(TEMPLATES.find((t) => t.id === 'spot'), { n: 'Zwei', w: 'auf der Brücke' }), 'Zwei Gegner auf der Brücke!');
  assert.equal(compose(TEMPLATES.find((t) => t.id === 'move'), { v: 'dashe', w: 'in den Turm' }), 'Ich dashe in den Turm!');
  assert.equal(compose(TEMPLATES.find((t) => t.id === 'hold'), { p: 'den Turm' }), 'Wir halten den Turm!');
  assert.equal(compose(TEMPLATES.find((t) => t.id === 'timing'), { n: 'dreißig' }), 'Angriff in dreißig Sekunden!');
  for (const p of PLACES) {
    assert.match(p.nom, /^(der|die|das) /); assert.match(p.acc, /^(den|die|das) /);
    assert.ok(/^(auf|in|im|am|bei|an) /.test(p.at), `at: ${p.at}`); assert.ok(/^(auf|in|zum|zur|aufs|zu) /.test(p.to), `to: ${p.to}`);
    if (p.nom.startsWith('der ')) assert.equal(p.acc, 'den ' + p.nom.slice(4), `masculine accusative of ${p.nom}`);
    else assert.equal(p.acc, p.nom, `non-masculine accusative equals nominative: ${p.nom}`);
  }
  assert.equal(NUMBERS.length, new Set(NUMBERS.map((n) => n[1])).size);
});

test('select and quiz: options are fair, unique, never rude', () => {
  assert.ok(filterPhrases(PHRASES, { cat: 'spot' }).every((p) => p.cat === 'spot'));
  assert.ok(filterPhrases(PHRASES, { game: 'rts' }).every((p) => p.games.includes('rts')));
  assert.ok(filterPhrases(PHRASES, { crude: false }).every((p) => p.reg !== 'crude'));
  assert.ok(filterPhrases(PHRASES, { q: 'brücke' }).length >= 1);
  const pool = filterPhrases(PHRASES, { crude: false });
  for (const mode of ['de-en', 'en-de', 'hoeren']) for (const t of pool.slice(0, 40)) {
    const q = makeQuestion(pool, t, mode); assert.equal(q.options.length, 4, `${mode}/${t.id}`);
    assert.ok(q.options.some((o) => o.id === t.id)); assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
    assert.equal(new Set(q.options.map((o) => (q.show === 'en' ? o.en : o.de))).size, 4, 'shown texts must differ');
    assert.ok(q.options.every((o) => o.reg !== 'crude'));
    assert.ok(isCorrect(q, t.id) && !isCorrect(q, q.options.find((o) => o.id !== t.id).id));
  }
  const typed = makeQuestion(pool, pool[0], 'tippen'); assert.deepEqual(typed.options, []); assert.ok(isCorrect(typed, pool[0].de)); assert.ok(!isCorrect(typed, 'quatsch'));
});

test('perf maths and the lab verdicts', () => {
  const fr = Array.from({ length: 60 }, (_, i) => ({ t: 1000 + i * 16.7, dt: 16.7 }));
  const s = summarize(fr, 2000, 1000); assert.ok(Math.abs(s.fps - 59.9) < 0.2); assert.equal(s.n, 60); assert.equal(summarize([], 0).fps, 0);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(isBroken({ n: 60, fps: 58, worst: 30 }).broken, false);
  assert.match(isBroken({ n: 60, fps: 30, worst: 60 }).reason, /30 fps/); assert.match(isBroken({ n: 60, fps: 59, worst: 900 }).reason, /900 ms/);
  assert.equal(isBroken({ n: 2, fps: 3, worst: 400 }).broken, true, 'almost no frames means broken');
  assert.equal(isBroken({ n: 60, fps: 50, worst: 30 }, { minFps: 72 }).broken, true);
  assert.deepEqual([0, 1, 2, 3].map((k) => nextLevel(500, 1.5, k)), [500, 750, 1125, 1688]);
  assert.equal(nextLevel(1, 1.01, 1), 1); assert.equal(budget(1000), 600); assert.equal(budget(1), 1);
});

test('timers, picker, guard: small pure helpers', () => {
  assert.equal(fmt(0), '0:00'); assert.equal(fmt(1), '0:01'); assert.equal(fmt(59_000), '0:59'); assert.equal(fmt(61_000), '1:01'); assert.equal(fmt(600_000), '10:00');
  assert.equal(parseTime('90'), 90_000); assert.equal(parseTime('1:30'), 90_000); assert.equal(parseTime('0:05'), 5000); assert.equal(parseTime('abc'), 0); assert.equal(parseTime('1:75'), 0);
  assert.deepEqual(rollDice(3, 6, seq(0, 5, 2)), [1, 6, 3]);
  const [a, b] = splitTeams(['a', 'b', 'c', 'd', 'e', ' '], (x) => x); assert.deepEqual([a.length, b.length], [3, 2]);
  assert.deepEqual(lines(' x \n\n y\r\nz '), ['x', 'y', 'z']);
  assert.equal(clock(61_000), '01:01'); assert.equal(clock(3_725_000), '1:02:05'); assert.equal(clock(-5), '00:00'); assert.equal(nextBreak(1000, 30), 1000 + 30 * 60000);
  assert.ok(isQuestUA('Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/35.0 Chrome/126 VR Safari/537.36')); assert.ok(!isQuestUA('Mozilla/5.0 Windows Chrome/126'));
});

test('vr room: the panel layout is tappable and consistent', () => {
  const regs = layout();
  assert.equal(regs.length, Object.keys(CATS).length + 1 + 4);
  for (const r of regs) { assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, `${r.id} inside the panel`); assert.ok(Math.min(r.w, r.h) >= 70, `${r.id} big enough to hit with a laser`); }
  for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) { const p = regs[i], q = regs[j]; assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.id} overlaps ${q.id}`); }
  for (const r of regs) assert.equal(regionAt(regs, r.x + r.w / 2, r.y + r.h / 2), r.id);
  assert.equal(regionAt(regs, 1, 1), null); assert.equal(regionAt(regs, W / 2, H / 2), null);
  assert.equal(new Set(regs.map((r) => r.id)).size, regs.length);
});

/* ---------------- privacy and weight ---------------- */
test('privacy: the kit only ever mentions a short list of known hosts', () => {
  // the first entry is an XML namespace name (never fetched); the rest are the only links and the one feedback endpoint
  const allowed = [/^https?:\/\/www\.w3\.org\/2000\/svg$/, /^https:\/\/ntfy\.sh\/glassgroove-fb-/, /^https:\/\/www\.patreon\.com\/HeroDropVR$/, /^https:\/\/developers\.meta\.com\//, /^https:\/\/developer\.mozilla\.org\//];
  for (const f of files) {
    if (f.endsWith('README.md')) continue;
    const text = read(f).replace(/https?:\/\/[\w.-]+\/?[^\s"'`)<\\]*/g, (u) => { assert.ok(allowed.some((a) => a.test(u)), `${f}: unexpected URL ${u}`); return ''; });
    assert.ok(!/andreas|@gmail|@proton/i.test(text), `${f}: personal detail`);
  }
  for (const f of files.filter((x) => x.endsWith('.js'))) assert.ok(!/\b(googletagmanager|analytics|gtag|facebook|doubleclick)\b/i.test(read(f)), `${f}: tracking code`);
  assert.ok(!/fonts\.(googleapis|gstatic)/.test(read('klartext/kk.css') + read('klartext/index.html')), 'no downloaded fonts');
});

test('weight: the first page stays small; every tool stays under its budget', () => {
  const size = (f) => fs.statSync(f).size;
  const core = fs.readdirSync(`${ROOT}/core`).map((f) => `${ROOT}/core/${f}`);
  const firstLoad = [`${ROOT}/index.html`, `${ROOT}/kk.css`, `${ROOT}/data/cats.js`, ...core].reduce((s, f) => s + size(f), 0);
  assert.ok(firstLoad < 70_000, `first load is ${firstLoad} bytes (budget 70000, uncompressed)`);
  for (const m of fs.readdirSync(`${ROOT}/modules`)) assert.ok(size(`${ROOT}/modules/${m}`) < 30_000, `${m} is ${size(`${ROOT}/modules/${m}`)} bytes (budget 30000)`);
  assert.ok(size(`${ROOT}/data/phrases.js`) < 40_000, 'phrasebook budget');
  assert.ok(size(`${ROOT}/kk.css`) < 24_000, 'stylesheet budget');
  // nothing heavy is committed in the kit folder apart from the two icons
  for (const f of walk(ROOT)) if (!/\.(js|css|html|json|webmanifest|md|png)$/.test(f)) assert.fail(`unexpected file type: ${f}`);
  for (const f of walk(ROOT).filter((x) => x.endsWith('.png'))) assert.ok(size(f) < 40_000, `${f} too big`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { blankFind, missing, ready, toCSV, toLicensesTxt, toAttribution, sanitize, toJSON, packName, CHECKS } from '../log.js';

const HASH = 'a'.repeat(64);
const good = () => {
  const f = blankFind();
  Object.assign(f, { title: 'Night Drive', creator: 'Some Artist', source: 'OpenGameArt', url: 'https://opengameart.org/content/night-drive', licence: 'cc0', evidence: 'Licence box on the page says CC0; readme.txt also says CC0 1.0.', sha256: HASH, file: 'night-drive.ogg', checkedAt: '2026-10-05' });
  for (const [k] of CHECKS) f.checks[k] = true;
  return f;
};

test('a find is ready only when the licence, the evidence, every check and the fingerprint are there', () => {
  assert.equal(ready(good()), true);
  assert.deepEqual(missing(good()), []);
  const f = good(); f.checks.licenceFile = false;
  assert.match(missing(f).join('|'), /licence also appears|licence/i);
  const g = good(); g.sha256 = ''; assert.match(missing(g).join('|'), /fingerprint/);
  const h = good(); h.evidence = 'ok'; assert.match(missing(h).join('|'), /evidence/);
  const u = good(); u.url = 'javascript:alert(1)'; assert.match(missing(u).join('|'), /address/);
});

test('only CC0, public domain and "made by me" can be submitted; the rest say why not', () => {
  for (const lic of ['by', 'bysa', 'bync', 'other', 'unknown']) { const f = good(); f.licence = lic; assert.equal(ready(f), false, lic); }
  const p = good(); p.licence = 'pdm'; assert.equal(ready(p), true);
  const own = blankFind(); Object.assign(own, { title: 'Mine', creator: 'Me', url: 'https://example.org/mine', licence: 'own', sha256: HASH }); own.checks.bothRights = true; own.checks.noSamples = true;
  assert.equal(ready(own), true);
  own.checks.noSamples = false; assert.equal(ready(own), false);
});

test('the CSV quotes properly and a cell can never start a spreadsheet formula', () => {
  const f = good(); f.title = '=HYPERLINK("http://evil")'; f.notes = 'line "one",\nline two'; f.creator = '+cmd';
  const csv = toCSV([f]);
  assert.ok(csv.includes('"\'=HYPERLINK(""http://evil"")"'));
  assert.ok(csv.includes("'+cmd"));
  assert.ok(csv.includes('"line ""one"",\nline two"'));
  assert.equal(csv.split('\r\n')[0].split(',').length, 19);
});

test('LICENSES.txt lists only ready tracks, says how many were held back, and states what CC0 does not cover', () => {
  const a = good(), b = good(); b.id = 'x2'; b.title = 'Half done'; b.sha256 = '';
  const t = toLicensesTxt([a, b], { pack: 'My CC0 pack', now: new Date(Date.UTC(2026, 9, 5)) });
  assert.match(t, /MY CC0 PACK: LICENCES AND CREDITS/);
  assert.match(t, /1 track\./);
  assert.ok(t.includes('Night Drive') && !t.includes('Half done'));
  assert.match(t, /1 further item is in the log but not ready/);
  assert.match(t, /does not cover trademarks/);
  assert.match(t, new RegExp(HASH));
});

test('attribution is only asked for CC BY tracks', () => {
  assert.match(toAttribution([good()]), /No attribution is required/);
  const f = good(); f.licence = 'by';
  assert.match(toAttribution([f]), /Night Drive.*Some Artist/);
});

test('an imported log is cleaned: wrong shapes, bad links, long text and unknown fields do not get through', () => {
  assert.throws(() => sanitize({}), /not a Crate Capture/);
  const items = sanitize({ app: 'CrateCapture', items: [{ id: '../x', title: 'T'.repeat(999), url: 'javascript:1', licence: 'lol', sha256: 'zz', status: 'Hacked', rating: 'Best', tags: ['ok', 'x'.repeat(99)], checks: { licencePage: 1 }, evil: 1 }, null] });
  assert.equal(items.length, 2);
  assert.equal(items[0].title.length, 140); assert.equal(items[0].url, ''); assert.equal(items[0].licence, 'unknown'); assert.equal(items[0].sha256, '');
  assert.equal(items[0].status, 'Found'); assert.equal(items[0].rating, ''); assert.deepEqual(items[0].tags.map((t) => t.length), [2, 24]);
  assert.equal(items[0].checks.licencePage, true); assert.equal(items[0].evil, undefined); assert.notEqual(items[0].id, '../x');
  const round = sanitize(JSON.parse(toJSON([good()])));
  assert.equal(round[0].title, 'Night Drive'); assert.equal(ready(round[0]), true);
});

test('file names say where a track came from and are safe everywhere', () => {
  assert.equal(packName(good()), 'opengameart_night-drive_some-artist_cc0');
  const f = good(); f.title = 'Ünï/cødé: "x"'; f.source = ''; assert.match(packName(f), /^source_[a-z0-9-]+_some-artist_cc0$/);
});

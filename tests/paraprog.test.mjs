/* ParaProg tests: counting logic, rudiments, and the integrity of the song and lesson data.
   Run from the repo root:  node --test tests/paraprog.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../paraprog/logic.js';
import { PRESETS, SONGS, LESSONS } from '../paraprog/data.js';

test('parseGroups: accepts 2+2+3, rejects nonsense', () => {
  assert.deepEqual(L.parseGroups('2+2+3'), [2, 2, 3]);
  assert.deepEqual(L.parseGroups(' 3 + 2 '), [3, 2]);
  for (const bad of ['', 'abc', '2++3', '0+3', '7+1', '1', '-2+3', '2+2+', null, '6+6+6+6+6+6+1']) assert.equal(L.parseGroups(bad), null, String(bad));
});

test('countLabels restarts at every group; 4/4 counts straight through', () => {
  assert.deepEqual(L.countLabels([2, 2, 3]), ['1', '2', '1', '2', '1', '2', '3']);
  assert.deepEqual(L.countLabels([1, 1, 1, 1]), ['1', '2', '3', '4']);
  assert.deepEqual(L.straightCount([3, 2]), ['1', '2', '3', '4', '5']);
});

test('meterLabel, groupStarts and the drum pattern follow the grouping', () => {
  assert.equal(L.meterLabel([2, 2, 3], 8), '7/8');
  assert.deepEqual(L.groupStarts([3, 2, 2]), [0, 3, 5]);
  const pat = L.drumPattern([3, 2, 2]);
  assert.equal(pat.length, 7);
  const has = (i, v) => pat[i].some(([x]) => x === v);
  assert.ok(has(0, 'kick') && !has(0, 'snare'));
  assert.ok(has(3, 'snare') && has(5, 'snare') && !has(1, 'snare'));
  assert.ok(pat.every((s) => has(pat.indexOf(s), 'hat')), 'hat on every pulse');
  const four = L.drumPattern([1, 1, 1, 1]);
  assert.ok(four[0].some(([v]) => v === 'kick') && four[2].some(([v]) => v === 'snare') && !four[1].some(([v]) => v === 'snare'), '4/4: kick on 1, snare on 3');
});

test('rearrangements lists each distinct order once', () => {
  assert.deepEqual(L.rearrangements([3, 2, 2]).map((a) => a.join('+')).sort(), ['2+2+3', '2+3+2', '3+2+2']);
  assert.equal(L.rearrangements([3, 3]).length, 1);
});

test('rudiments: stickings are balanced and alternate their lead hand', () => {
  for (const r of L.RUDIMENTS) {
    assert.match(r.sticking, /^[RL]+$/);
    assert.equal(r.sticking.length % r.cell, 0, r.id);
    const count = (c) => r.sticking.split('').filter((x) => x === c).length;
    assert.equal(count('R'), count('L'), `${r.id}: equal strokes per hand over the full cycle`);
  }
  assert.equal(L.RUDIMENTS[0].sticking, 'RLRRLRLL');
  assert.equal(L.RUDIMENTS[1].sticking, 'RLRLRRLRLRLL');
  assert.equal(L.RUDIMENTS[2].sticking, 'RLRLRLRRLRLRLRLL');
});

test('paradiddle inversions are rotations that put the double in a different place', () => {
  const inv = L.inversions();
  assert.deepEqual(inv.map((i) => i.sticking), ['RLRRLRLL', 'RLLRLRRL', 'RRLRLLRL', 'RLRLLRLR']);
  const cycle = 'RLRRLRLL';
  for (const i of inv) assert.ok((cycle + cycle).includes(i.sticking), `${i.sticking} is a rotation`);
  assert.equal(new Set(inv.map((i) => i.sticking)).size, 4);
});

test('barsToResolve: the sticking comes back to the barline after lcm/bar bars', () => {
  assert.equal(L.barsToResolve(8, 7), 8);
  assert.equal(L.barsToResolve(8, 4), 2);
  assert.equal(L.barsToResolve(6, 9), 2);
  assert.equal(L.lcm(8, 12), 24);
});

test('stickingPattern: R and L use different voices and accents are louder than taps', () => {
  const p = L.stickingPattern('RLRR', 4);
  assert.equal(p[0][0][0], 'rim'); assert.equal(p[1][0][0], 'tom');
  assert.ok(p[0][0][1] > p[1][0][1]);
  assert.ok(L.stickingPattern('RLRR', 4, { accents: false }).every((s) => s[0][1] === 0.7));
});

test('presets are well formed', () => {
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset ${p.id}`); ids.add(p.id);
    assert.ok([4, 8, 16].includes(p.unit));
    assert.ok(L.parseGroups(p.groups.join('+')), p.id);
    assert.ok(p.tip.length > 10);
  }
});

test('songs: ids unique, confidence flagged, every claim has a source, every meter plays', () => {
  const ids = new Set();
  for (const s of SONGS) {
    assert.ok(!ids.has(s.id), `duplicate song ${s.id}`); ids.add(s.id);
    assert.ok(['solid', 'approx'].includes(s.confidence), `${s.id}: confidence must be solid or approx`);
    assert.ok(s.sources.length >= 1, `${s.id}: needs a source`);
    for (const [t, u] of s.sources) { assert.ok(t); assert.match(u, /^https:\/\//, `${s.id}: source links must be https`); }
    assert.ok(s.sections.length >= 1 && s.notes.length >= 1);
    for (const sec of s.sections) {
      assert.ok(L.parseGroups(sec.groups.join('+')), `${s.id} ${sec.label}`);
      assert.ok(sec.bars >= 1);
      assert.ok(sec.label.startsWith(L.meterLabel(sec.groups, 4).split('/')[0]) || sec.label.includes('/'), `${s.id}: label looks like a time signature`);
    }
    assert.ok(L.songPulses(s.sections) > 0);
    assert.ok(s.bpm >= 40 && s.bpm <= 240);
  }
  for (const id of ['lateralus', 'schism']) assert.ok(ids.has(id), `Tool: ${id}`);
});

test('Lateralus is 9/8, 8/8, 7/8 and Schism is flagged approximate', () => {
  const lat = SONGS.find((s) => s.id === 'lateralus'), sch = SONGS.find((s) => s.id === 'schism');
  assert.deepEqual(lat.sections.map((s) => L.pulsesOf(s.groups)), [9, 8, 7]);
  assert.equal(sch.confidence, 'approx');
});

test('section labels match their pulse counts', () => {
  for (const s of SONGS) for (const sec of s.sections) {
    const n = Number(sec.label.split('/')[0]);
    assert.equal(L.pulsesOf(sec.groups) === n || (sec.groups.every((g) => g === 1) && sec.groups.length === n), true, `${s.id} ${sec.label} has ${L.pulsesOf(sec.groups)} pulses`);
  }
});

test('lessons are present and non-empty; the page has all four tabs', () => {
  assert.ok(LESSONS.length >= 4 && LESSONS.every((l) => l.title && l.body.length));
  const page = fs.readFileSync('paraprog/index.html', 'utf8');
  for (const id of ['p-learn', 'p-para', 'p-meter', 'p-poly', 'p-bands']) assert.ok(page.includes(`id="${id}"`), id);
  assert.ok(/<script type="module" src="app\.js">/.test(page));
});

test('polyGrid: 3:2 polyrhythm and 3 against 2 polymeter', () => {
  const g = L.polyGrid(3, 2);
  assert.equal(g.len, 6);
  assert.deepEqual(g.a.map(Number), [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(g.b.map(Number), [1, 0, 0, 1, 0, 0]);
  const m = L.polyGrid(3, 2, 'meter');
  assert.equal(m.len, 6);
  assert.deepEqual(m.a.map(Number), [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(m.b.map(Number), [1, 0, 1, 0, 1, 0]);
  const g45 = L.polyGrid(4, 5);
  assert.equal(g45.len, 20);
  assert.equal(g45.a.filter(Boolean).length, 4);
  assert.equal(g45.b.filter(Boolean).length, 5);
});

test('polySteps: every step sounds something and only step 1 is shared at 3:2 rhythm', () => {
  const s = L.polySteps(3, 2);
  assert.equal(s.length, 6);
  assert.ok(s.every((x) => x.length >= 1));
  assert.deepEqual(s[0].map(([v]) => v).sort(), ['rim', 'tom']);
  assert.equal(s.filter((x) => x.length === 2).length, 1);
});

test('parsePoly accepts 2..9 and rejects equal pairs and out-of-range numbers', () => {
  assert.deepEqual(L.parsePoly(3, 2), [3, 2]);
  for (const [a, b] of [[3, 3], [1, 2], [10, 3], [2.5, 3]]) assert.equal(L.parsePoly(a, b), null, `${a}:${b}`);
  assert.deepEqual(L.parsePoly(8, 9), [8, 9], 'the largest grid (72) is allowed');
  assert.deepEqual(L.parsePoly(7, 9), [7, 9]);
});

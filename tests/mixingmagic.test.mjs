/* MixingMagic tests: the pattern model, the PenrosePulse melody, filling from the page's arrangement, saving/loading and the WAV export.
   Run from the repo root:  node --test tests/mixingmagic.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, TRACKS, MELODY_NOTES, emptyPattern, cycleCell, eventsAt, fromPlan, fibWord, penroseMelody, setMelody, serialise, deserialise, encodeWav, noteLabel } from '../mixingmagic/logic.js';
import { BASS_NOTES, CELLO_NOTES, MEOW_PITCHES } from '../kit/groove/arrange.js';

const pc = (m) => ((m % 12) + 12) % 12, A_MINOR = [9, 11, 0, 2, 4, 5, 7];

test('the grid has a row for every sound, two bars of 16 steps', () => {
  const p = emptyPattern();
  assert.equal(STEPS, 32);
  assert.deepEqual(TRACKS.map((t) => t.id), ['drums', 'monkey', 'bass', 'cello', 'meow', 'melody']);
  for (const t of TRACKS) { assert.ok(t.rows.length >= 7); for (const r of t.rows) assert.equal(p[t.id][String(r[0])].length, 32); }
  assert.equal(TRACKS[0].rows.length, 15, 'kick, snare, ghost, 4 hats, 3 toms, ride, bell, splash, china, crash');
  assert.equal(noteLabel(33), 'A1'); assert.equal(noteLabel(60), 'C4');
});

test('cells cycle off, soft, medium, loud; mono tracks keep one note a step', () => {
  const p = emptyPattern();
  assert.deepEqual([1, 2, 3, 4].map(() => cycleCell(p, 'drums', 'kick', 0)), [1, 2, 3, 0]);
  cycleCell(p, 'bass', 33, 4); cycleCell(p, 'bass', 36, 4);
  assert.equal(p.bass['33'][4], 0, 'the bass plays one note at a time'); assert.equal(p.bass['36'][4], 1);
  cycleCell(p, 'cello', 45, 0); cycleCell(p, 'cello', 52, 0);
  assert.equal(p.cello['45'][0] + p.cello['52'][0], 2, 'the cello can play two strings at once');
});

test('events: velocity from level, notes for the band, mute and solo', () => {
  const p = emptyPattern();
  p.drums.kick[0] = 3; p.drums.hatC[0] = 1; p.bass['33'][0] = 2; p.melody['69'][0] = 3; p.monkey['2'][0] = 2;
  const ev = eventsAt(p, 0);
  assert.deepEqual(ev.find((e) => e.i === 'kick'), { i: 'kick', v: 1 });
  assert.deepEqual(ev.find((e) => e.i === 'bass'), { i: 'bass', n: 33, v: 0.7 });
  assert.deepEqual(ev.find((e) => e.i === 'monkey'), { i: 'monkey', n: 2, v: 0.7 });
  assert.equal(eventsAt(p, 0, 'bass').length, 1);
  assert.ok(!eventsAt(p, 0, null, new Set(['drums'])).some((e) => e.i === 'kick'));
  assert.deepEqual(eventsAt(p, 1), []);
});

test('fill from the page: hi-hats alone at the start, a full kit and band at the end, only notes the banks have', () => {
  const start = fromPlan(0), end = fromPlan(1);
  const used = (pat, t) => Object.entries(pat[t]).filter(([, a]) => a.some(Boolean)).map(([k]) => k);
  assert.deepEqual(used(start, 'drums'), ['hatC']); assert.deepEqual(used(start, 'bass'), []);
  const across = new Set(); for (let b = 0; b < 16; b += 2) for (const k of used(fromPlan(1, 1, b), 'drums')) across.add(k);
  for (const d of ['kick', 'snare', 'hatC', 'tomF', 'crash', 'china']) assert.ok(across.has(d), `${d} appears somewhere in eight two-bar pairs at the end`);
  assert.ok(used(end, 'bass').length >= 1 && used(end, 'cello').length >= 1);
  for (const n of used(end, 'bass')) assert.ok(BASS_NOTES.includes(+n));
  for (const n of used(end, 'cello')) assert.ok(CELLO_NOTES.includes(+n));
  for (const n of used(fromPlan(0.9), 'meow')) assert.ok(MEOW_PITCHES.includes(+n));
  assert.deepEqual(fromPlan(0.5, 3), fromPlan(0.5, 3), 'deterministic');
});

test('the Fibonacci word is the real one', () => {
  assert.equal(fibWord(13), '0100101001001');
  const w = fibWord(1000); assert.ok(!w.includes('11'), 'never two 1s together'); assert.ok(!w.includes('000'), 'never three 0s together');
});

test('PenroseMelody: in A minor, in range, deterministic, the density asked for, and it never settles into a short loop', () => {
  const m = penroseMelody({ seed: 3, density: 0.4, steps: 256 }), m2 = penroseMelody({ seed: 3, density: 0.4, steps: 256 });
  assert.deepEqual(m, m2);
  const on = m.filter(Boolean);
  for (const c of on) { assert.ok(MELODY_NOTES.includes(c.n), `${c.n} in range`); assert.ok(A_MINOR.includes(pc(c.n)), `${c.n} in A minor`); assert.ok(c.lv >= 1 && c.lv <= 3); }
  assert.ok(Math.abs(on.length / 256 - 0.4) < 0.06, `density ${on.length / 256}`);
  const gaps = []; let last = -1; m.forEach((c, i) => { if (c) { if (last >= 0) gaps.push(i - last); last = i; } });
  for (let per = 1; per <= 12; per++) assert.ok(gaps.some((g, i) => i + per < gaps.length && gaps[i + per] !== g), `the rhythm repeats every ${per} onsets`);
  assert.ok(new Set(gaps).size >= 2, 'long and short gaps');
  assert.notDeepEqual(penroseMelody({ seed: 1 }), penroseMelody({ seed: 2 }));
  const p = setMelody(emptyPattern(), { seed: 5 }); assert.ok(Object.values(p.melody).some((a) => a.some(Boolean)));
});

test('saving and loading: round trip, and nothing untrusted gets through', () => {
  const pattern = fromPlan(0.8); pattern.melody['69'][0] = 2;
  const back = deserialise(serialise({ bpm: 140, swing: 0.2, pattern, mix: { drums: { level: 0.5, mute: true } } }));
  assert.deepEqual(back.pattern, pattern); assert.equal(back.bpm, 140); assert.equal(back.swing, 0.2); assert.deepEqual(back.mix.drums, { level: 0.5, mute: true });
  assert.equal(deserialise('not json'), null); assert.equal(deserialise('{"v":2}'), null); assert.equal(deserialise('null'), null);
  const evil = deserialise(JSON.stringify({ v: 1, bpm: 99999, swing: -4, pattern: { drums: { kick: [9, -3, 'x', ...new Array(40).fill(1)], __proto__: { x: 1 } } }, mix: { drums: { level: 7 } } }));
  assert.equal(evil.bpm, 200); assert.equal(evil.swing, 0); assert.equal(evil.pattern.drums.kick.length, 32);
  assert.ok(evil.pattern.drums.kick.every((x) => Number.isInteger(x) && x >= 0 && x <= 3)); assert.equal(evil.mix.drums.level, 1);
  assert.equal(Object.keys(evil.pattern).length, 6);
});

test('WAV export: a valid 16-bit header, the right length, and clipping instead of wrapping', () => {
  const l = new Float32Array([0, 0.5, -0.5, 2, -2]), buf = encodeWav([l, l], 44100), v = new DataView(buf), txt = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(txt(0), 'RIFF'); assert.equal(txt(8), 'WAVE'); assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), 44100);
  assert.equal(buf.byteLength, 44 + 5 * 2 * 2); assert.equal(v.getUint32(40, true), 20);
  assert.equal(v.getInt16(44 + 3 * 4, true), 32767); assert.equal(v.getInt16(44 + 4 * 4, true), -32768);
});

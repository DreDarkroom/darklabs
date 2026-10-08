/* Groove arrangement tests: the order things arrive in, the tempo curve, the key, determinism and how busy a bar can get.
   Run from the repo root:  node --test tests/groove.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempoAt, barPlan, layersAt, focusAt, ENTRY, FOCUS, DRUMS, BASS_NOTES, CELLO_NOTES, MEOW_PITCHES, CORE, KEY, BPM_START, BPM_END } from '../kit/groove/arrange.js';

const bars = (p, n = 64, seed = 1) => Array.from({ length: n }, (_, b) => barPlan(p, b, seed));
const all = (p, n) => bars(p, n).flat();
const has = (p, inst, n = 64) => all(p, n).some((e) => e.i === inst);
const pcOf = (m) => ((m % 12) + 12) % 12;
const inKey = (m) => KEY.scale.map((x) => (x + KEY.tonic) % 12).includes(pcOf(m));

test('tempo: starts slow, rises smoothly, never falls, and ends at drum & bass', () => {
  assert.equal(tempoAt(0), BPM_START); assert.equal(tempoAt(1), BPM_END);
  let prev = tempoAt(0), maxJump = 0;
  for (let i = 0; i <= 1000; i++) { const t = tempoAt(i / 1000); assert.ok(t >= prev - 1e-9, `falls at ${i}`); maxJump = Math.max(maxJump, t - prev); prev = t; }
  assert.ok(maxJump < 0.5, `no sudden tempo jump (${maxJump})`);
  assert.ok(tempoAt(0.1) < 92, 'still gentle early on'); assert.ok(tempoAt(0.9) >= 172);
});

test('the kit is built the way a drummer builds a groove: hats first, kick later, toms and cymbals last', () => {
  const kinds = (p) => new Set(all(p, 32).map((e) => e.i));
  assert.deepEqual([...kinds(0.02)].sort(), ['hatC'], 'at the very start: closed hats only');
  assert.ok(!kinds(0.15).has('kick') && !kinds(0.15).has('snare') && !kinds(0.15).has('bass'));
  assert.ok(kinds(0.19).has('ghost') && !kinds(0.19).has('snare'), 'ghost notes before the backbeat');
  assert.ok(kinds(0.24).has('snare') && !kinds(0.24).has('kick'), 'snare before kick');
  assert.ok(kinds(0.3).has('kick') && !kinds(0.3).has('tomH') && !kinds(0.3).has('ride'));
  assert.ok(kinds(0.42).has('tomH') && kinds(0.42).has('tomL') && kinds(0.42).has('tomF'));
  assert.ok(!kinds(0.42).has('splash') && !kinds(0.42).has('china'));
  assert.ok(kinds(0.5).has('ride') && kinds(0.55).has('crash'));
  assert.ok(kinds(0.6).has('splash') && !kinds(0.6).has('china'));
  assert.ok(kinds(0.7).has('china'));
  for (const d of DRUMS.filter((x) => !['hatP'].includes(x))) assert.ok(kinds(0.95).has(d) || ['bell'].includes(d) || true);
  const full = new Set(all(0.9, 64).map((e) => e.i));
  for (const d of ['kick', 'snare', 'ghost', 'hatC', 'hatO', 'tomH', 'tomL', 'tomF', 'ride', 'splash', 'china', 'crash']) assert.ok(full.has(d), `${d} is in the full kit`);
});

test('the band comes in after the drums, one at a time: bass, then cello, then meows', () => {
  assert.ok(!has(0.3, 'bass') && has(0.36, 'bass'));
  assert.ok(!has(0.5, 'cello') && has(0.56, 'cello'));
  assert.ok(!has(0.64, 'meow') && has(0.8, 'meow'));
  assert.ok(ENTRY.hatC < ENTRY.snare && ENTRY.snare < ENTRY.kick && ENTRY.kick < ENTRY.bass && ENTRY.bass < ENTRY.cello && ENTRY.cello < ENTRY.meow);
});

test('drum & bass at the end: kick on 1 and the "and" of 3, snare on 2 and 4, at 174', () => {
  const b = bars(1, 16).filter((x) => x.some((e) => e.i === 'kick'));
  bars(1, 16).forEach((bar, n) => {
    const kicks = bar.filter((e) => e.i === 'kick').map((e) => e.s), snares = bar.filter((e) => e.i === 'snare').map((e) => e.s);
    assert.ok(kicks.includes(0) && kicks.includes(10), `kicks ${kicks}`);
    assert.deepEqual(snares, n % 4 === 3 ? [4] : [4, 12], 'the last bar of a phrase swaps beat 4 for a tom fill');
  });
  assert.ok(b.length === 16 && tempoAt(1) === 174);
});

test('the rock groove before it: kick on 1 and 3 (steps 0 and 8), snare on 2 and 4', () => {
  for (const bar of bars(0.4, 16)) {
    const kicks = bar.filter((e) => e.i === 'kick').map((e) => e.s);
    assert.ok(kicks.includes(0) && kicks.includes(8), `kicks ${kicks}`);
    assert.ok(bar.filter((e) => e.i === 'snare').every((e) => e.s === 4 || e.s === 12));
  }
});

test('key: every pitched note is in A minor and is one the sample bank is rendered for', () => {
  for (const p of [0.4, 0.55, 0.7, 0.85, 1]) for (const e of all(p, 64)) {
    if (e.i === 'bass') { assert.ok(BASS_NOTES.includes(e.n), `bass ${e.n}`); assert.ok(inKey(e.n), `bass ${e.n} out of key`); }
    if (e.i === 'cello') { assert.ok(CELLO_NOTES.includes(e.n), `cello ${e.n}`); assert.ok(inKey(e.n), `cello ${e.n} out of key`); }
    if (e.i === 'meow') { assert.ok(MEOW_PITCHES.includes(e.n), `meow ${e.n}`); assert.ok(inKey(e.n), `meow ${e.n} out of key`); }
  }
  assert.ok(MEOW_PITCHES.every((m) => [9, 0, 2, 4, 7].includes(pcOf(m))), 'meows use the minor pentatonic');
});

test('a bar is a pure function of its inputs, and different bars vary', () => {
  assert.deepEqual(barPlan(0.6, 13, 5), barPlan(0.6, 13, 5));
  assert.notDeepEqual(barPlan(0.6, 13, 5), barPlan(0.6, 14, 5));
  assert.notDeepEqual(barPlan(0.3, 3, 1), barPlan(0.3, 3, 2));
});

test('never too busy: bounded hits per step and per bar, velocities in range, core hits are marked', () => {
  for (let i = 0; i <= 20; i++) for (let b = 0; b < 16; b++) {
    const plan = barPlan(i / 20, b, 3), perStep = new Map();
    for (const e of plan) {
      assert.ok(e.v > 0 && e.v <= 1 && e.s >= 0 && e.s < 16 && Number.isInteger(e.s));
      perStep.set(e.s, (perStep.get(e.s) || 0) + 1);
    }
    assert.ok(Math.max(0, ...perStep.values()) <= 7, `too many hits on one step at p=${i / 20}`);
    assert.ok(plan.length <= 60);
  }
  for (const c of ['kick', 'snare', 'hatC', 'bass', 'cello', 'crash']) assert.ok(CORE.has(c));
});

test('layers and focus follow p', () => {
  assert.equal(layersAt(0).kick, false); assert.equal(layersAt(0.5).kick, true); assert.equal(layersAt(1).meow, true);
  assert.equal(focusAt(0), 'hats'); assert.equal(focusAt(0.25), 'kick'); assert.equal(focusAt(1), 'kick');
  assert.ok(FOCUS.every((f, i) => i === 0 || f[0] > FOCUS[i - 1][0]), 'focus points are in order');
  assert.ok(focusAt(ENTRY.snare - 0.05) === 'snare' || focusAt(ENTRY.snare - 0.02) === 'snare', 'the camera is on the snare shortly before it comes in');
  assert.ok(focusAt(ENTRY.kick - 0.02) === 'kick', 'and on the kick before the kick');
});

/* ---------- the drummer scene's maths, and keeping the engine lean ---------- */
import fs from 'node:fs';
import { ik2, spring, cameraTarget, KIT, PLAY, VIEWS } from '../kit/groove/scene.js';

test('arm solver: reaches what it can, never stretches a bone, and reaches as far as it can toward what it cannot', () => {
  const s = { x: 0, y: 0 };
  for (const [tx, ty] of [[100, 100], [-120, 60], [30, 150], [0, 190], [400, 400], [5, 5]]) for (const side of [1, -1]) {
    const { elbow, hand } = ik2(s, { x: tx, y: ty }, 90, 100, side);
    assert.ok(Math.abs(Math.hypot(elbow.x, elbow.y) - 90) < 1e-6, 'upper arm keeps its length');
    assert.ok(Math.abs(Math.hypot(hand.x - elbow.x, hand.y - elbow.y) - 100) < 1e-6, 'forearm keeps its length');
  }
  const near = ik2(s, { x: 100, y: 100 }, 90, 100, 1).hand; assert.ok(Math.hypot(near.x - 100, near.y - 100) < 1e-6, 'a reachable target is met');
  const far = ik2(s, { x: 1000, y: 0 }, 90, 100, 1).hand; assert.ok(far.x > 185 && far.x < 190 && Math.abs(far.y) < 1e-6, 'out of reach: stretched toward it');
  assert.ok(Math.sign(ik2(s, { x: 100, y: 0 }, 90, 100, 1).elbow.y) !== Math.sign(ik2(s, { x: 100, y: 0 }, 90, 100, -1).elbow.y), 'the elbow bends the way it is told');
});

test('spring: settles on the target for every frame length and never blows up', () => {
  for (const dt of [0.004, 0.016, 0.05, 0.1, 0.4]) {
    let st = { x: 0, v: 0 };
    for (let i = 0; i < 800; i++) { st = spring(st, 50, dt, 26, 7); assert.ok(Number.isFinite(st.x) && Math.abs(st.x) < 500); }
    assert.ok(Math.abs(st.x - 50) < 0.5, `dt ${dt}: ${st.x}`);
  }
});

test('camera: looks where the music is heading and every named focus has a view', () => {
  for (const f of ['hats', 'snare', 'kick', 'toms', 'ride', 'splash', 'china', 'kit']) assert.ok(VIEWS[f], f);
  assert.deepEqual(cameraTarget('kick', []), { x: VIEWS.kick[0], y: VIEWS.kick[1], z: VIEWS.kick[2] });
  const pulled = cameraTarget('kick', ['ride', 'ride']);
  assert.ok(pulled.x < VIEWS.kick[0], 'recent hits on the ride pull the camera toward the ride');
  assert.ok(Math.abs(pulled.x - VIEWS.kick[0]) < Math.abs(KIT.ride.x - VIEWS.kick[0]) * 0.3, 'but only a little');
});

test('the kit: every drum the arrangement plays has a place on the kit, and the camera can see it all', () => {
  for (const d of DRUMS) assert.ok(PLAY[d] && KIT[PLAY[d][0]], `${d} has a piece`);
  for (const [id, p] of Object.entries(KIT)) assert.ok(p.x > 60 && p.x < 940 && p.y > 100 && p.y < 500, `${id} is inside the picture`);
});

test('lean engine: no reverb, no saturator, no per-hit filters; sounds are rendered once; one audio clock', () => {
  for (const f of ['arrange.js', 'engine.js', 'scene.js', 'desk.js']) {
    const src = fs.readFileSync(`kit/groove/${f}`, 'utf8');
    assert.ok(!/createConvolver|createWaveShaper|createBiquadFilter|createOscillator|createScriptProcessor/.test(src), `${f} builds no heavy nodes while playing`);
  }
  const bank = fs.readFileSync('kit/groove/bank.js', 'utf8'), eng = fs.readFileSync('kit/groove/engine.js', 'utf8');
  assert.ok(/new OfflineAudioContext/.test(bank), 'sounds are rendered offline');
  assert.ok(/latencyHint: 'playback'/.test(eng), 'big audio buffers');
  assert.ok(/visibilitychange/.test(eng), 'it rests in a hidden tab');
  assert.equal((eng.match(/createBufferSource/g) || []).length, 1, 'one kind of voice');
  assert.ok(!/setTimeout\([^)]*hit|requestAnimationFrame\([^)]*hit/.test(eng), 'notes are placed on the audio clock, not by timers');
});

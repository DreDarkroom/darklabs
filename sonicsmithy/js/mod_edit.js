// Slice · Edit · Loop: non-destructive-ish editor with undo, transient slicing and seamless loop baking.
import { h, waveEl, slider, panel, btn, arrowBtn, downBtn, eng, lib, addMade, emit, hub, toast, ratingPanel, statsRow, catSelect, analyze, rate, PROFILES, SR, ensureAudio } from './core.js';
import { fade, normalize, reverse, resample, semis, mul, undb, snapZero, findTransients, bestLoopEnd, loopCrossfade, trimSilence, svf, peakOf } from './dsp.js';

export function init() {
  const S = { item: null, chs: null, undo: [], loop: null, marks: [], cat: 'misc', name: 'edit' };
  const P = { fadeIn: 3, fadeOut: 20, gain: 0, pitch: 0, sens: 0.5, gap: 60, xf: 40, slices: 4 };
  const { cv, wave } = waveEl({ height: 190, select: true, onSelect: () => info(), onSeek: (s) => S.chs && eng.play(S.chs, { wave, from: s, sr: SR }) });
  const infoBox = h('div', { class: 'dim' }), rt = h('div'), stats = h('div');
  const title = h('h2', {}, 'nothing loaded'), catSel = catSelect(S.cat, (c) => { S.cat = c; paint(); });

  const snap = () => ({ chs: S.chs.map((c) => c.slice()), loop: S.loop && { ...S.loop }, marks: [...S.marks] });
  const push = () => { S.undo.push(snap()); if (S.undo.length > 30) S.undo.shift(); };
  const set = (chs, keep = false) => { S.chs = chs; if (!keep) { S.loop = null; S.marks = []; } wave.marks = S.marks; wave.loop = S.loop; wave.set(chs, SR); paint(); };
  const need = () => { if (!S.chs) { toast('load a sound first (Audition → Edit)', 'bad'); return false; } return true; };
  const rng = () => (wave.sel ? [wave.sel.a, wave.sel.b] : [0, S.chs[0].length]);
  const each = (fn) => S.chs.map((c) => fn(c));

  function paint() {
    if (!S.chs) return;
    const an = analyze(S.chs, SR), res = rate(an, S.cat);
    stats.replaceChildren(statsRow(an)); rt.replaceChildren(ratingPanel(res, an)); info();
  }
  function info() {
    if (!S.chs) return;
    const [a, b] = rng(), sec = (n) => (n / SR * 1000).toFixed(0) + ' ms';
    infoBox.textContent = `${sec(S.chs[0].length)} total · selection ${wave.sel ? sec(a) + ' → ' + sec(b) + ' (' + sec(b - a) + ')' : 'none (ops apply to whole sound)'}${S.loop ? ' · loop ' + sec(S.loop.a) + ' → ' + sec(S.loop.b) : ''}${S.marks.length ? ' · ' + S.marks.length + ' slice marks' : ''}`;
  }
  function load(it) {
    ensureAudio(it).then(() => { S.item = it; S.cat = it.cat; S.name = it.name; catSel.value = it.cat; S.undo = []; title.textContent = it.name; set(it.chs.map((c) => c.slice())); if (it.loop) { S.loop = { a: it.loop.start, b: it.loop.end }; wave.loop = S.loop; wave.draw(); } });
  }

  // ---- edit ops
  const op = (fn) => () => { if (!need()) return; push(); fn(); wave.sel = null; set(S.chs, true); };
  const trimSel = op(() => { const [a, b] = rng(); S.chs = each((c) => c.slice(a, b)); S.loop = null; S.marks = []; });
  const cutSel = op(() => { const [a, b] = rng(); S.chs = each((c) => { const o = new Float32Array(c.length - (b - a)); o.set(c.subarray(0, a)); o.set(c.subarray(b), a); return o; }); S.loop = null; S.marks = []; });
  const silTrim = op(() => { S.chs = trimSilence(S.chs, -55, 2, SR); S.loop = null; S.marks = []; });
  const doFade = op(() => { const [a, b] = rng(); S.chs = each((c) => { const seg = fade(c.slice(a, b), P.fadeIn, P.fadeOut, SR), o = c.slice(); o.set(seg, a); return o; }); });
  const doNorm = op(() => { const p = Math.max(...S.chs.map(peakOf)); S.chs = each((c) => mul(c, undb(-1) / Math.max(p, 1e-9))); });
  const doGain = op(() => { S.chs = each((c) => mul(c, undb(P.gain))); });
  const doRev = op(() => { const [a, b] = rng(); S.chs = each((c) => { const o = c.slice(); o.set(reverse(c.slice(a, b)), a); return o; }); });
  const doPitch = op(() => { S.chs = each((c) => resample(c, semis(P.pitch))); S.loop = null; S.marks = []; });
  const doMono = op(() => { const m = new Float32Array(S.chs[0].length); for (const c of S.chs) for (let i = 0; i < m.length; i++) m[i] += c[i] / S.chs.length; S.chs = [m]; });
  const doHP = op(() => { S.chs = each((c) => svf(c, 40, 0.707, 'hp', SR)); });
  const zeroSnap = () => { if (!need() || !wave.sel) return; wave.sel = { a: snapZero(S.chs[0], wave.sel.a), b: snapZero(S.chs[0], wave.sel.b) }; wave.draw(); info(); };
  const undo = () => { const u = S.undo.pop(); if (!u) return toast('nothing to undo'); S.chs = u.chs; S.loop = u.loop; S.marks = u.marks; wave.sel = null; set(S.chs, true); };

  // ---- slice
  const findMarks = () => { if (!need()) return; S.marks = findTransients(S.chs[0], P.sens, P.gap, SR); wave.marks = S.marks; wave.draw(); info(); toast(S.marks.length + ' transients found'); };
  const gridMarks = () => { if (!need()) return; const n = S.chs[0].length; S.marks = Array.from({ length: P.slices - 1 }, (_, i) => snapZero(S.chs[0], Math.round((i + 1) * n / P.slices))); wave.marks = S.marks; wave.draw(); info(); };
  const sliceOut = () => {
    if (!need()) return; const pts = [0, ...S.marks.filter((m) => m > 0), S.chs[0].length].sort((a, b) => a - b); let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i + 1] - pts[i] < SR * 0.02) continue; k++;
      const it = addMade(`${S.name}_s${String(k).padStart(2, '0')}`, S.chs.map((c) => fade(c.slice(pts[i], pts[i + 1]), 1, 8, SR)), S.cat); emit('item', it);
    }
    toast(`${k} slices → library`, 'ok');
  };

  // ---- loop
  const loopFromSel = () => { if (!need() || !wave.sel) return toast('drag a selection first', 'bad'); S.loop = { a: wave.sel.a, b: wave.sel.b }; wave.loop = S.loop; wave.draw(); info(); };
  const loopBest = () => {
    if (!need()) return; const a = S.loop ? S.loop.a : 0, n = S.chs[0].length;
    const r = bestLoopEnd(S.chs[0], a, Math.round(SR * 0.15), n - 2100); S.loop = { a, b: r.end }; wave.loop = S.loop; wave.draw(); info(); toast(`best loop end found (match ${(r.score * 100).toFixed(0)}%)`, 'ok');
  };
  const loopPlay = () => { if (!need()) return; const l = S.loop || { a: 0, b: S.chs[0].length }; eng.play(S.chs, { wave, loop: true, loopStart: l.a, loopEnd: l.b, from: l.a }); };
  const bake = op(() => {
    const l = S.loop || { a: 0, b: S.chs[0].length }, xf = Math.round(P.xf * 0.001 * SR);
    S.chs = each((c) => loopCrossfade(c, l.a, l.b, xf)); S.marks = []; S.loop = { a: 0, b: S.chs[0].length };
    toast(`baked ${P.xf} ms equal-power crossfade — loop is seamless`, 'ok');
  });

  const save = (basket) => {
    if (!need()) return;
    const it = addMade(S.name + '_edit', S.chs.map((c) => c.slice()), S.cat, { loop: S.loop ? { start: S.loop.a, end: S.loop.b } : null, parent: S.item?.id, src: S.item?.src && S.item.src.format !== 'gen' ? { ...S.item.src } : { format: 'gen' } });
    if (basket) lib.basket.add(it.id); emit('item', it); if (basket) emit('basket'); toast('saved to library' + (basket ? ' + basket' : ''), 'ok');
  };
  const sl = (label, key, min, max, step, fmt) => slider({ label, min, max, step, value: P[key], fmt, onInput: (v) => { P[key] = v; } });
  const row = (...k) => h('div', { class: 'bar-row wrap' }, ...k);

  const root = h('section', { class: 'mod', id: 'mod-edit', hidden: true },
    h('div', { class: 'edit-top' }, title, h('span', { class: 'sp' }), catSel, btn('Load selected from Audition', () => { const it = lib.byId.get(lib.sel); it ? load(it) : toast('select a sound in Audition first', 'bad'); }, 'ghost')),
    cv, infoBox,
    row(arrowBtn('Play', () => S.chs && eng.play(S.chs, { wave, sr: SR })), btn('▶ selection', () => { if (!need()) return; const [a, b] = rng(); eng.play(S.chs.map((c) => c.slice(a, b)), { sr: SR }); }, 'ghost'), btn('■', () => eng.stop(), 'ghost'), btn('↶ Undo', undo, 'ghost'), h('span', { class: 'sp' }),
      downBtn('Save to library', () => save(false)), downBtn('Save + basket', () => save(true), 'teal')),
    h('div', { class: 'grid3' },
      panel('Edit', h('div', {}, row(btn('Trim to selection', trimSel), btn('Cut selection', cutSel), btn('Trim silence', silTrim), btn('Snap to zero-x', zeroSnap, 'ghost')),
        row(btn('Reverse', doRev), btn('Normalise −1 dB', doNorm), btn('To mono', doMono), btn('Cut sub <40 Hz', doHP)),
        sl('fade in', 'fadeIn', 0, 200, 1, (v) => v + ' ms'), sl('fade out', 'fadeOut', 0, 500, 1, (v) => v + ' ms'), row(btn('Apply fades to selection', doFade)),
        sl('gain', 'gain', -24, 12, 0.5, (v) => v + ' dB'), row(btn('Apply gain', doGain)), sl('pitch (resample)', 'pitch', -12, 12, 1, (v) => v + ' st'), row(btn('Apply pitch', doPitch))), { open: true }),
      panel('Slice', h('div', {}, sl('sensitivity', 'sens', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'), sl('min gap', 'gap', 20, 500, 5, (v) => v + ' ms'),
        row(btn('Find transients', findMarks), btn('Clear marks', () => { S.marks = []; wave.marks = S.marks; wave.draw(); info(); }, 'ghost')),
        sl('equal slices', 'slices', 2, 16, 1, (v) => v), row(btn('Slice grid', gridMarks)), row(downBtn('Slices → library', sliceOut, 'teal'))), { open: true }),
      panel('Loop', h('div', {}, row(btn('Loop = selection', loopFromSel), btn('Find best loop end', loopBest)), sl('crossfade', 'xf', 2, 500, 1, (v) => v + ' ms'),
        row(btn('Bake seamless loop', bake), arrowBtn('Audition loop', loopPlay, 'purple')),
        h('p', { class: 'hint' }, 'Baking blends the loop tail into its head with an equal-power fade, so the wrap-around has no click. Godot: WAV exports carry a loop chunk; the manifest carries loop points for OGG.')), { open: true })),
    panel('Rating of current edit', h('div', {}, stats, rt), { open: true }));

  hub.edit = (it) => { hub.go('edit'); load(it); };
  return { root, onShow() { if (!S.chs && lib.sel) load(lib.byId.get(lib.sel)); } };
}

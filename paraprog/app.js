import { PRESETS, LESSONS, SONGS, WISHLIST } from './data.js';
import { Kit, Player } from './engine.js';
import * as L from './logic.js';

const kit = new Kit();
const player = new Player(kit);
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};

/* one transport at a time: starting anything stops whatever else was playing */
let stopCurrent = null;
function playToggle(btn, begin) {
  const on = btn.getAttribute('aria-pressed') === 'true';
  if (stopCurrent) { stopCurrent(); stopCurrent = null; }
  if (on) return;
  btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Stop';
  const end = begin();
  stopCurrent = () => { end && end(); player.stop(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Play'; };
}
const playBtn = (begin) => { const b = h('button', { class: 'play', 'aria-pressed': 'false' }, 'Play'); b.addEventListener('click', () => playToggle(b, begin)); return b; };
const slider = (min, max, val, onInput) => { const i = h('input', { type: 'range', min, max, value: val }); i.addEventListener('input', () => onInput(+i.value)); return i; };

/* a row of pulse cells split into groups. returns { el, cells } */
function barView(groups, { hideCount = false, straight = false } = {}) {
  const labels = straight ? L.straightCount(groups) : L.countLabels(groups);
  const starts = new Set(L.groupStarts(groups));
  const cells = [];
  const el = h('div', { class: 'bar' });
  let i = 0;
  for (const n of groups) {
    const g = h('div', { class: 'group' });
    for (let k = 0; k < n; k++, i++) {
      const c = h('div', { class: 'cell' + (starts.has(i) ? ' start' : '') + (hideCount ? ' hidden-count' : '') }, labels[i]);
      cells.push(c); g.append(c);
    }
    el.append(g);
  }
  return { el, cells };
}
const flash = (cells) => { let last = null; return (i) => { if (last != null && cells[last]) cells[last].classList.remove('on'); last = i; cells[i] && cells[i].classList.add('on'); }; };

/* ---------------- tabs ---------------- */
const tabs = [...document.querySelectorAll('[role=tab]')];
function show(id) {
  if (stopCurrent) { stopCurrent(); stopCurrent = null; }
  for (const t of tabs) {
    const on = t.id === id;
    t.setAttribute('aria-selected', on);
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  try { history.replaceState(null, '', '#' + id.slice(2)); } catch {}
}
tabs.forEach((t) => t.addEventListener('click', () => show(t.id)));
tabs.forEach((t, i) => t.addEventListener('keydown', (e) => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); show(n.id); }
}));

/* ---------------- Learn ---------------- */
function buildLearn() {
  const p = $('#p-learn');
  p.append(h('h2', {}, 'Start here'),
    h('p', { class: 'hint' }, 'Five short lessons. Then play with the Meter Lab, work the Paradiddles, and see how real songs use it all.'));
  for (const l of LESSONS) {
    p.append(h('details', l.id === 'what' ? { open: true } : {}, h('summary', {}, l.title), l.body.map((t) => h('p', {}, t))));
  }
  p.append(h('p', { class: 'srcs' }, 'Further reading: ', h('a', { href: 'https://en.wikipedia.org/wiki/Time_signature' }, 'Time signature'), ' \u00b7 ',
      h('a', { href: 'https://en.wikipedia.org/wiki/Paradiddle' }, 'Paradiddle'), ' \u00b7 ',
      h('a', { href: 'https://en.wikipedia.org/wiki/Polyrhythm' }, 'Polyrhythm')));
}

/* ---------------- Meter Lab ---------------- */
function buildMeter() {
  const p = $('#p-meter');
  const st = { groups: PRESETS[6].groups, unit: PRESETS[6].unit, bpm: 110, hide: false, straight: false, tip: PRESETS[6].tip };
  const title = h('h2', {}), tip = h('p', { class: 'hint' }), host = h('div'), re = h('div', { class: 'row' }), err = h('div', { id: 'err', role: 'status' });
  let view = null, restart = null;

  const render = () => {
    title.textContent = `${L.meterLabel(st.groups, st.unit)} counted ${st.groups.join(' + ')}`;
    tip.textContent = st.tip || '';
    view = barView(st.groups, { hideCount: st.hide, straight: st.straight });
    host.replaceChildren(view.el);
    re.replaceChildren();
    const alts = L.rearrangements(st.groups);
    if (alts.length > 1) {
      re.append(h('span', { class: 'hint' }, 'Same pulses, different feel:'));
      for (const a of alts) re.append(h('button', { 'aria-pressed': a.join() === st.groups.join(), onclick: () => { st.groups = a; st.tip = 'Same total, regrouped. Listen to where the long beats land.'; render(); restart && restart(); } }, a.join('+')));
    }
  };
  const setPreset = (id) => { const pr = PRESETS.find((x) => x.id === id); Object.assign(st, { groups: pr.groups, unit: pr.unit, tip: pr.tip }); err.textContent = ''; render(); restart && restart(); };

  const sel = h('select', { 'aria-label': 'Preset' }, PRESETS.map((x) => h('option', { value: x.id }, x.name)));
  sel.value = PRESETS[6].id; sel.addEventListener('change', () => setPreset(sel.value));
  const custom = h('input', { type: 'text', 'aria-label': 'Custom grouping, for example 2+2+3', placeholder: 'e.g. 3+3+2', size: 12, inputmode: 'text' });
  custom.addEventListener('change', () => {
    const g = L.parseGroups(custom.value);
    if (!g) { err.textContent = 'Use groups of 1 to 6 joined by +, e.g. 2+2+3 (2 to 32 pulses in total).'; return; }
    err.textContent = '';
    const total = L.pulsesOf(g);
    Object.assign(st, { groups: g, unit: st.unit, tip: `${total} pulses. Change "Pulse note" to set the bottom number.` });
    render(); restart && restart();
  });
  const unitSel = h('select', { 'aria-label': 'Note value of the pulse (bottom number)' }, [4, 8, 16].map((u) => h('option', { value: u }, `/${u}`)));
  unitSel.value = st.unit; unitSel.addEventListener('change', () => { st.unit = +unitSel.value; render(); });
  const bpmOut = h('span', {}, `${st.bpm} bpm`);
  const bpm = slider(40, 240, st.bpm, (v) => { st.bpm = v; bpmOut.textContent = v + ' bpm'; });
  const hide = h('input', { type: 'checkbox' }); hide.addEventListener('change', () => { st.hide = hide.checked; render(); });
  const straight = h('input', { type: 'checkbox' }); straight.addEventListener('change', () => { st.straight = straight.checked; render(); });

  const go = playBtn(() => {
    const begin = () => { const steps = L.drumPattern(st.groups); const f = flash(view.cells); player.start(steps, () => 60 / st.bpm, f); };
    restart = () => { if (stopCurrent) begin(); };
    begin();
    return () => { restart = null; };
  });

  p.append(h('h2', {}, 'Meter Lab'),
    h('p', { class: 'hint' }, 'Pick a meter, press Play, and count out loud with the highlighted pulse. Kick is on ONE, snare on the start of the other groups, hi-hat on every pulse. Tempo is the pulse itself (the bottom-number note).'),
    h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('label', {}, 'Preset', sel), h('label', {}, 'Custom grouping', custom), h('label', {}, 'Pulse note', unitSel), go),
      h('div', { class: 'row' }, h('label', {}, 'Tempo', bpm), bpmOut),
      h('div', { class: 'row' },
        h('label', { class: 'inline' }, hide, 'Hide the count (keep it in your head)'),
        h('label', { class: 'inline' }, straight, 'Count straight through (1 2 3 4 5 6 7)')),
      err, title, tip, host, re));
  render();
}

/* ---------------- Paradiddles ---------------- */
function buildPara() {
  const p = $('#p-para');
  const st = { rud: L.RUDIMENTS[0], inv: 0, bpm: 80, acc: true, barLen: 0 };
  const info = h('div'), view = h('div'), oddHost = h('div');
  const perBeat = () => (st.rud.cell === 4 || st.rud.cell === 8 ? 4 : 6);
  const sticking = () => (st.rud.id === 'single' ? L.inversions()[st.inv].sticking : st.rud.sticking);
  const cell = () => (st.rud.cell);

  const stickRow = (s, cellLen, cuts) => {
    const acc = cellLen ? L.stickingAccents(s, cellLen) : [];
    const row = h('div', { class: 'stick' });
    const cells = s.split('').map((ch, i) => h('div', { class: `cell ${ch}${st.acc && acc[i] ? ' acc' : ''}${cuts && (i + 1) % cuts === 0 ? ' cut' : ''}` }, ch));
    row.append(...cells); return { row, cells };
  };

  const draw = () => {
    const s = sticking();
    info.replaceChildren(h('h3', {}, st.rud.name), h('p', {}, st.rud.blurb), h('p', { class: 'hint' }, `Feel: ${st.rud.feel}. Sticking: ${st.rud.id === 'diddle' ? s : s.slice(0, s.length / 2) + ' then ' + s.slice(s.length / 2)}.`));
    const r = stickRow(s, cell(), st.rud.cell);
    view.replaceChildren(r.row, h('p', { class: 'legend' }, 'Pink R = right hand (rim sound), blue L = left hand (low tom). White outline = accent, the rest are soft taps.'));
    view.cells = r.cells;
    drawOdd();
  };

  const drawOdd = () => {
    const s = sticking(), bar = st.barLen;
    oddHost.replaceChildren(); oddHost.cells = [];
    if (!bar) return;
    const bars = L.barsToResolve(s.length, bar), total = bars * bar;
    const rows = [];
    for (let b = 0; b < bars; b++) {
      const part = Array.from({ length: bar }, (_, i) => s[(b * bar + i) % s.length]).join('');
      const r = stickRow(part, 0, 0);
      rows.push(h('p', { class: 'barlbl' }, `Bar ${b + 1}: starts on ${part[0]}`), r.row);
      r.cells.forEach((c, i) => { const g = b * bar + i; if (L.stickingAccents(s, cell())[g % s.length] && st.acc) c.classList.add('acc'); });
      oddHost.cells.push(...r.cells);
    }
    oddHost.prepend(h('p', {}, `The sticking is ${s.length} notes long and the bar is ${bar} notes long, so the pattern comes back to the barline after ${bars} bar${bars > 1 ? 's' : ''} (${total} notes). That is lcm(${s.length}, ${bar}) ÷ ${bar}.`));
    oddHost.append(...rows);
  };

  const rudSel = h('select', { 'aria-label': 'Rudiment' }, L.RUDIMENTS.map((r) => h('option', { value: r.id }, r.name)));
  rudSel.addEventListener('change', () => { st.rud = L.RUDIMENTS.find((r) => r.id === rudSel.value); st.inv = 0; invSel.disabled = st.rud.id !== 'single'; invSel.value = 0; draw(); });
  const invSel = h('select', { 'aria-label': 'Inversion (where the double falls)' }, L.inversions().map((v, i) => h('option', { value: i }, v.name)));
  invSel.addEventListener('change', () => { st.inv = +invSel.value; draw(); });
  const bpmOut = h('span', {}, `${st.bpm} bpm`);
  const bpm = slider(40, 160, st.bpm, (v) => { st.bpm = v; bpmOut.textContent = v + ' bpm'; });
  const acc = h('input', { type: 'checkbox', checked: true }); acc.addEventListener('change', () => { st.acc = acc.checked; draw(); });

  const go = playBtn(() => {
    const s = sticking();
    const steps = L.stickingPattern(s, cell(), { accents: st.acc });
    const f = flash(view.cells);
    player.start(steps, () => 60 / st.bpm / perBeat(), f);
  });

  const barSel = h('select', { 'aria-label': 'Bar length in notes' }, [h('option', { value: 0 }, 'Off'), ...[5, 7, 9, 11, 13].map((n) => h('option', { value: n }, `${n} notes per bar`))]);
  barSel.addEventListener('change', () => { st.barLen = +barSel.value; goOdd.disabled = !st.barLen; draw(); });
  const goOdd = playBtn(() => {
    const s = sticking(), bar = st.barLen;
    const total = L.lcm(s.length, bar), base = L.stickingPattern(s, cell(), { accents: st.acc });
    const steps = Array.from({ length: total }, (_, i) => { const x = base[i % s.length].map((a) => a.slice()); if (i % bar === 0) x.push(['kick', 1]); return x; });
    const f = flash(oddHost.cells || []);
    player.start(steps, () => 60 / st.bpm / perBeat(), f);
  });

  p.append(h('h2', {}, 'Paradiddles'),
    h('p', { class: 'hint' }, 'A paradiddle is "para-did-dle": single, single, double. The double flips the leading hand so you can play the pattern endlessly without it getting stuck on one side. Start at a tempo where every note is even.'),
    h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('label', {}, 'Rudiment', rudSel), h('label', {}, 'Inversion', invSel), go),
      h('div', { class: 'row' }, h('label', {}, 'Tempo (beats per minute)', bpm), bpmOut, h('label', { class: 'inline' }, acc, 'Accents')),
      info, view),
    h('h2', {}, 'Paradiddles in odd time'),
    h('p', { class: 'hint' }, 'What happens when the sticking length and the bar length do not match? The pattern shifts hands each bar until it comes back round. Pick a bar length. The kick marks the start of each bar.'),
    h('div', { class: 'panel' }, h('div', { class: 'row' }, h('label', {}, 'Bar length', barSel), goOdd), oddHost));
  goOdd.disabled = true; draw();
}

/* ---------------- Bands ---------------- */
function buildBands() {
  const p = $('#p-bands');
  p.append(h('h2', {}, 'Bands and songs'),
    h('p', { class: 'hint' }, 'Each loop plays the song’s meter(s) on the kit so you can count along; it is not the recording. The groupings are teaching suggestions. Where sources disagree, the card says so.'));
  for (const s of SONGS) {
    const sectionViews = s.sections.map((sec) => ({ sec, v: barView(sec.groups, { straight: sec.groups.every((n) => n === 1) }) }));
    const flatCells = sectionViews.flatMap(({ sec, v }) => Array.from({ length: sec.bars }, () => v.cells).flat());   // one entry per pulse in play order
    let bpm = s.bpm;
    const bpmOut = h('span', {}, `${bpm} bpm`);
    const sl = slider(40, 240, bpm, (v) => { bpm = v; bpmOut.textContent = v + ' bpm'; });
    const go = playBtn(() => {
      const steps = s.sections.flatMap((sec) => Array.from({ length: sec.bars }, () => L.drumPattern(sec.groups)).flat());
      const f = flash(flatCells);
      player.start(steps, () => 60 / bpm, f);
    });
    p.append(h('article', { class: 'card', id: s.id },
      h('h3', {}, `${s.artist} — ${s.title}`),
      h('p', { class: 'meta' }, `${s.year} · ${s.meterText} `, h('b', { class: `chip ${s.confidence}` }, s.confidence === 'solid' ? 'checked' : 'approximate')),
      sectionViews.map(({ sec, v }) => [h('p', { class: 'barlbl' }, `${sec.label}${sec.bars > 1 ? ` × ${sec.bars}` : ''} · counted ${sec.groups.join('+')}`), v.el]),
      h('div', { class: 'row' }, go, h('label', {}, 'Pulse tempo', sl), bpmOut),
      s.notes.map((n) => h('p', {}, n)),
      h('p', { class: 'srcs' }, 'Sources: ', s.sources.flatMap(([t, u], i) => [i ? ' · ' : '', h('a', { href: u, rel: 'noopener' }, t)]))));
  }
  p.append(h('h2', {}, 'Still to come'), h('ul', {}, WISHLIST.map((w) => h('li', {}, w))));
}

/* ---------------- Polyrhythm ---------------- */
function buildPoly() {
  const p = $('#p-poly');
  const st = { a: 3, b: 2, mode: 'rhythm', speed: 20, bpm: 120 };
  const host = h('div'), info = h('div'), err = h('div', { id: 'err', role: 'status' });
  let cols = [];
  const num = (v) => h('select', { 'aria-label': v }, [2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('option', { value: n }, n)));
  const selA = num('First voice'), selB = num('Second voice');
  selA.value = st.a; selB.value = st.b;
  const row = (label, hits, cls) => h('div', { class: 'stick' }, h('div', { class: 'barlbl', style: 'width:100%' }, label), hits.map((x, i) => h('div', { class: `cell ${cls}${x ? ' acc' : ''}`, style: 'min-width:30px;height:34px' }, x ? '\u25cf' : '')));
  const draw = () => {
    const g = L.polyGrid(st.a, st.b, st.mode);
    const ra = row(`Voice A (rim, right hand): ${st.mode === 'rhythm' ? st.a + ' evenly spaced hits' : 'a bar of ' + st.a}`, g.a, 'R'), rb = row(`Voice B (low tom, left hand): ${st.mode === 'rhythm' ? st.b + ' evenly spaced hits' : 'a bar of ' + st.b}`, g.b, 'L');
    host.replaceChildren(ra, rb);
    cols = g.a.map((_, i) => [ra.children[i + 1], rb.children[i + 1]]);
    const hits = g.a.filter(Boolean).length + g.b.filter((x, i) => x && !g.a[i]).length;
    info.replaceChildren(st.mode === 'rhythm'
      ? h('p', {}, `${st.a}:${st.b} divides one bar into ${g.len} equal steps. A hits every ${g.len / st.a} steps and B every ${g.len / st.b}. They only land together on step 1. There are ${hits} separate attacks in the bar.`)
      : h('p', {}, `A repeats every ${st.a} pulses and B every ${st.b}. They line up again after lcm(${st.a}, ${st.b}) = ${g.len} pulses, which is ${g.len / st.a} bars of ${st.a} against ${g.len / st.b} bars of ${st.b}.`));
    if (st.mode === 'rhythm' && st.a === 3 && st.b === 2) info.append(h('p', { class: 'hint' }, 'Common teaching trick for 3:2: say "nice cup of tea". "Nice" is both hands, "cup" is the 3, "of" is the 2, "tea" is the 3.'));
  };
  const flashCols = (i) => { cols.forEach((c) => c.forEach((x) => x.classList.remove('on'))); cols[i] && cols[i].forEach((x) => x.classList.add('on')); };
  const apply = () => {
    const ok = L.parsePoly(+selA.value, +selB.value);
    if (!ok) { err.textContent = 'Pick two different numbers from 2 to 9.'; return false; }
    err.textContent = ''; if (stopCurrent) { stopCurrent(); stopCurrent = null; }
    [st.a, st.b] = ok; draw(); return true;
  };
  selA.addEventListener('change', apply); selB.addEventListener('change', apply);
  const presets = h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Try:'), [[3, 2], [4, 3], [5, 4], [5, 3], [7, 4], [3, 4]].map(([a, b]) => h('button', { onclick: () => { selA.value = a; selB.value = b; apply(); } }, `${a}:${b}`)));
  const modeBtns = ['rhythm', 'meter'].map((m) => h('button', { 'aria-pressed': m === st.mode, onclick: () => { st.mode = m; modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', ['rhythm', 'meter'][i] === m)); label.textContent = m === 'rhythm' ? 'Cycles per minute' : 'Pulses per minute'; slide.value = m === 'rhythm' ? st.speed : st.bpm; out.textContent = (m === 'rhythm' ? st.speed : st.bpm); apply(); } }, m === 'rhythm' ? 'Polyrhythm' : 'Polymeter'));
  const out = h('span', {}, String(st.speed));
  const label = h('span', {}, 'Cycles per minute');
  const slide = slider(10, 240, st.speed, (v) => { if (st.mode === 'rhythm') st.speed = Math.min(v, 60); else st.bpm = v; out.textContent = st.mode === 'rhythm' ? st.speed : st.bpm; });
  const go = playBtn(() => {
    const steps = L.polySteps(st.a, st.b, st.mode);
    player.start(steps, () => (st.mode === 'rhythm' ? 60 / st.speed / steps.length : 60 / st.bpm), flashCols);
  });
  p.append(h('h2', {}, 'Polyrhythm and polymeter'),
    h('p', { class: 'hint' }, 'Two voices at once. Polyrhythm fits both inside one bar (3 hits against 2). Polymeter repeats two different bar lengths on the same pulse (a bar of 3 against a bar of 2). Start by tapping one voice and counting the other out loud.'),
    h('div', { class: 'panel' },
      h('div', { class: 'row' }, ...modeBtns, go),
      h('div', { class: 'row' }, h('label', {}, 'A', selA), h('span', {}, ' against '), h('label', {}, 'B', selB)),
      presets,
      h('div', { class: 'row' }, h('label', {}, label, slide), out),
      err, host, info));
  draw();
}

buildLearn(); buildMeter(); buildPara(); buildPoly(); buildBands();
const start = { learn: 't-learn', para: 't-para', poly: 't-poly', meter: 't-meter', bands: 't-bands' }[location.hash.slice(1)];
if (start) show(start);

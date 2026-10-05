/* Crate Capture: the page. A guide, a map of sources, and a local-only log of finds with proof.
   No network code: a file you pick is read and fingerprinted in this tab and never leaves it, and nothing is sent anywhere. Text you type is only ever shown as text. */
import { SOURCES, NOT_CC0 } from './sources.js';
import * as L from './log.js';

const KEY = 'cratecapture.v1';
const $ = (s, r = document) => r.querySelector(s);
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
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3400); }
const download = (name, text, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const today = () => new Date().toISOString().slice(0, 10);
const fmtBytes = (n) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtTime = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

/* ---------- storage ---------- */
let items = [];
try { const j = JSON.parse(localStorage.getItem(KEY)); if (j) items = L.sanitize(j); } catch (err) { items = []; }
let saveTimer = 0, savedOk = true;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, L.toJSON(items)); savedOk = true; } catch (err) { savedOk = false; toast('The browser would not save. Export the JSON now.'); } }, 300); };

/* ---------- tabs ---------- */
const TABS = ['guide', 'sources', 'log', 'tools'];
function route() {
  const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'guide';
  document.querySelectorAll('[data-view]').forEach((s) => { s.hidden = s.id !== `t-${t}`; });
  document.querySelectorAll('#tabs [data-t]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.t === t)));
  if (t === 'log') renderLog();
}
document.querySelectorAll('#tabs [data-t]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.t; scrollTo(0, 0); }));
addEventListener('hashchange', route);

/* ---------- sources ---------- */
const TRUST = { high: ['Sure by design', 'The site or collection is CC0 / public domain by design.'], check: ['Check every item', 'It has a CC0 or public domain filter, but anyone can upload.'], age: ['Public domain by age', 'Not a dedication: depends on the country, the recording and the song.'], make: ['You make it', 'The cleanest provenance.'] };
let tfilter = 'all';
function renderSources() {
  const f = $('#trustfilter'); f.replaceChildren(...[['all', 'All'], ...Object.entries(TRUST).map(([k, v]) => [k, v[0]])].map(([k, t]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(tfilter === k), onclick: () => { tfilter = k; renderSources(); } }, t)));
  $('#srclist').replaceChildren(...SOURCES.filter((s) => tfilter === 'all' || s.trust === tfilter).map((s) => h('article', { class: `src t-${s.trust}` },
    h('div', { class: 'ptop' }, h('b', { text: s.name }), h('span', { class: 'status', title: TRUST[s.trust][1], text: TRUST[s.trust][0] })),
    h('p', { class: 'dim', text: s.kind }), h('p', { text: s.what }), h('p', null, h('b', { text: 'How: ' }), s.how), s.warn ? h('p', { class: 'pwarn' }, h('b', { text: 'Careful: ' }), s.warn) : null,
    s.url ? h('a', { class: 'btn', href: s.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open (a new tab)' }) : null)));
  $('#notcc0').replaceChildren(...NOT_CC0.map(([a, b]) => h('li', null, h('b', { text: a }), h('br'), b)));
}

/* ---------- the log ---------- */
let sfilter = 'all', rfilter = 'all', onlyReady = false;
const lic = (id) => L.LICENCES.find((l) => l.id === id) || L.LICENCES[7];
function findCard(f) {
  const miss = L.missing(f), ok = !miss.length;
  return h('button', { type: 'button', class: `pcard ${ok ? 'ok' : ''}`, onclick: () => editFind(f.id), 'aria-label': `${f.title || 'Untitled'}, ${ok ? 'ready' : `${miss.length} things missing`}` },
    h('span', { class: 'ptop' }, h('b', { text: f.title || 'Untitled' }), h('span', { class: 'status', text: f.status })),
    h('span', { class: 'dim', text: [f.creator, f.source].filter(Boolean).join(' · ') || 'no creator or source yet' }),
    h('span', { class: 'pfoot' }, h('span', { class: `badge ${f.licence === 'cc0' || f.licence === 'own' ? 'good' : f.licence === 'pdm' ? 'good' : 'warn'}`, text: lic(f.licence).label.split(' (')[0] }),
      f.rating ? h('span', { class: `badge r-${f.rating.toLowerCase()}`, text: f.rating }) : null,
      h('span', { class: ok ? 'ready' : 'notready', text: ok ? '✓ Ready' : `✗ ${miss.length} to do` })));
}
function renderLog() {
  const ready = items.filter(L.ready).length;
  $('#logstate').textContent = `${items.length} find${items.length === 1 ? '' : 's'}, ${ready} ready. Stored only in this browser: export a backup now and then.${savedOk ? '' : ' (Not saved!)'}`;
  const chips = (list, val, set, label) => list.map(([k, t]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(val === k), onclick: () => { set(k); renderLog(); } }, t));
  $('#logfilters').replaceChildren(...chips([['all', 'All'], ...L.STATUSES.map((s) => [s, s])], sfilter, (k) => { sfilter = k; }),
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(onlyReady), onclick: () => { onlyReady = !onlyReady; renderLog(); } }, 'Ready only'),
    ...chips([['all', 'Any rating'], ['Love', 'Love'], ['Keep', 'Keep'], ['Maybe', 'Maybe'], ['Drop', 'Drop']], rfilter, (k) => { rfilter = k; }));
  const list = items.filter((f) => (sfilter === 'all' || f.status === sfilter) && (rfilter === 'all' || f.rating === rfilter) && (!onlyReady || L.ready(f))).sort((a, b) => b.created - a.created);
  $('#loglist').replaceChildren(...(list.length ? list.map(findCard) : [h('p', { class: 'dim', text: items.length ? 'Nothing matches those filters.' : 'No finds yet. Press “Add a find” when you have found a track, and fill it in as you check it.' })]));
}

const dlg = $('#dlg');
function editFind(id) {
  const f = items.find((x) => x.id === id); if (!f) return;
  let objectUrl = '';
  const changed = () => { save(); paintReady(); };
  const input = (label, k, o = {}) => h('label', { class: 'field' }, label, h('input', { type: o.type || 'text', value: f[k], maxlength: o.max || 200, placeholder: o.ph || '', oninput: (e) => { f[k] = e.target.value; changed(); } }));
  const ready = h('div', { class: 'readybox', role: 'status' });
  function paintReady() {
    const miss = L.missing(f);
    ready.className = `readybox ${miss.length ? 'no' : 'yes'}`;
    ready.replaceChildren(miss.length ? h('b', { text: `Not ready yet: ${miss.length} thing${miss.length === 1 ? '' : 's'} to do` }) : h('b', { text: '✓ Ready to hand over' }), miss.length ? h('ul', null, miss.map((m) => h('li', { text: m }))) : h('p', { class: 'dim', text: `Suggested file name: ${L.packName(f)}` }));
  }
  const player = h('audio', { controls: true, preload: 'metadata' }); player.hidden = true;
  const fileInfo = h('p', { class: 'dim', text: f.sha256 ? `${f.file} · ${fmtBytes(f.size)} · ${f.duration ? `${f.duration} · ` : ''}SHA-256 ${f.sha256.slice(0, 16)}…` : 'No file picked yet.' });
  const pick = h('input', { type: 'file', accept: 'audio/*,.flac,.ogg,.wav,.mp3,.m4a,.opus', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 400e6) { fileInfo.textContent = 'That file is over 400 MB: fingerprint it with the command in the Tools tab.'; return; }
    fileInfo.textContent = 'Reading and fingerprinting… (nothing leaves this device)';
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      f.sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); f.size = file.size; f.file = file.name.slice(0, 200);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file); player.src = objectUrl; player.hidden = false;
      player.onloadedmetadata = () => { f.duration = fmtTime(player.duration); fileInfo.textContent = `${f.file} · ${fmtBytes(f.size)} · ${f.duration} · SHA-256 ${f.sha256.slice(0, 16)}…`; save(); };
      fileInfo.textContent = `${f.file} · ${fmtBytes(f.size)} · SHA-256 ${f.sha256.slice(0, 16)}…`;
      changed();
    } catch (err) { fileInfo.textContent = 'Could not read that file.'; }
  } });
  const srcSel = h('select', { 'aria-label': 'Where did you find it', onchange: (e) => { f.source = e.target.value; const s = SOURCES.find((x) => x.name === f.source); if (s && s.url && !f.url) { /* the page address must be the track's own page: leave it for the person */ } changed(); } },
    h('option', { value: '', text: 'Where did you find it?' }), SOURCES.filter((s) => s.id !== 'make').map((s) => h('option', { value: s.name, text: s.name, selected: s.name === f.source })), h('option', { value: 'Other', text: 'Somewhere else', selected: f.source === 'Other' }));
  const licSel = h('select', { 'aria-label': 'Licence', onchange: (e) => { f.licence = e.target.value; licNote.textContent = lic(f.licence).note || ''; changed(); } }, L.LICENCES.map((l) => h('option', { value: l.id, text: l.label, selected: l.id === f.licence })));
  const licNote = h('p', { class: 'dim', text: lic(f.licence).note || '' });
  const checks = h('div', { class: 'checks' }, L.CHECKS.map(([k, label]) => h('label', { class: 'tick-row' }, h('input', { type: 'checkbox', checked: !!f.checks[k], onchange: (e) => { f.checks[k] = e.target.checked; if (e.target.checked && !f.checkedAt) { f.checkedAt = today(); date.value = f.checkedAt; } changed(); } }), h('span', { text: label }))));
  const date = h('input', { type: 'date', value: f.checkedAt, onchange: (e) => { f.checkedAt = e.target.value; changed(); } });
  const rate = h('div', { class: 'chips' }, ['Love', 'Keep', 'Maybe', 'Drop'].map((r) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.rating === r), onclick: (e) => { f.rating = f.rating === r ? '' : r; [...e.target.parentNode.children].forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === f.rating))); changed(); } }, r)));
  const status = h('select', { 'aria-label': 'Status', onchange: (e) => { f.status = e.target.value; changed(); } }, L.STATUSES.map((s) => h('option', { value: s, text: s, selected: s === f.status })));
  const evidence = h('textarea', { rows: 3, maxlength: L.LIMITS.evidence, placeholder: 'Exactly where you saw the licence, e.g. “Licence box on the page says CC0; readme.txt line 2 says CC0 1.0”', oninput: (e) => { f.evidence = e.target.value; changed(); } }, f.evidence);
  const notes = h('textarea', { rows: 3, maxlength: L.LIMITS.notes, placeholder: 'What you searched, what you thought, what it could be used for', oninput: (e) => { f.notes = e.target.value; changed(); } }, f.notes);
  const tagField = h('label', { class: 'field' }, 'Tags (separate with commas)', h('input', { type: 'text', value: f.tags.join(', '), maxlength: 160, oninput: (e) => { f.tags = e.target.value.split(',').map((x) => x.trim().slice(0, 24)).filter(Boolean).slice(0, 12); changed(); } }));
  const close = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); dlg.close(); };
  dlg.replaceChildren(h('form', { method: 'dialog', class: 'sheetform', onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'sheet-head' }, h('h2', { text: 'A find' }), h('button', { type: 'button', class: 'btn', onclick: close }, 'Close')),
    ready, input('Title', 'title', { max: 140 }), input('Creator', 'creator', { max: 120 }), h('label', { class: 'field' }, 'Source', srcSel),
    input('Address of the page you found it on', 'url', { type: 'url', max: 400, ph: 'https://…' }),
    h('label', { class: 'field' }, 'Licence', licSel), licNote, input('Licence address (optional)', 'licenceUrl', { type: 'url', max: 400, ph: 'https://creativecommons.org/…' }),
    h('label', { class: 'field' }, 'Evidence', evidence), h('h3', { text: 'The six checks' }), checks, h('label', { class: 'field' }, 'Day you checked', date),
    h('h3', { text: 'The file' }), h('p', { class: 'dim', text: 'Pick the downloaded file to fingerprint it and listen. It is read here and never uploaded.' }), pick, fileInfo, player,
    h('h3', { text: 'Your verdict' }), rate, h('label', { class: 'field' }, 'Status', status), tagField, h('label', { class: 'field' }, 'Notes', notes),
    h('button', { type: 'button', class: 'btn danger wide', onclick: () => { if (confirm('Delete this find from the log?')) { items = items.filter((x) => x !== f); save(); close(); renderLog(); } } }, 'Delete this find')));
  paintReady();
  dlg.addEventListener('close', () => { renderLog(); }, { once: true });
  dlg.showModal();
}
$('#addfind').addEventListener('click', () => { const f = L.blankFind(); items.push(f); save(); editFind(f.id); });

/* ---------- export and import ---------- */
$('#exportbtn').addEventListener('click', () => {
  const pack = h('input', { type: 'text', value: 'My CC0 pack', maxlength: 60, 'aria-label': 'Pack name' }), ready = items.filter(L.ready);
  dlg.replaceChildren(h('div', { class: 'sheetform' }, h('div', { class: 'sheet-head' }, h('h2', { text: 'Export' }), h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Close')),
    h('p', { class: 'dim', text: `${ready.length} of ${items.length} finds are ready. LICENSES.txt lists only the ready ones; the sheet and the backup contain everything.` }),
    h('label', { class: 'field' }, 'Pack name (for LICENSES.txt)', pack),
    h('button', { type: 'button', class: 'btn primary wide', onclick: () => download('LICENSES.txt', L.toLicensesTxt(items, { pack: pack.value.trim() || 'Music pack' }), 'text/plain;charset=utf-8') }, 'Download LICENSES.txt'),
    h('button', { type: 'button', class: 'btn wide', onclick: () => download('provenance.csv', L.toCSV(items), 'text/csv;charset=utf-8') }, 'Download provenance.csv'),
    h('button', { type: 'button', class: 'btn wide', onclick: () => download('ATTRIBUTION.md', L.toAttribution(ready), 'text/markdown;charset=utf-8') }, 'Download ATTRIBUTION.md'),
    h('button', { type: 'button', class: 'btn wide', onclick: () => download(`crate-capture-backup-${today()}.json`, L.toJSON(items), 'application/json') }, 'Download a backup (JSON)')));
  dlg.showModal();
});
$('#importbtn').addEventListener('click', () => $('#importfile').click());
$('#importfile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    if (file.size > 5e6) throw new Error('That file is too large to be a log.');
    const incoming = L.sanitize(JSON.parse(await file.text()));
    if (!confirm(`Add ${incoming.length} find(s) from this file? Finds with the same id are replaced.`)) return;
    const ids = new Set(incoming.map((i) => i.id)); items = items.filter((i) => !ids.has(i.id)).concat(incoming); save(); renderLog(); toast('Imported.');
  } catch (err) { toast(err.message || 'That file could not be read.'); }
});

/* ---------- copy buttons on the command boxes ---------- */
document.querySelectorAll('pre[data-copy]').forEach((pre) => {
  const b = h('button', { type: 'button', class: 'btn copy', 'aria-label': 'Copy this command', onclick: async () => { try { await navigator.clipboard.writeText(pre.textContent); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } catch (err) { toast('Select the text and copy it.'); } } }, 'Copy');
  pre.after(b);
});

renderSources(); route();

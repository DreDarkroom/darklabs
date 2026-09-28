// Export: basket -> Godot-ready files (+ manifest, GDScript bank, licences). Match source quality, or WAV / OGG / MP3 / FLAC.
import { h, lib, on, emit, ensureAudio, panel, btn, arrowBtn, downBtn, toast, fmtMs, hub, PROFILES, SR } from './core.js';
import { gameMaster, undb, mul } from './dsp.js';
import { encodeWav, convertRate, zipStore, slug } from './io.js';
import { attenuateToTarget } from './synth.js';

// Sensible per-category playback defaults that the manifest hands to Godot.
const GODOT = {
  pistol: { pitch_var: 0.04, vol_var_db: 1.5, poly: 6 }, impact: { pitch_var: 0.06, vol_var_db: 2, poly: 8 }, energy: { pitch_var: 0.03, vol_var_db: 1, poly: 6 },
  explosion: { pitch_var: 0.05, vol_var_db: 1.5, poly: 3 }, whoosh: { pitch_var: 0.06, vol_var_db: 1.5, poly: 4 }, sweep: { pitch_var: 0.03, vol_var_db: 1, poly: 3 },
  mech: { pitch_var: 0.03, vol_var_db: 1, poly: 4 }, pickup: { pitch_var: 0.02, vol_var_db: 0.5, poly: 4 }, ui: { pitch_var: 0.01, vol_var_db: 0.5, poly: 4 },
  loop: { pitch_var: 0, vol_var_db: 0, poly: 1 }, misc: { pitch_var: 0.03, vol_var_db: 1, poly: 4 },
};

export function init() {
  const E = { format: 'match', kbps: 'match', sr: '48000', chans: 'auto', norm: 'peak', trim: true, dest: 'zip', folder: 'sfx', bits: '16' };
  const table = h('div', { class: 'etable' }), log = h('pre', { class: 'log' }), count = h('span', { class: 'dim' });
  let caps = { encode: false, formats: ['wav'] };
  const capPill = h('span', { class: 'pill no' }, 'server: checking…');
  fetch('/api/caps').then((r) => r.json()).then((c) => { caps = c; capPill.textContent = c.encode ? 'server on · OGG/MP3/FLAC + save-to-folder' : 'server on · install numpy+soundfile for OGG'; capPill.className = 'pill ' + (c.encode ? 'ok' : 'no'); hub.caps = c; })
    .catch(() => { capPill.textContent = 'no server · WAV + zip only (run python server.py for OGG)'; capPill.className = 'pill no'; });

  const sel = (key, opts) => h('select', { class: 'sel', onchange: (e) => { E[key] = e.target.value; paint(); } }, opts.map(([v, l]) => h('option', { value: v, selected: E[key] === v }, l)));
  const field = (label, ctl) => h('label', { class: 'fld' }, h('span', {}, label), ctl);

  function outFormat(it) {
    const s = it.src || {};
    if (E.format === 'match') {
      if (!it.made && ['ogg', 'wav', 'mp3'].includes(s.format) && (it.bytes || it.url)) return { ext: s.format, pass: true, note: `original ${s.format}${s.bitrate_kbps ? ' ' + s.bitrate_kbps + 'k' : ''} copied untouched` };
      if (s.format === 'ogg' && caps.encode) return { ext: 'ogg', kbps: s.bitrate_kbps || 160, note: `ogg ${s.bitrate_kbps || 160}k (matches source)` };
      if (s.format === 'mp3' && caps.encode) return { ext: 'mp3', kbps: s.bitrate_kbps || 192, note: `mp3 ${s.bitrate_kbps || 192}k (matches source)` };
      if (s.format === 'ogg') return { ext: 'wav', bits: 24, note: 'wav 24-bit (lossless; start server for ogg)' };
      return { ext: 'wav', bits: s.bitdepth || 16, note: `wav ${s.bitdepth || 16}-bit` };
    }
    if (E.format === 'wav') return { ext: 'wav', bits: +E.bits, note: `wav ${E.bits}-bit` };
    if (E.format === 'flac') return caps.encode ? { ext: 'flac', note: 'flac 24-bit' } : { ext: 'wav', bits: 24, note: 'wav 24 (flac needs server)' };
    const kb = E.kbps === 'match' ? (s.bitrate_kbps || 160) : +E.kbps;
    if (!caps.encode) return { ext: 'wav', bits: 24, note: `wav 24 (${E.format} needs server)` };
    return { ext: E.format, kbps: kb, note: `${E.format} ${kb}k` };
  }

  function paint() {
    const items = [...lib.basket].map((id) => lib.byId.get(id)).filter(Boolean);
    count.textContent = `${items.length} in basket`;
    table.replaceChildren(h('div', { class: 'erow head' }, h('span', {}, 'sound'), h('span', {}, 'category'), h('span', {}, 'length'), h('span', {}, 'grade'), h('span', {}, 'will export as'), h('span')),
      ...items.map((it) => { const o = outFormat(it); return h('div', { class: 'erow' }, h('span', { class: 'nm' }, it.name), h('span', {}, PROFILES[it.cat]?.label || it.cat), h('span', {}, it.an ? fmtMs(it.an.durMs) : '…'),
        h('span', { class: 'gd g-' + (it.rt?.grade || '') }, it.rt?.grade || '·'), h('span', { class: 'dim' }, o.note), h('button', { class: 'ico', title: 'remove', onclick: () => { lib.basket.delete(it.id); emit('basket'); } }, '✕')); }),
      items.length ? null : h('div', { class: 'empty' }, 'Basket is empty — tick sounds in Audition, or use “Keep + basket” anywhere.'));
  }

  const addBy = (fn, label) => { let n = 0; for (const it of lib.items) if (fn(it) && !lib.basket.has(it.id)) { lib.basket.add(it.id); n++; } emit('basket'); toast(`${n} ${label} added`, n ? 'ok' : ''); };

  // ---- the export pipeline
  async function process(it) {
    await ensureAudio(it);
    const o = outFormat(it), loop = it.loop || null;
    if (o.pass) { const bytes = it.bytes ? new Uint8Array(it.bytes) : new Uint8Array(await (await fetch(it.url)).arrayBuffer()); return { bytes, ext: o.ext, dur: it.an.dur, loop: loop && { a: loop.start / it.sr, b: loop.end / it.sr }, ch: it.chs.length, sr: it.sr, note: o.note }; }
    let chs = it.chs, sr = it.sr || SR;
    const prof = PROFILES[it.cat] || PROFILES.misc;
    if (E.chans === 'mono' || (E.chans === 'auto' && prof.mono && chs.length > 1)) { const m = new Float32Array(chs[0].length); for (const c of chs) for (let i = 0; i < m.length; i++) m[i] += c[i] / chs.length; chs = [m]; }
    let l = loop ? { ...loop } : null;
    if (E.norm !== 'none') chs = gameMaster(chs, { ceil: -1, glue: false, trim: E.trim && !l, loop: !!l, fadeIn: 1, fadeOut: 10 });
    if (E.norm === 'loud') chs = chs.map((c) => attenuateToTarget(c, prof.lufs));
    const target = E.sr === 'keep' ? sr : +E.sr;
    if (target !== sr) { chs = convertRate(chs, sr, target); if (l) l = { start: Math.round(l.start * target / sr), end: Math.round(l.end * target / sr) }; sr = target; }
    if (l) l = { start: Math.max(0, l.start), end: Math.min(chs[0].length, l.end) };
    const wav = encodeWav(chs, sr, o.ext === 'wav' ? o.bits : 32, o.ext === 'wav' ? l : null);
    let bytes = wav;
    if (o.ext !== 'wav') {
      const r = await fetch(`/api/encode?fmt=${o.ext}&kbps=${o.kbps || 160}`, { method: 'POST', body: wav });
      if (!r.ok) throw new Error('encode failed: ' + (await r.text()));
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    return { bytes, ext: o.ext, dur: chs[0].length / sr, loop: l && { a: l.start / sr, b: l.end / sr }, ch: chs.length, sr, note: o.note };
  }

  async function run() {
    const items = [...lib.basket].map((id) => lib.byId.get(id)).filter(Boolean);
    if (!items.length) return toast('basket is empty', 'bad');
    log.textContent = ''; const say = (s) => { log.textContent += s + '\n'; log.scrollTop = 1e9; };
    const files = [], manifest = { generator: 'Sonic Smithy', version: 1, bus: 'SFX', sounds: {} }, used = new Set(), licences = new Map();
    for (const it of items) {
      try {
        const r = await process(it), prof = it.cat, base = slug(it.name);
        let path = `${E.folder}/${prof}/${base}.${r.ext}`, k = 2; while (used.has(path)) path = `${E.folder}/${prof}/${base}_${k++}.${r.ext}`; used.add(path);
        files.push({ name: path, data: r.bytes });
        const group = base.replace(/_\d+$/, ''), G = GODOT[it.cat] || GODOT.misc, m = (manifest.sounds[group] ||= { category: it.cat, files: [], loop: !!r.loop, volume_db: 0, pitch_var: G.pitch_var, volume_var_db: G.vol_var_db, max_polyphony: G.poly });
        m.files.push(path.slice(E.folder.length + 1)); if (r.loop) { m.loop_start = +r.loop.a.toFixed(4); m.loop_end = +r.loop.b.toFixed(4); }
        if (it.meta?.speed != null) m.grind_speed = it.meta.speed;
        if (it.license) licences.set(it.pack, `${it.pack} — ${it.license} — ${it.source || ''}`);
        say(`✓ ${path}   ${r.note} · ${fmtMs(r.dur * 1000)} · ${(r.bytes.length / 1024).toFixed(1)} KB`);
      } catch (e) { say(`✗ ${it.name}: ${e.message}`); }
    }
    const enc = new TextEncoder();
    files.push({ name: `${E.folder}/sfx_manifest.json`, data: enc.encode(JSON.stringify(manifest, null, 2)) });
    try { files.push({ name: `${E.folder}/sfx_bank.gd`, data: new Uint8Array(await (await fetch('gd/sfx_bank.gd')).arrayBuffer()) }); } catch { /* optional */ }
    files.push({ name: `${E.folder}/LICENSES.txt`, data: enc.encode('Sounds sourced under CC0 1.0 (public domain dedication); credit not required, but appreciated.\n\n' + [...licences.values()].join('\n') + '\n\nGenerated/edited sounds: Sonic Smithy (Dre Darkroom).\n') });
    if (E.dest === 'server' && caps.encode !== undefined && hub.caps) {
      let ok = 0; for (const f of files) { const r = await fetch('/api/save?path=' + encodeURIComponent(f.name), { method: 'POST', body: f.data }); if (r.ok) ok++; }
      say(`\n↓ wrote ${ok}/${files.length} files to ./exports/${E.folder}/`); toast('written to exports/', 'ok');
    } else {
      const blob = zipStore(files), a = h('a', { href: URL.createObjectURL(blob), download: `${E.folder}_godot.zip` }); document.body.append(a); a.click(); a.remove();
      say(`\n↓ downloaded ${E.folder}_godot.zip (${files.length} files)`); toast('zip downloaded', 'ok');
    }
  }

  const root = h('section', { class: 'mod', id: 'mod-export', hidden: true },
    h('div', { class: 'split wide' },
      h('div', { class: 'col-list' },
        panel('Basket', h('div', {}, h('div', { class: 'bar-row wrap' }, count, h('span', { class: 'sp' }),
          btn('＋ all grade A/S', () => addBy((i) => i.rt && i.rt.score >= 80, 'A/S sounds'), 'ghost'), btn('＋ all 4★+', () => addBy((i) => i.stars >= 4, 'starred sounds'), 'ghost'), btn('＋ workshop', () => addBy((i) => i.made, 'workshop sounds'), 'ghost'), btn('Clear', () => { lib.basket.clear(); emit('basket'); }, 'ghost')), table), { open: true })),
      h('div', { class: 'detail' },
        capPill,
        panel('Format', h('div', { class: 'form' },
          field('Format', sel('format', [['match', 'Match source (same quality in → out)'], ['wav', 'WAV (lossless)'], ['ogg', 'OGG Vorbis'], ['mp3', 'MP3'], ['flac', 'FLAC 24-bit']])),
          field('WAV depth', sel('bits', [['16', '16-bit (Godot SFX default)'], ['24', '24-bit'], ['32', '32-bit float']])),
          field('OGG/MP3 bitrate', sel('kbps', [['match', 'match source'], ['96', '96k'], ['128', '128k'], ['160', '160k'], ['192', '192k'], ['240', '240k'], ['320', '320k']])),
          h('p', { class: 'hint' }, 'Untouched library sounds are copied byte-for-byte (nothing re-encoded, so no quality loss). Edited/generated sounds keep the source’s format & bitrate where possible; OGG/MP3/FLAC encoding uses the local server.')), { open: true }),
        panel('Game-ready processing (edited & generated sounds)', h('div', { class: 'form' },
          field('Sample rate', sel('sr', [['48000', '48 kHz'], ['44100', '44.1 kHz'], ['keep', 'keep']])),
          field('Channels', sel('chans', [['auto', 'auto — mono for positional categories'], ['mono', 'force mono'], ['keep', 'keep']])),
          field('Level', sel('norm', [['peak', 'peak −1 dBTP'], ['loud', 'peak −1 + loudness-match down to category'], ['none', 'leave as-is']])),
          field('Trim silence', sel('trim', [['true', 'yes'], ['false', 'no']]))), { open: true }),
        panel('Destination', h('div', { class: 'form' },
          field('Folder name', h('input', { class: 'inp', value: E.folder, oninput: (e) => { E.folder = slug(e.target.value) || 'sfx'; } })),
          field('Deliver as', sel('dest', [['zip', 'zip download'], ['server', 'write to ./exports/ (needs server)']]))), { open: true }),
        h('div', { class: 'bar-row' }, downBtn('Export for Godot', run, 'red')),
        log,
        h('p', { class: 'hint' }, 'Drop the folder into res://audio/. It contains a sfx_manifest.json (variants, loop points, pitch/volume variation) and sfx_bank.gd — an autoload that plays them: SfxBank.play("pistol_sidearm").'))));
  E.trim = true; root.querySelectorAll('select').forEach((s) => { if (s.value === 'true') E.trim = true; });
  on('basket', paint); on('lib', paint); paint();
  // make the trim select boolean
  root.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' && (e.target.value === 'true' || e.target.value === 'false')) E.trim = e.target.value === 'true'; });
  return { root, onShow: paint };
}

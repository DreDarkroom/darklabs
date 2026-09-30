// Sources: the acquisition side of the pipeline — pull more CC0 packs (live, via the local server),
// and cross-link CrateCall, the sibling tool that does the same audition/keep/export job for music.
import { h, panel, btn, arrowBtn, toast, lib, on } from './core.js';

// Kenney CC0 packs not fetched by default (tools/fetch_cc0.py), picked for a sci-fi movement/VR game.
const SUGGESTED = [
  { name: 'kenney-rpg-audio', landing: 'https://kenney.nl/assets/rpg-audio', tags: 'impact,mech,pickup', why: 'Swings, spell zaps and pickups — good raw material for melee/ability layers.' },
  { name: 'kenney-casino-audio', landing: 'https://kenney.nl/assets/casino-audio', tags: 'ui,pickup', why: 'Crisp chip/coin clicks — a different flavour of UI & pickup transient than Interface Sounds.' },
  { name: 'kenney-music-jingles', landing: 'https://kenney.nl/assets/music-jingles', tags: 'pickup,ui', why: 'Short musical stingers — level-up / objective-complete beats rather than one-shot blips.' },
];
const OTHER_SOURCES = [
  { label: 'Freesound.org — CC0 search', url: 'https://freesound.org/search/?q=&f=license%3A%22Creative+Commons+0%22', note: 'huge, human-recorded Foley; filter License = CC0 before downloading' },
  { label: 'OpenGameArt.org — CC0 audio', url: 'https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=13&sort_by=count&sort_order=DESC&field_art_licenses_tid%5B%5D=8', note: 'game-ready SFX & music, filter licence = CC0' },
  { label: 'Kenney.nl — full asset catalogue', url: 'https://kenney.nl/assets?q=audio', note: 'every CC0 Kenney audio pack, including ones not listed here yet' },
];

export function init() {
  const packBox = h('div', { class: 'rows' }), sugBox = h('div', { class: 'kinds' }), log = h('pre', { class: 'log' }), caps = h('span', { class: 'pill no' }, 'checking server…');
  let ok = false;
  fetch('/api/caps').then((r) => r.json()).then((c) => { ok = !!c.fetch; caps.textContent = ok ? 'server on — live fetch available' : 'server needs numpy+soundfile'; caps.className = 'pill ' + (ok ? 'ok' : 'no'); paintSug(); })
    .catch(() => { caps.textContent = 'no local server — run  python server.py  to fetch packs live'; caps.className = 'pill no'; paintSug(); });

  function packCounts() {
    const by = new Map();
    for (const it of lib.items) by.set(it.pack, (by.get(it.pack) || 0) + 1);
    return by;
  }
  function paintPacks() {
    const by = packCounts();
    packBox.replaceChildren(...[...by.entries()].sort((a, b) => b[1] - a[1]).map(([pack, n]) =>
      h('div', { class: 'row', style: 'grid-template-columns: 1fr 60px;cursor:default' }, h('span', { class: 'nm' }, pack), h('span', { class: 'dim' }, n + ' sounds'))));
    if (!by.size) packBox.append(h('div', { class: 'empty' }, 'no packs loaded yet'));
  }
  async function fetchPack(p, cardBtn) {
    if (!ok) return toast('start  python server.py  first — this pulls a real zip from kenney.nl', 'bad');
    cardBtn.disabled = true; cardBtn.textContent = 'fetching…';
    log.textContent += `→ fetching ${p.name} from ${p.landing}\n`; log.scrollTop = 1e9;
    try {
      const r = await fetch(`/api/fetch-pack?name=${encodeURIComponent(p.name)}&landing=${encodeURIComponent(p.landing)}&tags=${encodeURIComponent(p.tags)}`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || 'fetch failed');
      log.textContent += `✓ ${j.files} files → library/cc0/${p.name}/ — reloading library…\n`;
      const { loadIndex } = await import('./core.js'); await loadIndex();
      toast(`${j.files} sounds added from ${p.name}`, 'ok'); cardBtn.textContent = '✓ fetched'; paintPacks();
    } catch (e) { log.textContent += `✗ ${e.message}\n`; toast('fetch failed — see log', 'bad'); cardBtn.disabled = false; cardBtn.textContent = 'Fetch this pack →'; }
  }
  function paintSug() {
    const have = new Set([...packCounts().keys()]);
    sugBox.replaceChildren(...SUGGESTED.map((p) => {
      const got = have.has(p.name);
      const b = h('button', { class: 'btn' + (got ? ' ghost' : ' purple'), disabled: got, onclick: (e) => fetchPack(p, e.target) }, got ? '✓ already in library' : 'Fetch this pack →');
      return h('div', { class: 'kind', style: 'cursor:default' }, h('b', {}, p.name.replace('kenney-', '')), h('small', {}, p.why), b);
    }));
  }
  const mailUrl = (() => {
    const subj = 'Sonic Smithy: suggested CC0 pack';
    const body = 'Pack name:\nLanding page (kenney.nl/assets/... or a CC0 Freesound/OpenGameArt link):\nWhy it fits the game:\n';
    return `mailto:cratecall@dredarkroom.com?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  })();

  const root = h('section', { class: 'mod', id: 'mod-sources', hidden: true },
    h('div', { class: 'split wide' },
      h('div', { class: 'col-list' },
        panel('Pull more CC0 sounds', h('div', {}, h('div', { class: 'bar-row' }, caps), sugBox,
          h('p', { class: 'hint' }, 'Live-fetches the real zip from kenney.nl, extracts it into library/cc0/, and rebuilds the index — no page reload needed. This only works while server.py is running (it needs a backend to reach the network and unzip); the browser-only build can\'t do this itself. Roadmap: an in-browser fetch fallback (CORS permitting) for the static Pages build.'),
          h('div', { class: 'bar-row' }, h('a', { class: 'btn ghost', href: mailUrl }, 'Suggest a pack →'))), { open: true }),
        panel('Other CC0 sources', h('div', {}, OTHER_SOURCES.map((s) => h('div', { class: 'bar-row wrap' }, h('a', { class: 'btn ghost', href: s.url, target: '_blank', rel: 'noopener' }, s.label), h('span', { class: 'dim' }, s.note)))), { open: false })),
      h('div', { class: 'detail' },
        panel('Library packs currently loaded', packBox, { open: true }),
        panel('CrateCall — the music half of this pipeline', h('div', {},
          h('p', { class: 'hint' }, 'CrateCall is the sibling tool for the same VR game: audition candidate music tracks (Love / Keep / Maybe / Drop), trim a loop, and send picks to the team. Sonic Smithy does the equivalent job for SFX — rate, layer, generate, export. Use CrateCall when a sound in Rail Lab or Layer Lab needs a musical bed rather than an effect.'),
          h('div', { class: 'bar-row' }, arrowBtn('Open CrateCall', () => { window.open('../cratecall/', '_blank'); }, 'purple'))), { open: true }),
        panel('Fetch log', log, { open: true }))));
  on('lib', paintPacks); paintPacks(); paintSug();
  return { root, onShow() { paintPacks(); } };
}

/* Darklabs hub tests: device detection, the boost order, the lantern spring, the card order the owner asked for, the symbols, lazy loading, and the right-click menu fix.
   Run from the repo root:  node --test tests/hub.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectDevice, boostOrder, chase, FX_DEFAULTS } from '../hub/logic.js';

const page = fs.readFileSync('index.html', 'utf8');
const ids = (section) => [...section.matchAll(/class="hang" data-id="([^"]+)"/g)].map((m) => m[1]);
const parts = page.split(/<h2 class="sect">/);                       // [head, line, trays, roadmap]
const line = ids(parts[1]), trays = ids(parts[2]), soon = ids(parts[3]);
const tagsOf = (id) => {
  const m = page.match(new RegExp(`<article class="[^"]*" id="${id}"[^>]*>(<span class="tags">.*?</span></span>)?`));
  return m && m[1] ? [...m[1].matchAll(/data-t="(\w+)"/g)].map((x) => x[1]) : [];
};

test('detectDevice: headsets, phones, tablets and desktops', () => {
  const quest = 'Mozilla/5.0 (X11; Linux x86_64; Android 12) AppleWebKit/537.36 Chrome/120 OculusBrowser/30.0 VR Mobile Safari/537.36';
  assert.equal(detectDevice({ ua: quest }), 'vr', 'a Quest says Android and Mobile too: the headset wins');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36' }), 'mobile');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' }), 'mobile');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', touchPoints: 5 }), 'mobile', 'an iPad that says Mac');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', touchPoints: 0 }), 'desktop');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', coarse: false, width: 1440 }), 'desktop');
  assert.equal(detectDevice({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', coarse: true, touchPoints: 10, width: 1920 }), 'desktop', 'a big touchscreen laptop is still a desktop');
  assert.equal(detectDevice(), 'desktop');
});

test('boostOrder: boosted first for this device only, everything else keeps its order', () => {
  const items = [{ id: 'a' }, { id: 'b', boost: { mobile: 5 } }, { id: 'c', boost: { vr: 5 } }, { id: 'd' }, { id: 'e', boost: { mobile: 2, vr: 1 } }];
  assert.deepEqual(boostOrder(items, 'desktop').map((x) => x.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(boostOrder(items, 'mobile').map((x) => x.id), ['b', 'e', 'a', 'c', 'd']);
  assert.deepEqual(boostOrder(items, 'vr').map((x) => x.id), ['c', 'e', 'a', 'b', 'd']);
  assert.equal(items[0].id, 'a', 'the input is not changed');
});

test('chase: settles on the target and stays stable for long frames', () => {
  for (const dt of [0.004, 0.016, 0.05, 0.1, 0.5]) {
    let s = { x: 0, v: 0 };
    for (let i = 0; i < 600; i++) { s = chase(s, 100, dt); assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 1000, `dt ${dt} blew up`); }
    assert.ok(Math.abs(s.x - 100) < 0.5, `dt ${dt} did not settle: ${s.x}`);
  }
});

test('the optional features are off by default; the harmless ones are on', () => {
  for (const k of ['robots', 'beam', 'dust', 'motion', 'icons3d']) assert.equal(FX_DEFAULTS[k], false, k);
  assert.equal(FX_DEFAULTS.boost, true); assert.equal(FX_DEFAULTS.cursor, true);
});

test('card order: the order that was asked for', () => {
  const at = (id) => trays.indexOf(id);
  assert.ok(at('circuitstomp') === 0, 'CircuitStomp leads the trays');
  assert.ok(at('circuitstomp') < at('crate-capture'), 'CircuitStomp is above the top line of the other WIP items');
  assert.ok(at('glowgrain') > at('darkography') && at('throattapper') > at('darkography'), 'the retired ones are below the rest');
  assert.deepEqual(trays.slice(-3).sort(), ['glowgrain', 'pipeline-test', 'throattapper'], 'the last three are the retired ones');
  assert.ok(trays.indexOf('glowgrain') > trays.indexOf('throattapper') || trays.indexOf('glowgrain') === trays.length - 1, 'GlowGrain is the last');
  assert.ok(line.includes('chunguscello') && line.includes('wipelight'));
  assert.equal(new Set([...line, ...trays, ...soon]).size, line.length + trays.length + soon.length, 'no card appears twice');
});

test('symbols: ChungusCello is featured + VR, Glass Groove is for phones, retired ones are marked, and nothing says NEW', () => {
  assert.deepEqual(['featured', 'vr'].filter((t) => !tagsOf('chunguscello').includes(t)), []);
  assert.ok(tagsOf('wipelight').includes('mobile'));
  assert.ok(tagsOf('glowgrain').includes('retired') && tagsOf('throattapper').includes('retired'));
  assert.ok(tagsOf('circuitstomp').includes('wip'));
  assert.ok(!/<i>NEW<\/i>|class="new"|>NEW</.test(page), 'no NEW label');
  const used = new Set([...page.matchAll(/data-t="(\w+)"/g)].map((m) => m[1]));
  const legend = new Set([...page.matchAll(/<li><span class="tag"[^>]*data-t="(\w+)"/g)].map((m) => m[1]));
  for (const t of used) assert.ok(legend.has(t), `symbol ${t} is explained in the legend`);
  for (const t of used) assert.ok(page.includes(`.tag[data-t=${t}]{--tip:"`), `symbol ${t} has a tooltip`);
});

test('the boost data points at the right cards', () => {
  const boost = (id) => { const m = page.match(new RegExp(`data-id="${id}"[^>]*data-boost='([^']+)'`)); return m && JSON.parse(m[1]); };
  assert.ok(boost('chunguscello').vr > (boost('wipelight').vr || 0), 'ChungusCello leads in a headset');
  assert.ok(boost('wipelight').mobile > (boost('chunguscello').mobile || 0), 'Glass Groove leads on a phone');
});

test('lean by default: the hub page loads only its own small scripts, and the heavy ones are imported on demand', () => {
  const scripts = [...page.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts.sort(), ['hub/hub.js', 'kit/ctx.js']);
  assert.ok(!/(src|href)="[^"]*(three|hub3d|robots)[^"]*"/.test(page), 'no heavy or optional file is linked from the page');
  const hub = fs.readFileSync('hub/hub.js', 'utf8');
  assert.ok(/import\('\.\/fx\.js'\)/.test(hub) && /import\('\.\.\/robots\.js'\)/.test(hub) && /import\('\.\.\/hub3d\.js'\)/.test(hub), 'fx, robots and 3D icons are dynamic imports');
  assert.ok(page.length < 45000, `index.html stays small (${page.length} bytes)`);
});

test('robots: no swivelling mirror flip, they can be started and stopped, and the Word Lab link works from the Word Lab', () => {
  const js = fs.readFileSync('robots.js', 'utf8'), css = fs.readFileSync('robots.css', 'utf8'), learn = fs.readFileSync('learn/learn.js', 'utf8');
  assert.ok(!/scaleX/.test(css) && !/--dir/.test(js), 'the robots never flip to face the other way');
  assert.ok(/export function init\(/.test(js) && /export function stop\(/.test(js));
  assert.ok(/wordlab:open/.test(js) && /wordlab:open/.test(learn), 'same-page "Learn the word" links are handled and the Word Lab listens');
});

test('right-click menu: scrolling inside it does not close it', () => {
  const ctx = fs.readFileSync('kit/ctx.js', 'utf8');
  assert.ok(/const onAway = \(e\) =>/.test(ctx) && /menu\.contains\(e\.target\)/.test(ctx), 'the menu ignores its own scroll events');
  assert.ok(/overscroll-behavior: contain/.test(ctx));
});

test('the studio names are gone from the KlartextKit', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  for (const f of walk('klartext').filter((x) => /\.(js|html|md|json|css|webmanifest)$/.test(x))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/Electronic Arts|Triangle Factory|Rockstar|Take-Two|Take Two/i.test(t), `${f} names a studio`);
  }
});

test('every shared script parses as an ES module, and the Word Lab no longer has the glued "Stringprefs" typo', async () => {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os'), path = await import('node:path');
  const files = ['robots.js', 'robots-data.js', 'learn/learn.js', 'hub/hub.js', 'hub/fx.js', 'hub/logic.js', 'kit/prefs.js', 'kit/ctx.js'];
  for (const f of files) {
    const tmp = path.join(os.tmpdir(), `parse-${f.replace(/\W/g, '_')}.mjs`);
    fs.writeFileSync(tmp, fs.readFileSync(f, 'utf8'));
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f} does not parse: ${r.stderr}`);
  }
  assert.ok(!/String(prefs|\w+\.get)\b/.test(fs.readFileSync('learn/learn.js', 'utf8')), 'String( is never glued to the next word');
});

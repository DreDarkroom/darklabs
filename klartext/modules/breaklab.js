/* Bruchlabor (Break Lab): push this device until it breaks, on purpose, and write down where.
   Twelve load generators (things that really slow pages and headsets down). Each ramps up in steps; after every step the live frame rate decides: still smooth, or broken.
   A break = the frame rate fell below your line, or one frame took longer than the freeze limit. The last smooth step is the limit; 60% of it is the suggested budget.
   CRASHES ARE RECORDED: before every step a marker is saved; if the tab dies or freezes hard enough that you close it, the marker is still there next time and is logged as an abrupt end.
   Frame rates inside a hidden or software-rendered browser are unreliable: judge real numbers on the real device (a Quest, a phone), not on a desktop preview. */
import { h, icon, delegate, put, fill } from '../core/dom.js';
import { MODULES } from '../core/registry.js';
import { head, chips, toggle } from './_ui.js';

/* ---- pure helpers (tested) ---- */
export const nextLevel = (start, grow, k) => Math.max(1, Math.round(start * Math.pow(grow, k)));
export const budget = (level) => Math.max(1, Math.floor(level * 0.6));
/** snap = meter snapshot over the step. Too few frames in the window means the page is under 3 fps: that is broken. */
export function isBroken(snap, { minFps = 45, freezeMs = 700 } = {}) {
  if (snap.n < 4) return { broken: true, reason: 'frames almost stopped' };
  if (snap.worst > freezeMs) return { broken: true, reason: `a frame took ${Math.round(snap.worst)} ms` };
  if (snap.fps < minFps) return { broken: true, reason: `${snap.fps.toFixed(0)} fps, below ${minFps}` };
  return { broken: false, reason: '' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unit = (id) => LOADS.find((l) => l.id === id)?.unit || '';

/* ---- the twelve load generators. make(slot) returns {set(level), frame(dt), destroy()} or null if this device cannot do it. ---- */
export const LOADS = [
  { id: 'dom', label: 'DOM nodes', unit: 'nodes', start: 500, grow: 1.5, cap: 200000, make(slot) {
    const box = h('div', { class: 'lab-dom' }); slot.append(box); let n = 0, flip = 0;
    return { set(l) { if (l > n) { const f = document.createDocumentFragment(); for (let i = n; i < l; i++) { const s = document.createElement('i'); s.style.cssText = `left:${(i * 37) % 100}%;top:${(i * 53) % 100}%`; f.append(s); } box.append(f); } else while (n > l) { box.lastChild.remove(); n--; } n = l; }, frame() { box.dataset.t = (flip ^= 1); }, destroy() { box.remove(); } };
  } },
  { id: 'anim', label: 'CSS animations', unit: 'animated elements', start: 50, grow: 1.5, cap: 20000, make(slot) {
    const box = h('div', { class: 'lab-anim' }); slot.append(box); let n = 0;
    return { set(l) { while (n < l) { box.append(h('b', { style: { left: `${(n * 29) % 100}%`, top: `${(n * 41) % 100}%`, animationDelay: `${-(n % 17) / 10}s` } })); n++; } while (n > l) { box.lastChild.remove(); n--; } }, destroy() { box.remove(); } };
  } },
  { id: 'layout', label: 'Layout-heavy animations', unit: 'elements', start: 20, grow: 1.5, cap: 5000, make(slot) {
    const box = h('div', { class: 'lab-layout' }); slot.append(box); let n = 0;
    return { set(l) { while (n < l) { box.append(h('u')); n++; } while (n > l) { box.lastChild.remove(); n--; } }, destroy() { box.remove(); } };
  } },
  { id: 'canvas', label: 'Canvas 2D particles', unit: 'particles', start: 1000, grow: 1.5, cap: 400000, make(slot) {
    const cv = h('canvas', { class: 'lab-cv', width: 480, height: 240 }); slot.append(cv); const g = cv.getContext('2d'); let n = 0, X = new Float32Array(1), Y = X, VX = X, VY = X;
    return { set(l) { if (l > X.length) { const grow = (a) => { const b = new Float32Array(l); b.set(a); return b; }; const old = X.length; X = grow(X); Y = grow(Y); VX = grow(VX); VY = grow(VY); for (let i = old; i < l; i++) { X[i] = Math.random() * 480; Y[i] = Math.random() * 240; VX[i] = Math.random() * 3 - 1.5; VY[i] = Math.random() * 3 - 1.5; } } n = l; },
      frame() { g.clearRect(0, 0, 480, 240); g.fillStyle = '#ff2500'; for (let i = 0; i < n; i++) { X[i] += VX[i]; Y[i] += VY[i]; if (X[i] < 0 || X[i] > 480) VX[i] = -VX[i]; if (Y[i] < 0 || Y[i] > 240) VY[i] = -VY[i]; g.fillRect(X[i], Y[i], 3, 3); } }, destroy() { cv.remove(); } };
  } },
  { id: 'fill', label: 'Canvas fill-rate (big gradients)', unit: 'full-size fills', start: 5, grow: 1.4, cap: 5000, make(slot) {
    const cv = h('canvas', { class: 'lab-cv', width: 480, height: 240 }); slot.append(cv); const g = cv.getContext('2d'); let n = 0;
    const gr = [0, 1, 2, 3].map((i) => { const q = g.createRadialGradient(240, 120, 5, 240, 120, 260); q.addColorStop(0, ['#ff2500', '#ffd400', '#3d8bff', '#19d46a'][i]); q.addColorStop(1, 'rgba(0,0,0,0)'); return q; });
    return { set(l) { n = l; }, frame() { g.globalAlpha = 0.05; for (let i = 0; i < n; i++) { g.fillStyle = gr[i & 3]; g.fillRect(0, 0, 480, 240); } g.globalAlpha = 1; }, destroy() { cv.remove(); } };
  } },
  { id: 'gl', label: 'WebGL points (GPU fill)', unit: 'points', start: 1000, grow: 1.6, cap: 2000000, make(slot) {
    const cv = h('canvas', { class: 'lab-cv', width: 480, height: 240 }); slot.append(cv); const gl = cv.getContext('webgl'); if (!gl) { cv.remove(); return null; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;uniform float t;void main(){vec2 q=p+vec2(sin(t+p.y*9.),cos(t+p.x*9.))*.05;gl_Position=vec4(q,0.,1.);gl_PointSize=14.;}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(1.,.15,0.,.12*(1.-d*2.));}'));
    gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tl = gl.getUniformLocation(pr, 't'); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); let n = 0;
    return { set(l) { const a = new Float32Array(l * 2); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; gl.bufferData(gl.ARRAY_BUFFER, a, gl.DYNAMIC_DRAW); n = l; },
      frame() { gl.viewport(0, 0, 480, 240); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(tl, performance.now() / 1000); gl.drawArrays(gl.POINTS, 0, n); },
      destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); cv.remove(); } };
  } },
  { id: 'js', label: 'JavaScript work', unit: 'thousand loops per frame', start: 5, grow: 1.4, cap: 20000, make() {
    let k = 0, sink = 0;
    return { set(l) { k = l * 1000; }, frame() { let s = 0; for (let i = 0; i < k; i++) s += Math.sin(i) * Math.sqrt(i); sink = s; return sink; }, destroy() {} };
  } },
  { id: 'audio', label: 'Audio voices (silent)', unit: 'oscillators', start: 8, grow: 1.5, cap: 2000, make() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; let ac; try { ac = new AC(); } catch (err) { return null; } const v = [];
    return { set(l) { while (v.length < l) { const o = ac.createOscillator(), g = ac.createGain(); g.gain.value = 0.00001; o.type = 'sawtooth'; o.frequency.value = 100 + Math.random() * 900; o.connect(g).connect(ac.destination); o.start(); v.push([o, g]); } while (v.length > l) { const [o, g] = v.pop(); o.stop(); o.disconnect(); g.disconnect(); } },
      destroy() { v.splice(0).forEach(([o, g]) => { try { o.stop(); o.disconnect(); g.disconnect(); } catch (err) { /* already stopped */ } }); ac.close?.(); } };
  } },
  { id: 'memory', label: 'Memory', unit: 'MB held', start: 16, grow: 1.5, cap: 768, danger: 6144, make() {
    const chunks = [];
    return { set(l) { while (chunks.length < l) { const a = new Uint8Array(1 << 20); a.fill(chunks.length & 255); chunks.push(a); } while (chunks.length > l) chunks.pop(); }, destroy() { chunks.length = 0; } };
  } },
  { id: 'events', label: 'Event flood', unit: 'messages per frame', start: 200, grow: 1.5, cap: 200000, make() {
    const ch = new MessageChannel(); let n = 0, got = 0; ch.port1.onmessage = () => { got++; };
    return { set(l) { n = l; }, frame() { for (let i = 0; i < n; i++) ch.port2.postMessage(0); return got; }, destroy() { ch.port1.close(); ch.port2.close(); } };
  } },
  { id: 'storage', label: 'Storage writes', unit: 'writes per frame', start: 5, grow: 1.5, cap: 5000, make() {
    let n = 0; const blob = 'x'.repeat(1024);
    return { set(l) { n = l; }, frame() { try { for (let i = 0; i < n; i++) localStorage.setItem('kk.lab.tmp', blob + i); } catch (err) { /* storage unavailable: nothing to stress */ } }, destroy() { try { localStorage.removeItem('kk.lab.tmp'); } catch (err) { /* ignore */ } } };
  } },
  { id: 'thrash', label: 'Forced layout (thrash)', unit: 'elements', start: 10, grow: 1.5, cap: 5000, make(slot) {
    const box = h('div', { class: 'lab-thrash' }); slot.append(box); const els = []; let w = 10;
    return { set(l) { while (els.length < l) { const e = h('i'); box.append(e); els.push(e); } while (els.length > l) els.pop().remove(); },
      frame() { w = (w % 40) + 1; let t = 0; for (const e of els) { e.style.width = w + 'px'; t += e.offsetWidth; } return t; }, destroy() { box.remove(); } };
  } },
];

export default {
  mount(root, ctx) {
    const { store, meter, vr, timings, attend } = ctx;
    const chosen = new Set(store.get('lab.sel', ['dom', 'anim', 'canvas', 'gl', 'js']));
    let mode = 'one', minFps = store.get('lab.fps', 45), danger = false, stepMs = 1500, running = false, cancel = false, raf = 0;
    const live = h('p', { class: 'labread', 'aria-hidden': 'true' }, '…');
    const slot = h('div', { class: 'lab-slot' }), stage = h('div', { class: 'labstage' }, slot);
    const status = h('p', { class: 'panel note', 'aria-live': 'polite' }, 'Bereit.');
    const resultBox = h('div'), weighBox = h('div');
    let hist = store.get('lab.hist', []);
    const crashed = store.get('lab.live', null);
    if (crashed) { hist.push({ at: crashed.at, ids: crashed.ids, levels: crashed.levels, minFps: crashed.minFps, crash: true, reason: 'ended abruptly: crash, freeze or closed tab' }); store.set('lab.hist', hist.slice(-40)); store.del('lab.live'); }

    /* ---- running a ramp ---- */
    let instances = [];
    const readout = setInterval(() => { const s = meter.snapshot(1000); live.textContent = `${s.fps.toFixed(0)} fps · ${s.avg.toFixed(1)} ms/frame · worst ${s.worst.toFixed(0)} ms · long tasks ${s.long} · long frames ${s.loaf}${s.heapMB ? ` · heap ${s.heapMB.toFixed(0)} MB` : ''} · ${s.nodes} nodes`; }, 250);
    meter.acquire();
    let last = 0;
    function loop(t) { raf = requestAnimationFrame(loop); const dt = t - last; last = t; for (const i of instances) i.api.frame?.(dt); }

    async function ramp(defs, label) {
      instances = []; slot.replaceChildren();
      for (const d of defs) { const sub = h('div', { class: 'lab-sub' }); slot.append(sub); const api = d.make(sub); if (api) instances.push({ def: d, api }); }
      if (!instances.length) { status.textContent = `${label}: auf diesem Gerät nicht möglich.`; return null; }
      const grow = instances.length === 1 ? instances[0].def.grow : 1.4;
      let k = 0, good = null, outcome = null;
      cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
      for (;; k++) {
        if (cancel) { outcome = { reason: 'gestoppt', cancelled: true }; break; }
        const levels = instances.map((i) => nextLevel(i.def.start, grow, k));
        const over = instances.some((i, n) => levels[n] > (danger && i.def.danger ? i.def.danger : danger ? i.def.cap * 10 : i.def.cap));
        if (over) { outcome = { reason: 'kein Bruch bis zur Obergrenze', capped: true }; break; }
        store.set('lab.live', { ids: instances.map((i) => i.def.id), levels, at: Date.now(), minFps });
        status.textContent = `${label}: Stufe ${k + 1}, ${instances.map((i, n) => `${levels[n].toLocaleString('de-DE')} ${i.def.unit}`).join(' + ')}`;
        let failed = null;
        try { instances.forEach((i, n) => i.api.set(levels[n])); } catch (err) { failed = `Fehler: ${err?.name || err}`; }
        if (!failed) {
          await sleep(400); while (document.hidden && !cancel) await sleep(500);
          meter.reset(); await sleep(stepMs); while (document.hidden && !cancel) { await sleep(500); meter.reset(); await sleep(stepMs); }
          const snap = meter.snapshot(stepMs), j = isBroken(snap, { minFps, freezeMs: 700 });
          if (j.broken) failed = j.reason;
          if (!failed) good = { levels, snap };
          else outcome = { reason: failed, levels, snap };
        } else outcome = { reason: failed, levels };
        if (failed) break;
      }
      instances.forEach((i) => { try { i.api.destroy(); } catch (err) { /* ignore */ } }); instances = []; slot.replaceChildren(); cancelAnimationFrame(raf);
      store.del('lab.live');
      const rec = { at: Date.now(), ids: defs.map((d) => d.id), minFps, good: good ? good.levels : null, fpsGood: good ? +good.snap.fps.toFixed(1) : null, breakAt: outcome.levels || null, fpsBreak: outcome.snap ? +outcome.snap.fps.toFixed(1) : null, reason: outcome.reason, capped: !!outcome.capped, cancelled: !!outcome.cancelled };
      if (!rec.cancelled) { hist.push(rec); hist = hist.slice(-40); store.set('lab.hist', hist); }
      return rec;
    }

    async function runAll() {
      if (running) return; running = true; cancel = false; btn.textContent = 'Stopp'; btn.dataset.state = 'stop';
      const defs = LOADS.filter((l) => chosen.has(l.id));
      try {
        if (!defs.length) status.textContent = 'Wähle mindestens eine Last.';
        else if (mode === 'all') await ramp(defs, 'Alles zusammen');
        else for (const d of defs) { if (cancel) break; await ramp([d], d.label); }
        status.textContent = cancel ? 'Gestoppt.' : 'Fertig. Ergebnisse unten.';
        if (!cancel) attend.flash(status, 'ok');
      } finally { running = false; btn.textContent = 'Grenze finden'; delete btn.dataset.state; drawResults(); }
    }

    /* ---- results ---- */
    const fmtLv = (ids, lv) => (lv ? ids.map((id, n) => `${lv[n].toLocaleString('de-DE')} ${unit(id)}`).join(' + ') : '–');
    function drawResults() {
      const rows = [...hist].reverse();
      resultBox.replaceChildren(h('div', { class: 'panel' }, h('h2', null, 'Ergebnisse ', h('span', { class: 'en' }, 'Results')),
        rows.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Test', 'Letzte glatte Stufe', 'Bruch bei', 'Grund', 'Budget (60 %)'].map((t) => h('th', null, t)))),
          h('tbody', null, rows.map((r) => h('tr', { class: r.crash ? 'crashrow' : '' },
            h('td', null, r.ids.map((id) => LOADS.find((l) => l.id === id)?.label || id).join(' + '), h('br'), h('span', { class: 'fine' }, new Date(r.at).toLocaleString('de-DE'))),
            h('td', null, r.crash ? '–' : fmtLv(r.ids, r.good), r.fpsGood ? h('span', { class: 'fine' }, ` (${r.fpsGood} fps)`) : null),
            h('td', null, r.crash ? fmtLv(r.ids, r.levels) : fmtLv(r.ids, r.breakAt), r.fpsBreak ? h('span', { class: 'fine' }, ` (${r.fpsBreak} fps)`) : null),
            h('td', null, r.reason),
            h('td', null, r.good ? r.ids.map((id, n) => `${budget(r.good[n]).toLocaleString('de-DE')} ${unit(id)}`).join(' + ') : '–')))))) : h('p', { class: 'fine' }, 'Noch nichts gemessen.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => download('klartextkit-bruchlabor.json', JSON.stringify(report(), null, 1)) }, 'Bericht speichern (JSON)'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => navigator.clipboard?.writeText(JSON.stringify(report())).catch(() => {}) }, 'Kopieren'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { hist = []; store.set('lab.hist', hist); drawResults(); } }, 'Liste leeren'))));
    }
    function report() {
      return { kit: 'KlartextKit', when: new Date().toISOString(), ua: navigator.userAgent, cores: navigator.hardwareConcurrency || null, memoryGB: navigator.deviceMemory || null, screen: [screen.width, screen.height], dpr: devicePixelRatio, vrLayout: vr.on(), minFps, results: hist, moduleTimings: timings };
    }
    function download(name, text) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); }

    /* ---- weighing the toolkit itself: what each module really costs ---- */
    const silent = { supported: false, hasGerman: false, speak: () => false, stop() {}, voiceName: () => '' };
    async function weigh() {
      weighBox.replaceChildren(h('p', { class: 'panel note' }, 'Wiege alle Werkzeuge …'));
      const out = [];
      for (const m of MODULES.filter((x) => x.id !== 'breaklab')) {
        const t0 = performance.now(); let mod, err = null;
        try { mod = (await m.load()).default; } catch (e) { err = e; }
        const loadMs = performance.now() - t0;
        const entry = performance.getEntriesByType('resource').filter((e) => e.name.endsWith(`/modules/${m.id}.js`)).pop();
        let mountMs = 0, nodes = 0;
        if (mod && !err) {
          const box = h('div'); const t1 = performance.now();
          try { const c = await mod.mount(box, { ...ctx, tts: silent, params: {} }); mountMs = performance.now() - t1; nodes = box.getElementsByTagName('*').length; if (typeof c === 'function') c(); } catch (e) { err = e; }
        }
        out.push({ id: m.id, kb: entry ? Math.round((entry.decodedBodySize || entry.encodedBodySize || 0) / 102.4) / 10 : 0, loadMs, mountMs, nodes, err });
      }
      out.sort((a, b) => b.kb - a.kb);
      const files = performance.getEntriesByType('resource').filter((e) => /\/(core|data)\/[\w-]+\.js$|kk\.css$/.test(e.name));
      const kbOf = (re) => Math.round(files.filter((e) => re.test(e.name)).reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 102.4) / 10;
      weighBox.replaceChildren(h('div', { class: 'panel' }, h('h2', null, 'Was jedes Werkzeug kostet ', h('span', { class: 'en' }, 'What each tool costs')),
        h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Werkzeug', 'JS (KB)', 'Laden (ms)', 'Aufbau (ms)', 'Knoten'].map((t) => h('th', null, t)))),
          h('tbody', null, out.map((r) => h('tr', null, h('th', null, r.id), h('td', null, r.err ? 'Fehler' : r.kb), h('td', null, r.loadMs.toFixed(1)), h('td', null, r.mountMs.toFixed(1)), h('td', null, r.nodes))))),
        h('p', { class: 'fine' }, `Kern (core): ${kbOf(/\/core\//)} KB · Daten (data): ${kbOf(/\/data\//)} KB · Stylesheet: ${kbOf(/kk\.css/)} KB (unkomprimiert, wie geladen). Ladezeiten kommen aus dem Cache, wenn du die Werkzeuge schon geöffnet hattest.`),
        h('p', { class: 'fine' }, 'Zum Abspecken: erst die Werkzeuge mit dem größten JS und den meisten Knoten prüfen. Mit brand.json lassen sich Werkzeuge ausblenden, ohne Code zu ändern.')));
    }

    /* ---- controls ---- */
    const btn = h('button', { class: 'btn big', type: 'button', onclick: () => { if (running) { cancel = true; } else runAll(); } }, 'Grenze finden');
    const pickers = h('div', { class: 'chips', role: 'group', 'aria-label': 'Lasten' });
    const drawPick = () => pickers.replaceChildren(...LOADS.map((l) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(l.id)), onclick: () => { chosen.has(l.id) ? chosen.delete(l.id) : chosen.add(l.id); store.set('lab.sel', [...chosen]); drawPick(); } }, l.label)));
    drawPick();

    put(root, 
      head('Bruchlabor', 'Stress lab', 'Treib dieses Gerät mit Absicht bis zur Grenze und schreib auf, wo sie liegt.'),
      crashed ? h('p', { class: 'panel warn', role: 'alert' }, 'Der letzte Lauf endete abrupt (Absturz, Einfrieren oder geschlossener Tab). Er steht in der Liste, mit der Stufe, bei der es passierte.') : null,
      h('p', { class: 'panel note' }, 'Ehrlicher Hinweis: Bilder pro Sekunde in einem Vorschaufenster oder ohne Grafikkarte sagen wenig. Miss auf dem echten Gerät, zum Beispiel in der Quest.'),
      h('div', { class: 'panel filters' },
        h('h2', null, 'Was soll es quälen?'), pickers,
        chips('Wie?', [{ id: 'one', text: 'Eins nach dem anderen' }, { id: 'all', text: 'Alles zusammen' }], mode, (v) => { mode = v; }),
        chips('Bruch, wenn Bilder pro Sekunde unter …', [30, 45, 60, 72].map((n) => ({ id: n, text: `${n} fps` })), minFps, (n) => { minFps = n; store.set('lab.fps', n); }),
        toggle('Gefahrenmodus: Obergrenzen aufheben', danger, (v) => { danger = v; }),
        danger ? h('p', { class: 'warn' }, 'Kann den Tab einfrieren oder abstürzen lassen (im Quest-Browser startet der Browser dann neu). Das ist der Sinn: Der Absturzpunkt wird beim nächsten Öffnen notiert.') : null,
        btn),
      status, live, stage, resultBox,
      h('div', { class: 'panel' }, h('h2', null, 'Das Kit selbst wiegen'), h('p', null, 'Lädt jedes Werkzeug einmal still und misst Größe, Ladezeit, Aufbauzeit und Knoten.'), h('button', { class: 'btn', type: 'button', onclick: weigh }, 'Alle Werkzeuge wiegen')), weighBox);
    drawResults();
    return () => { cancel = true; clearInterval(readout); cancelAnimationFrame(raf); instances.forEach((i) => { try { i.api.destroy(); } catch (err) { /* ignore */ } }); store.del('lab.live'); meter.release(); };
  },
};

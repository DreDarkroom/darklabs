/* VR-Raum (VR room, EXPERIMENTAL): flashcards on a big panel in front of you, in a headset. Point a controller (or pinch with hand tracking) and press to use the buttons.
   The panel is one canvas drawn by paintPanel(); the buttons are plain rectangles from layout(), so the hit-testing is ordinary tested maths, not guesswork.
   three.js (MIT, already in this site's vendor folder) is only loaded when you open the room, so it costs nothing until then.
   HONEST STATUS: the layout and hit-testing are tested; the desktop preview is checked in a browser; the immersive headset session has NOT been tested on a real headset yet. */
import { h, put, fill } from '../core/dom.js';
import { CATS } from '../data/cats.js';
import { PHRASES } from '../data/phrases.js';
import { filterPhrases } from '../core/select.js';
import { onColor } from '../core/color.js';
import { head } from './ui.js';

export const W = 1280, H = 800;

/** Every clickable rectangle on the panel (canvas pixels). */
export function layout() {
  const regs = [], ids = ['all', ...Object.keys(CATS)], cw = 132, ch = 72, gap = 12, x0 = (W - (ids.length * cw + (ids.length - 1) * gap)) / 2;
  ids.forEach((id, i) => regs.push({ id: `cat:${id}`, x: x0 + i * (cw + gap), y: 28, w: cw, h: ch }));
  const bw = 270, bh = 130, by = H - 170, bg = 28, bx = (W - (4 * bw + 3 * bg)) / 2;
  ['prev', 'show', 'say', 'next'].forEach((id, i) => regs.push({ id, x: bx + i * (bw + bg), y: by, w: bw, h: bh }));
  return regs;
}
export const regionAt = (regs, x, y) => regs.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
const LABEL = { prev: '◀ Zurück', show: 'Zeigen', say: '🔊 Hören', next: 'Weiter ▶' };

function fit(g, text, maxW, start, min) { let s = start; do { g.font = `700 ${s}px system-ui, sans-serif`; s -= 4; } while (g.measureText(text).width > maxW && s > min); return s; }

/** Draw the whole panel. st = { p, shown, hover, cat, idx, n } */
export function paintPanel(g, st) {
  g.fillStyle = '#0b0b10'; g.fillRect(0, 0, W, H);
  for (const r of layout()) {
    const hov = st.hover === r.id;
    if (r.id.startsWith('cat:')) {
      const id = r.id.slice(4), c = CATS[id], on = st.cat === id, hue = c ? c.hue : '#ffffff';
      g.fillStyle = on ? hue : '#1b1b24'; g.fillRect(r.x, r.y, r.w, r.h);
      g.lineWidth = hov ? 8 : 4; g.strokeStyle = hov ? '#ffffff' : hue; g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle = on ? onColor(hue) : '#ffffff'; g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(c ? c.de : 'Alle', r.x + r.w / 2, r.y + r.h / 2);
    } else {
      g.fillStyle = hov ? '#ffffff' : '#ff2500'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#000000'; g.font = '700 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(LABEL[r.id], r.x + r.w / 2, r.y + r.h / 2);
    }
  }
  const p = st.p, hue = p ? CATS[p.cat].hue : '#444444';
  g.fillStyle = hue; g.fillRect(60, 140, W - 120, 14);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (!p) { g.fillStyle = '#fff'; g.font = '700 44px system-ui, sans-serif'; g.fillText('Keine Karten in dieser Auswahl', W / 2, 360); return; }
  g.fillStyle = '#ffffff'; fit(g, p.de, W - 160, 112, 40); g.fillText(p.de, W / 2, 330);
  g.fillStyle = st.shown ? '#d9d9e6' : '#555566'; fit(g, st.shown ? p.en : '· · ·', W - 160, 60, 30); g.fillText(st.shown ? p.en : '· · ·', W / 2, 450);
  g.fillStyle = '#9a9aab'; g.font = '600 28px system-ui, sans-serif'; g.fillText(`${CATS[p.cat].de} · ${st.idx + 1} / ${st.n}`, W / 2, 530);
}

export default {
  async mount(root, ctx) {
    const { tts, vr } = ctx;
    const caps = await vr.caps();
    const msg = h('p', { class: 'panel note', 'aria-live': 'polite' }, '');
    const stageBox = h('div', { class: 'vrstage' });
    let session = null, dispose = null;

    async function build(immersive) {
      msg.textContent = 'Lade 3D …';
      dispose?.(); dispose = null; stageBox.replaceChildren();
      let THREE;
      try { THREE = await import('../../chunguscello/vendor/three.module.min.js'); } catch (err) { msg.textContent = 'Konnte die 3D-Bibliothek nicht laden (nur online beim ersten Mal).'; return; }
      const regs = layout();
      const st = { cat: 'all', idx: 0, shown: false, hover: null, n: 0, p: null };
      let list = [];
      const refresh = () => { list = filterPhrases(PHRASES, { cat: st.cat, crude: false }); st.n = list.length; st.idx = Math.min(st.idx, Math.max(0, list.length - 1)); st.p = list[st.idx] || null; };
      refresh();
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const repaint = () => {
        paintPanel(g, st); tex.needsUpdate = true;
        canvas.setAttribute('aria-label', st.p ? `Karte ${st.idx + 1} von ${st.n}: ${st.p.de}${st.shown ? ' = ' + st.p.en : ''}` : 'Keine Karten in dieser Auswahl');
      };
      const act = (id) => {
        if (!id) return;
        if (id.startsWith('cat:')) { st.cat = id.slice(4); st.idx = 0; st.shown = false; refresh(); }
        else if (id === 'next' && list.length) { st.idx = (st.idx + 1) % list.length; st.shown = false; st.p = list[st.idx]; }
        else if (id === 'prev' && list.length) { st.idx = (st.idx - 1 + list.length) % list.length; st.shown = false; st.p = list[st.idx]; }
        else if (id === 'show') st.shown = !st.shown;
        else if (id === 'say' && st.p) tts.speak(st.p.say || st.p.de);
        repaint();
      };
      const canvas = document.createElement('canvas'); canvas.className = 'vrcanvas'; canvas.setAttribute('role', 'img');
      const renderer = new THREE.WebGLRenderer({ antialias: true, canvas }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(Math.min(960, stageBox.clientWidth || 960), 540);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05050a);
      const camera = new THREE.PerspectiveCamera(60, 960 / 540, 0.1, 50); camera.position.set(0, 1.5, 0.4);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshBasicMaterial({ map: tex })); panel.position.set(0, 1.5, -1.4); scene.add(panel);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.58, 64), new THREE.MeshBasicMaterial({ color: 0xff2500, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
      const rc = new THREE.Raycaster(), tmp = new THREE.Matrix4(), o = new THREE.Vector3(), d = new THREE.Vector3(), ndc = new THREE.Vector2();
      const regionFromRay = () => { const hit = rc.intersectObject(panel)[0]; return hit ? regionAt(regs, hit.uv.x * W, (1 - hit.uv.y) * H) : null; };

      const ctrls = [];
      for (let i = 0; i < 2; i++) {
        const c = renderer.xr.getController(i);
        c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: 0xffffff })));
        c.addEventListener('selectstart', () => act(rayOf(c)));
        scene.add(c); ctrls.push(c);
      }
      function rayOf(c) { tmp.identity().extractRotation(c.matrixWorld); o.setFromMatrixPosition(c.matrixWorld); d.set(0, 0, -1).applyMatrix4(tmp); rc.set(o, d); return regionFromRay(); }

      const onMove = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(ndc, camera); const id = regionFromRay(); if (id !== st.hover) { st.hover = id; repaint(); } };
      const onClick = (e) => { onMove(e); act(st.hover); };
      canvas.addEventListener('pointermove', onMove); canvas.addEventListener('click', onClick);

      renderer.setAnimationLoop(() => {
        if (renderer.xr.isPresenting) { let hv = null; for (const c of ctrls) { hv = rayOf(c) || hv; } if (hv !== st.hover) { st.hover = hv; repaint(); } }
        renderer.render(scene, camera);
      });
      repaint();
      stageBox.append(canvas);
      dispose = () => { renderer.setAnimationLoop(null); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('click', onClick); try { session?.end(); } catch (err) { /* already ended */ } session = null; renderer.dispose(); tex.dispose(); canvas.remove(); };

      if (immersive) {
        try {
          renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
          session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
          session.addEventListener('end', () => { session = null; msg.textContent = 'VR-Sitzung beendet.'; });
          await renderer.xr.setSession(session);
          msg.textContent = 'Du bist drin. Zeig mit dem Controller auf eine Taste und drück den Abzug.';
        } catch (err) { msg.textContent = `VR konnte nicht starten: ${err?.message || err}`; }
      } else msg.textContent = 'Vorschau am Bildschirm: fahr mit der Maus über die Tasten und klick. So sieht die Tafel in VR aus.';
    }

    put(root, 
      head('VR-Raum', 'VR room (experimental)', 'Karteikarten auf einer großen Tafel vor dir.'),
      h('p', { class: 'panel note' }, 'Ehrlicher Stand: Die Tafel, die Tasten und das Zielen sind getestet, die Vorschau am Bildschirm auch. Eine echte VR-Sitzung mit einer Brille wurde noch nicht getestet. Wenn du eine Quest hast: probier es und sag mir, was klemmt.'),
      h('div', { class: 'panel' },
        h('table', { class: 'tbl' }, h('tbody', null, [['WebXR', caps.webxr], ['Immersives VR', caps.immersiveVR], ['WebGL', caps.webgl]].map(([a, b]) => h('tr', null, h('th', null, a), h('td', null, b ? 'ja' : 'nein'))))),
        h('div', { class: 'row' },
          h('button', { class: 'btn big', type: 'button', disabled: !caps.immersiveVR || !caps.webgl, onclick: () => build(true) }, 'In VR starten'),
          h('button', { class: 'btn', type: 'button', disabled: !caps.webgl, onclick: () => build(false) }, 'Vorschau am Bildschirm')),
        !caps.immersiveVR ? h('p', { class: 'fine' }, 'Echtes VR gibt es nur im Browser einer Brille (zum Beispiel Meta Quest) und nur über HTTPS. Die Vorschau geht überall.') : null),
      msg, stageBox);
    return () => dispose?.();
  },
};

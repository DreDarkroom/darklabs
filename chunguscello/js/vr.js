// ChungusCello in VR (Meta Quest 2 / 3 / Pro via the Quest Browser, or any
// WebXR headset) and as an inline 3D view everywhere else.
//
// The cello is built at real size: 69 cm from bridge to nut. Your left hand
// stops the string and the pitch follows real string physics — a string
// stopped at length L sounds at f_open × 0.69 / L — so the notes sit exactly
// where they would on a real cello. Your right hand holds a bow; when its hair
// crosses a string near the bridge, the bow's speed along its own length drives
// the string model directly (bow speed, contact point and weight are the same
// three things a cellist controls).
//
// Loaded only when you open the 3D view or enter VR (three.js is ~700 kB).

import * as THREE from "../vendor/three.module.min.js";
import { clamp, lerp, noteName, snapToScale } from "./theory.js";
import { ARTICULATIONS } from "./engine.js";

const STRING_LEN = 0.69;
// cello-local frame: origin = top of the bridge, +y up the strings toward the
// nut, +z out of the front (the side the strings are on), +x toward the C
// string (the bass side — the player's left).
const X_BRIDGE = [0.027, 0.009, -0.009, -0.027];
const Z_BRIDGE = [0.0, 0.005, 0.005, 0.0];
const X_NUT = [0.0115, 0.004, -0.004, -0.0115];
const BOW_ZONE = [0.012, 0.26];     // where along the string the bow can play (m from the bridge)
const FINGER_ZONE = [0.075, STRING_LEN + 0.02];
// bow tilt (radians, in the cello's x–z plane) that meets each string on the arched bridge
const BRIDGE_ARC = [0.47, 0.16, -0.16, -0.47];
const BOW_TILT = BRIDGE_ARC.map((a) => -a);
const BOWED_ARTS = new Set(["arco", "tremolo", "ponti", "tasto", "harmonic"]);

function stringPoint(i, y, out = new THREE.Vector3()) {
  const t = y / STRING_LEN;
  return out.set(lerp(X_BRIDGE[i], X_NUT[i], t), y, lerp(Z_BRIDGE[i], -0.002, t));
}

// closest points between segments p1-q1 and p2-q2 → {d, s, t}
function segSeg(p1, q1, p2, q2) {
  const d1 = new THREE.Vector3().subVectors(q1, p1), d2 = new THREE.Vector3().subVectors(q2, p2), r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return { d: r.length(), s: 0, t: 0 };
  if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s), c2 = p2.clone().addScaledVector(d2, t);
  return { d: c1.distanceTo(c2), s, t };
}

// ---------------------------------------------------------------------------
// The stage: cello, bow, HUD, room. Shared by VR and the inline view.

class Stage {
  constructor(engine, looper, { ar = false } = {}) {
    this.engine = engine; this.looper = looper;
    this.scene = new THREE.Scene();
    this.ar = ar;
    if (!ar) { this.scene.background = new THREE.Color(0x060607); this.scene.fog = new THREE.Fog(0x060607, 4, 12); }
    this.buildLights();
    if (!ar) this.buildRoom();
    this.cello = this.buildCello();
    this.scene.add(this.cello.group);
    this.bow = this.buildBow();
    this.hud = this.buildHud();
    this.scene.add(this.hud.mesh);
    this.ghosts = [];
    this.tmp = new THREE.Vector3();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x553333, 0x0a0505, 0.9));
    const key = new THREE.DirectionalLight(0xffd8b0, 1.6); key.position.set(0.6, 2.4, 1.4); this.scene.add(key);
    const safelight = new THREE.PointLight(0xff2f4e, 6, 7, 1.6); safelight.position.set(-1.4, 2.3, -1.2); this.scene.add(safelight);
    const fill = new THREE.PointLight(0xff8a3d, 2.5, 5, 1.8); fill.position.set(1.2, 1.0, 0.6); this.scene.add(fill);
  }

  buildRoom() {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x120a0b, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    const rings = new THREE.Group();
    for (let r = 0.6; r <= 4; r += 0.6) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r, 96), new THREE.MeshBasicMaterial({ color: 0x3a1418, transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; rings.add(ring);
    }
    this.scene.add(rings);
    // a lightbox sign, darkroom style
    const c = document.createElement("canvas"); c.width = 1024; c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = "#0b0405"; g.fillRect(0, 0, 1024, 160);
    g.font = "bold 92px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#ff2f4e"; g.shadowBlur = 30; g.fillStyle = "#ff2f4e"; g.fillText("CHUNGUSCELLO", 512, 84);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.375), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), toneMapped: false }));
    sign.position.set(0, 2.5, -3.6);
    this.scene.add(sign);
    this.sign = sign;
  }

  buildCello() {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b2410, roughness: 0.38, metalness: 0.05 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3a1308, roughness: 0.5 });
    const ebony = new THREE.MeshStandardMaterial({ color: 0x0d0909, roughness: 0.35 });
    const maple = new THREE.MeshStandardMaterial({ color: 0xe0c9a0, roughness: 0.6 });

    // body outline (right half, then mirrored), metres, bridge at the waist
    const R = [[0.09, 0.335], [0.15, 0.3], [0.17, 0.22], [0.163, 0.14], [0.138, 0.08], [0.116, 0.02], [0.12, -0.04], [0.15, -0.095], [0.2, -0.155], [0.222, -0.245], [0.208, -0.335], [0.16, -0.39], [0.08, -0.416], [0, -0.422]];
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.34);
    shape.splineThru(R.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.splineThru(R.slice(0, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, y)).concat([new THREE.Vector2(0, 0.34)]));
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 48 }), wood);
    body.position.z = -0.197;          // front plate at z ≈ -0.085 (bridge height 8.5 cm)
    group.add(body);
    // f-holes
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.15), new THREE.MeshBasicMaterial({ color: 0x050202 }));
      f.position.set(s * 0.075, 0.0, -0.0845); f.rotation.z = s * 0.08; group.add(f);
    }
    // neck, pegbox, scroll
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.36, 0.034), woodDark);
    neck.position.set(0, 0.52, -0.036); group.add(neck);
    const pegbox = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.045), woodDark);
    pegbox.position.set(0, 0.77, -0.035); group.add(pegbox);
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.012, 10, 24), woodDark);
    scroll.position.set(0, 0.87, -0.04); scroll.rotation.y = Math.PI / 2; group.add(scroll);
    for (let i = 0; i < 4; i++) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.09, 8), ebony);
      peg.rotation.z = Math.PI / 2; peg.position.set(0, 0.72 + i * 0.03, -0.035); group.add(peg);
    }
    // fingerboard (tapered): from y 0.1 to the nut, top just under the strings
    const fbGeo = new THREE.BoxGeometry(1, 1, 1, 1, 8, 1);
    const pos = fbGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5;                           // 0..1 along
      const yy = lerp(0.1, STRING_LEN + 0.005, y);
      const w = lerp(0.068, 0.046, y);
      pos.setXYZ(i, pos.getX(i) * w, yy, lerp(-0.019, -0.005, pos.getZ(i) + 0.5) - lerp(0.03, 0.0, y) * 0.3);
    }
    fbGeo.computeVertexNormals();
    const fbMesh = new THREE.Mesh(fbGeo, ebony);
    group.add(fbMesh);
    const nut = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.006, 0.008), maple);
    nut.position.set(0, STRING_LEN + 0.002, -0.004); group.add(nut);
    // bridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.085), maple);
    bridge.position.set(0, 0, -0.043); group.add(bridge);
    // tailpiece + endpin
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.012), ebony);
    tail.position.set(0, -0.2, -0.07); tail.rotation.x = -0.12; group.add(tail);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }));
    pin.position.set(0, -0.67, -0.14); group.add(pin);

    // strings: bridge → nut (sounding part) and bridge → tailpiece
    const strMat = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xcfc6bd, metalness: 0.7, roughness: 0.3, emissive: 0x000000 }));
    const strings = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      stringPoint(i, 0, a); stringPoint(i, STRING_LEN, b);
      const m = cylinderBetween(a, b, 0.0022 - i * 0.00032, strMat[i]);
      group.add(m); strings.push(m);
      const t = cylinderBetween(a, new THREE.Vector3(lerp(0.012, -0.012, i / 3), -0.09, -0.066), 0.0018, strMat[i]);
      group.add(t);
    }
    // finger marker + bow contact marker
    const glow = (col, r) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, toneMapped: false }));
    const finger = glow(0xff2f4e, 0.009); finger.visible = false; group.add(finger);
    const contact = glow(0xff8a3d, 0.006); contact.visible = false; group.add(contact);
    const ghostGeo = new THREE.SphereGeometry(0.007, 12, 8);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.55, toneMapped: false });
    return { group, strings, strMat, finger, contact, ghostGeo, ghostMat };
  }

  buildBow() {
    const g = new THREE.Group();
    const stick = cylinderBetween(new THREE.Vector3(0.03, 0, 0), new THREE.Vector3(-0.72, 0, 0), 0.004, new THREE.MeshStandardMaterial({ color: 0x4a1c0a, roughness: 0.4 }));
    const hair = cylinderBetween(new THREE.Vector3(-0.02, -0.014, 0), new THREE.Vector3(-0.71, -0.009, 0), 0.0035, new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 }));
    const frog = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.014), new THREE.MeshStandardMaterial({ color: 0x0d0909 }));
    frog.position.set(-0.005, -0.008, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0xe0c9a0 }));
    tip.position.set(-0.715, -0.006, 0);
    g.add(stick, hair, frog, tip);
    g.userData.hairA = new THREE.Vector3(-0.03, -0.014, 0);
    g.userData.hairB = new THREE.Vector3(-0.70, -0.009, 0);
    return g;
  }

  buildHud() {
    const c = document.createElement("canvas"); c.width = 768; c.height = 320;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    return { c, g: c.getContext("2d"), tex, mesh, last: 0 };
  }

  drawHud(info) {
    const { g, c, tex } = this.hud;
    const e = this.engine;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(10,5,6,0.82)"; roundRect(g, 0, 0, c.width, c.height, 26); g.fill();
    g.strokeStyle = "#2a1418"; g.lineWidth = 3; g.stroke();
    g.textBaseline = "top";
    g.font = "bold 34px ui-monospace, Menlo, monospace"; g.fillStyle = "#ff2f4e"; g.fillText("CHUNGUSCELLO", 28, 22);
    const art = ARTICULATIONS.find((a) => a.id === e.s.articulation);
    g.font = "bold 30px ui-monospace, Menlo, monospace"; g.fillStyle = "#ff8a3d"; g.textAlign = "right";
    g.fillText(art ? art.name : "", c.width - 28, 24); g.textAlign = "left";
    g.font = "bold 76px ui-monospace, Menlo, monospace"; g.fillStyle = "#f2e4e6";
    g.fillText(info.note || "–", 28, 78);
    g.font = "26px ui-monospace, Menlo, monospace"; g.fillStyle = "#b8a2a6";
    g.fillText(info.detail || "", 300, 92);
    g.fillText(info.detail2 || "", 300, 128);
    // dynamics bar
    g.fillStyle = "#1c0f11"; g.fillRect(28, 190, c.width - 56, 16);
    g.fillStyle = "#ff2f4e"; g.fillRect(28, 190, (c.width - 56) * e.s.dynamics, 16);
    g.font = "24px ui-monospace, Menlo, monospace"; g.fillStyle = "#7a6468";
    const L = this.looper;
    g.fillText(`loop: ${L.state}${L.layers.length ? " · " + L.layers.length + " layers" : ""} · ${Math.round(e.s.bpm)} bpm${e.drone ? " · drone" : ""}`, 28, 222);
    g.fillText(info.help || "", 28, 262);
    tex.needsUpdate = true;
  }

  /** Strings glow + "blur" with the level of whatever is sounding on them. */
  updateStrings(levelsByLane) {
    for (let i = 0; i < 4; i++) {
      const lv = Math.min(1, (levelsByLane[i] || 0) * 6);
      const s = this.cello.strings[i];
      const wob = 1 + lv * 2.2 * (0.6 + 0.4 * Math.sin(performance.now() * 0.09 + i));
      s.scale.set(wob, 1, wob);
      this.cello.strMat[i].emissive.setRGB(lv * 1.0, lv * 0.45, lv * 0.15);
    }
  }

  laneFor(midi) {
    const s = this.engine.openStrings();
    for (let i = 3; i >= 0; i--) if (midi >= s[i] - 0.01 && midi <= s[i] + 12) return i;
    for (let i = 0; i < 4; i++) if (midi >= s[i]) return i === 3 ? 3 : i;
    return 0;
  }

  /** Show where every sounding note would be fingered on a real cello. */
  updateGhosts(skipKey) {
    const hs = [...this.engine.handles.values()].filter((h) => !h.alias && h.key !== skipKey);
    while (this.ghosts.length < hs.length) { const m = new THREE.Mesh(this.cello.ghostGeo, this.cello.ghostMat); this.cello.group.add(m); this.ghosts.push(m); }
    const levels = [0, 0, 0, 0];
    this.ghosts.forEach((m, i) => {
      const h = hs[i];
      if (!h) { m.visible = false; return; }
      const lane = this.laneFor(h.midi);
      const open = this.engine.openStrings()[lane];
      const y = STRING_LEN / Math.pow(2, Math.max(0, h.midi - open) / 12);
      stringPoint(lane, y, m.position);
      m.position.z += 0.004;
      m.visible = h.midi - open > 0.3;
      levels[lane] = Math.max(levels[lane], this.engine.levels.get(h.key) || 0.05);
    });
    return levels;
  }

  place(headPos, forward) {
    // bridge ~32 cm ahead and 55 cm below the eyes; cello leans back 35° toward
    // you and its neck tilts 12° to your left, like a seated cellist's.
    const f = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    if (!isFinite(f.x) || f.lengthSq() < 0.5) f.set(0, 0, -1);
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const p = headPos.clone().addScaledVector(f, 0.32).addScaledVector(right, 0.03);
    p.y = Math.max(0.5, headPos.y - 0.55);
    const g = this.cello.group;
    g.position.copy(p);
    const yaw = Math.atan2(f.x, f.z);
    g.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
    g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.61));
    g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.21));
    g.updateMatrixWorld(true);
    // HUD floats up and to the right, facing you
    this.hud.mesh.position.copy(headPos).addScaledVector(f, 0.9).addScaledVector(right, 0.42);
    this.hud.mesh.position.y = headPos.y + 0.05;
    this.hud.mesh.lookAt(headPos);
  }
}

// bow-local axes → cello-local axes: bow −x runs toward the C side, hair (bow −y) faces the strings
const BOW_IN_CELLO = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));

function cylinderBetween(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return m;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------------------------------------------------------------------------
// Inline 3D view (no headset needed)

let preview = null;

export function startPreview(container, { engine, looper }) {
  stopPreview();
  const stage = new Stage(engine, looper);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const hud = document.createElement("div"); hud.className = "hud"; hud.textContent = "drag to turn · scroll / pinch to zoom · play anything and watch where it's fingered";
  container.appendChild(hud);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 30);
  stage.place(new THREE.Vector3(0, 1.55, 0.35), new THREE.Vector3(0, 0, -1));
  stage.hud.mesh.visible = false;
  const target = new THREE.Vector3(); stage.cello.group.localToWorld(target.set(0, 0.2, -0.1));
  let yaw = Math.PI + 0.5, pitch = 0.18, dist = 1.9, dragging = null, idle = 0;
  const ptrs = new Map();
  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); dragging = true; idle = 0; });
  el.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [px, py] = ptrs.get(e.pointerId);
    if (ptrs.size === 2) {
      const other = [...ptrs.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(px - other[0], py - other[1]), d1 = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
      dist = clamp(dist * (d0 / Math.max(1, d1)), 0.6, 5);
    } else { yaw -= (e.clientX - px) * 0.008; pitch = clamp(pitch + (e.clientY - py) * 0.006, -0.3, 1.2); }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) dragging = false; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", (e) => { e.preventDefault(); dist = clamp(dist * (1 + Math.sign(e.deltaY) * 0.1), 0.6, 5); }, { passive: false });
  const ro = new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); });
  ro.observe(container);
  // a phantom bow that plays whatever bowed note is sounding
  stage.scene.add(stage.bow);
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!dragging) { idle += dt; if (idle > 3) yaw += dt * 0.12; }
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    const levels = stage.updateGhosts();
    stage.updateStrings(levels);
    // bow animation on the loudest bowed lane
    let lane = -1, best = 0.02;
    levels.forEach((l, i) => { if (l > best) { best = l; lane = i; } });
    const bowed = [...engine.handles.values()].some((h) => h.bowed);
    stage.bow.visible = lane >= 0 && bowed;
    if (stage.bow.visible) {
      // bow lies across the string (along the cello's x axis), frog on the
      // A-string side, hair facing the strings; stroke moves it along its length
      const P = stringPoint(lane, 0.085, new THREE.Vector3());
      const stroke = 0.35 + Math.sin(now * 0.0018) * 0.22;
      const frog = new THREE.Vector3();
      const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BRIDGE_ARC[lane]).multiply(BOW_IN_CELLO);
      frog.copy(P).sub(new THREE.Vector3(-stroke, -0.012, 0).applyQuaternion(qr));
      stage.bow.position.copy(stage.cello.group.localToWorld(frog));
      stage.bow.quaternion.copy(stage.cello.group.quaternion).multiply(qr);
    }
    renderer.render(stage.scene, camera);
  });
  preview = { renderer, ro, container };
}

export function stopPreview() {
  if (!preview) return;
  preview.renderer.setAnimationLoop(null);
  preview.ro.disconnect();
  preview.renderer.dispose();
  preview.container.innerHTML = "";
  preview = null;
}

// ---------------------------------------------------------------------------
// Immersive VR / passthrough

let active = null;

export async function enterVR({ engine, looper, fbOpts, onStatus, onArt, onDrone }) {
  if (active) return;
  const xr = navigator.xr;
  if (!xr) throw new Error("WebXR isn't available in this browser.");
  const opts = fbOpts();
  const arOK = opts.ar && (await xr.isSessionSupported("immersive-ar").catch(() => false));
  const mode = arOK ? "immersive-ar" : "immersive-vr";
  const session = await xr.requestSession(mode, { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });

  const stage = new Stage(engine, looper, { ar: arOK });
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: arOK });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.domElement.style.display = "none";
  document.body.appendChild(renderer.domElement);
  try { await renderer.xr.setSession(session); }
  catch (e) { renderer.xr.setReferenceSpaceType("local"); await renderer.xr.setSession(session); }
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
  stage.scene.add(stage.bow);
  stage.bow.visible = false;
  const leftMarker = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3a1418, emissive: 0x220608 }));
  stage.scene.add(leftMarker);

  const S = {
    placed: false, lane: 2, n: 0, cur: null, prevBtn: {}, lastHud: 0, pluckD: [1, 1, 1, 1],
    prevR: null, prevT: 0, vel: new THREE.Vector3(), fingerSmooth: null, k: 1, hapticT: 0, trigHeld: false,
  };
  active = { session, renderer, stage, S };
  onStatus("In VR. Y (left controller) recenters the cello in front of you.");
  engine.emit("vr", true);

  const ref = () => renderer.xr.getReferenceSpace();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  function readInputs(frame) {
    const out = { left: null, right: null };
    for (const src of session.inputSources) {
      const hand = src.handedness === "left" ? "left" : src.handedness === "right" ? "right" : null;
      if (!hand) continue;
      const st = { pos: null, quat: null, trigger: 0, squeeze: 0, buttons: [], axes: [0, 0], hand: !!src.hand, gp: src.gamepad };
      if (src.hand) {
        const tip = frame.getJointPose && frame.getJointPose(src.hand.get("index-finger-tip"), ref());
        const thumb = frame.getJointPose && frame.getJointPose(src.hand.get("thumb-tip"), ref());
        const wrist = frame.getJointPose && frame.getJointPose(src.hand.get("wrist"), ref());
        const p = tip || wrist;
        if (p) {
          st.pos = new THREE.Vector3(p.transform.position.x, p.transform.position.y, p.transform.position.z);
          const q = (wrist || p).transform.orientation; st.quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
        }
        if (tip && thumb) {
          const d = Math.hypot(tip.transform.position.x - thumb.transform.position.x, tip.transform.position.y - thumb.transform.position.y, tip.transform.position.z - thumb.transform.position.z);
          st.trigger = clamp((0.035 - d) / 0.02, 0, 1);
        }
      } else {
        const pose = frame.getPose(src.gripSpace || src.targetRaySpace, ref());
        if (pose) {
          const t = pose.transform;
          st.pos = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
          st.quat = new THREE.Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
        }
        if (src.gamepad) {
          const b = src.gamepad.buttons;
          st.trigger = b[0] ? b[0].value : 0;
          st.squeeze = b[1] ? b[1].value : 0;
          st.buttons = b.map((x) => !!(x && x.pressed));
          st.axes = [src.gamepad.axes[2] || 0, src.gamepad.axes[3] || 0];
        }
      }
      out[hand] = st;
    }
    return out;
  }

  function pressed(hand, i, st) {
    const key = hand + i;
    const now = !!(st && st.buttons[i]);
    const was = !!S.prevBtn[key];
    S.prevBtn[key] = now;
    return now && !was;
  }

  function pulse(st, v, ms) {
    try { const h = st && st.gp && st.gp.hapticActuators && st.gp.hapticActuators[0]; if (h) h.pulse(clamp(v, 0, 1), ms); } catch (e) { /* */ }
  }

  function onFrame(t, frame) {
    if (!frame) return;
    const now = t / 1000;
    const dt = S.prevT ? clamp(now - S.prevT, 0.001, 0.1) : 1 / 72;
    S.prevT = now;
    const o = fbOpts();
    const viewer = frame.getViewerPose(ref());
    const head = viewer ? new THREE.Vector3(viewer.transform.position.x, viewer.transform.position.y, viewer.transform.position.z) : new THREE.Vector3(0, 1.5, 0);
    const hq = viewer ? viewer.transform.orientation : { x: 0, y: 0, z: 0, w: 1 };
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(hq.x, hq.y, hq.z, hq.w));
    if (!S.placed && viewer) { stage.place(head, fwd); S.placed = true; }

    const inp = readInputs(frame);
    const L = inp.left, R = inp.right;
    const cg = stage.cello.group;

    // buttons
    if (pressed("r", 4, R)) { const i = ARTICULATIONS.findIndex((a) => a.id === engine.s.articulation); onArt(ARTICULATIONS[(i + 1) % ARTICULATIONS.length].id); }
    if (pressed("r", 5, R)) looper.press();
    if (pressed("l", 4, L)) onDrone();
    if (pressed("l", 5, L)) stage.place(head, fwd);
    if (R && Math.abs(R.axes[1]) > 0.25) engine.set("dynamics", clamp(engine.s.dynamics - R.axes[1] * dt * 0.7, 0, 1));
    if (R && Math.abs(R.axes[0]) > 0.7) { if (!S.flick) { S.lane = clamp(S.lane + (R.axes[0] > 0 ? -1 : 1), 0, 3); S.flick = true; } } else S.flick = false;

    // ---- left hand: where is the finger on the fingerboard?
    const opens = engine.openStrings();
    let fingerY = null, onNeck = false;
    if (L && L.pos) {
      leftMarker.visible = !L.hand;
      leftMarker.position.copy(L.pos);
      const lp = cg.worldToLocal(L.pos.clone());
      onNeck = Math.abs(lp.x) < 0.07 && lp.z > -0.09 && lp.z < 0.08 && lp.y > FINGER_ZONE[0] - 0.03 && lp.y < FINGER_ZONE[1] + 0.05;
      const touching = onNeck && lp.z > -0.02 && lp.z < 0.025;
      const press = onNeck && (L.trigger > 0.3 || L.squeeze > 0.4 || touching);
      if (onNeck) {
        // which string is under the hand (lanes widened so you don't need millimetre aim)
        const xs = X_BRIDGE.map((x, i) => lerp(x, X_NUT[i], clamp(lp.y / STRING_LEN, 0, 1)));
        let best = 0; xs.forEach((x, i) => { if (Math.abs(lp.x - x) < Math.abs(lp.x - xs[best])) best = i; });
        if (o.easy || !S.cur) S.lane = best;
      }
      if (press) fingerY = clamp(lp.y, FINGER_ZONE[0], STRING_LEN - 0.002);
    }

    // ---- right hand: the bow
    let bowing = false, speed = 0, pressure = 0.5, beta = null, lane = S.lane;
    let vel = null;
    if (R && R.pos) {
      if (S.prevR) { vel = R.pos.clone().sub(S.prevR).divideScalar(dt); S.vel.lerp(vel, 0.5); }
      S.prevR = R.pos.clone();
      stage.bow.visible = !R.hand;
      stage.bow.position.copy(R.pos);
      if (R.quat) stage.bow.quaternion.copy(R.quat);
      stage.bow.updateMatrixWorld(true);
      const bowDirW = stage.bow.localToWorld(tmpA.set(-1, 0, 0)).sub(stage.bow.position).normalize();
      const along = S.vel.dot(bowDirW);                     // m/s along the bow
      if (o.easy || R.hand) {
        bowing = R.trigger > 0.12;
        const mag = S.vel.length();
        speed = (R.trigger * 0.5 + Math.min(1, mag / 0.6)) * (along < -0.03 ? -1 : 1);
        pressure = 0.35 + R.trigger * 0.5;
      } else {
        // real bowing: find the string the hair is touching
        const a = cg.worldToLocal(stage.bow.localToWorld(stage.bow.userData.hairA.clone()));
        const b = cg.worldToLocal(stage.bow.localToWorld(stage.bow.userData.hairB.clone()));
        // The bridge is arched, so (as on a real cello) the bow's tilt picks the
        // string: tilt toward the C side for C, level-ish for G/D, the other way for A.
        const dir = b.clone().sub(a).normalize();
        if (dir.x < 0) dir.negate();
        const tilt = Math.atan2(dir.z, dir.x);
        let li = 0;
        for (let i = 1; i < 4; i++) if (Math.abs(tilt - BOW_TILT[i]) < Math.abs(tilt - BOW_TILT[li])) li = i;
        const r = segSeg(a, b, stringPoint(li, BOW_ZONE[0], tmpA), stringPoint(li, BOW_ZONE[1], tmpB));
        const best = { d: r.d, i: li, y: lerp(BOW_ZONE[0], BOW_ZONE[1], r.t) };
        if (best.d < 0.02) {
          bowing = true; lane = best.i; S.lane = lane;
          speed = clamp(along / 0.45, -1.2, 1.2);
          pressure = clamp(0.25 + R.trigger * 0.6 + (1 - best.d / 0.02) * 0.3, 0, 1);
          beta = clamp(best.y / STRING_LEN, 0.05, 0.3);
          const cp = stringPoint(lane, best.y, new THREE.Vector3());
          stage.cello.contact.position.copy(cp); stage.cello.contact.visible = true;
        } else stage.cello.contact.visible = false;
      }
    }

    // ---- pitch from the stopped length (real string physics)
    const open = opens[lane];
    let midi = open;
    if (fingerY != null) midi = open + 12 * Math.log2(STRING_LEN / fingerY);
    if (o.snap && fingerY != null) {
      S.fingerSmooth = S.fingerSmooth == null ? midi : S.fingerSmooth + (midi - S.fingerSmooth) * (1 - Math.exp(-dt / 0.07));
      const moving = Math.abs(midi - (S.lastRaw ?? midi)) / dt > 4;
      S.k = clamp(S.k + (moving ? -dt * 10 : dt * 4), 0, 1);
      midi = midi + S.k * (snapToScale(S.fingerSmooth, engine.s.keyRoot, engine.s.scale) - S.fingerSmooth);
    } else S.fingerSmooth = null;
    S.lastRaw = fingerY != null ? open + 12 * Math.log2(STRING_LEN / fingerY) : null;
    if (fingerY != null) { stringPoint(lane, fingerY, stage.cello.finger.position); stage.cello.finger.visible = true; }
    else stage.cello.finger.visible = false;

    // ---- drive the engine
    const art = engine.s.articulation;
    if (BOWED_ARTS.has(art)) {
      if (bowing) {
        if (!S.cur || S.cur.lane !== lane) {
          if (S.cur) engine.noteOff(S.cur.key);
          const key = "vr:" + S.n++;
          engine.noteOn(key, midi, 0.6, { noTranspose: true, lockBow: beta != null, noSection: false });
          S.cur = { key, lane, bowed: true };
          pulse(R, 0.35, 25);
        }
        const u = { midi, glide: 0.012, noTranspose: true, bowSpeed: speed, pressure };
        if (beta != null) u.beta = beta;
        engine.noteUpdate(S.cur.key, u);
        if (now - S.hapticT > 0.09) { S.hapticT = now; pulse(R, 0.05 + Math.min(0.35, Math.abs(speed) * 0.25), 90); }
      } else if (S.cur) { engine.noteOff(S.cur.key); S.cur = null; }
    } else {
      // one-shots: pluck, strike, spiccato, chug — trigger (easy) or crossing a string (real)
      if (S.cur && S.cur.bowed) { engine.noteOff(S.cur.key); S.cur = null; }
      let fire = false, vel = 0.8;
      if (o.easy || (R && R.hand)) {
        const trig = R ? R.trigger : 0;
        if (trig > 0.5 && !S.trigHeld) { fire = true; vel = 0.5 + trig * 0.5; }
        if (trig < 0.3 && S.trigHeld && S.cur) { engine.noteOff(S.cur.key); S.cur = null; }
        S.trigHeld = trig > 0.5 ? true : trig < 0.3 ? false : S.trigHeld;
      } else if (R && R.pos) {
        const tipL = cg.worldToLocal(stage.bow.localToWorld(new THREE.Vector3(0.02, -0.01, -0.06)));
        for (let i = 0; i < 4; i++) {
          const r = segSeg(tipL, tipL, stringPoint(i, 0.05, tmpA), stringPoint(i, 0.4, tmpB));
          if (r.d < 0.01 && S.pluckD[i] >= 0.01) { fire = true; lane = i; S.lane = i; vel = clamp(0.4 + S.vel.length() / 1.2, 0.4, 1); }
          S.pluckD[i] = r.d;
        }
        if (fire) midi = opens[lane] + (fingerY != null ? 12 * Math.log2(STRING_LEN / fingerY) : 0);
      }
      if (fire) {
        if (S.cur) engine.noteOff(S.cur.key);
        const key = "vr:" + S.n++;
        engine.noteOn(key, midi, vel, { noTranspose: true });
        S.cur = { key, lane };
        pulse(R, 0.6, 30);
        if (art !== "chug") { const k = key; setTimeout(() => { engine.noteOff(k); if (S.cur && S.cur.key === k) S.cur = null; }, 350); }
      }
    }

    // ---- visuals
    const levels = stage.updateGhosts(S.cur ? S.cur.key : null);
    if (S.cur) levels[S.cur.lane] = Math.max(levels[S.cur.lane], engine.levels.get(S.cur.key) || 0.05);
    stage.updateStrings(levels);
    if (now - S.lastHud > 0.12) {
      S.lastHud = now;
      const near = Math.round(midi), cents = Math.round((midi - near) * 100);
      stage.drawHud({
        note: S.cur ? noteName(near) : noteName(Math.round(opens[S.lane])),
        detail: S.cur ? `${cents >= 0 ? "+" : ""}${cents}¢ · ${noteName(opens[lane])} string` : `${noteName(opens[S.lane])} string · ${o.easy ? "easy" : "real"} bow`,
        detail2: fingerY != null ? `finger ${(fingerY * 100).toFixed(1)} cm from the bridge` : (onNeck ? "press (trigger / pinch / touch) to stop" : "left hand on the neck to finger"),
        help: "A artic · B loop · X drone · Y recenter · stick dynamics",
      });
    }
    renderer.render(stage.scene, camera);
  }

  let lastErr = 0;
  renderer.setAnimationLoop((t, frame) => {
    try { onFrame(t, frame); }
    catch (e) {
      // never let one bad frame kill the session; report at most once a second
      if (performance.now() - lastErr > 1000) { lastErr = performance.now(); console.error("VR frame error", e); onStatus("VR hiccup: " + (e.message || e), true); }
    }
  });

  session.addEventListener("end", () => {
    if (S.cur) engine.noteOff(S.cur.key);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    active = null;
    engine.emit("vr", false);
    onStatus("Left VR.");
  });
  return session;
}

export function exitVR() { if (active) active.session.end(); }

// exposed for tests
export const _internals = { stringPoint, segSeg, STRING_LEN, Stage, BRIDGE_ARC, BOW_IN_CELLO };
export function _active() { return active; }

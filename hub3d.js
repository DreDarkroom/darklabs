// Darklabs hub: real 3D models for the card icons, drawn with ONE shared WebGL canvas.
// Each icon slot is `<div class="icon" data-model="cello">`. This module builds the models from primitives (no asset files),
// then every frame draws each visible slot into its own rectangle with a scissored viewport.
// If WebGL or the import fails, the emoji stay (the page works exactly as before).

const idle = window.requestIdleCallback || ((f) => setTimeout(f, 400));
idle(async () => {
  const slots = [...document.querySelectorAll(".icon[data-model]")];
  if (!slots.length) return;
  let T;
  try { T = await import("./chunguscello/vendor/three.module.min.js"); } catch (e) { console.warn("3D icons: three.js not available", e); return; }
  const cv = document.getElementById("gl3d");
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "low-power" }); } catch (e) { console.warn("3D icons: no WebGL", e); return; }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const fit = () => renderer.setSize(innerWidth, innerHeight, false);
  fit(); addEventListener("resize", fit);

  // ── the shared stage ────────────────────────────────────────────────────────
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.15, 4.9); cam.lookAt(0, 0, 0);
  scene.add(new T.AmbientLight(0x7a5560, 1.9));
  const key = new T.DirectionalLight(0xffb0b8, 2.3); key.position.set(-3, 3, 4); scene.add(key);
  const rim = new T.DirectionalLight(0xff2f4e, 2.1); rim.position.set(4, 1, -3); scene.add(rim);
  const fill = new T.DirectionalLight(0x9fb8ff, 0.7); fill.position.set(2, -3, 3); scene.add(fill);

  const C = { red: 0xd1122b, soft: 0xe8434f, dark: 0x1b1114, ink: 0x0d0809, wood: 0x9a5a32, brass: 0xd9a441, steel: 0x9aa0ac, white: 0xeadede, blue: 0x2f6bff, amber: 0xf2a541, teal: 0x2fd0b5, pink: 0xff7a90, cream: 0xf1e3c6 };
  const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, metalness: o.m ?? 0.3, roughness: o.r ?? 0.55, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.t ?? 1, wireframe: !!o.w });
  const M = (g, c, o) => new T.Mesh(g, mat(c, o));
  const at = (o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
  const G = (...kids) => { const g = new T.Group(); kids.forEach((k) => g.add(k)); return g; };
  const box = (w, h, d, c, o) => M(new T.BoxGeometry(w, h, d), c, o);
  const cyl = (r, h, c, o, seg = 32) => M(new T.CylinderGeometry(r, r, h, seg), c, o);
  const sph = (r, c, o, sx = 1, sy = 1, sz = 1) => { const m = M(new T.SphereGeometry(r, 28, 20), c, o); m.scale.set(sx, sy, sz); return m; };
  const cone = (r, h, c, o) => M(new T.ConeGeometry(r, h, 24), c, o);
  const tor = (r, t, c, o, arc = Math.PI * 2) => M(new T.TorusGeometry(r, t, 14, 48, arc), c, o);

  // ── the models (each fits roughly inside a unit sphere of radius ~1.3) ───────
  const MODELS = {
    vinyl: () => G(cyl(1.2, 0.08, C.ink, { m: 0.5, r: 0.35 }), at(tor(0.9, 0.012, 0x3a2a2e), 0, 0.05, 0, Math.PI / 2), at(tor(0.7, 0.012, 0x3a2a2e), 0, 0.05, 0, Math.PI / 2), at(tor(0.5, 0.012, 0x3a2a2e), 0, 0.05, 0, Math.PI / 2), at(cyl(0.38, 0.1, C.red), 0, 0.02), at(cyl(0.05, 0.14, C.white), 0, 0.03)),
    stairs: () => { const g = new T.Group(); for (let i = 0; i < 16; i++) { const th = i * 0.44, s = box(0.78, 0.11, 0.34, i % 2 ? C.red : 0x5a1018, { m: 0.2 }); at(s, Math.cos(th) * 0.95, -0.85 + i * 0.115, Math.sin(th) * 0.95, 0, -th + Math.PI / 2, 0); g.add(s); } g.add(at(cyl(0.07, 2.1, C.steel), 0, 0, 0)); return g; },
    cello: () => { const g = G(at(sph(0.72, C.wood, { r: 0.35 }, 1, 1.1, 0.42), 0, -0.55), at(sph(0.5, C.wood, { r: 0.35 }, 1, 1, 0.4), 0, 0.3), at(box(0.14, 1.7, 0.1, C.ink), 0, 0.95, 0.06), at(sph(0.14, C.wood), 0, 1.85), at(box(0.34, 0.05, 0.1, C.cream), 0, -0.2, 0.2), at(cyl(0.025, 1.9, C.brass, { m: 0.8 }), -0.03, 0.55, 0.12), at(cyl(0.025, 1.9, C.brass, { m: 0.8 }), 0.03, 0.55, 0.12)); g.rotation.z = 0.35; g.scale.setScalar(0.82); return g; },
    cat: () => G(sph(0.78, C.amber, { r: 0.7 }, 1.1, 0.95, 0.95), at(cone(0.28, 0.5, C.amber, { r: 0.7 }), -0.55, 0.78), at(cone(0.28, 0.5, C.amber, { r: 0.7 }), 0.55, 0.78), at(sph(0.12, C.white), -0.3, 0.12, 0.7), at(sph(0.12, C.white), 0.3, 0.12, 0.7), at(sph(0.06, C.ink), -0.3, 0.12, 0.8), at(sph(0.06, C.ink), 0.3, 0.12, 0.8), at(sph(0.08, C.pink), 0, -0.08, 0.78), at(box(0.7, 0.012, 0.012, C.cream), -0.55, -0.12, 0.7, 0, 0, 0.15), at(box(0.7, 0.012, 0.012, C.cream), 0.55, -0.12, 0.7, 0, 0, -0.15)),
    monkey: () => G(sph(0.78, 0x7a4426, { r: 0.8 }), at(sph(0.3, 0x7a4426, { r: 0.8 }), -0.85, 0.1), at(sph(0.3, 0x7a4426, { r: 0.8 }), 0.85, 0.1), at(sph(0.22, 0xe2b98f, { r: 0.8 }), -0.85, 0.1, 0.15), at(sph(0.22, 0xe2b98f, { r: 0.8 }), 0.85, 0.1, 0.15), at(sph(0.55, 0xe2b98f, { r: 0.8 }, 1, 0.8, 0.7), 0, -0.15, 0.4), at(sph(0.1, C.white), -0.25, 0.2, 0.74), at(sph(0.1, C.white), 0.25, 0.2, 0.74), at(sph(0.05, C.ink), -0.25, 0.2, 0.83), at(sph(0.05, C.ink), 0.25, 0.2, 0.83), at(tor(0.2, 0.025, C.ink, {}, Math.PI), 0, -0.28, 0.9, 0, 0, Math.PI)),
    keys: () => { const g = new T.Group(); g.add(box(2.3, 0.34, 1.1, C.dark)); for (let i = 0; i < 7; i++) g.add(at(box(0.29, 0.2, 0.95, C.white, { r: 0.4 }), -0.9 + i * 0.3, 0.22, 0.04)); [0, 1, 3, 4, 5].forEach((i) => g.add(at(box(0.17, 0.2, 0.55, C.ink), -0.75 + i * 0.3, 0.38, -0.14))); g.rotation.x = 0.5; g.scale.setScalar(0.62); return g; },
    deck: () => G(box(2.1, 0.26, 1.7, C.dark), at(cyl(0.82, 0.08, C.steel, { m: 0.7 }), -0.1, 0.17), at(cyl(0.76, 0.06, C.ink), -0.1, 0.23), at(cyl(0.22, 0.07, C.red), -0.1, 0.27), at(cyl(0.05, 0.9, C.steel, { m: 0.8 }), 0.85, 0.5, -0.55), at(box(0.06, 0.05, 1.0, C.steel, { m: 0.8 }), 0.78, 0.9, -0.1, 0, -0.3, 0)),
    robot: (col = C.steel) => G(at(box(1.1, 0.82, 0.8, col, { m: 0.6 }), 0, 0.55), at(box(0.2, 0.16, 0.05, C.teal, { e: C.teal, ei: 1.2 }), -0.28, 0.62, 0.42), at(box(0.2, 0.16, 0.05, C.teal, { e: C.teal, ei: 1.2 }), 0.28, 0.62, 0.42), at(cyl(0.03, 0.35, C.steel), 0, 1.15), at(sph(0.08, C.red, { e: C.red }), 0, 1.36), at(box(0.9, 0.7, 0.6, C.dark, { m: 0.5 }), 0, -0.2), at(cyl(0.07, 0.6, col, { m: 0.6 }), -0.58, -0.15, 0, 0, 0, 0.2), at(cyl(0.07, 0.6, col, { m: 0.6 }), 0.58, -0.15, 0, 0, 0, -0.2)),
    sun: () => { const g = G(sph(0.6, C.amber, { e: C.amber, ei: 1.4, r: 0.3 })); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, c = cone(0.1, 0.5, C.amber, { e: C.amber, ei: 0.9 }); at(c, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0, 0, 0, a - Math.PI / 2); g.add(c); } return g; },
    bass: () => { const g = G(at(sph(0.62, C.blue, { m: 0.2, r: 0.35 }, 1, 1.15, 0.28), 0, -0.7), at(sph(0.42, C.blue, { m: 0.2, r: 0.35 }, 1, 1, 0.26), 0.12, 0.05), at(box(0.2, 2.0, 0.13, C.wood), 0, 0.85), at(box(0.3, 0.45, 0.1, C.ink), 0, 1.95), at(box(0.34, 0.1, 0.1, C.steel, { m: 0.7 }), 0, -0.55, 0.16), at(box(0.34, 0.1, 0.1, C.steel, { m: 0.7 }), 0, -0.85, 0.16)); for (let i = 0; i < 4; i++) g.add(at(cyl(0.012, 3.0, C.cream, { m: 0.8 }), -0.06 + i * 0.04, 0.6, 0.1)); g.rotation.z = 0.5; g.scale.setScalar(0.78); return g; },
    radio: () => G(box(1.9, 1.2, 0.7, 0x6a1c24, { m: 0.2, r: 0.5 }), at(cyl(0.38, 0.06, C.ink), -0.45, 0, 0.38, Math.PI / 2), at(cyl(0.38, 0.03, C.brass, { m: 0.8 }), -0.45, 0, 0.4, Math.PI / 2), at(cyl(0.09, 0.1, C.cream), 0.55, 0.25, 0.38, Math.PI / 2), at(cyl(0.09, 0.1, C.cream), 0.55, -0.25, 0.38, Math.PI / 2), at(cyl(0.02, 1.4, C.steel, { m: 0.8 }), 0.7, 1.0, 0, 0, 0, -0.4)),
    headphones: () => G(at(tor(0.95, 0.09, C.dark, { m: 0.5 }, Math.PI), 0, 0.1, 0), at(cyl(0.38, 0.3, C.red, { m: 0.3 }), -0.95, -0.15, 0, 0, 0, Math.PI / 2), at(cyl(0.38, 0.3, C.red, { m: 0.3 }), 0.95, -0.15, 0, 0, 0, Math.PI / 2), at(tor(0.38, 0.07, C.ink), -0.82, -0.15, 0, 0, Math.PI / 2), at(tor(0.38, 0.07, C.ink), 0.82, -0.15, 0, 0, Math.PI / 2)),
    anvil: () => { const g = G(at(box(1.4, 0.25, 0.7, C.steel, { m: 0.8, r: 0.4 }), 0, -0.7), at(box(0.7, 0.55, 0.5, C.steel, { m: 0.8, r: 0.4 }), 0, -0.3), at(box(1.6, 0.35, 0.7, C.steel, { m: 0.8, r: 0.35 }), 0, 0.12), at(cone(0.3, 0.7, C.steel, { m: 0.8 }), 1.1, 0.12, 0, 0, 0, -Math.PI / 2), at(cyl(0.05, 1.3, C.wood), -0.2, 0.9, 0, 0, 0, 0.9), at(box(0.55, 0.28, 0.3, C.dark, { m: 0.7 }), -0.7, 1.3, 0, 0, 0, 0.9)); g.scale.setScalar(0.85); return g; },
    clapper: () => { const g = G(at(box(1.9, 1.3, 0.1, C.ink), 0, -0.15)); const top = new T.Group(); top.add(at(box(1.9, 0.3, 0.12, C.ink), 0, 0.15)); for (let i = 0; i < 5; i++) top.add(at(box(0.18, 0.3, 0.13, C.white), -0.76 + i * 0.38, 0.15)); at(top, -0.95, 0.65, 0, 0, 0, 0.22); const piv = new T.Group(); piv.add(at(top, 0.95, 0, 0)); piv.position.set(-0.95, 0.5, 0); piv.rotation.z = 0.22; g.add(piv); for (let i = 0; i < 3; i++) g.add(at(box(1.5, 0.05, 0.11, C.white), 0, -0.1 - i * 0.28, 0)); return g; },
    flask: () => { const prof = [[0.0, -1.0], [0.95, -1.0], [0.9, -0.85], [0.25, 0.35], [0.25, 0.95], [0.34, 1.0]].map(([x, y]) => new T.Vector2(x, y)); const glass = M(new T.LatheGeometry(prof, 32), C.white, { t: 0.28, m: 0.1, r: 0.1 }); const liquid = M(new T.LatheGeometry([[0, -0.97], [0.86, -0.97], [0.8, -0.8], [0.5, -0.3], [0, -0.3]].map(([x, y]) => new T.Vector2(x, y)), 32), C.red, { e: C.red, ei: 0.8, m: 0.1, r: 0.3 }); return G(glass, liquid, at(sph(0.08, C.pink, { e: C.pink }), 0.1, -0.1, 0.3), at(sph(0.06, C.pink, { e: C.pink }), -0.15, 0.15, 0.1)); },
    core: () => G(M(new T.IcosahedronGeometry(0.95, 1), C.red, { w: true, e: C.red, ei: 1 }), sph(0.45, C.red, { e: C.red, ei: 1.6, r: 0.2 }), at(tor(1.25, 0.02, C.white, { e: C.white }), 0, 0, 0, 1.2, 0.3), at(tor(1.25, 0.02, C.white, { e: C.white }), 0, 0, 0, -0.5, 0, 0.9)),
    gear: () => { const g = G(cyl(0.8, 0.28, C.steel, { m: 0.8, r: 0.4 }, 40), at(cyl(0.28, 0.34, C.ink), 0, 0, 0)); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(at(box(0.3, 0.28, 0.3, C.steel, { m: 0.8, r: 0.4 }), Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0, -a, 0)); } g.rotation.x = 1.1; return g; },
    camera: () => G(box(1.9, 1.15, 0.8, C.dark, { m: 0.5 }), at(box(1.9, 0.4, 0.82, C.steel, { m: 0.7 }), 0, 0.4), at(cyl(0.5, 0.5, C.ink, { m: 0.6 }), 0.1, 0, 0.6, Math.PI / 2), at(cyl(0.34, 0.1, C.blue, { e: C.blue, ei: 0.5, m: 0.9, r: 0.1 }), 0.1, 0, 0.88, Math.PI / 2), at(box(0.35, 0.22, 0.3, C.dark), -0.6, 0.78, 0), at(box(0.2, 0.14, 0.05, C.red, { e: C.red }), 0.7, 0.32, 0.42)),
    mic: () => { const g = G(at(sph(0.55, C.steel, { m: 0.8, r: 0.3 }), 0, 0.7), at(sph(0.56, C.ink, { w: true }), 0, 0.7), at(cyl(0.22, 1.1, C.dark, { m: 0.6 }), 0, -0.3), at(cyl(0.26, 0.12, C.red), 0, 0.2)); g.rotation.z = 0.25; return g; },
    pipe: () => G(at(cyl(0.3, 1.5, C.steel, { m: 0.8, r: 0.4 }), -0.4, -0.5, 0, 0, 0, Math.PI / 2), at(sph(0.3, C.steel, { m: 0.8, r: 0.4 }), 0.35, -0.5), at(cyl(0.3, 1.4, C.steel, { m: 0.8, r: 0.4 }), 0.35, 0.2), at(tor(0.34, 0.07, C.red), -1.12, -0.5, 0, 0, Math.PI / 2), at(tor(0.34, 0.07, C.red), 0.35, 0.92, 0, Math.PI / 2)),
    film: () => { const g = G(box(2.3, 0.95, 0.05, C.ink)); for (let i = 0; i < 3; i++) g.add(at(box(0.62, 0.55, 0.06, C.amber, { e: C.amber, ei: 0.45 }), -0.72 + i * 0.72, 0, 0.01)); for (let i = 0; i < 12; i++) { g.add(at(box(0.1, 0.07, 0.07, C.white), -1.0 + i * 0.19, 0.4, 0.01)); g.add(at(box(0.1, 0.07, 0.07, C.white), -1.0 + i * 0.19, -0.4, 0.01)); } g.rotation.set(0.3, -0.4, 0.1); return g; },
    eye: () => G(sph(0.85, C.white, { r: 0.3 }), at(sph(0.46, C.red, { e: C.red, ei: 0.4 }, 1, 1, 0.3), 0, 0, 0.76), at(sph(0.2, C.ink, {}, 1, 1, 0.3), 0, 0, 0.92)),
    spiral: () => { const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 3.2, r = 0.2 + t * 0.95; pts.push(new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); } return G(M(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 90, 0.09, 10), C.pink, { e: C.pink, ei: 0.35, m: 0.3 })); },
    crate: () => { const g = G(box(1.5, 1.1, 1.1, C.wood, { r: 0.8 })); for (let i = -1; i <= 1; i++) { g.add(at(box(1.58, 0.16, 0.08, 0x6e3e20, { r: 0.8 }), 0, i * 0.38, 0.57)); g.add(at(box(1.58, 0.16, 0.08, 0x6e3e20, { r: 0.8 }), 0, i * 0.38, -0.57)); } g.add(at(box(0.16, 1.18, 0.08, 0x6e3e20), -0.65, 0, 0.57), at(box(0.16, 1.18, 0.08, 0x6e3e20), 0.65, 0, 0.57)); g.rotation.x = 0.35; return g; },
  };

  // models live in one scene; only the one being drawn is visible
  const cache = new Map();
  const get = (name) => { if (!cache.has(name)) { const f = MODELS[name] || MODELS.vinyl; const m = f(); m.visible = false; scene.add(m); cache.set(name, m); } return cache.get(name); };

  document.documentElement.classList.add("gl3d-on");
  const items = slots.map((el, i) => ({ el, name: el.dataset.model, phase: i * 0.9, boost: 0, hang: el.closest(".hang"), print: el.closest(".print") }));
  items.forEach((it) => { const p = it.print; if (p) { p.addEventListener("pointerenter", () => (it.hover = true)); p.addEventListener("pointerleave", () => (it.hover = false)); } });
  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000, h = innerHeight, w = innerWidth;
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w || r.width < 4) continue;
      let op = 1; if (it.hang) op *= parseFloat(getComputedStyle(it.hang).opacity); if (it.print) op *= parseFloat(getComputedStyle(it.print).opacity);
      if (op < 0.04) continue;
      it.boost += ((it.hover ? 1 : 0) - it.boost) * 0.1;
      const m = get(it.name); m.visible = true;
      const spin = reduce ? 0.6 : t * (0.5 + it.boost * 1.6) + it.phase;
      m.rotation.y = (it.name === "stairs" ? spin : Math.sin(spin) * 0.9 + 0.35);
      if (!reduce) m.position.y = Math.sin(t * 0.9 + it.phase) * 0.05;
      renderer.setViewport(r.left, h - r.bottom, r.width, r.height); renderer.setScissor(r.left, h - r.bottom, r.width, r.height);
      cv.style.opacity = "1";
      // fade by opacity (the card is still developing, or dimmed): scale lights instead of the canvas
      key.intensity = 2.3 * op; rim.intensity = 2.1 * op; fill.intensity = 0.7 * op; scene.children[0].intensity = 1.9 * op;
      renderer.render(scene, cam);
      m.visible = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__hub3d = { items, renderer, names: Object.keys(MODELS) };
});

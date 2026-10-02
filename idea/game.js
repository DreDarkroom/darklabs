// IDEA: Drunk Bots. A quick parody game: two teams of identical, very drunk bots look for the exit of a huge flat-pack maze.
// Desktop: click or tap near a bot on your team to shout directions (it sobers up for a few seconds).
// VR: a simple tabletop view. Point a controller at a bot and squeeze. Nothing here uses any real company's logo, colours, type or product names.
import * as THREE from "../chunguscello/vendor/three.module.min.js";

const MAP = [
  "#########################",
  "#S#...................#.#",
  "#.###.#####b#####.###.#.#",
  "#.....#.......#.....#.#.#",
  "#########.###.#.#####...#",
  "#.........#....b....#...#",
  "#.###.#.###.#######.###.#",
  "#.#.#...#...#.....#.#...#",
  "#.#.#.###.###.###.#...###",
  "#.#.#...#.....#.....#.#.#",
  "#.#.###.#.#.#####.#.#.#.#",
  "#.#.#...#...#.........#.#",
  "#.#.#.#######.#########.#",
  "#...#.........b...b.....E",
  "#########################",
];
const TILE = 2, H = MAP.length, W = MAP[0].length, WALL_H = 2.6, TEAM_SIZE = 6, TO_WIN = 4;
const COLORS = { red: 0xe5384a, blue: 0x3a7bf2 };
const q = new URLSearchParams(location.search), TIMESCALE = +q.get("speed") || 1;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let R = mulberry(+q.get("seed") || (Math.random() * 1e9) | 0);
const $ = (id) => document.getElementById(id);
const wx = (tx) => (tx - W / 2 + 0.5) * TILE, wz = (ty) => (ty - H / 2 + 0.5) * TILE;
const tileOf = (x, z) => [Math.floor(x / TILE + W / 2), Math.floor(z / TILE + H / 2)];
const isWall = (tx, ty) => tx < 0 || ty < 0 || tx >= W || ty >= H || MAP[ty][tx] === "#";

// ---------- the map: distances to the exit (so the bots know which way is right, when they can manage it)
let START = [1, 1], EXIT = [W - 1, H - 2]; const DIST = Array.from({ length: H }, () => Array(W).fill(Infinity));
{ const qd = [[...EXIT]]; DIST[EXIT[1]][EXIT[0]] = 0; while (qd.length) { const [x, y] = qd.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!isWall(nx, ny) && DIST[ny][nx] === Infinity) { DIST[ny][nx] = DIST[y][x] + 1; qd.push([nx, ny]); } } } }
if (DIST[START[1]][START[0]] === Infinity) throw new Error("the map has no way out");

// ---------- three.js stage
const canvas = $("gl"), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.xr.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a0d2b); scene.fog = new THREE.Fog(0x1a0d2b, 70, 140);
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xfff0e6, 0x5b3a78, 1.55));
const sun = new THREE.DirectionalLight(0xffe9d6, 1.5); sun.position.set(-20, 40, 18); scene.add(sun);
const world = new THREE.Group(); scene.add(world);
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0.05, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, transparent: o.t != null, opacity: o.t ?? 1 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * TILE + 6, H * TILE + 6), M(0xd9ccb2, { r: 0.95 })); floor.rotation.x = -Math.PI / 2; world.add(floor);
// walls (one instanced mesh) with simple product shelves on the walls that face a corridor
const wallTiles = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MAP[y][x] === "#") wallTiles.push([x, y]);
const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), M(0x8fae8e, { r: 0.9 }), wallTiles.length); const m4 = new THREE.Matrix4();
wallTiles.forEach(([x, y], i) => { m4.makeTranslation(wx(x), WALL_H / 2, wz(y)); walls.setMatrixAt(i, m4); }); world.add(walls);
const prodCols = [0xe07a5f, 0x81b29a, 0xd4a5a5, 0x9d8df1, 0xf4845f, 0x5fb0b7, 0xc77dff, 0xf28482].map((c) => new THREE.Color(c));
const prods = []; for (const [x, y] of wallTiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (!isWall(x + dx, y + dy) && R() < 0.55) for (let k = 0; k < 3; k++) prods.push([x, y, dx, dy, k]); }
const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), M(0xffffff, { r: 0.7 }), prods.length);
prods.forEach(([x, y, dx, dy, k], i) => { const along = (R() - 0.5) * 1.5; const px = wx(x) + dx * (TILE / 2 + 0.2) + (dy ? along : 0), pz = wz(y) + dy * (TILE / 2 + 0.2) + (dx ? along : 0); m4.makeTranslation(px, 0.55 + k * 0.7, pz); pm.setMatrixAt(i, m4); pm.setColorAt(i, prodCols[(R() * prodCols.length) | 0]); }); world.add(pm);
// beds (tempting), arrows (the intended route: "follow the arrows"), and the two gates
const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MAP[y][x] === "b") { const g = new THREE.Group(); g.add(part(new THREE.BoxGeometry(1.5, 0.35, 1.7), M(0xf3e1ea), 0, 0.3, 0), part(new THREE.BoxGeometry(1.5, 0.12, 1.7), M(0xb98af0), 0, 0.5, 0.15), part(new THREE.BoxGeometry(0.9, 0.18, 0.4), M(0xffffff), 0, 0.6, -0.6)); g.position.set(wx(x), 0, wz(y)); world.add(g); }
{ const sh = new THREE.Shape(); sh.moveTo(0, 0.5); sh.lineTo(0.55, -0.1); sh.lineTo(0.2, -0.1); sh.lineTo(0.2, -0.5); sh.lineTo(-0.2, -0.5); sh.lineTo(-0.2, -0.1); sh.lineTo(-0.55, -0.1); sh.closePath();
  const ag = new THREE.ShapeGeometry(sh); ag.rotateX(-Math.PI / 2); const am = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const mats = []; let [x, y] = START; while (DIST[y][x] > 0) { let best = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!isWall(nx, ny) && DIST[ny][nx] < DIST[y][x]) best = [nx, ny, dx, dy]; }
    const mm = new THREE.Matrix4().compose(new THREE.Vector3(wx(x), 0.03, wz(y)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-best[2], -best[3])), new THREE.Vector3(0.9, 0.9, 0.9)); mats.push(mm); [x, y] = [best[0], best[1]]; }
  const arrows = new THREE.InstancedMesh(ag, am, mats.length); mats.forEach((mm, i) => arrows.setMatrixAt(i, mm)); world.add(arrows); }          // the intended route, as ONE draw call
function sign(text, sub, bg, w = 8) { const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 512, 256); g.fillStyle = "#fff"; g.font = "900 120px ui-rounded,Trebuchet MS,sans-serif"; g.textAlign = "center"; g.fillText(text, 256, 140); g.font = "700 34px ui-rounded,sans-serif"; g.fillText(sub, 256, 205);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); return m; }
{ const s = sign("IDEA", "follow the arrows. allegedly.", "#6a2fa8"); s.position.set(wx(1), 4.6, wz(1) - 1.2); s.rotation.x = -0.35; world.add(s);
  const e = sign("CHECKOUT", "you made it?", "#a82f6a", 9); e.position.set(wx(W - 1) - 3, 4.6, wz(H - 2)); e.rotation.y = -Math.PI / 2; world.add(e);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, TILE + 0.4), M(0xff7ac8, { e: 0xff7ac8, ei: 0.7 })); gate.position.set(wx(W - 1) + 0.9, 1.6, wz(H - 2)); world.add(gate); }
const table = new THREE.Mesh(new THREE.BoxGeometry(W * TILE + 6, 1.4, H * TILE + 6), M(0x3a2552)); table.position.y = -0.72; table.visible = false; world.add(table);

// ---------- the bots: IDENTICAL for both teams, only the body colour differs
const G = { body: new THREE.CylinderGeometry(0.3, 0.34, 0.7, 20), head: new THREE.SphereGeometry(0.3, 20, 16), eye: new THREE.SphereGeometry(0.075, 10, 8), pupil: new THREE.SphereGeometry(0.035, 8, 6), arm: new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), foot: new THREE.BoxGeometry(0.22, 0.1, 0.34), ant: new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), ball: new THREE.SphereGeometry(0.07, 10, 8), disc: new THREE.CircleGeometry(0.5, 20) };
const MAT = { head: M(0xd7d3dd, { m: 0.2, r: 0.5 }), white: M(0xffffff), black: M(0x151018), dark: M(0x3a3342), red: M(COLORS.red, { r: 0.45 }), blue: M(COLORS.blue, { r: 0.45 }), ringRed: new THREE.MeshBasicMaterial({ color: COLORS.red, transparent: true, opacity: 0.5 }), ringBlue: new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.5 }), shout: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }) };
function makeBot(team) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const tm = MAT[team];
  const b = new THREE.Mesh(G.body, tm); b.position.y = 0.55; body.add(b); const h = new THREE.Mesh(G.head, MAT.head); h.position.y = 1.15; body.add(h);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.eye, MAT.white); e.position.set(0.12 * s, 1.2, 0.24); body.add(e); const p = new THREE.Mesh(G.pupil, MAT.black); p.position.set(0.12 * s, 1.2, 0.3); p.userData.pupil = true; body.add(p);
    const a = new THREE.Mesh(G.arm, MAT.dark); a.position.set(0.38 * s, 0.6, 0); a.rotation.z = 0.35 * s; a.userData.arm = s; body.add(a); const f = new THREE.Mesh(G.foot, MAT.dark); f.position.set(0.14 * s, 0.07, 0.04); f.userData.foot = s; body.add(f); }
  const an = new THREE.Mesh(G.ant, MAT.dark); an.position.y = 1.58; body.add(an); const ba = new THREE.Mesh(G.ball, tm); ba.position.y = 1.76; body.add(ba);
  const ring = new THREE.Mesh(G.disc, team === "red" ? MAT.ringRed : MAT.ringBlue); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.scale.setScalar(1.25); world.add(g); return { g, body, ring };
}
const bots = []; let state = "intro", team = "red", t = 0, spawnT = 0, spawned = { red: 0, blue: 0 }, finished = { red: 0, blue: 0 }, cooldown = 0, winner = null, endT = 0;
function resetGame(seed) {
  if (seed != null) R = mulberry(seed);
  for (const b of bots) world.remove(b.g); bots.length = 0; t = 0; spawnT = 0; spawned = { red: 0, blue: 0 }; finished = { red: 0, blue: 0 }; cooldown = 0; winner = null; endT = 0;
}
function spawn(tm) {
  const m = makeBot(tm), sx = wx(START[0]) + (R() - 0.5) * 0.8, sz = wz(START[1]) + (R() - 0.5) * 0.8;
  bots.push({ team: tm, ...m, x: sx, z: sz, hd: Math.PI / 2 * (R() < 0.5 ? 0 : 1), d: 0.55 + R() * 0.4, ph: R() * 6.28, ph2: R() * 6.28, st: "walk", tmr: 0, sober: 0, lost: 0, veer: 0, veerA: 0, lastTile: [-1, -1], best: Infinity, stuck: 0, hic: R() * 3, anim: R() * 6, done: false, doneT: 0, fall: 0 });
}

// ---------- sound (tiny, synthesised, only after you press start)
let ac = null, master = null;
const audio = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } if (ac.state !== "running") ac.resume(); return ac; };
function blip(f0, f1, dur, type = "sine", vol = 0.1, when = 0) { if (!ac) return; const t0 = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02); }
const SND = { hic: () => { blip(560, 260, 0.13, "sine", 0.07); }, shout: () => { blip(240, 140, 0.2, "sawtooth", 0.08); blip(480, 330, 0.12, "square", 0.03, 0.02); }, fall: () => blip(220, 60, 0.3, "triangle", 0.1), nap: () => blip(300, 200, 0.4, "sine", 0.05), done: () => { [523, 659, 784].forEach((f, i) => blip(f, f, 0.12, "square", 0.05, i * 0.07)); }, win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, f, 0.18, "square", 0.06, i * 0.1)); } };
let lastSnd = 0; const sfx = (k) => { const n = performance.now(); if (k === "hic" && n - lastSnd < 250) return; if (k === "hic") lastSnd = n; if (ac) SND[k](); };

// ---------- the drunk-bot brain
function step(dtRaw) {
  const dt = Math.min(0.05, dtRaw); t += dt; cooldown = Math.max(0, cooldown - dt);
  if (state === "play") { spawnT -= dt; if (spawnT <= 0) { spawnT = 0.9; for (const tm of (R() < 0.5 ? ["red", "blue"] : ["blue", "red"])) if (spawned[tm] < TEAM_SIZE) { spawn(tm); spawned[tm]++; } } }
  for (const b of bots) {
    b.anim += dt; b.hic -= dt;
    if (b.done) { b.doneT += dt; b.body.position.y = Math.abs(Math.sin(b.doneT * 9)) * 0.5; b.body.rotation.y += dt * 7; if (b.doneT > 2) { b.g.visible = false; } continue; }
    b.sober = Math.max(0, b.sober - dt);
    if (b.st === "fall") { b.fall -= dt; b.body.rotation.x += ((-Math.PI / 2 - b.body.rotation.x) * Math.min(1, dt * 12)); if (b.fall <= 0) b.st = "walk"; draw(b); continue; }
    if (b.st === "nap") { b.tmr -= dt; b.body.rotation.z = Math.sin(b.anim * 2) * 0.15; if (b.tmr <= 0) { b.st = "walk"; } draw(b); continue; }
    b.body.rotation.x += (0 - b.body.rotation.x) * Math.min(1, dt * 8);
    const sober = b.sober > 0, dE = sober ? 0.06 : b.d * (0.85 + 0.15 * Math.sin(t * 0.4 + b.ph));
    const [tx, ty] = tileOf(b.x, b.z); b.lost = Math.max(0, b.lost - dt); b.veer = Math.max(0, b.veer - dt);
    // which neighbour is closest to the exit? (or a random one when "lost")
    let nx = tx, ny = ty, bd = DIST[ty]?.[tx] ?? Infinity; const opts = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = tx + dx, ay = ty + dy; if (!isWall(ax, ay)) { opts.push([ax, ay]); if (DIST[ay][ax] < bd) { bd = DIST[ay][ax]; nx = ax; ny = ay; } } }
    if (b.lost > 0 && opts.length) { const o = opts[(b.ph * 997 + Math.floor(t * 0.7)) % opts.length | 0]; nx = o[0]; ny = o[1]; }
    const gx = wx(nx), gz = wz(ny), want = Math.atan2(gx - b.x, gz - b.z);                      // heading measured from +z toward +x
    if (b.veer <= 0 && !sober && R() < 0.5 * dE * dt) { b.veer = 0.4 + R() * 0.6; b.veerA = (R() < 0.5 ? -1 : 1) * (1 + R()); }
    const err = (Math.sin(t * 1.7 + b.ph) + 0.6 * Math.sin(t * 3.1 + b.ph2)) * 0.8 * dE + (b.veer > 0 ? b.veerA * dE : 0);
    let dh = want + err - b.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); b.hd += dh * Math.min(1, dt * (sober ? 7 : 3.2));
    const speed = 2.5 * (1 - 0.42 * dE) * (sober ? 1.3 : 1) * (b.st === "walk" ? 1 : 0);
    b.x += Math.sin(b.hd) * speed * dt; b.z += Math.cos(b.hd) * speed * dt;
    // random drunk events
    if (!sober) { if (R() < 0.05 * dE * dt * 6) { b.st = "fall"; b.fall = 1.1 + R() * 0.9; sfx("fall"); } else if (R() < 0.08 * dE * dt * 6) b.lost = 1.2 + R() * 2.2; }
    if (b.hic <= 0) { b.hic = 2 + R() * 4; sfx("hic"); }
    // wall collisions (circle against the nearby wall boxes)
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const cx = tx + ox, cy = ty + oy; if (!isWall(cx, cy)) continue; const x0 = wx(cx) - TILE / 2, x1 = wx(cx) + TILE / 2, z0 = wz(cy) - TILE / 2, z1 = wz(cy) + TILE / 2; const px = Math.max(x0, Math.min(x1, b.x)), pz = Math.max(z0, Math.min(z1, b.z)); const ddx = b.x - px, ddz = b.z - pz, d2 = ddx * ddx + ddz * ddz; if (d2 < 0.36 * 0.36 && d2 > 1e-9) { const d = Math.sqrt(d2), p = 0.36 - d; b.x += ddx / d * p; b.z += ddz / d * p; } else if (d2 <= 1e-9) { b.x += (b.x < wx(cx) ? -1 : 1) * 0.4; } }
    // beds are tempting
    if (tx !== b.lastTile[0] || ty !== b.lastTile[1]) { b.lastTile = [tx, ty]; if (MAP[ty]?.[tx] === "b" && !sober && R() < 0.55) { b.st = "nap"; b.tmr = 2 + R() * 1.6; sfx("nap"); } }
    // progress watchdog: if a bot hasn't got closer to the exit for a long while, sober it briefly
    const dd = DIST[ty]?.[tx] ?? Infinity; if (dd < b.best) { b.best = dd; b.stuck = 0; } else { b.stuck += dt; if (b.stuck > 9) { b.stuck = 0; b.sober = 2; b.lost = 0; } }
    if (tx === EXIT[0] && ty === EXIT[1] || b.x > wx(W - 1) + 0.2) { b.done = true; finished[b.team]++; sfx("done"); if (state === "play" && finished[b.team] >= TO_WIN) { winner = b.team; state = "end"; endT = 1.2; sfx("win"); } }
    draw(b);
  }
  // bots shove each other a little (and stay out of one another)
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) { const a = bots[i], c = bots[j]; if (a.done || c.done) continue; const dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 * 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.5 - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; c.x += dx / d * p; c.z += dz / d * p; } }
  if (state === "end") { endT -= dt; if (endT <= 0 && !$("end").dataset.shown) showEnd(); }
}
function draw(b) {
  b.g.position.set(b.x, 0, b.z); b.g.rotation.y = b.hd; const walk = b.st === "walk";
  const sway = walk ? Math.sin(b.anim * 5.5 + b.ph) * (0.1 + b.d * 0.22) : 0; b.body.rotation.z = b.st === "nap" ? b.body.rotation.z : sway; b.body.position.y = walk ? Math.abs(Math.sin(b.anim * 8)) * 0.06 : 0;
  for (const c of b.body.children) { if (c.userData.foot) c.position.z = 0.04 + Math.sin(b.anim * 8 + (c.userData.foot > 0 ? 0 : Math.PI)) * (walk ? 0.12 : 0); if (c.userData.arm) c.rotation.x = Math.sin(b.anim * 6 + c.userData.arm) * (walk ? 0.8 : 0.1); if (c.userData.pupil) c.position.x = (c.position.x > 0 ? 0.12 : -0.12) + Math.sin(b.anim * 3 + c.position.x * 9) * 0.03; }
}
// ---------- shouting
const rings = [];
function shoutAt(b) {
  b.sober = 3.6; b.lost = 0; b.st = b.st === "fall" ? "fall" : "walk"; cooldown = 1.6; sfx("shout");
  const r = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 28), MAT.shout.clone()); r.rotation.x = -Math.PI / 2; r.position.set(b.x, 0.05, b.z); r.userData.life = 0.7; world.add(r); rings.push(r);
}
function pickBot(x, z) { let best = null, bd = 3.4 * 3.4; for (const b of bots) { if (b.team !== team || b.done) continue; const d = (b.x - x) ** 2 + (b.z - z) ** 2; if (d < bd) { bd = d; best = b; } } return best; }
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function floorPoint(origin, dir) { ray.set(origin, dir); plane.constant = -world.position.y; const p = ray.ray.intersectPlane(plane, hit); return p ? world.worldToLocal(p.clone()) : null; }
canvas.addEventListener("pointerdown", (e) => { if (state !== "play" || cooldown > 0 || renderer.xr.isPresenting) return; const r = canvas.getBoundingClientRect(), nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(nd, cam); const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit); if (!p) return; const b = pickBot(p.x, p.z); if (b) shoutAt(b); });

// ---------- camera, HUD, flow
let view = "overview"; function fitCamera() { const a = innerWidth / innerHeight; cam.aspect = a; const fov = cam.fov * Math.PI / 180, dW = (W * TILE * 0.54) / (Math.tan(fov / 2) * a), dH = (H * TILE * 0.9) / (Math.tan(fov / 2)), d = Math.max(dW, dH); cam.userData.d = d; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); }
function placeCamera() { if (renderer.xr.isPresenting) return; if (view === "overview") { const d = cam.userData.d || 60; cam.position.set(0, d * 0.82, d * 0.58); cam.lookAt(0, 0, 0); } else { const lead = bots.filter((b) => b.team === team && !b.done).sort((a, b) => DIST[tileOf(a.x, a.z)[1]]?.[tileOf(a.x, a.z)[0]] - DIST[tileOf(b.x, b.z)[1]]?.[tileOf(b.x, b.z)[0]])[0]; if (lead) { cam.position.lerp(new THREE.Vector3(lead.x - Math.sin(lead.hd) * 6, 7, lead.z - Math.cos(lead.hd) * 6), 0.05); cam.lookAt(lead.x, 0.8, lead.z); } } }
addEventListener("resize", fitCamera); fitCamera();
function hud() { $("score").innerHTML = `<span><b style="background:var(--red)"></b>${finished.red}/${TO_WIN}</span><span><b style="background:var(--blue)"></b>${finished.blue}/${TO_WIN}</span>`; const s = Math.floor(t); $("clock").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); $("cool").style.width = (100 - cooldown / 1.6 * 100) + "%"; }
function showEnd() { $("end").dataset.shown = "1"; $("end").hidden = false; const you = winner === team; $("winner").textContent = (winner === "red" ? "Team Red" : "Team Blue") + " found the way out!"; $("winner").style.color = winner === "red" ? "#ff7a88" : "#7aa8ff"; $("endsub").textContent = (you ? "That's your team. Obviously you were great. " : "Not your team this time. ") + "It took " + Math.floor(t / 60) + ":" + String(Math.floor(t) % 60).padStart(2, "0") + " and a lot of staggering."; }
function begin() { resetGame(); $("end").hidden = true; delete $("end").dataset.shown; $("intro").hidden = true; $("hud").hidden = false; $("hint").hidden = false; setTimeout(() => ($("hint").hidden = true), 9000); state = "play"; audio(); }
for (const [id, tm] of [["tRed", "red"], ["tBlue", "blue"]]) $(id).onclick = () => { team = tm; $("tRed").setAttribute("aria-pressed", String(tm === "red")); $("tBlue").setAttribute("aria-pressed", String(tm === "blue")); };
$("start").onclick = begin; $("again").onclick = begin;
$("view").onclick = () => { view = view === "overview" ? "chase" : "overview"; $("view").textContent = "View: " + view; }; addEventListener("keydown", (e) => { if (e.key === "c" || e.key === "C" || e.key === "Tab") { e.preventDefault(); $("view").click(); } });
let radio = null; $("muz").onclick = async () => { const on = $("muz").getAttribute("aria-pressed") !== "true"; $("muz").setAttribute("aria-pressed", String(on)); $("muz").textContent = "Muzak: " + (on ? "on" : "off"); try { if (on) { if (!radio) { const m = await import("../fm/fm.js"); radio = new m.Radio(); } await radio.start("technosoft"); radio.M.gain.gain.value = 0.28; } else if (radio) radio.stop(); } catch (e) { $("muz").textContent = "Muzak: unavailable"; } };

// ---------- basic VR: the whole store sits on a table in front of you
const vrBtns = [$("vr"), $("vr2")]; let vrSession = null;
if (navigator.xr) navigator.xr.isSessionSupported("immersive-vr").then((ok) => { if (ok) vrBtns.forEach((b) => (b.hidden = false)); }).catch(() => {});
const board = (() => { const c = document.createElement("canvas"); c.width = 512; c.height = 128; const tex = new THREE.CanvasTexture(c); const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); s.position.set(0, 7, -H * TILE / 2 - 3); s.rotation.x = -0.6; s.visible = false; world.add(s); return { c, tex, s }; })();
function drawBoard() { const g = board.c.getContext("2d"); g.clearRect(0, 0, 512, 128); g.fillStyle = "rgba(10,4,16,.8)"; g.fillRect(0, 0, 512, 128); g.font = "900 64px ui-rounded,sans-serif"; g.fillStyle = "#ff7a88"; g.fillText(`${finished.red}`, 40, 84); g.fillStyle = "#fff"; g.font = "800 44px ui-rounded,sans-serif"; g.fillText("RED  /  BLUE", 130, 80); g.fillStyle = "#7aa8ff"; g.font = "900 64px ui-rounded,sans-serif"; g.fillText(`${finished.blue}`, 430, 84); board.tex.needsUpdate = true; }
async function enterVR() { try { if (state === "intro") begin(); vrSession = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] }); await renderer.xr.setSession(vrSession); world.scale.setScalar(0.026); world.position.set(0, 0.9, -0.95); table.visible = true; board.s.visible = true;
    for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2)]), new THREE.LineBasicMaterial({ color: 0xffffff }))); scene.add(c); c.addEventListener("selectstart", () => { if (state !== "play" || cooldown > 0) return; const o = new THREE.Vector3(), d = new THREE.Vector3(0, 0, -1); c.getWorldPosition(o); d.transformDirection(c.matrixWorld); const p = floorPoint(o, d); if (p) { const b = pickBot(p.x, p.z); if (b) shoutAt(b); } }); }
    vrSession.addEventListener("end", () => { world.scale.setScalar(1); world.position.set(0, 0, 0); table.visible = false; board.s.visible = false; vrSession = null; fitCamera(); }); } catch (e) { console.warn("VR could not start:", e); } }
vrBtns.forEach((b) => (b.onclick = enterVR));

// ---------- the loop
let last = performance.now(), hudT = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state !== "intro") { for (let i = 0; i < Math.max(1, Math.round(TIMESCALE)); i++) step(dt * (TIMESCALE < 1 ? TIMESCALE : 1)); }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.userData.life -= dt; r.scale.multiplyScalar(1 + dt * 5); r.material.opacity = Math.max(0, r.userData.life / 0.7); if (r.userData.life <= 0) { world.remove(r); rings.splice(i, 1); } }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; hud(); if (vrSession) drawBoard(); }
  placeCamera(); renderer.render(scene, cam);
});
window.__idea = { get state() { return state; }, bots, step, finished, get t() { return t; }, begin, setTeam: (x) => (team = x), get winner() { return winner; }, DIST, MAP, reset: (seed) => { resetGame(seed); state = "play"; }, toScreen: (b) => { const v = new THREE.Vector3(b.x, 0.8, b.z).project(cam), r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, get cooldown() { return cooldown; } };

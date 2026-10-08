/* The drum-kit scene: DreDarkbot plays the kit on a canvas, hit for hit, in time with the music.
   It reads the engine's hit queue (stamped in audio time), so a stick lands exactly when you hear it. Arms are two-bone, solved
   from the shoulder to wherever the next hit is; the camera eases toward the part of the kit that is about to matter.
   Drawing is plain 2D canvas, capped at 1.5x pixel density, and it idles at a low frame rate when nothing is playing. */
import { focusAt } from './arrange.js';

/* ---------- the kit: where each piece sits, in world units (1000 x 520) ---------- */
export const KIT = {
  kick:   { x: 470, y: 405, r: 92, kind: 'drum', name: 'kick' },
  snare:  { x: 575, y: 338, r: 44, kind: 'drum', name: 'snare' },
  tomH:   { x: 430, y: 268, r: 38, kind: 'drum', name: 'hi-tom' },
  tomL:   { x: 520, y: 248, r: 42, kind: 'drum', name: 'low-tom' },
  tomF:   { x: 335, y: 345, r: 56, kind: 'drum', name: 'floor-tom' },
  hat:    { x: 705, y: 300, r: 46, kind: 'hat', name: 'hi-hat' },
  ride:   { x: 270, y: 215, r: 76, kind: 'cymbal', name: 'ride', tilt: -0.12 },
  crash:  { x: 600, y: 150, r: 64, kind: 'cymbal', name: 'crash', tilt: 0.1 },
  splash: { x: 735, y: 175, r: 36, kind: 'cymbal', name: 'splash', tilt: 0.14 },
  china:  { x: 150, y: 175, r: 62, kind: 'cymbal', name: 'china', tilt: -0.18 },
};
/** Which piece an instrument id strikes, which hand plays it first, and where on the piece. */
export const PLAY = {
  kick: ['kick', 'foot'], snare: ['snare', 'L'], ghost: ['snare', 'L'], hatC: ['hat', 'R'], hatC2: ['hat', 'R'], hatO: ['hat', 'R'], hatP: ['hat', 'foot2'],
  tomH: ['tomH', 'R'], tomL: ['tomL', 'L'], tomF: ['tomF', 'R'], ride: ['ride', 'R'], bell: ['ride', 'R'], splash: ['splash', 'R'], china: ['china', 'R'], crash: ['crash', 'R'],
};
/** Where the camera looks for each focus name: [x, y, zoom]. */
export const VIEWS = {
  hats: [700, 300, 1.9], snare: [590, 335, 1.85], kick: [480, 385, 1.55], toms: [450, 275, 1.6], ride: [285, 235, 1.6],
  splash: [660, 200, 1.5], china: [190, 200, 1.5], kit: [450, 285, 1.0],
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Two-bone arm from `s` to `t`: returns the elbow, bending away from `side` (+1 elbow out to the right, -1 to the left). The target is clamped to reach. */
export function ik2(s, t, l1, l2, side = 1) {
  let dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.999, min = Math.abs(l1 - l2) + 1e-3;
  const dd = clamp(d, min, max);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const hand = { x: s.x + ux * dd, y: s.y + uy * dd };
  return { elbow: { x: s.x + ux * a - uy * h * side, y: s.y + uy * a + ux * h * side }, hand };
}

/** A heavy-lantern spring for the camera and hands: eases, overshoots a touch, never blows up on a long frame. */
export function spring(state, target, dt, stiffness = 60, damping = 9) {
  const h = Math.min(0.1, Math.max(0, dt)), n = Math.max(1, Math.ceil(h / 0.016)), s = h / n;
  let { x, v } = state;
  for (let i = 0; i < n; i++) { v += (target - x) * stiffness * s; v *= Math.exp(-damping * s); x += v * s; }
  return { x, v };
}

/** Where the camera wants to be: the named focus, nudged toward where hits have just landed. */
export function cameraTarget(focus, recent) {
  const base = VIEWS[focus] || VIEWS.kit;
  if (!recent.length) return { x: base[0], y: base[1], z: base[2] };
  let sx = 0, sy = 0; for (const p of recent) { sx += KIT[p].x; sy += KIT[p].y; }
  const cx = sx / recent.length, cy = sy / recent.length;
  return { x: base[0] * 0.75 + cx * 0.25, y: base[1] * 0.75 + cy * 0.25, z: base[2] };
}

const C = { bg: '#0a0506', line: '#d1122b', glow: '#ff3a52', shell: '#241418', head: '#d9cfc9', brass: '#b8923f', brassDark: '#6e5622', body: '#2b1f23', metal: '#5a4a50', visor: '#05080a' };

export class Scene {
  constructor(canvas, groove, o = {}) {
    this.cv = canvas; this.g = groove; this.cx = canvas.getContext('2d', { alpha: false });
    this.reduce = !!o.reduceMotion;
    this.cam = { x: { x: 700, v: 0 }, y: { x: 300, v: 0 }, z: { x: 1.9, v: 0 } };
    this.flash = {}; this.shake = {}; this.seen = new Set(['hat']);
    this.hands = { L: { x: { x: 600, v: 0 }, y: { x: 250, v: 0 }, lift: 0 }, R: { x: { x: 520, v: 0 }, y: { x: 250, v: 0 }, lift: 0 } };
    this.foot = { kick: 0, hat: 0 }; this.hatOpen = 0; this.recent = []; this.last = 0; this.running = false; this.blink = 0; this.beat = 0;
    this.resize(); this._raf = 0; this._loop = (t) => this.frame(t);
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    if (this._ro) this._ro.observe(canvas);
  }
  resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr; this.w = w; this.h = h;
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this._raf = requestAnimationFrame(this._loop); }
  stop() { this.running = false; cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect(); }

  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const playing = this.g.playing, busy = playing || this.hasMotion();
    if (!document.hidden && (busy || ((t / 66) | 0) % 2 === 0)) this.step(dt, playing);   // idle: about 15 frames a second
    this._raf = requestAnimationFrame(this._loop);
  }
  hasMotion() { return Object.values(this.flash).some((v) => v > 0.01) || this.hands.L.lift > 0.02; }

  step(dt, playing) {
    const { due, soon } = playing ? this.g.hits(0.16) : { due: [], soon: [] };
    const now = (this.g.ctx ? this.g.ctx.currentTime - (this.g.ctx.outputLatency || this.g.ctx.baseLatency || 0) : 0);
    for (const h of due) {
      if (!PLAY[h.i]) continue;                                    // bass, cello and meows are not on the kit
      const [piece] = PLAY[h.i];
      this.flash[piece] = Math.min(1.3, 0.7 + h.v * 0.6); this.seen.add(piece); this.beat = 1;
      if (piece === 'hat') this.hatOpen = h.i === 'hatO' ? 1 : 0;
      this.recent.push(piece); if (this.recent.length > 6) this.recent.shift();
      if (KIT[piece].kind === 'cymbal' || piece === 'hat') this.shake[piece] = 1;
      if (h.i === 'kick') this.foot.kick = 1;
      if (h.i === 'hatP') this.foot.hat = 1;
    }
    for (const k of Object.keys(this.flash)) this.flash[k] *= Math.exp(-dt * 7);
    for (const k of Object.keys(this.shake)) this.shake[k] *= Math.exp(-dt * 3.2);
    this.foot.kick *= Math.exp(-dt * 9); this.foot.hat *= Math.exp(-dt * 9); this.beat *= Math.exp(-dt * 5);
    this.aim(soon, now, dt);
    // camera: where the music is heading
    const tgt = cameraTarget(focusAt(this.g.state.p), this.recent);
    const st = this.reduce ? { s: 500, d: 40 } : { s: 26, d: 7 };
    for (const [k, v] of [['x', tgt.x], ['y', tgt.y], ['z', tgt.z]]) this.cam[k] = spring(this.cam[k], v, dt, st.s, st.d);
    this.draw(now);
  }

  /** Give each hand its next hit: the stick rises, then falls so it lands on the beat. */
  aim(soon, now, dt) {
    const next = { L: null, R: null };
    for (const h of soon) {
      if (!PLAY[h.i]) continue;
      const [piece, pref] = PLAY[h.i];
      if (pref === 'foot' || pref === 'foot2') continue;
      const other = pref === 'L' ? 'R' : 'L';
      let hand = pref;
      if (next[pref] && next[pref].t < h.t + 0.09 && !next[other]) hand = other;                // the preferred hand is busy: use the other
      if (!next[hand] || h.t < next[hand].t) next[hand] = { t: h.t, piece, who: h.i };
    }
    for (const side of ['L', 'R']) {
      const H = this.hands[side], n = next[side];
      let tx, ty, lift;
      if (n) {
        const p = KIT[n.piece], dtHit = clamp((n.t - now) / 0.15, 0, 1);
        lift = Math.pow(dtHit, 1.3);
        tx = p.x + (side === 'L' ? -6 : 6); ty = p.y - p.r * (p.kind === 'cymbal' ? 0.1 : 0.55) - lift * 70;
      } else { tx = side === 'L' ? 580 : 560; ty = 250; lift = 0.4; }
      H.x = spring(H.x, tx, dt, 420, 30); H.y = spring(H.y, ty, dt, 420, 30); H.lift = lift;
    }
  }

  draw(now) {
    const c = this.cx, W = this.w, Hh = this.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = C.bg; c.fillRect(0, 0, W, Hh);
    const z = this.cam.z.x * Math.min(W / 1000, Hh / 520) * 1.1;
    c.setTransform(z, 0, 0, z, W / 2 - this.cam.x.x * z, Hh / 2 - this.cam.y.x * z);
    this.floor(c);
    this.robot(c);
    for (const id of ['china', 'ride', 'crash', 'splash']) this.cymbal(c, id);
    this.hatStand(c);
    for (const id of ['tomF', 'tomH', 'tomL', 'snare', 'kick']) this.drum(c, id);
    this.arms(c);
  }

  floor(c) {
    const g = c.createRadialGradient(480, 470, 20, 480, 470, 520);
    g.addColorStop(0, 'rgba(209,18,43,.28)'); g.addColorStop(1, 'rgba(209,18,43,0)');
    c.fillStyle = g; c.fillRect(-400, 330, 1800, 400);
    c.strokeStyle = 'rgba(209,18,43,.35)'; c.lineWidth = 2; c.beginPath(); c.ellipse(480, 455, 380, 54, 0, 0, Math.PI * 2); c.stroke();
  }

  dim(id) { return this.seen.has(id) ? 1 : 0.38; }

  drum(c, id) {
    const p = KIT[id], f = this.flash[id] || 0, s = 1 + f * 0.05 + (id === 'kick' ? this.foot.kick * 0.04 : 0);
    c.save(); c.globalAlpha = this.dim(id); c.translate(p.x, p.y); c.scale(s, s);
    if (id === 'kick') {                                        // the bass drum faces us: a round head with a crimson hoop and the logo mark
      c.fillStyle = C.shell; c.beginPath(); c.arc(0, 0, p.r + 8, 0, 7); c.fill();
      c.strokeStyle = C.line; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, p.r + 4, 0, 7); c.stroke();
      c.fillStyle = '#120a0c'; c.beginPath(); c.arc(0, 0, p.r - 4, 0, 7); c.fill();
      c.fillStyle = `rgba(255,58,82,${0.16 + f * 0.5})`; c.beginPath(); c.arc(0, 0, p.r - 8, 0, 7); c.fill();
      c.fillStyle = C.glow; c.font = '700 38px ui-monospace, Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha *= 0.55 + f * 0.45; c.fillText('DL', 0, 4);
    } else {                                                     // a top-down-ish drum: shell edge below, head above
      c.fillStyle = C.shell; c.beginPath(); c.ellipse(0, 10, p.r, p.r * 0.5, 0, 0, 7); c.fill();
      c.fillRect(-p.r, 0, p.r * 2, 12);
      c.fillStyle = C.shell; c.beginPath(); c.ellipse(0, 12, p.r, p.r * 0.5, 0, 0, Math.PI); c.fill();
      c.fillStyle = C.head; c.globalAlpha *= 0.9; c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 7); c.fill();
      c.globalAlpha = this.dim(id);
      c.strokeStyle = C.line; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 7); c.stroke();
      if (f > 0.02) { c.strokeStyle = `rgba(255,58,82,${Math.min(0.9, f)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, p.r * (1.1 + (1.3 - f) * 0.35), p.r * 0.5 * (1.1 + (1.3 - f) * 0.35), 0, 0, 7); c.stroke(); }
    }
    c.restore();
  }

  cymbal(c, id) {
    const p = KIT[id], f = this.flash[id] || 0, sh = this.shake[id] || 0, ang = (p.tilt || 0) + Math.sin(performance.now() / 55) * 0.05 * sh;
    c.save(); c.globalAlpha = this.dim(id);
    c.strokeStyle = C.metal; c.lineWidth = 4; c.beginPath(); c.moveTo(p.x, p.y + 8); c.lineTo(p.x + (id === 'china' ? 30 : -4), 440); c.stroke();
    c.translate(p.x, p.y); c.rotate(ang);
    c.fillStyle = f > 0.05 ? '#e8cf8a' : C.brass; c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.2, 0, 0, 7); c.fill();
    c.strokeStyle = C.brassDark; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, p.r * 0.45, p.r * 0.09, 0, 0, 7); c.stroke();
    if (f > 0.02) { c.strokeStyle = `rgba(255,220,150,${Math.min(0.8, f)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, p.r * (1.05 + sh * 0.1), p.r * 0.2 * (1.05 + sh * 0.1), 0, 0, 7); c.stroke(); }
    c.restore();
  }

  hatStand(c) {
    const p = KIT.hat, f = this.flash.hat || 0, open = this.hatOpen * 10 + this.foot.hat * -3;
    c.save(); c.globalAlpha = this.dim('hat');
    c.strokeStyle = C.metal; c.lineWidth = 4; c.beginPath(); c.moveTo(p.x, p.y + 6); c.lineTo(p.x, 445); c.stroke();
    for (const [dy, up] of [[8, 0], [-4 - open, 1]]) {
      c.fillStyle = f > 0.05 ? '#e8cf8a' : C.brass; c.beginPath(); c.ellipse(p.x + (up ? Math.sin(performance.now() / 40) * (this.shake.hat || 0) * 2 : 0), p.y + dy, p.r, p.r * 0.17, 0, 0, 7); c.fill();
    }
    c.restore();
  }

  robot(c) {
    const bx = 480, by = 228, bob = Math.sin(performance.now() / 420) * 2 + this.beat * 5, tilt = this.beat * 0.025;
    c.save(); c.translate(bx, by + bob); c.rotate(tilt);
    c.fillStyle = C.metal; c.fillRect(-30, 100, 60, 40);                                           // the throne post
    c.fillStyle = C.body; c.strokeStyle = C.line; c.lineWidth = 3;
    c.beginPath(); c.roundRect(-52, -10, 104, 120, 14); c.fill(); c.stroke();                       // torso
    c.fillStyle = '#120a0c'; c.beginPath(); c.roundRect(-30, 10, 60, 34, 6); c.fill();               // chest panel
    c.fillStyle = `rgba(255,58,82,${0.35 + this.beat * 0.65})`; c.fillRect(-22, 22, 44, 10);        // it pulses with the beat
    c.fillStyle = C.body; c.beginPath(); c.roundRect(-44, -92, 88, 78, 16); c.fill(); c.stroke();     // head
    c.fillStyle = C.visor; c.beginPath(); c.roundRect(-34, -74, 68, 32, 10); c.fill();
    const eye = this.beat > 0.2 ? 1 : 0.7; c.fillStyle = `rgba(255,58,82,${eye})`;
    c.beginPath(); c.arc(-15, -58, 7, 0, 7); c.arc(15, -58, 7, 0, 7); c.fill();                      // eyes
    c.fillStyle = C.metal; c.fillRect(-2, -108, 4, 16); c.fillStyle = C.glow; c.beginPath(); c.arc(0, -112, 6 + this.beat * 3, 0, 7); c.fill();   // antenna
    c.restore();
    // legs: the right foot works the kick pedal, the left the hi-hat pedal
    c.save(); c.strokeStyle = C.body; c.lineWidth = 16; c.lineCap = 'round';
    c.beginPath(); c.moveTo(450, 335); c.lineTo(430, 390 + this.foot.kick * 14); c.stroke();
    c.beginPath(); c.moveTo(510, 335); c.lineTo(620, 400 + this.foot.hat * 10); c.stroke();
    c.restore();
  }

  arms(c) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [side, sx, dir] of [['L', 524, 1], ['R', 436, -1]]) {
      const H = this.hands[side], s = { x: sx, y: 246 + this.beat * 3 }, t = { x: H.x.x, y: H.y.x };
      const { elbow, hand } = ik2(s, t, 92, 96, dir);
      c.strokeStyle = C.body; c.lineWidth = 17; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(elbow.x, elbow.y); c.lineTo(hand.x, hand.y); c.stroke();
      c.strokeStyle = C.line; c.lineWidth = 3; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(elbow.x, elbow.y); c.lineTo(hand.x, hand.y); c.stroke();
      c.fillStyle = C.metal; c.beginPath(); c.arc(elbow.x, elbow.y, 7, 0, 7); c.fill();
      // the stick runs from the hand down toward the piece it will strike
      c.strokeStyle = '#e8dccd'; c.lineWidth = 5; c.beginPath(); c.moveTo(hand.x, hand.y); c.lineTo(hand.x + (side === 'L' ? -10 : 10), hand.y + 46 * (1 - H.lift * 0.35)); c.stroke();
      c.fillStyle = C.glow; c.beginPath(); c.arc(hand.x, hand.y, 8, 0, 7); c.fill();
    }
    c.restore();
  }
}

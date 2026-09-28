// The fingerboard: four strings you play with your fingers (or a mouse, or a
// Quest controller's pointer). Along a string = pitch, fretless. Across a
// string = where the bow sits (tasto ↔ ponticello). Wiggle for vibrato, slide
// for glissando, two fingers on two strings for double stops.
//
// "Soft" snapping (the default) pulls a still finger onto the nearest note of
// the key, but keeps the fast wiggles — so vibrato survives and slides stay
// smooth. "Snap" is fully quantised, "Free" is a true fretless string.

import { clamp, snapToScale, inScale, noteName, NOTE_NAMES } from "./theory.js";

export class Fingerboard {
  constructor(canvas, engine, opts = {}) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.engine = engine;
    this.range = opts.range || 19;          // semitones per string
    this.snap = opts.snap || "soft";        // free | soft | snap
    this.timbre = opts.timbre !== false;    // across-string → bow position
    this.touches = new Map();
    this.ghosts = [];                       // notes from other sources, shown on the board
    this.dirty = true;
    this.phase = 0;
    this.enabled = true;
    const pe = (fn) => (e) => { if (this.enabled) fn.call(this, e); };
    canvas.addEventListener("pointerdown", pe(this.down));
    canvas.addEventListener("pointermove", pe(this.move));
    canvas.addEventListener("pointerup", pe(this.up));
    canvas.addEventListener("pointercancel", pe(this.up));
    canvas.addEventListener("lostpointercapture", pe(this.up));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    engine.on("levels", () => { this.dirty = true; });
    engine.on("setting", (e) => { if (["tuning", "keyRoot", "scale", "a4"].includes(e.name)) this.dirty = true; });
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height);
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.vertical = this.H > this.W * 1.05;
    this.dirty = true;
  }

  strings() { return this.engine.openStrings(); }

  // geometry: "along" 0..1 from nut, "lane" index + offset -0.5..0.5 across
  pad() { return this.vertical ? { a0: 26, a1: this.H - 10, c0: 8, c1: this.W - 8 } : { a0: 34, a1: this.W - 12, c0: 8, c1: this.H - 8 }; }
  locate(x, y) {
    const p = this.pad();
    const along = this.vertical ? y : x;
    const cross = this.vertical ? x : this.H - y;     // horizontal: lowest string at the bottom
    const n = 4;
    const lanes = (cross - p.c0) / ((p.c1 - p.c0) / n);
    const lane = clamp(Math.floor(lanes), 0, n - 1);
    return { pos: clamp((along - p.a0) / (p.a1 - p.a0), 0, 1), lane, off: clamp(lanes - lane - 0.5, -0.5, 0.5) };
  }
  midiAt(lane, pos) { return this.strings()[lane] + pos * this.range; }
  posOf(lane, midi) { return (midi - this.strings()[lane]) / this.range; }
  /** Best string for a note that came from elsewhere (keys, MIDI, phrases). */
  laneFor(midi) {
    const s = this.strings();
    for (let i = s.length - 1; i >= 0; i--) if (midi >= s[i] - 0.01 && midi <= s[i] + this.range * 0.55) return i;
    for (let i = 0; i < s.length; i++) if (midi >= s[i] && midi <= s[i] + this.range) return i;
    return midi < s[0] ? 0 : s.length - 1;
  }

  xyFor(lane, pos, off = 0) {
    const p = this.pad();
    const w = (p.c1 - p.c0) / 4;
    const c = p.c0 + (lane + 0.5 + off) * w;
    const a = p.a0 + pos * (p.a1 - p.a0);
    return this.vertical ? [c, a] : [a, this.H - c];
  }

  // ------------------------------------------------------------ pointers

  down(e) {
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    const r = this.cv.getBoundingClientRect();
    const L = this.locate(e.clientX - r.left, e.clientY - r.top);
    const raw = this.midiAt(L.lane, L.pos);
    const s = this.engine.s;
    const t = { id: e.pointerId, lane: L.lane, raw, smooth: raw, k: this.snap === "soft" ? 1 : 0, last: performance.now(), off: L.off, key: "fb:" + e.pointerId };
    t.out = this.pitchFor(t);
    this.touches.set(e.pointerId, t);
    const pr = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : null;
    const vel = pr != null ? 0.3 + pr * 0.7 : 0.8;
    const params = this.timbre ? { bowPos: clamp(s.bowPos + L.off * 0.9, 0, 1) } : undefined;
    this.engine.noteOn(t.key, t.out, vel, { params, lockBow: this.timbre, noTranspose: true });
    this.dirty = true;
  }

  move(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const r = this.cv.getBoundingClientRect();
    const L = this.locate(e.clientX - r.left, e.clientY - r.top);
    t.raw = this.strings()[t.lane] + L.pos * this.range;
    // across offset relative to the finger's own lane
    const p = this.pad();
    const cross = this.vertical ? e.clientX - r.left : this.H - (e.clientY - r.top);
    const w = (p.c1 - p.c0) / 4;
    t.off = clamp((cross - p.c0) / w - t.lane - 0.5, -1, 1);
    if (e.pointerType === "pen" && e.pressure > 0) this.engine.noteUpdate(t.key, { vel: 0.3 + e.pressure * 0.7 });
    this.dirty = true;
  }

  up(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    this.engine.noteOff(t.key);
    this.dirty = true;
  }

  releaseAll() { for (const t of this.touches.values()) this.engine.noteOff(t.key); this.touches.clear(); this.dirty = true; }

  pitchFor(t) {
    const s = this.engine.s;
    if (this.snap === "free") return t.raw;
    const target = snapToScale(t.smooth, s.keyRoot, s.scale);
    if (this.snap === "snap") return target + (t.raw - t.smooth) * 0.6;
    return t.raw + t.k * (target - t.smooth);
  }

  // per-frame pitch tracking (soft snap needs time-based smoothing)
  update(dt) {
    const s = this.engine.s;
    for (const t of this.touches.values()) {
      const prev = t.smooth;
      const a = 1 - Math.exp(-dt / 0.07);
      t.smooth += (t.raw - t.smooth) * a;
      const speed = Math.abs(t.smooth - prev) / Math.max(dt, 1e-3);   // semitones / s
      if (this.snap === "soft") t.k = clamp(t.k + (speed > 4 ? -dt * 10 : dt * 4), 0, 1);
      const out = this.pitchFor(t);
      if (Math.abs(out - t.out) > 0.002) { t.out = out; this.engine.noteUpdate(t.key, { midi: out, glide: 0.012, noTranspose: true }); }
      if (this.timbre) {
        const bp = clamp(s.bowPos + t.off * 0.9, 0, 1);
        if (Math.abs(bp - (t.bp ?? -1)) > 0.01) { t.bp = bp; this.engine.noteUpdate(t.key, { bowPos: bp }); }
      }
    }
  }

  // ------------------------------------------------------------ drawing

  loop(ts) {
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    if (this.touches.size) this.update(dt);
    const busy = this.touches.size || this.engine.levels.size || this.ghosts.length;
    if ((this.dirty || busy) && this.cv.offsetParent !== null) { this.phase += dt; this.draw(); this.dirty = false; }
    requestAnimationFrame(this.loop);
  }

  draw() {
    const g = this.g, W = this.W, H = this.H, V = this.vertical;
    const s = this.engine.s;
    const strings = this.strings();
    const p = this.pad();
    g.clearRect(0, 0, W, H);

    // ebony board
    const grad = V ? g.createLinearGradient(0, 0, W, 0) : g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0c0909"); grad.addColorStop(0.5, "#171112"); grad.addColorStop(1, "#0c0909");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // nut
    g.fillStyle = "#e9dcc8";
    if (V) g.fillRect(p.c0, p.a0 - 6, p.c1 - p.c0, 4); else g.fillRect(p.a0 - 6, H - p.c1, 4, p.c1 - p.c0);

    // note guides (same for every string on a linear board, so draw per string lane)
    const w = (p.c1 - p.c0) / 4;
    g.font = "10px ui-monospace, Menlo, monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let lane = 0; lane < 4; lane++) {
      for (let k = 0; k <= this.range; k++) {
        const m = strings[lane] + k;
        const pos = k / this.range;
        const inKey = inScale(m, s.keyRoot, s.scale);
        const isRoot = ((m - s.keyRoot) % 12 + 12) % 12 === 0 && s.scale !== "chromatic";
        const [x, y] = this.xyFor(lane, pos, 0);
        g.strokeStyle = isRoot ? "rgba(255,47,78,0.55)" : inKey ? "rgba(242,228,230,0.16)" : "rgba(242,228,230,0.05)";
        g.lineWidth = isRoot ? 2 : 1;
        g.beginPath();
        if (V) { g.moveTo(x - w * 0.46, y); g.lineTo(x + w * 0.46, y); } else { g.moveTo(x, y - w * 0.46); g.lineTo(x, y + w * 0.46); }
        g.stroke();
        if (inKey && (k % 12 === 0 || s.scale !== "chromatic" || [0, 2, 4, 5, 7, 9, 11].includes(((m % 12) + 12) % 12))) {
          g.fillStyle = isRoot ? "rgba(255,47,78,0.8)" : "rgba(242,228,230,0.28)";
          const label = NOTE_NAMES[((m % 12) + 12) % 12];
          if (V) g.fillText(label, x + w * 0.3, y - 7); else g.fillText(label, x + 9, y - w * 0.33);
        }
      }
      // inlay dots at the octave and fifth, like position markers
      for (const k of [7, 12]) {
        if (k > this.range) continue;
        const [x, y] = this.xyFor(lane, k / this.range, 0);
        g.fillStyle = "rgba(255,138,61,0.18)";
        g.beginPath(); g.arc(V ? x - w * 0.3 : x, V ? y : y + w * 0.3, 2.5, 0, Math.PI * 2); g.fill();
      }
    }

    // which lanes are sounding (for string vibration)
    const laneLevel = [0, 0, 0, 0];
    for (const [key, lvl] of this.engine.levels) {
      const t = this.touchByKey(key);
      const h = this.engine.handles.get(key);
      const lane = t ? t.lane : h ? this.laneFor(h.midi) : -1;
      if (lane >= 0) laneLevel[lane] = Math.max(laneLevel[lane], lvl);
    }

    // strings
    for (let lane = 0; lane < 4; lane++) {
      const [x0, y0] = this.xyFor(lane, 0);
      const [x1, y1] = this.xyFor(lane, 1);
      const amp = Math.min(6, laneLevel[lane] * 22);
      const thick = 3.2 - lane * 0.55;
      g.strokeStyle = amp > 0.2 ? "#ff8a3d" : lane < 2 ? "#b9a58c" : "#d9d2cc";
      g.lineWidth = thick;
      g.beginPath();
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const wob = amp * Math.sin(Math.PI * u) * Math.sin(this.phase * 60 + lane);
        const x = x0 + (x1 - x0) * u + (V ? wob : 0);
        const y = y0 + (y1 - y0) * u + (V ? 0 : wob);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      // open-string name at the nut
      g.fillStyle = "#7a6468";
      g.font = "bold 11px ui-monospace, Menlo, monospace";
      const nm = noteName(strings[lane]);
      if (V) g.fillText(nm, x0, p.a0 - 16); else g.fillText(nm, p.a0 - 20, y0);
    }

    // ghosts: notes playing from keys / MIDI / phrases / voice
    const held = new Set([...this.touches.values()].map((t) => t.key));
    for (const [key, h] of this.engine.handles) {
      if (held.has(key) || h.alias) continue;
      const lane = this.laneFor(h.midi);
      const pos = clamp(this.posOf(lane, h.midi), 0, 1);
      const [x, y] = this.xyFor(lane, pos);
      g.fillStyle = "rgba(255,138,61,0.35)";
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    }

    // fingers
    for (const t of this.touches.values()) {
      const pos = clamp(this.posOf(t.lane, t.out), 0, 1);
      const [x, y] = this.xyFor(t.lane, pos, this.timbre ? clamp(t.off, -0.5, 0.5) * 0.5 : 0);
      g.fillStyle = "rgba(255,47,78,0.9)";
      g.shadowColor = "rgba(255,47,78,0.8)"; g.shadowBlur = 14;
      g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      const near = Math.round(t.out);
      const cents = Math.round((t.out - near) * 100);
      g.fillStyle = "#1a0004";
      g.font = "bold 11px ui-monospace, Menlo, monospace";
      g.fillText(noteName(near), x, y - 1);
      g.fillStyle = "#f2e4e6";
      g.font = "10px ui-monospace, Menlo, monospace";
      const lbl = (cents > 0 ? "+" : "") + cents + "¢";
      if (V) g.fillText(lbl, x, y - 24); else g.fillText(lbl, x, y - 24);
    }
  }

  touchByKey(key) { for (const t of this.touches.values()) if (t.key === key) return t; return null; }
}

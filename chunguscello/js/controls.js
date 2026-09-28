// Smaller play surfaces and meters: on-screen keys, the bow pad, the scope,
// the loop ring and the tuner needle.

import { clamp, KEY_SEQUENCE, isBlack, noteName, inScale } from "./theory.js";

// ---------------------------------------------------------------- on-screen keys

export class PianoKeys {
  constructor(el, engine, getBase) {
    this.el = el; this.engine = engine; this.getBase = getBase;
    this.ptr = new Map();       // pointerId → midi
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e));
    el.addEventListener("pointercancel", (e) => this.up(e));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    engine.on("noteon", () => this.mark());
    engine.on("noteoff", () => this.mark());
    engine.on("setting", (e) => { if (["keyRoot", "scale"].includes(e.name)) this.render(); });
    new ResizeObserver(() => this.render()).observe(el);
  }
  render() {
    const w = this.el.clientWidth || 600;
    const whites = clamp(Math.floor(w / 40), 8, 22);
    const base = this.getBase();
    const s = this.engine.s;
    this.el.innerHTML = "";
    let m = base, count = 0;
    while (count < whites) {
      const k = document.createElement("div");
      const black = isBlack(m);
      k.className = "key" + (black ? " black" : "") + (inScale(m, s.keyRoot, s.scale) ? "" : " out") + ((((m - s.keyRoot) % 12) + 12) % 12 === 0 && s.scale !== "chromatic" ? " root" : "");
      k.dataset.midi = m;
      const idx = m - base;
      const letter = idx < KEY_SEQUENCE.length ? KEY_SEQUENCE[idx].key.toUpperCase() : "";
      k.innerHTML = black ? `<small>${letter}</small>` : `${noteName(m)}<small>${letter}</small>`;
      this.el.appendChild(k);
      if (!black) count++;
      m++;
    }
    this.mark();
  }
  keyAt(x, y) {
    const t = document.elementFromPoint(x, y);
    const k = t && t.closest ? t.closest(".key") : null;
    return k && this.el.contains(k) ? +k.dataset.midi : null;
  }
  down(e) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    const m = this.keyAt(e.clientX, e.clientY);
    if (m == null) return;
    this.ptr.set(e.pointerId, m);
    this.engine.noteOn("pk:" + e.pointerId + ":" + m, m, 0.8);
  }
  move(e) {
    if (!this.ptr.has(e.pointerId)) return;
    const m = this.keyAt(e.clientX, e.clientY);
    const old = this.ptr.get(e.pointerId);
    if (m == null || m === old) return;
    // new note first so mono legato glides
    this.ptr.set(e.pointerId, m);
    this.engine.noteOn("pk:" + e.pointerId + ":" + m, m, 0.8);
    this.engine.noteOff("pk:" + e.pointerId + ":" + old);
  }
  up(e) {
    const m = this.ptr.get(e.pointerId);
    if (m == null) return;
    this.ptr.delete(e.pointerId);
    this.engine.noteOff("pk:" + e.pointerId + ":" + m);
  }
  mark() {
    const on = new Set();
    for (const h of this.engine.handles.values()) on.add(Math.round(h.midi));
    for (const k of this.el.children) k.classList.toggle("active", on.has(+k.dataset.midi));
  }
}

// ---------------------------------------------------------------- bow pad

export class BowPad {
  constructor(wrap, canvas, engine, onChange) {
    this.wrap = wrap; this.cv = canvas; this.g = canvas.getContext("2d"); this.engine = engine;
    this.onChange = onChange || (() => {});
    this.handBow = false;
    this.active = null;
    this.speed = 0; this.dir = 1;
    this.trail = [];
    wrap.addEventListener("pointerdown", (e) => this.down(e));
    wrap.addEventListener("pointermove", (e) => this.move(e));
    wrap.addEventListener("pointerup", (e) => this.up(e));
    wrap.addEventListener("pointercancel", (e) => this.up(e));
    wrap.addEventListener("dblclick", () => { this.engine.set("bowPos", 0.45); this.engine.set("pressure", 0.5); this.onChange(); });
    new ResizeObserver(() => this.resize()).observe(wrap);
    engine.on("setting", (e) => { if (e.name === "bowPos" || e.name === "pressure") this.dirty = true; });
    this.resize();
    const loop = (ts) => { this.frame(ts); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height);
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }
  setHandBow(on) {
    this.handBow = on;
    this.engine.handBow = on;
    if (!on) this.engine.apply("dynamics");
    else this.engine.post({ type: "global", values: { expr: 0 } });
    this.dirty = true;
  }
  pos(e) { const r = this.wrap.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; }
  down(e) {
    e.preventDefault();
    try { this.wrap.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    const [x, y] = this.pos(e);
    this.active = { id: e.pointerId, x, y, t: performance.now() };
    if (!this.handBow) this.setXY(x, y);
    else this.engine.set("pressure", y);
  }
  move(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    const [x, y] = this.pos(e);
    const now = performance.now();
    const dt = Math.max(1, now - this.active.t) / 1000;
    if (this.handBow) {
      // bow speed from horizontal hand speed (pad widths per second), signed
      const vx = (x - this.active.x) / dt;
      const target = clamp(vx * 0.55, -1.3, 1.3);
      this.speed += (target - this.speed) * 0.5;
      this.engine.post({ type: "global", values: { expr: this.speed } });
      if (Math.abs(y - this.engine.s.pressure) > 0.02) this.engine.set("pressure", y);
      this.trail.push([x, y, now]);
    } else this.setXY(x, y);
    this.active.x = x; this.active.y = y; this.active.t = now;
    this.dirty = true;
  }
  up(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    this.active = null;
    if (this.handBow) this.speed = 0;
    this.dirty = true;
  }
  setXY(x, y) {
    if (Math.abs(x - this.engine.s.bowPos) > 0.004) this.engine.set("bowPos", Math.round(x * 100) / 100);
    if (Math.abs(y - this.engine.s.pressure) > 0.004) this.engine.set("pressure", Math.round(y * 100) / 100);
    this.onChange();
    this.dirty = true;
  }
  frame(ts) {
    // hand bow: a still hand is a stopped bow — speed decays toward zero
    if (this.handBow && this.engine.ready) {
      if (!this.active || (performance.now() - (this.active.t || 0)) > 60) {
        if (Math.abs(this.speed) > 0.001) { this.speed *= 0.82; if (Math.abs(this.speed) < 0.01) this.speed = 0; this.engine.post({ type: "global", values: { expr: this.speed } }); this.dirty = true; }
      }
    }
    if (!this.dirty && !this.trail.length) return;
    this.dirty = false;
    const g = this.g, W = this.W, H = this.H, s = this.engine.s;
    g.clearRect(0, 0, W, H);
    // strings across the pad, like looking down at the bridge area
    g.strokeStyle = "rgba(242,228,230,0.08)"; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H * i) / 4); g.lineTo(W, (H * i) / 4); g.stroke(); }
    // bridge on the right edge, fingerboard end on the left
    g.fillStyle = "rgba(181,101,43,0.35)"; g.fillRect(W - 6, 0, 6, H);
    g.fillStyle = "rgba(20,14,15,1)"; g.fillRect(0, 0, 6, H);
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p[2] < 500);
    for (const [x, y, t] of this.trail) {
      g.fillStyle = `rgba(255,138,61,${0.5 * (1 - (now - t) / 500)})`;
      g.beginPath(); g.arc(x * W, (1 - y) * H, 3, 0, Math.PI * 2); g.fill();
    }
    if (this.trail.length) this.dirty = true;
    const bx = s.bowPos * W, py = (1 - s.pressure) * H;
    // the bow hair: a vertical band at the contact point, thicker with pressure
    g.fillStyle = `rgba(242,228,230,${0.15 + 0.25 * s.pressure})`;
    g.fillRect(bx - 2 - s.pressure * 3, 0, 4 + s.pressure * 6, H);
    g.fillStyle = this.handBow && Math.abs(this.speed) > 0.05 ? "#ff8a3d" : "#ff2f4e";
    g.shadowColor = g.fillStyle; g.shadowBlur = 12;
    g.beginPath(); g.arc(bx, py, 9, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    if (this.handBow) {
      g.fillStyle = "rgba(242,228,230,0.6)"; g.font = "11px ui-monospace, Menlo, monospace"; g.textAlign = "center";
      g.fillText(Math.abs(this.speed) > 0.05 ? (this.speed > 0 ? "down-bow →" : "← up-bow") : "stroke left ↔ right to bow", W / 2, 16);
    }
  }
}

// ---------------------------------------------------------------- scope

export function startScope(canvas, engine) {
  const g = canvas.getContext("2d");
  const buf = new Float32Array(1024);
  const draw = () => {
    requestAnimationFrame(draw);
    if (!engine.analyser || document.hidden) return;
    const W = canvas.width, H = canvas.height;
    engine.analyser.getFloatTimeDomainData(buf);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,47,78,0.85)"; g.lineWidth = 1.5;
    g.beginPath();
    // trigger on a rising zero crossing so the wave stands still
    let start = 0;
    for (let i = 1; i < 512; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
    for (let i = 0; i < 512; i++) {
      const x = (i / 511) * W, y = H / 2 - buf[start + i] * H * 0.9;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  };
  draw();
}

// ---------------------------------------------------------------- loop ring

export function drawLoopRing(canvas, looper, engine) {
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, r = W / 2 - 8;
  g.clearRect(0, 0, W, H);
  g.lineWidth = 8;
  g.strokeStyle = "#1c0f11";
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  const st = looper.state;
  let ph = looper.phase();
  let col = "#ff2f4e";
  if (st === "recording" || st === "countin") {
    col = "#ff0033";
    const el = engine.now - looper.capStart;
    if (st === "countin") ph = 1 - Math.max(0, (looper.capStart - engine.now) / engine.barDur());
    else if (looper.bars !== "free") ph = el / (+looper.bars * engine.barDur());
    else ph = (el % 4) / 4;
  } else if (st === "overdub") col = "#ff8a3d";
  else if (st === "stopped" || st === "empty") ph = 0;
  if (ph > 0) {
    g.strokeStyle = col;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ph * Math.PI * 2); g.stroke();
  }
  // beat ticks
  if (looper.loopLen) {
    const beats = Math.max(1, Math.round(looper.loopLen / engine.beatDur()));
    if (beats <= 64) {
      g.strokeStyle = "rgba(242,228,230,0.25)"; g.lineWidth = 2;
      for (let i = 0; i < beats; i++) {
        const a = -Math.PI / 2 + (i / beats) * Math.PI * 2;
        const r0 = r - (i % 4 === 0 ? 14 : 9);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5)); g.stroke();
      }
    }
  }
  g.fillStyle = "#f2e4e6"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "bold 15px ui-monospace, Menlo, monospace";
  const label = { empty: "ready", countin: "count", recording: "REC", playing: "play", overdub: "DUB", stopped: "stop" }[st] || st;
  g.fillText(label, cx, cy - 8);
  g.font = "11px ui-monospace, Menlo, monospace"; g.fillStyle = "#7a6468";
  g.fillText(looper.layers.length ? `${looper.layers.length} layer${looper.layers.length > 1 ? "s" : ""}` : `${Math.round(engine.s.bpm)} bpm`, cx, cy + 10);
  if (looper.loopLen) g.fillText(`${looper.loopLen.toFixed(2)}s`, cx, cy + 24);
}

export function drawPeaks(canvas, peaks, color = "#ff2f4e") {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 200, H = canvas.clientHeight || 30;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  let pk = 0; for (const p of peaks) pk = Math.max(pk, p);
  const k = pk > 0 ? 1 / pk : 1;
  g.fillStyle = color;
  const bw = W / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, peaks[i] * k * H * 0.9);
    g.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 0.5), h);
  }
}

// ---------------------------------------------------------------- tuner needle

export function drawTuner(canvas, cents, active) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#150a0c"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(242,228,230,0.2)"; g.lineWidth = 1;
  for (let c = -50; c <= 50; c += 10) {
    const x = W / 2 + (c / 50) * (W / 2 - 10);
    g.beginPath(); g.moveTo(x, H - (c % 50 === 0 ? 18 : c === 0 ? 22 : 10)); g.lineTo(x, H); g.stroke();
  }
  g.fillStyle = "rgba(80,220,120,0.25)"; g.fillRect(W / 2 - (5 / 50) * (W / 2 - 10), 0, (10 / 50) * (W / 2 - 10), H);
  if (!active) return;
  const x = W / 2 + (clamp(cents, -50, 50) / 50) * (W / 2 - 10);
  g.strokeStyle = Math.abs(cents) < 5 ? "#50dc78" : "#ff2f4e"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, 2); g.lineTo(x, H); g.stroke();
}

// PenrosePulse visuals: an infinite zoom that never arrives.
//
// Fifteen thin rings sit at radii R * 0.78^d, where d = (ring index + phase). Advancing `phase`
// from 0 to 1 slides every ring into the place of the next one in (ring i at phase 1 IS ring i+1 at
// phase 0), so the tunnel can zoom forever with no seam, the Shepard-Risset glissando drawn in light.
// Everything about a ring (shape, twist, alpha, width) depends only on its continuous depth d, which
// is what keeps the wrap invisible. One canvas, additive blending, no shadows: light on the CPU.

import { clamp, lerp, smooth } from "./theory.js";
import { arcAt } from "./conductor.js";

const TAU = Math.PI * 2;
const STOPS = [[0, [150, 205, 255]], [0.5, [186, 166, 255]], [0.85, [255, 160, 206]], [1, [255, 216, 152]]];

export function arcColor(a) {
  for (let i = 1; i < STOPS.length; i++) {
    if (a <= STOPS[i][0]) {
      const [a0, c0] = STOPS[i - 1], [a1, c1] = STOPS[i], t = (a - a0) / (a1 - a0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export class Tunnel {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext("2d", { alpha: false });
    this.phase = 0; this.t = 0; this.pings = []; this.boomV = 0; this.pulse = 0; this.level = 0; this.avg = 0.016; this.low = false;
    this.eco = false; this.acc = 0; this.n = 0;
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize(); addEventListener("resize", () => this.resize());
  }

  /** Eco: render at 1x, half the frames, fewer rings. For slow machines; switched on automatically when frames run slow. */
  setEco(on) { if (on !== this.eco) { this.eco = on; this.resize(); } }

  resize() {
    this.dpr = this.eco || this.low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = innerWidth; this.h = innerHeight;
    this.c.width = Math.floor(this.w * this.dpr); this.c.height = Math.floor(this.h * this.dpr);
    this.x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** A note: a ripple races outward from the centre at the pitch's angle. */
  ping(pitchClass, strength = 0.6) { if (!this.reduced && this.pings.length < 24) this.pings.push({ born: this.t, ang: (pitchClass / 12) * TAU - Math.PI / 2, s: strength }); }
  boom() { this.boomV = 1; }
  beat(accent) { this.pulse = Math.max(this.pulse, accent ? 1 : 0.55); }

  frame(dt, st) {
    dt = Math.min(dt, 0.05);
    this.avg += (dt - this.avg) * 0.04;
    if (!this.low && this.t > 3 && this.avg > 0.026) { this.low = true; this.resize(); }       // quality scaler: shed detail on slow devices
    this.acc += dt;
    if ((this.eco || this.low) && ++this.n % 2) return;                                          // half the frames when lightening the load
    dt = this.acc; this.acc = 0; this.t += dt;
    this.level += ((Number.isFinite(st.level) ? st.level : 0) - this.level) * Math.min(1, dt * 6);
    this.pulse *= Math.exp(-dt * 7); this.boomV *= Math.exp(-dt * 2.2);
    const x = this.x, w = this.w, h = this.h, a = clamp(st.a, 0, 1), L = clamp(this.level * 5, 0, 1);
    const [cr, cg, cb] = arcColor(a), cx = w / 2, cy = h * 0.46, maxR = Math.hypot(w, h) * 0.6;
    const speed = this.reduced ? 0.02 : 0.045 + 0.7 * a * a + 1.3 * this.boomV + 0.2 * this.pulse * a;
    this.phase = (this.phase + dt * speed) % 1;

    // night, with the colour of the climb glowing in the middle
    x.globalCompositeOperation = "source-over";
    const bg = x.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.9);
    bg.addColorStop(0, `rgba(${cr * 0.22 | 0},${cg * 0.22 | 0},${cb * 0.3 | 0},1)`); bg.addColorStop(1, "#03050a");
    x.fillStyle = bg; x.fillRect(0, 0, w, h);

    // the rings
    x.globalCompositeOperation = "lighter";
    const light = this.eco || this.low, R = light ? 8 : 14, SEG = light ? 44 : 84, lw = Math.max(1, Math.min(w, h) / 520);
    const m1 = 0.025 + 0.13 * a + 0.05 * L, m2 = 0.015 + 0.09 * a + 0.06 * this.pulse, m3 = 0.1 * this.pulse * a;
    for (let i = 0; i < R; i++) {
      const d = i + this.phase, r = maxR * Math.pow(0.78, d);
      const alpha = smooth(0, 1.4, d) * (1 - smooth(R - 4, R, d)) * (0.16 + 0.34 * a + 0.2 * L + 0.15 * this.boomV);
      if (alpha < 0.01 || r < 2) continue;
      const rot = this.t * 0.05 + d * (0.28 + 0.5 * a);
      x.beginPath();
      for (let j = 0; j <= SEG; j++) {
        const th = (j / SEG) * TAU;
        const rr = r * (1 + m1 * Math.cos(3 * th + rot) + m2 * Math.cos(5 * th - rot * 1.3) + m3 * Math.cos(8 * th + rot * 0.6));
        const px = cx + Math.cos(th) * rr, py = cy + Math.sin(th) * rr * 0.96;
        if (j) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha.toFixed(3)})`;
      x.lineWidth = lw * (0.7 + 1.6 * (1 - d / R) + 1.5 * this.boomV);
      x.stroke();
    }

    // the seed at the centre: a phyllotaxis of points that breathes with the beat
    const dots = light ? 36 : 70, sr = Math.min(w, h) * (0.05 + 0.05 * a + 0.04 * this.pulse);
    x.fillStyle = `rgba(${Math.min(255, cr + 60) | 0},${Math.min(255, cg + 60) | 0},${Math.min(255, cb + 60) | 0},${(0.35 + 0.35 * this.pulse + 0.2 * a).toFixed(2)})`;
    for (let i = 1; i < dots; i++) {
      const ang = i * 2.39996 + this.t * 0.12, rad = sr * Math.sqrt(i / dots) * 1.9;
      x.beginPath(); x.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.96, 0.8 + 1.5 * (i / dots) * (1 + this.pulse), 0, TAU); x.fill();
    }

    // note ripples
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i], age = (this.t - p.born) / 1.7;
      if (age >= 1) { this.pings.splice(i, 1); continue; }
      const rr = maxR * (0.05 + 0.85 * age * age), al = (1 - age) * 0.7 * p.s;
      x.beginPath(); x.arc(cx, cy, rr, p.ang - 0.42, p.ang + 0.42);
      x.strokeStyle = `rgba(255,240,215,${al.toFixed(3)})`; x.lineWidth = lw * (1.4 + 2 * (1 - age)); x.stroke();
    }

    // the drop: one bright breath
    if (this.boomV > 0.01) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      g.addColorStop(0, `rgba(255,248,235,${(0.6 * this.boomV).toFixed(3)})`); g.addColorStop(1, "rgba(255,200,150,0)");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = "source-over";
  }
}

/** A small map of the whole arc with a playhead, so you always know where you are in the loop. */
export class ArcGraph {
  constructor(canvas) { this.c = canvas; this.x = canvas.getContext("2d"); this.resize(); addEventListener("resize", () => this.resize()); }

  resize() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(60, r.width); this.h = Math.max(20, r.height);
    this.c.width = Math.floor(this.w * dpr); this.c.height = Math.floor(this.h * dpr);
    this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(N, a, arcBar, auto) {
    const x = this.x, w = this.w, h = this.h, pad = 4;
    x.clearRect(0, 0, w, h);
    const pts = 140, yOf = (v) => h - pad - v * (h - pad * 2);
    const [r, g, b] = arcColor(a);
    const grad = x.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(150,205,255,0.35)"); grad.addColorStop(0.7, "rgba(255,160,206,0.4)"); grad.addColorStop(1, "rgba(255,216,152,0.45)");
    x.beginPath(); x.moveTo(0, h);
    for (let i = 0; i <= pts; i++) x.lineTo((i / pts) * w, yOf(arcAt((i / pts) * N * 0.9999, N).a));
    x.lineTo(w, h); x.closePath(); x.fillStyle = grad; x.fill();
    x.beginPath();
    for (let i = 0; i <= pts; i++) { const px = (i / pts) * w, py = yOf(arcAt((i / pts) * N * 0.9999, N).a); if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.strokeStyle = "rgba(235,245,255,0.8)"; x.lineWidth = 1.2; x.stroke();
    const px = auto ? ((arcBar % N) / N) * w : null;
    if (px != null) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = 1; x.stroke(); }
    x.beginPath(); x.arc(px != null ? px : w * 0.5, yOf(a), 3.2, 0, TAU); x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; x.fill();
  }
}

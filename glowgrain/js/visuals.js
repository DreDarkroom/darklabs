// The sky behind the instrument: a low sun that swells with the sound, faint light
// rays that appear as Bloom opens, and slow glowing motes that lift off each note.
// Cheap on purpose: one canvas, one cached glow sprite, a hard particle cap.

import { clamp, lerp } from "./theory.js";

const MAX_PARTS = 120;

export class Sky {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext("2d", { alpha: false });
    this.parts = []; this.avg = 0.016; this.low = false; this.t = 0; this.level = 0; this.bloom = 0; this.bloomShown = 0; this.w = 0; this.h = 0; this.dpr = 1;
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.sprite = this._sprite();
    this.resize(); addEventListener("resize", () => this.resize());
  }

  _sprite() {
    const s = document.createElement("canvas"); s.width = s.height = 64;
    const g = s.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,244,214,1)"); r.addColorStop(0.25, "rgba(255,190,100,.55)"); r.addColorStop(1, "rgba(255,150,70,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return s;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = innerWidth; this.h = innerHeight;
    this.c.width = Math.floor(this.w * this.dpr); this.c.height = Math.floor(this.h * this.dpr);
    this.x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Lift a few motes from (px, py) in CSS pixels. */
  spawn(px, py, strength = 0.6, n = 3) {
    if (this.reduced) return;
    const cap = this.low ? 36 : MAX_PARTS;
    for (let i = 0; i < n && this.parts.length < cap; i++) {
      this.parts.push({
        x: px + (Math.random() - 0.5) * 18, y: py, vx: (Math.random() - 0.5) * 14, vy: -(26 + Math.random() * 46) * (0.6 + strength),
        life: 0, max: 2.2 + Math.random() * 2.4, size: 10 + Math.random() * 22 * (0.5 + strength),
      });
    }
  }

  frame(dt, level, bloom) {
    dt = Math.min(dt, 0.05); this.t += dt;
    // quality scaler: if frames stay slow (phone, headset, busy machine) shed the rays and most motes, for good
    this.avg += (dt - this.avg) * 0.04;
    if (!this.low && this.t > 3 && this.avg > 0.03) { this.low = true; this.parts.length = Math.min(this.parts.length, 30); }
    this.level += ((Number.isFinite(level) ? level : 0) - this.level) * Math.min(1, dt * 7);
    if (!Number.isFinite(this.level)) this.level = 0;
    this.bloomShown += (bloom - this.bloomShown) * Math.min(1, dt * 2.5);
    const { x, w, h } = this, b = this.bloomShown, L = clamp(this.level * 5, 0, 1);

    // sky
    const sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#120807");
    sky.addColorStop(0.55, `rgb(${Math.round(lerp(34, 58, b))},${Math.round(lerp(17, 26, b))},${Math.round(lerp(12, 14, b))})`);
    sky.addColorStop(1, `rgb(${Math.round(lerp(66, 118, b))},${Math.round(lerp(32, 54, b))},${Math.round(lerp(16, 24, b))})`);
    x.globalCompositeOperation = "source-over"; x.fillStyle = sky; x.fillRect(0, 0, w, h);

    // sun
    const sx = w * 0.5, sy = h * lerp(0.9, 0.7, b), R = Math.max(w, h) * (0.42 + 0.28 * b + 0.12 * L);
    const sun = x.createRadialGradient(sx, sy, 0, sx, sy, R);
    sun.addColorStop(0, `rgba(255,214,150,${0.34 + 0.3 * b + 0.2 * L})`);
    sun.addColorStop(0.3, `rgba(255,150,70,${0.2 + 0.2 * b + 0.1 * L})`);
    sun.addColorStop(1, "rgba(255,120,60,0)");
    x.globalCompositeOperation = "lighter"; x.fillStyle = sun; x.fillRect(0, 0, w, h);

    // rays
    if (b > 0.18 && !this.reduced && !this.low) {
      const rays = 9, a0 = this.t * 0.03;
      x.fillStyle = `rgba(255,190,110,${0.018 + 0.05 * b})`;
      for (let i = 0; i < rays; i++) {
        const a = a0 + (i / rays) * Math.PI * 2, wdt = 0.07 + 0.04 * Math.sin(this.t * 0.3 + i);
        x.beginPath(); x.moveTo(sx, sy);
        x.lineTo(sx + Math.cos(a - wdt) * R * 2.4, sy + Math.sin(a - wdt) * R * 2.4);
        x.lineTo(sx + Math.cos(a + wdt) * R * 2.4, sy + Math.sin(a + wdt) * R * 2.4);
        x.closePath(); x.fill();
      }
    }

    // ambient motes + note motes
    if (!this.reduced && Math.random() < dt * (1.2 + 5 * b) && this.parts.length < (this.low ? 14 : MAX_PARTS)) {
      this.parts.push({ x: Math.random() * w, y: h + 10, vx: (Math.random() - 0.5) * 8, vy: -(10 + Math.random() * 18), life: 0, max: 6 + Math.random() * 5, size: 8 + Math.random() * 14, amb: true });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt; if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt + Math.sin(this.t + i) * 6 * dt; p.y += p.vy * dt; p.vy *= 1 - 0.18 * dt;
      const k = p.life / p.max, a = Math.sin(Math.PI * k) * (p.amb ? 0.35 : 0.8);
      x.globalAlpha = a; const s = p.size * (0.7 + 0.5 * k);
      x.drawImage(this.sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  }
}

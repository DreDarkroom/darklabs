// Ambient background visualiser — a taste of the Safelight approach (soft reactive glow behind the UI),
// kept deliberately subtle: a few slow-drifting orbs in the brand colours that swell on transients.
// Not part of any export — display-only, and it backs off entirely under prefers-reduced-motion.
import { eng } from './core.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function init(canvas) {
  const g = canvas.getContext('2d', { alpha: true });
  let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  new ResizeObserver(resize).observe(canvas); resize();

  const orbs = [
    { x: .12, y: .18, r: 340, hue: '230,57,70', vx: .010, vy: .006, ph: 0 },   // red-hot
    { x: .86, y: .10, r: 380, hue: '157,107,255', vx: -.008, vy: .009, ph: 2 }, // purple
    { x: .70, y: .92, r: 300, hue: '34,211,192', vx: .007, vy: -.007, ph: 4 },  // teal
    { x: .30, y: .85, r: 220, hue: '122,13,23', vx: -.006, vy: -.005, ph: 1 },  // deep red
  ];
  let t = 0, level = 0, buf = null;

  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    t += REDUCE ? 0.0015 : 0.006;
    // react to whatever's actually playing, decaying smoothly so single transients don't strobe the scene
    let target = 0;
    if (eng.analyser) {
      buf ||= new Uint8Array(eng.analyser.fftSize);
      eng.analyser.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i += 4) { const v = (buf[i] - 128) / 128; sum += v * v; }
      target = Math.min(1, Math.sqrt(sum / (buf.length / 4)) * 3.2);
    }
    level += (target - level) * 0.08;
    g.clearRect(0, 0, W, H);
    for (const o of orbs) {
      const bx = (o.x + Math.sin(t * o.vx * 40 + o.ph) * 0.05) * W, by = (o.y + Math.cos(t * o.vy * 40 + o.ph) * 0.05) * H;
      const pulse = 1 + level * 0.35 + Math.sin(t * 1.3 + o.ph) * 0.03;
      const r = o.r * pulse;
      const grd = g.createRadialGradient(bx, by, 0, bx, by, r);
      const a = (0.10 + level * 0.10).toFixed(3);
      grd.addColorStop(0, `rgba(${o.hue},${a})`); grd.addColorStop(1, `rgba(${o.hue},0)`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
  }
  requestAnimationFrame(tick);
}

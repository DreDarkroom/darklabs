/* ParaProg audio: a small synthesised kit and a look-ahead step scheduler. No samples. */

export class Kit {
  constructor() { this.ctx = null; this.noise = null; }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.out = this.ctx.createGain(); this.out.gain.value = 0.9;
      const lim = this.ctx.createDynamicsCompressor();
      this.out.connect(lim); lim.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  env(t, peak, dec) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    g.connect(this.out);
    return g;
  }
  tone(t, f0, f1, dec, peak, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dec * 0.6);
    o.connect(this.env(t, peak, dec)); o.start(t); o.stop(t + dec + 0.02);
  }
  hiss(t, hp, dec, peak) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    s.connect(f); f.connect(this.env(t, peak, dec)); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.02);
  }
  hit(voice, t, vel = 1) {
    const v = Math.max(0.05, Math.min(1, vel));
    switch (voice) {
      case 'kick': this.tone(t, 150, 45, 0.28, 0.95 * v); break;
      case 'snare': this.tone(t, 190, 120, 0.12, 0.35 * v, 'triangle'); this.hiss(t, 1800, 0.17, 0.55 * v); break;
      case 'hat': this.hiss(t, 7000, 0.045, 0.28 * v); break;
      case 'rim': this.tone(t, 330, 240, 0.09, 0.4 * v, 'triangle'); this.hiss(t, 2500, 0.07, 0.38 * v); break;   // right hand
      case 'tom': this.tone(t, 150, 95, 0.2, 0.7 * v); this.hiss(t, 3500, 0.04, 0.1 * v); break;                  // left hand
      case 'click': this.tone(t, 1500, 1500, 0.04, 0.35 * v, 'square'); break;
      default: break;
    }
  }
}

/* Loops `steps` (an array of [[voice, velocity], ...] per step). stepSeconds() is read live so tempo changes apply at once.
   onStep(index) is called close to when the step sounds. */
export class Player {
  constructor(kit) { this.kit = kit; this.timer = null; this.running = false; }
  start(steps, stepSeconds, onStep) {
    this.stop();
    const ctx = this.kit.ensure();
    this.running = true;
    let i = 0, next = ctx.currentTime + 0.08;
    const tick = () => {
      while (next < ctx.currentTime + 0.14) {
        for (const [voice, vel] of steps[i]) this.kit.hit(voice, next, vel);
        const idx = i, at = next;
        setTimeout(() => { if (this.running) onStep && onStep(idx); }, Math.max(0, (at - ctx.currentTime) * 1000));
        next += stepSeconds();
        i = (i + 1) % steps.length;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }
  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

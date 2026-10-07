/* KlartextKit: the performance meter and the little on-screen readout. It costs nothing while it is off (no frame loop, no observers).
   The maths (summarize, percentile) is pure so it can be tested; the meter just feeds it frame times from requestAnimationFrame.
   Long-frame and long-task counts come from the browser's own observers where they exist (Chromium has both; others just show 0). */
export const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

/** frames: [{t, dt}] (t = when the frame started in ms, dt = ms since the one before). Looks only at the last windowMs. */
export function summarize(frames, now, windowMs = 1000) {
  const recent = frames.filter((f) => now - f.t <= windowMs);
  if (!recent.length) return { fps: 0, avg: 0, p95: 0, worst: 0, n: 0 };
  const dts = recent.map((f) => f.dt).sort((a, b) => a - b);
  const sum = dts.reduce((a, b) => a + b, 0), avg = sum / dts.length;
  return { fps: 1000 / avg, avg, p95: percentile(dts, 0.95), worst: dts[dts.length - 1], n: dts.length };
}

const heapMB = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0);

export function createMeter(size = 600) {
  const T = new Float64Array(size), D = new Float32Array(size);
  const counters = { long: 0, longWorst: 0, loaf: 0, loafWorst: 0 };
  let i = 0, count = 0, last = 0, raf = 0, users = 0, observers = [];

  function loop(t) {
    if (!users) return;
    if (last) { T[i] = t; D[i] = t - last; i = (i + 1) % size; if (count < size) count++; }
    last = t;
    raf = requestAnimationFrame(loop);
  }
  function observe() {
    for (const [type, key] of [['longtask', 'long'], ['long-animation-frame', 'loaf']]) {
      try {
        const o = new PerformanceObserver((list) => { for (const e of list.getEntries()) { counters[key]++; counters[key + 'Worst'] = Math.max(counters[key + 'Worst'], e.duration); } });
        o.observe({ type, buffered: false }); observers.push(o);
      } catch (err) { /* this browser does not report that kind of entry */ }
    }
  }
  return {
    /** Several things may want the meter at once (the readout and the lab); it runs while anyone holds it. */
    acquire() { if (users++ === 0) { last = 0; raf = requestAnimationFrame(loop); observe(); } },
    release() { if (users > 0 && --users === 0) { cancelAnimationFrame(raf); observers.forEach((o) => o.disconnect()); observers = []; } },
    reset() { i = 0; count = 0; last = 0; Object.assign(counters, { long: 0, longWorst: 0, loaf: 0, loafWorst: 0 }); },
    get running() { return users > 0; },
    snapshot(windowMs = 1000, now = performance.now()) {
      const frames = [];
      for (let k = 0; k < count; k++) { const idx = (i - count + k + size) % size; frames.push({ t: T[idx], dt: D[idx] }); }
      return { ...summarize(frames, now, windowMs), ...counters, heapMB: heapMB(), nodes: document.getElementsByTagName('*').length };
    },
  };
}

export function createHud(meter, doc = document) {
  let el = null, timer = 0;
  const update = () => {
    const s = meter.snapshot(1000);
    el.textContent = `${s.fps.toFixed(0)} fps · ${s.avg.toFixed(1)} ms · worst ${s.worst.toFixed(0)} · long ${s.long}/${s.loaf} · ${s.heapMB ? s.heapMB.toFixed(0) + ' MB · ' : ''}${s.nodes} nodes`;
  };
  return {
    get on() { return !!el; },
    show() {
      if (el) return;
      el = doc.createElement('div'); el.id = 'hud'; el.setAttribute('aria-hidden', 'true');
      doc.body.append(el); meter.acquire(); timer = setInterval(update, 250); update();
    },
    hide() { if (!el) return; clearInterval(timer); el.remove(); el = null; meter.release(); },
    toggle() { this.on ? this.hide() : this.show(); return this.on; },
  };
}

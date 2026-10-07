/* KlartextKit: the attention system. The rule: the page is still and calm until something needs you, then it gets loud on purpose.
   Three levels, chosen by the user (and 'off' by default when the device asks for reduced motion):
     off     nothing moves. State is shown with colour, shape and words only.
     gentle  a short pulse or glow on the thing that matters. Alarms breathe slowly.
     wild    adds an edge glow, a shake, and a confetti burst for wins. Alarms are impossible to miss.
   Nothing flashes more than about twice a second, in any level (WCAG 2.3.1). The visual part lives in kk.css under html[data-attn]. */
export const LEVELS = ['off', 'gentle', 'wild'];

export function createAttend(store, doc = document) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let level = store.get('attn', reduced ? 'off' : 'gentle');
  if (!LEVELS.includes(level)) level = 'gentle';
  const root = doc.documentElement;
  root.dataset.attn = level;
  let edgeTimer = 0, audio = null;

  const edge = (kind, ms = 900) => {
    const e = doc.getElementById('edge'); if (!e) return;
    e.dataset.k = kind; e.classList.add('on');
    clearTimeout(edgeTimer); edgeTimer = setTimeout(() => e.classList.remove('on'), ms);
  };

  const api = {
    get level() { return level; },
    set(l) { if (!LEVELS.includes(l)) return; level = l; store.set('attn', l); root.dataset.attn = l; },
    cycle() { api.set(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]); return level; },

    /** A one-off cue on an element: kind is 'ok', 'bad' or 'info'. */
    flash(el, kind = 'ok') {
      if (level === 'off' || !el) return;
      const cls = 'at-' + kind;
      el.classList.remove('at-ok', 'at-bad', 'at-info'); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 1000);
      if (level === 'wild') { edge(kind); if (kind === 'ok') confetti(el, doc); }
    },

    /** A cue that keeps going until stopped (timer done, break due). Returns the stop function. */
    alarm(el) {
      if (el && level !== 'off') el.classList.add('at-alarm');
      const e = doc.getElementById('edge');
      if (level === 'wild' && e) { e.dataset.k = 'alarm'; e.classList.add('on', 'hold'); }
      return () => { el?.classList.remove('at-alarm'); e?.classList.remove('on', 'hold'); };
    },

    /** A short tone. Created on first use because browsers only allow sound after a tap. Quiet by design. */
    beep(freq = 880, ms = 140, vol = 0.1) {
      if (!store.get('sound', true)) return;
      try {
        audio = audio || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
      } catch (err) { /* no audio available: the visual cue still happens */ }
    },
  };
  return api;
}

let burstBusy = false;
/** A small confetti burst from an element, only in 'wild'. 36 dots for 0.9 s on one throw-away canvas that is removed afterwards. */
function confetti(el, doc) {
  if (burstBusy) return; burstBusy = true;
  const r = el.getBoundingClientRect(), cv = doc.createElement('canvas');
  const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
  cv.setAttribute('aria-hidden', 'true'); doc.body.append(cv);
  const g = cv.getContext('2d'), colors = ['#ff2500', '#ffd400', '#19d46a', '#3d8bff', '#b07cff', '#1fd1c6'];
  const ps = Array.from({ length: 36 }, (_, i) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 9 - 2, c: colors[i % colors.length], s: 4 + Math.random() * 5 }));
  const t0 = performance.now();
  (function step(t) {
    const k = (t - t0) / 900;
    g.clearRect(0, 0, W, H);
    if (k >= 1) { cv.remove(); burstBusy = false; return; }
    g.globalAlpha = 1 - k;
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.35; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); }
    requestAnimationFrame(step);
  })(t0);
}

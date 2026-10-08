/* Darklabs hub: the small rules that decide things, kept pure (no page access) so the tests can run them exactly. */

/** 'vr' (a headset browser), 'mobile' (a phone or tablet) or 'desktop'. The headset is checked first: some headset browsers also say "Android". */
export function detectDevice({ ua = '', coarse = false, width = 1280, touchPoints = 0 } = {}) {
  if (/OculusBrowser|Quest|PicoBrowser|Pico Neo|Wolvic|HoloLens|VR Safari/i.test(ua)) return 'vr';
  const tabletMac = /Macintosh/.test(ua) && touchPoints > 1;                      // an iPad that says it is a Mac
  if (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || tabletMac || (coarse && touchPoints > 0 && width < 900)) return 'mobile';
  return 'desktop';
}

/** items: [{ id, boost: { mobile: 2, vr: 1 } }]. Items with a boost for this device go first (highest first); everyone else keeps the order they came in. */
export function boostOrder(items, device) {
  const score = (it) => (it.boost && it.boost[device]) || 0;
  return items.map((it, i) => ({ it, i, s: score(it) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.it);
}

/** One step of a heavy lantern: the light is pulled toward where you point, slightly overshoots, then settles. state = { x, v }. Stable for any dt up to 0.1 s. */
export function chase(state, target, dt, { stiffness = 60, damping = 9 } = {}) {
  const h = Math.min(0.1, Math.max(0, dt)), steps = Math.max(1, Math.ceil(h / 0.016)), s = h / steps;
  let { x, v } = state;
  for (let i = 0; i < steps; i++) { v += (target - x) * stiffness * s; v *= Math.exp(-damping * s); x += v * s; }
  return { x, v };
}

/** Which element of the hub is allowed to run when the person's settings say so: a plain list of the optional features and their defaults (all off but the harmless ones). */
export const FX_DEFAULTS = { robots: false, beam: false, dust: false, motion: false, icons3d: false, boost: true, cursor: true };

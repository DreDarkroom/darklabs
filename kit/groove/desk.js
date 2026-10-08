/* The mixing desk: the essential controls of each instrument in one strip, bound to a running Groove.
   Drums (DarkDeck), Bass (BlueHeronBass), Cello (ChungusCello), Meows (MeowSynth): level, mute and solo for each,
   the kit's pieces switched on and off, and a tempo you can pin. "Open MixingMagic" hands over to the full instrument.
   Built with DOM calls, not HTML strings, so nothing typed anywhere can become markup. */
import { LAYER_GAIN } from './engine.js';

const STRIPS = {
  drums: { label: 'Drums', from: 'DarkDeck', hue: '#ff3a52' },
  bass: { label: 'Bass', from: 'BlueHeronBass', hue: '#5ab0ff' },
  cello: { label: 'Cello', from: 'ChungusCello', hue: '#e0a050' },
  meow: { label: 'Meows', from: 'MeowSynth', hue: '#9be37a' },
};
const LAYERS = Object.keys(STRIPS);
export const KIT_GROUPS = [
  ['Hats', ['hatC', 'hatC2', 'hatO', 'hatP']], ['Snare', ['snare', 'ghost']], ['Kick', ['kick']],
  ['Toms', ['tomH', 'tomL', 'tomF']], ['Cymbals', ['ride', 'bell', 'splash', 'china', 'crash']],
];

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const btn = (text, label, pressed) => { const b = el('button', { type: 'button', textContent: text }); b.setAttribute('aria-label', label); if (pressed != null) b.setAttribute('aria-pressed', String(pressed)); return b; };

export function mountDesk(root, groove, { onExpand } = {}) {
  root.replaceChildren();
  const status = el('p', { className: 'say' }); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const strips = el('div', { className: 'stems' });
  const state = { mute: new Set(), solo: null, off: new Set() };
  const apply = () => { for (const l of LAYERS) groove.mute(l, state.mute.has(l)); groove.solo(state.solo); paint(); };
  const nodes = {};

  for (const l of LAYERS) {
    const meta = STRIPS[l];
    const s = el('div', { className: 'stem' }); s.style.setProperty('--hue', meta.hue);
    const slider = el('input', { type: 'range', min: 0, max: 100, value: 100 }); slider.setAttribute('aria-label', `${meta.label} level`);
    slider.addEventListener('input', () => groove.setLayer(l, LAYER_GAIN[l] * (slider.value / 100)));
    const m = btn('M', `Mute ${meta.label}`, false), so = btn('S', `Solo ${meta.label}`, false);
    m.addEventListener('click', () => { state.mute.has(l) ? state.mute.delete(l) : state.mute.add(l); apply(); });
    so.addEventListener('click', () => { state.solo = state.solo === l ? null : l; apply(); });
    s.append(el('b', { textContent: meta.label }), el('small', { textContent: meta.from }), el('div', { className: 'sm' }, so, m), slider);
    if (l === 'drums') {
      const chips = el('div', { className: 'chips' });
      for (const [name, ids] of KIT_GROUPS) {
        const c = btn(name, `${name} on or off`, true);
        c.addEventListener('click', () => { const off = !state.off.has(name); off ? state.off.add(name) : state.off.delete(name); groove.muteInst(ids, off); c.setAttribute('aria-pressed', String(!off)); });
        chips.append(c);
      }
      s.append(chips);
    }
    nodes[l] = { s, m, so, slider }; strips.append(s);
  }

  const tempo = el('input', { type: 'range', min: 80, max: 190, value: 174 }); tempo.setAttribute('aria-label', 'Tempo in beats per minute');
  const out = el('output', { textContent: 'follows the page' });
  let pinned = false;
  tempo.addEventListener('input', () => { pinned = true; groove.setTempo(+tempo.value); out.textContent = `${tempo.value} BPM`; });
  const follow = el('button', { type: 'button', className: 'btn ghost', textContent: 'Follow the page' });
  follow.addEventListener('click', () => { pinned = false; groove.setTempo(0); out.textContent = 'follows the page'; });
  const reset = el('button', { type: 'button', className: 'btn ghost', textContent: 'Reset the mix' });
  reset.addEventListener('click', () => { state.mute.clear(); state.solo = null; state.off.clear(); groove.muteInst(KIT_GROUPS.flatMap((g) => g[1]), false); for (const l of LAYERS) { nodes[l].slider.value = 100; groove.setLayer(l, LAYER_GAIN[l]); } follow.click(); apply(); root.querySelectorAll('.chips button').forEach((c) => c.setAttribute('aria-pressed', 'true')); });
  const knobs = el('div', { className: 'knobs' }, el('label', {}, 'Tempo ', tempo, out), follow, reset);
  const expand = el('button', { type: 'button', className: 'btn', id: 'expandDesk', textContent: 'Open MixingMagic: the full instrument' });
  expand.setAttribute('aria-expanded', 'false');
  expand.addEventListener('click', () => onExpand && onExpand(expand));
  root.append(el('h3', { textContent: 'The mixing desk' }), status, strips, knobs, el('div', { className: 'expand' }, expand));

  function paint() {
    for (const l of LAYERS) {
      const dead = state.solo ? state.solo !== l : state.mute.has(l);
      nodes[l].s.classList.toggle('off', dead); nodes[l].s.classList.toggle('solo', state.solo === l);
      nodes[l].m.setAttribute('aria-pressed', String(state.mute.has(l))); nodes[l].so.setAttribute('aria-pressed', String(state.solo === l));
    }
    status.textContent = state.solo ? `Soloing ${STRIPS[state.solo].label}.` : state.mute.size ? `Muted: ${[...state.mute].map((l) => STRIPS[l].label).join(', ')}.` : 'Everything is playing. Solo a part, mute one, or pin the tempo.';
  }
  paint();
  return { paint, setLive(on) { root.classList.toggle('idle', !on); root.querySelectorAll('button, input').forEach((e) => { e.disabled = !on && e.id !== 'expandDesk'; }); if (!on) status.textContent = 'Press play to hear the desk.'; else paint(); } };
}

/* The six robots: names (two words joined, a capital in the middle), what they do, and the one word each teaches. Plain data, so tests can read it without a browser. */
export const ROBOTS = [
  { id: 'ClankCog', parts: ['Clank', 'Cog'], role: 'builder', body: '#6b5a5e', accent: '#ff7a3d', head: 'box', term: 'portmanteau',
    lines: ['Clank! I join parts together. Clank + Cog = ClankCog. That is a portmanteau.', 'I build things one piece at a time.', 'A portmanteau is a new word made from two words. Press the link to learn more.'] },
  { id: 'WobbleWire', parts: ['Wobble', 'Wire'], role: 'cable keeper', body: '#566a6a', accent: '#40f0d0', head: 'round', term: 'offline',
    lines: ['I plug everything in. I wobble a lot, but it works.', 'No internet? Many labs still work. That is called offline.', 'Wires, wires, everywhere!'] },
  { id: 'SparkSprocket', parts: ['Spark', 'Sprocket'], role: 'sound maker', body: '#6a6350', accent: '#ffe14d', head: 'tall', term: 'synthesiser',
    lines: ['Spark! I make sounds from nothing. No recordings.', 'A machine that makes sound from numbers is a synthesiser.', 'Every sound in these labs is made live.'] },
  { id: 'PixelPatch', parts: ['Pixel', 'Patch'], role: 'picture fixer', body: '#5e5670', accent: '#9670ff', head: 'visor', term: 'pixel',
    lines: ['I paint pictures with tiny dots. Each dot is a pixel.', 'I fix the little holes in the picture.', 'Look closely at your screen. Dots, dots, dots.'] },
  { id: 'GlitchGizmo', parts: ['Glitch', 'Gizmo'], role: 'mischief maker', body: '#6b4e5c', accent: '#ff2f6d', head: 'box', term: 'glitch',
    lines: ['A glitch is a small mistake that looks strange. I do it on purpose.', 'Did you see that? Zzzt!', 'Do not worry. It is only style.'] },
  { id: 'BeepBolt', parts: ['Beep', 'Bolt'], role: 'tester', body: '#4f6070', accent: '#6ab8ff', head: 'round', term: 'bpm',
    lines: ['Beep. I count the beat. BPM means beats per minute.', 'Fast music has more beats in a minute.', 'Beep beep. Test passed!'] },
];

/* ---------- drawing a robot (plain SVG, no images) ---------- */
export function botSVG(r) {
  const head = { box: '<rect x="17" y="14" width="30" height="23" rx="6"/>', round: '<rect x="17" y="13" width="30" height="25" rx="13"/>', tall: '<rect x="19" y="10" width="26" height="29" rx="7"/>', visor: '<rect x="15" y="15" width="34" height="21" rx="9"/>' }[r.head];
  const eyes = r.head === 'visor' ? `<rect class="b-eye" x="21" y="23" width="22" height="5" rx="2.5" fill="${r.accent}"/>`
    : `<rect class="b-eye" x="23" y="23" width="5" height="7" rx="2" fill="${r.accent}"/><rect class="b-eye" x="36" y="23" width="5" height="7" rx="2" fill="${r.accent}"/>`;
  return `<svg class="botsvg" viewBox="0 0 64 80" aria-hidden="true" focusable="false">
<g class="b-ant"><path d="M32 12 V4" stroke="#8a7a7e" stroke-width="2"/><circle class="b-bulb" cx="32" cy="4" r="3" fill="${r.accent}"/></g>
<g class="b-arm-l"><rect x="9" y="42" width="8" height="16" rx="4" fill="#8a7a7e"/></g>
<g class="b-arm-r"><rect x="47" y="42" width="8" height="16" rx="4" fill="#8a7a7e"/><rect x="45" y="56" width="12" height="6" rx="2" fill="${r.accent}"/></g>
<g fill="${r.body}" stroke="#1a0d10" stroke-width="1.5">${head}<rect x="20" y="39" width="24" height="22" rx="5"/></g>
${eyes}
<circle cx="32" cy="50" r="4" fill="${r.accent}" opacity=".85"/>
<g class="b-wheels"><g class="b-wheel" style="transform-origin:24px 69px"><circle cx="24" cy="69" r="7" fill="#1a0d10" stroke="#8a7a7e" stroke-width="2"/><path d="M24 63v12M18 69h12" stroke="#8a7a7e" stroke-width="1.5"/></g>
<g class="b-wheel" style="transform-origin:40px 69px"><circle cx="40" cy="69" r="7" fill="#1a0d10" stroke="#8a7a7e" stroke-width="2"/><path d="M40 63v12M34 69h12" stroke="#8a7a7e" stroke-width="1.5"/></g></g>
</svg>`;
}

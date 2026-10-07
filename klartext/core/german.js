/* KlartextKit: small pieces of German logic, pure so they can be tested.
   conjugateWeak: regular -en verbs (which is what English game verbs become: pushen, campen, boosten).
   normalize / matches: forgiving comparison for typed answers (ignores case, punctuation, and umlaut spelling: ä = ae, ß = ss). */
export function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFC')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export const matches = (typed, target) => normalize(typed) !== '' && normalize(typed) === normalize(target);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function conjugateWeak(infinitive) {
  const w = String(infinitive ?? '').trim().toLowerCase();
  if (!/^[a-zäöüß]{4,}n$/.test(w)) return { error: 'Type an English game verb with -en on the end, like pushen or campen.' };
  if (/(eln|ern)$/.test(w)) return { error: 'Verbs ending in -eln or -ern change shape. This tool does not do those.' };
  if (!/en$/.test(w) || w.length < 5) return { error: 'Type an English game verb with -en on the end, like pushen or campen.' };
  const stem = w.slice(0, -2);
  // An extra e keeps the ending sayable: after t or d (wartest), and after b/c/d/f/g/k/p/t + m or n (öffnest, atmest). Not after w, l, r, h (spawnst, lernst).
  const extraE = /[td]$/.test(stem) || /[bcdfgkpt][mn]$/.test(stem);
  const du = /[sßxz]$/.test(stem) ? stem + 't' : stem + (extraE ? 'est' : 'st');   // after s, ß, x, z the du ending is just -t (du mixt)
  const er = stem + (extraE ? 'et' : 't');
  const noGe = /^(be|ge|ver|er|zer|ent|emp|miss)/.test(stem) || /ieren$/.test(w);
  const participle = (noGe ? '' : 'ge') + (extraE ? stem + 'et' : stem + 't');
  return {
    inf: w, stem,
    rows: [['ich', stem + 'e'], ['du', du], ['er / sie / es', er], ['wir', w], ['ihr', er], ['sie / Sie', w]],
    perfect: `ich habe ${participle}`,
    participle,
    imperative: [['du', cap(stem + (extraE ? 'e' : '')) + '!'], ['ihr', cap(er) + '!']],
  };
}

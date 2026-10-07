/* KlartextKit: the call builder. Each place has the four forms a callout needs, which is also the most useful grammar lesson:
   nom (the thing), acc (the thing as an object), at (where it IS: dative) and to (where you GO: accusative).
   Same provenance as phrases.js: AI-written, not yet checked by a native speaker. */
export const PLACES = [
  { en: 'bridge', nom: 'die Brücke', acc: 'die Brücke', at: 'auf der Brücke', to: 'auf die Brücke' },
  { en: 'tower', nom: 'der Turm', acc: 'den Turm', at: 'im Turm', to: 'in den Turm' },
  { en: 'gate', nom: 'das Tor', acc: 'das Tor', at: 'am Tor', to: 'zum Tor' },
  { en: 'roof', nom: 'das Dach', acc: 'das Dach', at: 'auf dem Dach', to: 'aufs Dach' },
  { en: 'cellar', nom: 'der Keller', acc: 'den Keller', at: 'im Keller', to: 'in den Keller' },
  { en: 'ramp', nom: 'die Rampe', acc: 'die Rampe', at: 'auf der Rampe', to: 'auf die Rampe' },
  { en: 'entrance', nom: 'der Eingang', acc: 'den Eingang', at: 'am Eingang', to: 'zum Eingang' },
  { en: 'middle', nom: 'die Mitte', acc: 'die Mitte', at: 'in der Mitte', to: 'in die Mitte' },
  { en: 'flag', nom: 'die Flagge', acc: 'die Flagge', at: 'bei der Flagge', to: 'zur Flagge' },
  { en: 'bomb', nom: 'die Bombe', acc: 'die Bombe', at: 'bei der Bombe', to: 'zur Bombe' },
  { en: 'base', nom: 'die Basis', acc: 'die Basis', at: 'in der Basis', to: 'in die Basis' },
  { en: 'resource field', nom: 'das Ressourcenfeld', acc: 'das Ressourcenfeld', at: 'am Ressourcenfeld', to: 'zum Ressourcenfeld' },
  { en: 'back yard', nom: 'der Hinterhof', acc: 'den Hinterhof', at: 'im Hinterhof', to: 'in den Hinterhof' },
  { en: 'vault room', nom: 'der Tresorraum', acc: 'den Tresorraum', at: 'im Tresorraum', to: 'in den Tresorraum' },
  { en: 'garage', nom: 'die Garage', acc: 'die Garage', at: 'in der Garage', to: 'in die Garage' },
];

const DIRS = [['links', 'left'], ['rechts', 'right'], ['oben', 'above'], ['unten', 'below'], ['hinten', 'behind'], ['vorne', 'in front']];
export const NUMBERS = [[10, 'zehn'], [15, 'fünfzehn'], [20, 'zwanzig'], [30, 'dreißig'], [40, 'vierzig'], [45, 'fünfundvierzig'], [60, 'sechzig']];
const o = (v, en) => ({ v, en });

/** Each template: slots (each a list of {v: German, en}) and make(picks) -> the sentence. */
export const TEMPLATES = [
  {
    id: 'spot', de: 'Gegner melden', en: 'Report enemies', cat: 'spot',
    slots: [
      { id: 'n', label: 'Wie viele? (how many)', opts: [o('Ein', 'one'), o('Zwei', 'two'), o('Drei', 'three'), o('Vier', 'four')] },
      { id: 'w', label: 'Wo? (where)', opts: [...DIRS.map(([d, e]) => o(d, e)), ...PLACES.map((p) => o(p.at, p.en))] },
    ],
    make: (s) => `${s.n} Gegner ${s.w}!`,
    hint: 'Wo? takes the dative: auf DER Brücke, im Turm.',
  },
  {
    id: 'move', de: 'Ich bewege mich', en: 'Say where you go', cat: 'attack',
    slots: [
      { id: 'v', label: 'Wie? (how)', opts: [o('gehe', 'walk'), o('renne', 'run'), o('dashe', 'dash'), o('fliege', 'fly')] },
      { id: 'w', label: 'Wohin? (where to)', opts: PLACES.map((p) => o(p.to, p.en)) },
    ],
    make: (s) => `Ich ${s.v} ${s.w}!`,
    hint: 'Wohin? takes the accusative: auf DIE Brücke, in DEN Turm.',
  },
  {
    id: 'need', de: 'Ich brauche …', en: 'Ask for something', cat: 'help',
    slots: [{ id: 't', label: 'Was? (what)', opts: [o('Heilung', 'healing'), o('Munition', 'ammo'), o('Deckung', 'cover'), o('Verstärkung', 'reinforcements'), o('Sicht', 'vision'), o('Hilfe', 'help'), o('Ressourcen', 'resources')] }],
    make: (s) => `Ich brauche ${s.t}!`,
    hint: 'No article needed with these nouns.',
  },
  {
    id: 'hold', de: 'Wir halten …', en: 'Hold a place', cat: 'defend',
    slots: [{ id: 'p', label: 'Was? (what)', opts: PLACES.map((p) => o(p.acc, p.en)) }],
    make: (s) => `Wir halten ${s.p}!`,
    hint: 'Masculine nouns change after halten: der Turm becomes DEN Turm.',
  },
  {
    id: 'where', de: 'Wo ist …?', en: 'Ask where something is', cat: 'spot',
    slots: [{ id: 'p', label: 'Was? (what)', opts: PLACES.map((p) => o(p.nom, p.en)) }],
    make: (s) => `Wo ist ${s.p}?`,
    hint: 'After "ist" the noun stays as it is (nominative).',
  },
  {
    id: 'timing', de: 'Angriff in …', en: 'Call a timing', cat: 'attack',
    slots: [{ id: 'n', label: 'Wie lange? (how long)', opts: NUMBERS.map(([n, w]) => o(w, String(n))) }],
    make: (s) => `Angriff in ${s.n} Sekunden!`,
    hint: 'Numbers: zehn, zwanzig, dreißig, vierzig, fünfzig, sechzig.',
  },
];

export const compose = (tpl, picks) => tpl.make(Object.fromEntries(tpl.slots.map((s) => [s.id, picks[s.id] ?? s.opts[0].v])));

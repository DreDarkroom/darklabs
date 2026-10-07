/* KlartextKit: the module registry. Adding a tool = one entry here + one file in modules/ that exports
     export default { mount(root, ctx) { ...; return optionalCleanup; } }
   Modules are loaded only when opened (dynamic import), so the first page stays small and a phone never pays for tools it does not use.
   hue is a category id from data/cats.js (colour + shape + label). */
export const GROUPS = {
  play: { de: 'Im Spiel', en: 'In the game' },
  learn: { de: 'Lernen', en: 'Learn' },
  lab: { de: 'Labor', en: 'Lab and settings' },
};

export const MODULES = [
  { id: 'comms', group: 'play', de: 'Funk', en: 'Callouts', hue: 'attack', desc: 'Big colour-coded buttons. Tap one to hear the German.', load: () => import('../modules/comms.js') },
  { id: 'timers', group: 'play', de: 'Zeit', en: 'Timers', hue: 'econ', desc: 'Countdowns and a stopwatch that call out in German.', load: () => import('../modules/timers.js') },
  { id: 'picker', group: 'play', de: 'Los', en: 'Coin, dice, teams', hue: 'chat', desc: 'Coin, dice, a name picker and a team splitter.', load: () => import('../modules/picker.js') },
  { id: 'guard', group: 'play', de: 'Pause', en: 'VR break guard', hue: 'help', desc: 'A gentle reminder to rest, drink and look away.', load: () => import('../modules/guard.js') },
  { id: 'notes', group: 'play', de: 'Notiz', en: 'Notepad', hue: 'spot', desc: 'A notepad that stays on your device.', load: () => import('../modules/notes.js') },
  { id: 'cards', group: 'learn', de: 'Karten', en: 'Flashcards', hue: 'defend', desc: 'Spaced-repetition cards: hard ones come back sooner.', load: () => import('../modules/cards.js') },
  { id: 'quiz', group: 'learn', de: 'Quiz', en: 'Quiz', hue: 'heist', desc: 'Read it, say it, hear it, type it.', load: () => import('../modules/quiz.js') },
  { id: 'scenes', group: 'learn', de: 'Szenen', en: 'Chat practice', hue: 'chat', desc: 'A teammate says something. Pick the best German reply.', load: () => import('../modules/scenes.js') },
  { id: 'lexicon', group: 'learn', de: 'Lexikon', en: 'Phrasebook and rules', hue: 'spot', desc: 'Search every phrase and word. Short grammar notes.', load: () => import('../modules/lexicon.js') },
  { id: 'builder', group: 'learn', de: 'Bauen', en: 'Build calls, verbs', hue: 'econ', desc: 'Snap a call together; turn English game verbs into German.', load: () => import('../modules/builder.js') },
  { id: 'spotlight', group: 'learn', de: 'Spiele', en: 'Games spotlight', hue: 'heist', desc: 'C&C Rivals, Hyper Dash // Hero Drop, and heist talk.', load: () => import('../modules/spotlight.js') },
  { id: 'breaklab', group: 'lab', de: 'Bruchlabor', en: 'Stress lab', hue: 'attack', desc: 'Push this device until it breaks. Find the real limits.', load: () => import('../modules/breaklab.js') },
  { id: 'vrroom', group: 'lab', de: 'VR-Raum', en: 'VR room (experimental)', hue: 'defend', desc: 'Flashcards on a panel in front of you, in a headset.', load: () => import('../modules/vrroom.js') },
  { id: 'about', group: 'lab', de: 'Info', en: 'About and settings', hue: 'chat', desc: 'Settings, your data, credits, corrections.', load: () => import('../modules/about.js') },
];

export const QUICK = ['comms', 'cards', 'timers'];
export const byId = (id) => MODULES.find((m) => m.id === id);

/** The modules this brand shows (a white-label build can pick and order them). */
export function visible(brand) {
  if (!brand?.modules) return MODULES;
  return brand.modules.map(byId).filter(Boolean);
}

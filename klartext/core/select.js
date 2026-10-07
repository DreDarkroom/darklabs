/* KlartextKit: choosing phrases and building quiz questions. Pure functions: no page access, random source can be swapped, so tests are exact. */
import { randInt, shuffle } from './dom.js';
import { matches } from './german.js';

export function filterPhrases(list, { cat = 'all', game = 'all', crude = true, q = '' } = {}) {
  const needle = String(q).toLowerCase().trim();
  return list.filter((p) =>
    (cat === 'all' || p.cat === cat) && (game === 'all' || p.games.includes(game)) && (crude || p.reg !== 'crude') &&
    (!needle || p.de.toLowerCase().includes(needle) || p.en.toLowerCase().includes(needle) || (p.note || '').toLowerCase().includes(needle)));
}

export const MODES = {
  'de-en': { de: 'Deutsch → Englisch', en: 'Read the German, pick the meaning' },
  'en-de': { de: 'Englisch → Deutsch', en: 'Read the English, pick the German' },
  hoeren: { de: 'Hören', en: 'Hear it, pick what you heard' },
  tippen: { de: 'Tippen', en: 'Type the German' },
};

/** One question. Wrong answers come from the same category first, then from anywhere, never from the rude list. */
export function makeQuestion(pool, target, mode, rnd = randInt) {
  const safe = pool.filter((p) => p.id !== target.id && p.reg !== 'crude' && p.de !== target.de);
  const take = (arr, k) => { const a = [...arr], out = []; while (a.length && out.length < k) out.push(a.splice(rnd(a.length), 1)[0]); return out; };
  const near = take(safe.filter((p) => p.cat === target.cat), 3);
  const far = take(safe.filter((p) => p.cat !== target.cat), 3 - near.length);
  const options = mode === 'tippen' ? [] : shuffle([target, ...near, ...far]);
  return { mode, target, options, prompt: mode === 'de-en' ? target.de : mode === 'hoeren' ? '' : target.en, show: mode === 'de-en' ? 'en' : 'de' };
}

export function isCorrect(q, answer) {
  if (q.mode === 'tippen') return matches(answer, q.target.de) || (q.target.say ? matches(answer, q.target.say) : false);
  return answer === q.target.id;
}

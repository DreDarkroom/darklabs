/* KlartextKit: the day streak. Doing anything that counts as practice today keeps it alive. Dates are the player's own local calendar days. */
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prevDay = (t) => { const d = new Date(t); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime()); };

/** Call after any practice. Returns the streak state. */
export function touch(store, now = Date.now()) {
  const s = store.get('streak', { last: '', n: 0, best: 0 });
  const today = dayKey(now);
  if (s.last === today) return s;
  const n = s.last === prevDay(now) ? s.n + 1 : 1;
  const out = { last: today, n, best: Math.max(s.best || 0, n) };
  store.set('streak', out);
  return out;
}

/** The streak to show: it still counts if you practised today or yesterday, and is 0 once a day has been missed. */
export function current(store, now = Date.now()) {
  const s = store.get('streak', { last: '', n: 0 });
  return s.last === dayKey(now) || s.last === prevDay(now) ? s.n : 0;
}

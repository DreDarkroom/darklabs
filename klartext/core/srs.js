/* KlartextKit: spaced repetition (a Leitner box system). A card you know moves to a higher box and comes back later; a card you miss comes back soon.
   State per card is tiny: { b: box number from 0, d: due time in ms, n: times reviewed }. A card with no state yet is "new". */
export const BOXES = 5;
export const DAY = 86400000;
/** Days to wait in each box (index = box). 0 means "again soon" (10 minutes, so it comes back in the same session). */
export const WAIT_DAYS = [0, 1, 3, 7, 16];
const SOON = 10 * 60 * 1000;

/**
 * What happens to a card after you rate it: 'know', 'almost' or 'miss'. Returns the card's new state.
 * This is the learning rhythm. The defaults below are the classic Leitner choice: know = up a box, miss = back to the start,
 * almost = stay where you are.
 * TODO(human): decide your own rhythm. For example, should 'almost' drop one box instead of staying? Should 'miss' on a high box only
 * fall to box 1 (not all the way to 0)? Should WAIT_DAYS be shorter for the first week? A few lines in this function is all it takes.
 */
export function schedule(card, result, now = Date.now()) {
  let box = card?.b ?? 0;
  if (result === 'know') box = Math.min(box + 1, BOXES - 1);
  else if (result === 'miss') box = 0;
  const wait = WAIT_DAYS[box] * DAY || SOON;
  return { b: box, d: now + wait, n: (card?.n || 0) + 1 };
}

export const isDue = (card, now = Date.now()) => !!card && card.d <= now;

/** The study queue: cards that are due (soonest first), then up to newLimit cards you have never seen. */
export function buildQueue(ids, states, { now = Date.now(), newLimit = 10 } = {}) {
  const due = ids.filter((id) => isDue(states[id], now)).sort((a, b) => states[a].d - states[b].d);
  const fresh = ids.filter((id) => !states[id]).slice(0, newLimit);
  return [...due, ...fresh];
}

export function stats(ids, states, now = Date.now()) {
  let fresh = 0, due = 0, learning = 0, mastered = 0;
  for (const id of ids) {
    const s = states[id];
    if (!s) fresh++; else { if (isDue(s, now)) due++; if (s.b >= BOXES - 1) mastered++; else learning++; }
  }
  return { total: ids.length, fresh, due, learning, mastered };
}

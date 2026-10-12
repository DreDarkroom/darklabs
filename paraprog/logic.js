/* ParaProg logic: pure functions, no DOM, no audio. Tested in tests/paraprog.test.mjs */

export const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const lcm = (a, b) => (a / gcd(a, b)) * b;

/* "2+2+3" -> [2,2,3]; null if it is not a usable grouping (groups of 1..6, 1..12 groups, 2..32 pulses) */
export function parseGroups(text) {
  if (typeof text !== 'string' || !/^\s*\d+(\s*\+\s*\d+)*\s*$/.test(text)) return null;
  const g = text.split('+').map((s) => parseInt(s, 10));
  if (g.length > 12 || g.some((n) => n < 1 || n > 6)) return null;
  const total = g.reduce((a, b) => a + b, 0);
  return total >= 2 && total <= 32 ? g : null;
}

export const pulsesOf = (groups) => groups.reduce((a, b) => a + b, 0);

/* the time signature as written: pulses over the unit (4 = quarter, 8 = eighth, 16 = sixteenth) */
export const meterLabel = (groups, unit) => `${pulsesOf(groups)}/${unit}`;

/* one entry per pulse: the count you say out loud. Each group restarts at 1, so 2+2+3 -> 1 2 1 2 1 2 3 */
export function countLabels(groups) {
  if (groups.every((n) => n === 1)) return straightCount(groups);
  return groups.flatMap((n) => Array.from({ length: n }, (_, i) => String(i + 1)));
}

/* the same bar counted straight through: 1 2 3 4 5 6 7 */
export function straightCount(groups) {
  return Array.from({ length: pulsesOf(groups) }, (_, i) => String(i + 1));
}

/* pulse indexes where a group begins (the felt "long beats") */
export function groupStarts(groups) {
  const out = [];
  let at = 0;
  for (const n of groups) { out.push(at); at += n; }
  return out;
}

/* a basic drum pattern for a grouping: hat on every pulse, kick on the bar's 1, snare on every other group start */
export function drumPattern(groups) {
  const allOnes = groups.every((n) => n === 1);
  const starts = new Set(groupStarts(groups));
  if (allOnes) {                                       // 4/4, 3/4: kick on 1, snare on 3 (or the last beat of a 3)
    return groups.map((_, i) => {
      const step = [['hat', i === 0 ? 0.75 : 0.45]];
      if (i === 0) step.push(['kick', 1]);
      if (i === 2) step.push(['snare', 0.9]);
      return step;
    });
  }
  return Array.from({ length: pulsesOf(groups) }, (_, i) => {
    const step = [['hat', starts.has(i) ? 0.75 : 0.35]];
    if (i === 0) step.push(['kick', 1]);
    else if (starts.has(i)) step.push(['snare', 0.9]);
    return step;
  });
}

/* every way to order the groups of a bar, without repeats: 3+2+2, 2+3+2, 2+2+3 */
export function rearrangements(groups) {
  const seen = new Set(), out = [];
  const go = (rest, acc) => {
    if (!rest.length) { const k = acc.join('+'); if (!seen.has(k)) { seen.add(k); out.push(acc.slice()); } return; }
    rest.forEach((n, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, n]));
  };
  go(groups, []);
  return out;
}

/* ---------- rudiments ---------- */

export const rotate = (s, n) => s.slice(n % s.length) + s.slice(0, n % s.length);

export const RUDIMENTS = [
  { id: 'single', name: 'Single paradiddle', sticking: 'RLRRLRLL', cell: 4, feel: '16ths', blurb: 'The first one to learn. Single, single, double: the double flips which hand leads, so the pattern swaps sides every four notes.' },
  { id: 'double', name: 'Double paradiddle', sticking: 'RLRLRRLRLRLL', cell: 6, feel: 'sextuplets or 6/8', blurb: 'Two singles then a double. It adds up to six notes, so it sits naturally in 6/8, 3/4 or any sextuplet.' },
  { id: 'triple', name: 'Triple paradiddle', sticking: 'RLRLRLRRLRLRLRLL', cell: 8, feel: '16ths over two beats', blurb: 'Three singles then a double. Eight notes per side, so one cell fills two beats of 16ths.' },
  { id: 'diddle', name: 'Paradiddle-diddle', sticking: 'RLRRLL', cell: 6, feel: 'triplets', blurb: 'Single, single, double, double. Six notes that start and end on the same hand, so it does not flip sides. A staple for triplet and 6/8 grooves.' },
];

/* the single paradiddle with the double moved: the "inversions" */
export function inversions() {
  const base = 'RLRRLRLL';
  const names = ['Double on beats 3-4 (the standard)', 'Double on beats 2-3', 'Double on beats 1-2', 'Double across the bar line (4 into 1)'];
  const shifts = [0, 5, 2, 3];
  return shifts.map((s, i) => ({ name: names[i], sticking: rotate(base, s) }));
}

/* accent the first note of each cell and the note after a double (the hand that just changed) */
export function stickingAccents(sticking, cell) {
  return sticking.split('').map((_, i) => i % cell === 0);
}

/* how many bars before a repeating sticking lines up with the barline again */
export function barsToResolve(cycleNotes, barNotes) {
  return lcm(cycleNotes, barNotes) / barNotes;
}

/* sticking -> engine steps: R is the snare-side voice, L the low tom, accents louder, taps quieter */
export function stickingPattern(sticking, cell, { accents = true } = {}) {
  const acc = stickingAccents(sticking, cell);
  return sticking.split('').map((h, i) => [[h === 'R' ? 'rim' : 'tom', accents ? (acc[i] ? 1 : 0.38) : 0.7]]);
}

/* ---------- song data checks ---------- */

/* total pulses of a song section list: sum of (pulses x bars) */
export const songPulses = (sections) => sections.reduce((a, s) => a + pulsesOf(s.groups) * s.bars, 0);

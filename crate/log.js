/* Crate Capture: the pure parts (no browser needed, so they can be tested). What a find looks like, whether it is ready to submit, and the files you hand over with it:
   a provenance sheet (CSV), a LICENSES.txt, an ATTRIBUTION.md, and the whole log as JSON. Nothing here touches the network. */
export const LICENCES = [
  { id: 'cc0', label: 'CC0 1.0 (public domain dedication)', url: 'https://creativecommons.org/publicdomain/zero/1.0/', submit: true },
  { id: 'pdm', label: 'Public domain (by age, not a CC0 dedication)', url: 'https://creativecommons.org/publicdomain/mark/1.0/', submit: true, note: 'Public domain by age depends on the country and on the recording AND the composition. Say which in the evidence.' },
  { id: 'by', label: 'CC BY (needs credit)', url: 'https://creativecommons.org/licenses/by/4.0/', submit: false },
  { id: 'bysa', label: 'CC BY-SA (needs credit, share alike)', url: 'https://creativecommons.org/licenses/by-sa/4.0/', submit: false },
  { id: 'bync', label: 'CC BY-NC (no commercial use)', url: 'https://creativecommons.org/licenses/by-nc/4.0/', submit: false },
  { id: 'own', label: 'Made by me (I will dedicate it to CC0)', url: 'https://creativecommons.org/publicdomain/zero/1.0/', submit: true, note: 'Only if you made every part and nobody else has a claim on it.' },
  { id: 'other', label: 'Something else (royalty-free, a site licence…)', url: '', submit: false },
  { id: 'unknown', label: 'I do not know yet', url: '', submit: false },
];
export const STATUSES = ['Found', 'Checking', 'Verified', 'Downloaded', 'Prepared', 'Submitted', 'Rejected'];
export const RATINGS = ['', 'Love', 'Keep', 'Maybe', 'Drop'];
/** The checks that must be ticked before something can be called ready. Each one is a question you answer from the evidence, not a guess. */
export const CHECKS = [
  ['licencePage', 'The licence is stated on the page where I found it (I saved the address)'],
  ['licenceFile', 'The licence also appears inside the download (readme, text file, tags), or there is no text file at all and I looked'],
  ['creator', 'The person who uploaded it is the person who made it (or the work is public domain by age)'],
  ['noSamples', 'It contains no recognisable samples, quotes, covers or other people\'s voices, and it is not described as AI-made from someone else\'s work'],
  ['bothRights', 'Both the recording and the composition are covered (a CC0 recording of a song someone else wrote is not enough)'],
  ['noRestrictions', 'Nothing else restricts it (a trademark, a person\'s name or voice, a site rule such as "not on its own")'],
];
const LIM = { title: 140, creator: 120, url: 400, evidence: 1200, notes: 3000, file: 200, tag: 24 };
const SRC_OK = /^https?:\/\/[^\s]+$/i;

export const blankFind = () => ({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: '', creator: '', source: '', url: '', licence: 'unknown', licenceUrl: '', evidence: '', checks: {}, checkedAt: '', file: '', sha256: '', size: 0, duration: '', tags: [], rating: '', status: 'Found', notes: '', created: Date.now() });

export const SOURCES_PUBLIC_DOMAIN_NOTE = 'Public domain by age is decided per country, and separately for the recording and the composition.';

/** What is still missing before this can be handed over. An empty list means ready. */
export function missing(f) {
  const out = [], lic = LICENCES.find((l) => l.id === f.licence);
  if (!f.title.trim()) out.push('a title');
  if (!f.creator.trim()) out.push('the creator\'s name');
  if (!SRC_OK.test(f.url)) out.push('the address of the page you found it on');
  if (!lic || !lic.submit) out.push(!lic || f.licence === 'unknown' ? 'a known licence' : 'a licence that can be submitted (CC0, or public domain)');
  if (f.licence !== 'own') {
    for (const [k, label] of CHECKS) if (!f.checks[k]) out.push(`check: ${label.split(' (')[0]}`);
    if (f.evidence.trim().length < 12) out.push('evidence: where, exactly, did you see the licence?');
  } else if (!f.checks.bothRights || !f.checks.noSamples) out.push('check that you own every part and that nothing is sampled');
  if (!/^[0-9a-f]{64}$/.test(f.sha256)) out.push('the file\'s fingerprint (pick the file to compute it)');
  return out;
}
export const ready = (f) => missing(f).length === 0;

/* ---------- exports ---------- */
const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`;                       // a spreadsheet must never run a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const COLS = ['id', 'title', 'creator', 'source', 'url', 'licence', 'licence_url', 'evidence', 'checked_at', 'file', 'sha256', 'bytes', 'duration', 'rating', 'status', 'ready', 'missing', 'tags', 'notes'];
export function toCSV(items) {
  const rows = items.map((f) => [f.id, f.title, f.creator, f.source, f.url, f.licence, f.licenceUrl || (LICENCES.find((l) => l.id === f.licence) || {}).url || '', f.evidence, f.checkedAt, f.file, f.sha256, f.size, f.duration, f.rating, f.status, ready(f) ? 'yes' : 'no', missing(f).join('; '), f.tags.join('; '), f.notes]);
  return `${[COLS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function toLicensesTxt(items, { pack = 'Music pack', now = new Date() } = {}) {
  const day = now.toISOString().slice(0, 10), list = items.filter(ready);
  const lines = [`${pack.toUpperCase()}: LICENCES AND CREDITS`, '='.repeat(Math.min(60, pack.length + 22)), '',
    `Written ${day}. ${list.length} track${list.length === 1 ? '' : 's'}. Every track below was checked against the licence on the page where it was found and, where one existed, inside the download.`,
    'Nothing here was made with an AI music model. The evidence for each track is kept in the provenance sheet.', ''];
  list.forEach((f, i) => {
    const lic = LICENCES.find((l) => l.id === f.licence);
    lines.push(`${i + 1}. ${f.title}`, `   Creator:  ${f.creator}`, `   Licence:  ${f.licence === 'own' ? 'CC0 1.0, dedicated by its maker' : lic.label}${lic.url ? ` (${f.licenceUrl || lic.url})` : ''}`, `   Source:   ${f.url}`, `   File:     ${f.file || '(not named)'}  SHA-256 ${f.sha256}`, `   Checked:  ${f.checkedAt || day}`, `   Evidence: ${f.evidence.replace(/\s+/g, ' ').trim() || 'made by the submitter'}`, '');
  });
  const held = items.length - list.length;
  if (held) lines.push(`(${held} further item${held === 1 ? ' is' : 's are'} in the log but not ready, so not listed.)`, '');
  lines.push('CC0 waives copyright only. It does not cover trademarks, a person\'s privacy or likeness, or rights other people may hold in a work.');
  return `${lines.join('\r\n')}\r\n`;
}

export function toAttribution(items) {
  const need = items.filter((f) => ['by', 'bysa'].includes(f.licence));
  if (!need.length) return 'No attribution is required for the tracks that are ready: they are CC0 or public domain. Crediting the creators is still kind.\n';
  return `# Credits\n\n${need.map((f) => `- “${f.title}” by ${f.creator}, ${f.url}, ${(LICENCES.find((l) => l.id === f.licence) || {}).label}`).join('\n')}\n`;
}

/* ---------- checking what comes in (an imported log) ---------- */
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
export function sanitize(doc) {
  if (!doc || doc.app !== 'CrateCapture' || !Array.isArray(doc.items)) throw new Error('This is not a Crate Capture file.');
  return doc.items.slice(0, 2000).map((r) => {
    const f = blankFind(), r2 = r && typeof r === 'object' ? r : {};
    f.id = /^[\w-]{1,30}$/.test(r2.id) ? r2.id : f.id;
    f.title = str(r2.title, LIM.title); f.creator = str(r2.creator, LIM.creator); f.source = str(r2.source, 60); f.url = SRC_OK.test(r2.url) ? str(r2.url, LIM.url) : '';
    f.licence = LICENCES.some((l) => l.id === r2.licence) ? r2.licence : 'unknown'; f.licenceUrl = SRC_OK.test(r2.licenceUrl) ? str(r2.licenceUrl, LIM.url) : '';
    f.evidence = str(r2.evidence, LIM.evidence); f.notes = str(r2.notes, LIM.notes); f.file = str(r2.file, LIM.file);
    f.sha256 = /^[0-9a-f]{64}$/.test(r2.sha256) ? r2.sha256 : ''; f.size = Number.isFinite(r2.size) ? r2.size : 0; f.duration = str(r2.duration, 12);
    f.checkedAt = /^\d{4}-\d{2}-\d{2}$/.test(r2.checkedAt) ? r2.checkedAt : '';
    f.status = STATUSES.includes(r2.status) ? r2.status : 'Found'; f.rating = RATINGS.includes(r2.rating) ? r2.rating : '';
    f.tags = (Array.isArray(r2.tags) ? r2.tags : []).map((t) => str(t, LIM.tag)).filter(Boolean).slice(0, 12);
    for (const [k] of CHECKS) f.checks[k] = !!(r2.checks && r2.checks[k]);
    f.created = Number.isFinite(r2.created) ? r2.created : f.created;
    return f;
  });
}
export const toJSON = (items) => JSON.stringify({ app: 'CrateCapture', v: 1, items }, null, 1);

/** A file name that says where it came from and is safe on every system. */
export function packName(f) {
  const slug = (s) => String(s || '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  return `${slug(f.source) || 'source'}_${slug(f.title) || 'untitled'}_${slug(f.creator) || 'unknown'}_${f.licence === 'own' ? 'cc0' : f.licence}`;
}
export const LIMITS = LIM;

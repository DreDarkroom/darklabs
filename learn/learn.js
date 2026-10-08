/* The Word Lab page: the portmanteau maker, the robots, the searchable word list, read-aloud, and the reading settings. */
import { prefs } from '../kit/prefs.js';
import { ROBOTS, botSVG } from '../robots.js';
import { TERMS, CATS } from './terms.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
const speak = (text) => { if (!canSpeak) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en'; u.rate = 0.9; speechSynthesis.speak(u); };

/* ---------- reading settings ---------- */
const switches = [['easy', 'easy'], ['hc', 'hc'], ['calm', 'calm']];
const paint = () => {
  for (const [id, key] of switches) $(`#${id}`).setAttribute('aria-pressed', String(prefs.get(key)));
  for (const [id, n] of [['sm', 100], ['md', 125], ['lg', 150]]) $(`#${id}`).setAttribute('aria-pressed', String(prefs.get('size') === n));
};
for (const [id, key] of switches) $(`#${id}`).addEventListener('click', () => prefs.toggle(key));
$('#sm').addEventListener('click', () => prefs.set('size', 100));
$('#md').addEventListener('click', () => prefs.set('size', 125));
$('#lg').addEventListener('click', () => prefs.set('size', 150));
addEventListener('darklabs:prefs', paint);
paint();
if (canSpeak) {
  const b = $('#readintro'); b.hidden = false;
  b.addEventListener('click', () => speak(`${$('#port').textContent}. ${$('#portmanteau-card .big').textContent} ${[...document.querySelectorAll('#portmanteau-card p')].slice(1, 3).map((p) => p.textContent).join(' ')}`));
}

/* ---------- the portmanteau maker ---------- */
const clean = (s) => s.replace(/[^\p{L}]/gu, '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
const palette = () => ROBOTS[Math.floor(Math.random() * ROBOTS.length)];
function make() {
  const a = clean($('#w1').value), b = clean($('#w2').value);
  const name = cap(a) + cap(b);
  $('#out').textContent = name || '…';
  let why = '';
  if (!a || !b) why = 'Type two words.';
  else if (a[0].toLowerCase() === b[0].toLowerCase()) why = `Both words start with “${a[0].toUpperCase()}”. That is alliteration. The capital “${b[0].toUpperCase()}” in the middle is CamelCase.`;
  else why = `The capital “${b[0].toUpperCase()}” in the middle is CamelCase. For alliteration, start both words with the same letter.`;
  $('#why').textContent = why;
  if (name) { const r = { ...palette(), id: name }; $('#mini').innerHTML = botSVG(r).replace('class="botsvg"', 'class="botsvg" style="width:56px;height:70px"'); }
}
const PAIRS = { B: ['Beep', 'Bolt', 'Buzz', 'Bop', 'Bleep'], C: ['Clank', 'Click', 'Cog', 'Chip', 'Crank'], D: ['Dial', 'Dash', 'Ding', 'Dot', 'Drift'], F: ['Fizz', 'Flip', 'Fuse', 'Flux', 'Flash'],
  G: ['Glitch', 'Gizmo', 'Gear', 'Glow', 'Grind'], P: ['Pixel', 'Patch', 'Ping', 'Pulse', 'Plug'], S: ['Spark', 'Sprocket', 'Snap', 'Spin', 'Switch'], W: ['Wobble', 'Wire', 'Whirr', 'Widget', 'Wave'], Z: ['Zap', 'Zip', 'Zing', 'Zoom', 'Zig'] };
$('#rand').addEventListener('click', () => {
  const letters = Object.keys(PAIRS), L = letters[Math.floor(Math.random() * letters.length)], list = PAIRS[L].slice();
  const a = list.splice(Math.floor(Math.random() * list.length), 1)[0], b = list[Math.floor(Math.random() * list.length)];
  $('#w1').value = a.toLowerCase(); $('#w2').value = b.toLowerCase(); make();
});
$('#w1').addEventListener('input', make); $('#w2').addEventListener('input', make);
$('#copy').addEventListener('click', async () => {
  const name = $('#out').textContent;
  try { await navigator.clipboard.writeText(name); $('#mstatus').textContent = `Copied: ${name}`; } catch (err) { $('#mstatus').textContent = 'Could not copy. Select the name and copy it.'; }
});
make();

/* ---------- the robots ---------- */
const rb = $('#robots');
for (const r of ROBOTS) {
  const c = h('div', 'card'), art = h('div', 'bot'), body = h('div');
  art.innerHTML = botSVG(r);
  const eq = h('div', 'eq', `${r.parts[0]} + ${r.parts[1]} = ${r.id}`);
  const t = TERMS.find((x) => x.id === r.term);
  body.append(h('h3', null, r.id), eq, h('p', 'note', `A little ${r.role}. ${r.lines[0]}`));
  if (t) { const a = h('a', null, `Word: ${t.term}`); a.href = `#${t.id}`; body.append(a); }
  c.append(art, body); rb.append(c);
}

/* ---------- the word list ---------- */
let cat = 'all', query = '';
const filters = $('#filters');
const fbtn = (id, label) => { const b = h('button', null, label); b.type = 'button'; b.dataset.cat = id; b.addEventListener('click', () => { cat = id; render(); }); filters.append(b); };
fbtn('all', 'All');
for (const [id, label] of Object.entries(CATS)) fbtn(id, label);

function card(t) {
  const c = h('article', 'term'); c.id = t.id;
  const title = h('h3'); title.append(h('span', 'emoji', t.emoji), document.createTextNode(t.term));
  title.firstChild.setAttribute('aria-hidden', 'true');
  c.append(title);
  if (t.say) c.append(h('div', 'say', `Say: ${t.say}`));
  c.append(h('p', null, t.plain), h('p', 'ex', `Example: ${t.example}`));
  const acts = h('div', 'acts');
  if (canSpeak) { const b = h('button', null, '🔊 Listen'); b.type = 'button'; b.setAttribute('aria-label', `Listen to the word ${t.term}`); b.addEventListener('click', () => speak(`${t.term}. ${t.plain} ${t.example}`)); acts.append(b); }
  if (t.see) { const a = h('a', 'btn', `Try it: ${t.see.label}`); a.href = t.see.href; a.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none'; acts.append(a); }
  const link = h('button', null, 'Copy link to this word'); link.type = 'button';
  link.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${t.id}`); link.textContent = 'Copied'; setTimeout(() => { link.textContent = 'Copy link to this word'; }, 1800); } catch (err) { /* no clipboard */ } });
  acts.append(link);
  c.append(acts);
  return c;
}
function render() {
  const q = query.trim().toLowerCase();
  const shown = TERMS.filter((t) => (cat === 'all' || t.cat === cat) && (!q || `${t.term} ${t.plain} ${t.example}`.toLowerCase().includes(q)));
  const list = $('#terms');
  list.replaceChildren(...shown.map(card));
  if (!shown.length) list.append(h('p', 'empty', `No word found for “${query}”. Try a shorter word, or tell me below and I will add it.`));
  for (const b of filters.children) b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
  $('#count').textContent = `${shown.length} ${shown.length === 1 ? 'word' : 'words'}`;
  const id = decodeURIComponent(location.hash.slice(1)), el = id && document.getElementById(id);
  if (el && el.classList.contains('term')) { el.classList.add('hit'); setTimeout(() => el.scrollIntoView({ block: 'center' }), 50); setTimeout(() => el.classList.remove('hit'), 3500); }
}
$('#q').addEventListener('input', (e) => { query = e.target.value; render(); });
addEventListener('hashchange', render);
addEventListener('wordlab:open', render);       // the robots' "Learn the word" link, pressed while already here
{
  const p = new URLSearchParams(location.search).get('q');
  if (p) { query = p.slice(0, 60); $('#q').value = query; }
}
render();

/* ---------- a word is missing ---------- */
let lastSent = 0;
$('#send').addEventListener('click', async () => {
  const word = $('#miss').value.trim().slice(0, 60), s = $('#sstatus');
  if (word.length < 2) { s.textContent = 'Write the word first.'; return; }
  if (Date.now() - lastSent < 20000) { s.textContent = 'One moment before you send another.'; return; }
  lastSent = Date.now();
  try {
    const r = await fetch('https://ntfy.sh/glassgroove-fb-kw0ofz6geo83rn', { method: 'POST', body: word, headers: { Title: 'Word Lab: a missing word', Tags: 'book' } });
    if (!r.ok) throw new Error(String(r.status));
    s.textContent = 'Thank you! I got it.'; $('#miss').value = '';
  } catch (err) { s.textContent = 'It could not be sent. Check your internet and try again.'; }
});

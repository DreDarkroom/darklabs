/* Darklabs: the right-click menu, in the Darklabs style.

   It does what the browser's own menu does, as far as a web page is allowed to (Back, Forward, Reload, Print, Select all, copy / cut / paste, open and copy links,
   save and copy images, view the page's source, play / pause media), and adds a few things that help: a word's meaning in the Word Lab, reading text aloud,
   and the calm and easy-reading switches.

   Your own menu is never taken away:
     - hold Shift and right-click: the browser's menu, any time
     - "Use the browser's menu" in this menu turns this one off on every Darklabs page (turn it back on the same way, from the footer link or from this menu's page)
     - mark any element data-native-menu to keep the browser's menu there (instruments that use right-click themselves do this)
   Only pages that load this file are affected. Touch screens: a long press keeps the phone's own menu (text selection, share and so on), because overriding it breaks selecting text. Keyboard: the Menu key opens it; Shift + F10 gives the browser's. */
import { prefs } from './prefs.js';

const EDITABLE = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color]), [contenteditable=""], [contenteditable="true"]';
let menu = null, returnFocus = null;
const learnUrl = new URL('../learn/', import.meta.url).href;

/* ---------- small helpers ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function toast(msg) {
  let t = document.getElementById('dl-toast');
  if (!t) { t = el('div'); t.id = 'dl-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (err) { /* fall through to the older way */ }
  const ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* nothing */ }
  ta.remove(); return ok;
}

function selectedText(editable) {
  if (editable && 'selectionStart' in editable) return editable.value.slice(editable.selectionStart, editable.selectionEnd);
  return String(getSelection ? getSelection() : '').trim();
}

/* ---------- what is under the pointer decides what the menu offers ---------- */
function build(target) {
  const link = target.closest('a[href]'), img = target.closest('img'), media = target.closest('video, audio'), editable = target.closest(EDITABLE);
  const sel = selectedText(editable).trim(), groups = [];
  const g = (label, items) => { const list = items.filter(Boolean); if (list.length) groups.push({ label, items: list }); };
  const it = (label, run, o = {}) => ({ label, run, ...o });

  if (editable) {
    const ro = editable.readOnly || editable.disabled;
    g('Edit', [
      it('Cut', () => { editable.focus(); document.execCommand('cut'); }, { disabled: ro || !sel, key: 'Ctrl X' }),
      it('Copy', () => { editable.focus(); document.execCommand('copy'); }, { disabled: !sel, key: 'Ctrl C' }),
      it('Paste', async () => {
        editable.focus();
        try { document.execCommand('insertText', false, await navigator.clipboard.readText()); } catch (err) { toast('Your browser asked not to paste from here. Press Ctrl + V (or hold and tap Paste).'); }
      }, { disabled: ro, key: 'Ctrl V' }),
      it('Select all', () => { editable.focus(); editable.select ? editable.select() : document.execCommand('selectAll'); }, { key: 'Ctrl A' }),
      it('Undo', () => { editable.focus(); document.execCommand('undo'); }, { key: 'Ctrl Z' }),
    ]);
  } else if (sel) {
    const oneWord = /^[\p{L}'’-]{2,30}$/u.test(sel);
    g('Selected text', [
      it('Copy', () => copyText(sel).then((ok) => toast(ok ? 'Copied.' : 'Could not copy.')), { key: 'Ctrl C' }),
      oneWord && it(`What does “${sel}” mean?`, () => { location.href = `${learnUrl}?q=${encodeURIComponent(sel)}`; }),
      'speechSynthesis' in window && it('Read it out loud', () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(sel)); }),
      it('Search the web for it', () => window.open(`https://duckduckgo.com/?q=${encodeURIComponent(sel)}`, '_blank', 'noopener')),
    ]);
  }
  if (link) g('Link', [
    it('Open link', () => { location.href = link.href; }),
    it('Open link in a new tab', () => window.open(link.href, '_blank', 'noopener')),
    it('Copy link address', () => copyText(link.href).then((ok) => toast(ok ? 'Link copied.' : 'Could not copy.'))),
  ]);
  if (img) g('Image', [
    it('Open image in a new tab', () => window.open(img.currentSrc || img.src, '_blank', 'noopener')),
    it('Copy image', async () => {
      try { const b = await (await fetch(img.currentSrc || img.src)).blob(); await navigator.clipboard.write([new ClipboardItem({ [b.type]: b })]); toast('Image copied.'); } catch (err) { toast('Your browser would not copy that image.'); }
    }),
    it('Copy image address', () => copyText(img.currentSrc || img.src).then((ok) => toast(ok ? 'Address copied.' : 'Could not copy.'))),
    it('Save image', () => { const a = el('a'); a.href = img.currentSrc || img.src; a.download = ''; document.body.append(a); a.click(); a.remove(); }),
  ]);
  if (media) g(media.tagName === 'VIDEO' ? 'Video' : 'Audio', [
    it(media.paused ? 'Play' : 'Pause', () => (media.paused ? media.play() : media.pause())),
    it(media.loop ? 'Stop looping' : 'Loop', () => { media.loop = !media.loop; }),
    it(media.muted ? 'Sound on' : 'Mute', () => { media.muted = !media.muted; }),
  ]);

  g('Page', [
    it('Back', () => history.back(), { disabled: history.length < 2, key: 'Alt ←' }),
    it('Forward', () => history.forward(), { key: 'Alt →' }),
    it('Reload', () => location.reload(), { key: 'Ctrl R' }),
    it('Print', () => print(), { key: 'Ctrl P' }),
    !editable && it('Select all', () => getSelection().selectAllChildren(document.body), { key: 'Ctrl A' }),
    it('View page source', async () => {
      try { const t = await (await fetch(location.href)).text(); window.open(URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })), '_blank', 'noopener'); } catch (err) { toast('Could not load the source.'); }
    }),
    it('Copy page address', () => copyText(location.href).then((ok) => toast(ok ? 'Address copied.' : 'Could not copy.'))),
    navigator.share && it('Share this page', () => navigator.share({ title: document.title, url: location.href }).catch(() => {})),
  ]);
  g('Darklabs', [
    it('Calm mode (no motion)', () => prefs.toggle('calm'), { check: prefs.get('calm') }),
    it('Easy reading', () => prefs.toggle('easy'), { check: prefs.get('easy') }),
    it('High contrast', () => prefs.toggle('hc'), { check: prefs.get('hc') }),
    it('Word Lab: words explained', () => { location.href = learnUrl; }),
  ]);
  g('Your browser’s menu', [
    it('Use the browser’s menu instead', () => { prefs.set('ctx', 'off'); toast('Done. Right-click now shows your browser’s menu. Turn this one back on from the footer.'); }),
    it('Tip: Shift + right-click opens the browser’s menu any time', () => {}, { info: true }),
  ]);
  return groups;
}

/* ---------- drawing the menu ---------- */
function close(refocus = true) {
  if (!menu) return;
  menu.remove(); menu = null;
  removeEventListener('pointerdown', outside, true); removeEventListener('scroll', onAway, true); removeEventListener('resize', onAway); removeEventListener('blur', onAway);
  if (refocus && returnFocus && returnFocus.focus) { try { returnFocus.focus({ preventScroll: true }); } catch (err) { /* gone */ } }
}
const outside = (e) => { if (menu && !menu.contains(e.target)) close(false); };
const onAway = () => close(false);

function open(x, y, target, fromKeyboard) {
  close(false);
  returnFocus = document.activeElement;
  menu = el('div', 'dl-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Darklabs menu');
  const items = [];
  for (const group of build(target)) {
    menu.append(el('div', 'dl-group', group.label));
    for (const item of group.items) {
      const b = el('button', 'dl-item'); b.type = 'button';
      b.setAttribute('role', item.check != null ? 'menuitemcheckbox' : 'menuitem');
      if (item.check != null) b.setAttribute('aria-checked', String(!!item.check));
      if (item.disabled) b.setAttribute('aria-disabled', 'true');
      if (item.info) b.classList.add('dl-info');
      b.append(el('span', 'dl-mark', item.check ? '✓' : ''), el('span', 'dl-label', item.label));
      if (item.key) b.append(el('kbd', 'dl-key', item.key));
      b.tabIndex = -1;
      b.addEventListener('click', () => { if (item.disabled || item.info) return; close(false); Promise.resolve().then(item.run); });
      menu.append(b); items.push(b);
    }
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect(), pad = 8;
  menu.style.left = `${Math.max(pad, Math.min(x, innerWidth - r.width - pad))}px`;
  menu.style.top = `${Math.max(pad, Math.min(y, innerHeight - r.height - pad))}px`;
  const live = items.filter((b) => b.getAttribute('aria-disabled') !== 'true');
  const move = (i) => { if (live.length) live[(i + live.length) % live.length].focus(); };
  menu.addEventListener('keydown', (e) => {
    const i = live.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(i < 0 ? -1 : i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); }
  });
  addEventListener('pointerdown', outside, true); addEventListener('scroll', onAway, true); addEventListener('resize', onAway); addEventListener('blur', onAway);
  if (fromKeyboard) move(0);
}

/* ---------- when does it open? ---------- */
let lastInput = 'mouse';                                                                         // a long press on a touch screen is how people select text and use the phone's own menu: leave that alone
addEventListener('pointerdown', (e) => { lastInput = e.pointerType || 'mouse'; }, true);
addEventListener('keydown', () => { lastInput = 'key'; }, true);
addEventListener('contextmenu', (e) => {
  if (e.shiftKey || prefs.get('ctx') === 'off' || e.defaultPrevented || lastInput === 'touch') return;                  // Shift + right-click, or a choice made: the browser's own menu
  const t = e.target instanceof Element ? e.target : document.body;
  if (t.closest('[data-native-menu]')) return;
  e.preventDefault();
  const fromKeyboard = e.clientX === 0 && e.clientY === 0 && e.pointerType !== 'mouse' && e.button === 0 && !e.buttons;
  if (fromKeyboard) { const r = (document.activeElement || t).getBoundingClientRect(); open(r.left + 12, r.bottom - 4, document.activeElement || t, true); }
  else open(e.clientX, e.clientY, t, false);
});

/* the footer link: switch the Darklabs menu back on (or off) */
addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('[data-ctx-toggle]') : null;
  if (!a) return;
  e.preventDefault();
  prefs.set('ctx', prefs.get('ctx') === 'off' ? null : 'off');
  toast(prefs.get('ctx') === 'off' ? 'Right-click now shows your browser’s menu.' : 'The Darklabs right-click menu is back on.');
  document.querySelectorAll('[data-ctx-toggle]').forEach((n) => { n.textContent = prefs.get('ctx') === 'off' ? 'Turn the Darklabs right-click menu on' : 'Use the browser’s right-click menu'; });
});
document.querySelectorAll('[data-ctx-toggle]').forEach((n) => { n.textContent = prefs.get('ctx') === 'off' ? 'Turn the Darklabs right-click menu on' : 'Use the browser’s right-click menu'; });

/* ---------- style ---------- */
const css = el('style'); css.id = 'dl-ctx-css';
css.textContent = `
.dl-menu { position: fixed; z-index: 100000; min-width: 232px; max-width: min(92vw, 320px); max-height: 92vh; overflow: auto; padding: 6px; border-radius: 6px;
  background: linear-gradient(180deg, rgba(30, 10, 14, .97), rgba(12, 5, 7, .97)); border: 1px solid rgba(209, 18, 43, .7);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .85), 0 0 0 1px rgba(255, 255, 255, .03) inset, 0 0 36px rgba(209, 18, 43, .28);
  font: 600 .92rem/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #eadede; animation: dl-open .16s steps(4) both; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.dl-menu::before { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; background: repeating-linear-gradient(0deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 3px); }
.dl-group { padding: 8px 10px 3px; font: 700 .66rem/1 ui-monospace, "SF Mono", Consolas, monospace; letter-spacing: .2em; text-transform: uppercase; color: #e8434f; }
.dl-group:not(:first-child) { margin-top: 4px; border-top: 1px solid rgba(209, 18, 43, .25); padding-top: 10px; }
.dl-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 6px 10px; border: 0; border-radius: 3px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; position: relative; }
.dl-item:hover, .dl-item:focus-visible { background: rgba(209, 18, 43, .32); outline: none; text-shadow: 1px 0 rgba(255, 40, 80, .8), -1px 0 rgba(60, 220, 255, .55); }
.dl-item:focus-visible { box-shadow: 0 0 0 2px #fff inset; }
.dl-item[aria-disabled=true] { opacity: .4; cursor: default; }
.dl-item.dl-info { font-weight: 500; font-size: .8rem; color: #b09c9c; cursor: default; white-space: normal; }
.dl-mark { width: 1.1em; color: #ff6a7a; flex: none; }
.dl-label { flex: 1; }
.dl-key { font: 500 .72rem ui-monospace, Consolas, monospace; color: #9c8a8a; }
@media (pointer: coarse) { .dl-item { min-height: 48px; font-size: 1rem; } .dl-key { display: none; } }
@keyframes dl-open { from { clip-path: inset(0 0 100% 0); transform: translateY(-4px); } to { clip-path: inset(0); transform: none; } }
html.calm .dl-menu { animation: none; }
#dl-toast { position: fixed; z-index: 100001; left: 50%; bottom: 22px; transform: translate(-50%, 12px); max-width: min(92vw, 420px); padding: 10px 14px; border-radius: 4px; background: #0c0507; color: #eadede; border: 1px solid rgba(209, 18, 43, .7); font: 600 .9rem/1.3 system-ui, sans-serif; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
#dl-toast.show { opacity: 1; transform: translate(-50%, 0); }
`;
document.head.append(css);

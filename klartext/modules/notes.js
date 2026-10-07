/* Notiz (notepad): a notepad that stays on this device. Saves as you type. Drop in your favourite phrases (from Funk) with one tap. Copy or download it as a text file. */
import { h, put, fill } from '../core/dom.js';
import { PHRASES } from '../data/phrases.js';
import { head } from './_ui.js';

export default {
  mount(root, ctx) {
    const { store } = ctx;
    const ta = h('textarea', { class: 'field notes', rows: 12, 'aria-label': 'Notizen', placeholder: 'Deine Notizen …' });
    ta.value = store.get('notes.text', '');
    const status = h('p', { class: 'fine', 'aria-live': 'polite' }, '');
    let t = 0, armed = false;
    const save = () => { store.set('notes.text', ta.value); status.textContent = `Gespeichert · ${ta.value.length} Zeichen`; };
    ta.addEventListener('input', () => { clearTimeout(t); status.textContent = 'Speichert …'; t = setTimeout(save, 400); });
    const favs = (store.get('comms.fav', []) || []).map((id) => PHRASES.find((p) => p.id === id)).filter(Boolean).slice(0, 12);
    const insert = (txt) => { const a = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, a) + txt + '\n' + ta.value.slice(ta.selectionEnd ?? a); ta.focus(); save(); };
    const clr = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      if (!armed) { armed = true; clr.textContent = 'Sicher? Nochmal tippen'; setTimeout(() => { armed = false; clr.textContent = 'Löschen'; }, 4000); return; }
      ta.value = ''; save(); armed = false; clr.textContent = 'Löschen';
    } }, 'Löschen');
    put(root, head('Notiz', 'Notepad', 'Bleibt auf diesem Gerät. Nichts wird hochgeladen.'),
      favs.length ? h('div', { class: 'panel' }, h('p', { class: 'fine' }, 'Deine Favoriten einfügen:'), h('div', { class: 'chips' }, favs.map((p) => h('button', { class: 'chip', type: 'button', onclick: () => insert(`${p.de}  (${p.en})`) }, p.de)))) : h('p', { class: 'fine' }, 'Tipp: Markiere in „Funk“ Sätze mit dem Stern ☆, dann kannst du sie hier einfügen.'),
      ta, status,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { navigator.clipboard?.writeText(ta.value).then(() => (status.textContent = 'Kopiert'), () => (status.textContent = 'Kopieren geht hier nicht')); } }, 'Kopieren'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' })), download: 'notizen.txt' }); document.body.append(a); a.click(); a.remove(); } }, 'Als Datei speichern'),
        clr));
    status.textContent = ta.value ? `${ta.value.length} Zeichen` : '';
    return () => { clearTimeout(t); store.set('notes.text', ta.value); };
  },
};

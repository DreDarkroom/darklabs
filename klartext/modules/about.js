/* Info: settings, your data (export / import / reset), what this device can do, credits, and a way to report a mistake in the German. */
import { h, put, fill } from '../core/dom.js';
import { applyPrefs, SIZES } from '../core/prefs.js';
import { LEVELS } from '../core/attend.js';
import { VR_PREFS } from '../core/vr.js';
import { head, chips, toggle } from './ui.js';

export default {
  mount(root, ctx) {
    const { store, vr, attend, tts, brand } = ctx;
    const settings = h('div', { class: 'panel' }, h('h2', null, 'Einstellungen ', h('span', { class: 'en' }, 'Settings')));
    const demoBox = h('div', { class: 'panel demo', 'aria-live': 'polite' }, 'Probier es: ', h('b', null, 'Bewegung'), ' ändert, wie stark die Seite sich bewegt, wenn etwas deine Aufmerksamkeit braucht.');
    const lbl = { auto: 'Auto', on: 'An', off: 'Aus', gentle: 'Sanft', wild: 'Wild' };
    settings.append(
      h('h3', null, 'VR-Layout'), chips('VR-Layout', VR_PREFS.map((v) => ({ id: v, text: lbl[v] })), vr.pref(), (v) => vr.set(v)),
      h('p', { class: 'fine' }, 'Auto schaltet im Meta-Quest-Browser selbst auf große Tasten.'),
      h('h3', null, 'Bewegung'), chips('Bewegung', [{ id: 'off', text: 'Aus' }, { id: 'gentle', text: 'Sanft' }, { id: 'wild', text: 'Wild' }], attend.level, (v) => { attend.set(v); }),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { attend.flash(demoBox, 'ok'); attend.beep(880, 120); } }, 'Erfolg ausprobieren'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { attend.flash(demoBox, 'bad'); } }, 'Hinweis ausprobieren'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { const stop = attend.alarm(demoBox); attend.beep(660, 200); setTimeout(stop, 2500); } }, 'Alarm ausprobieren (2,5 s)')),
      demoBox,
      h('p', { class: 'fine' }, 'Sanft: kurzes Leuchten. Wild: Rand, Wackeln, Konfetti. Nichts blinkt öfter als etwa zweimal pro Sekunde. Wenn dein Gerät „weniger Bewegung“ verlangt, startet die Seite auf Aus.'),
      toggle('Töne', store.get('sound', true), (v) => store.set('sound', v)),
      h('h3', null, 'Text'), chips('Textgröße', SIZES.map((n) => ({ id: n, text: `${n} %` })), store.get('size', 100), (n) => { store.set('size', n); applyPrefs(store); }),
      toggle('Mehr Kontrast', store.get('hc', false), (v) => { store.set('hc', v); applyPrefs(store); }));

    /* data */
    const io = h('textarea', { class: 'field', rows: 4, 'aria-label': 'Sicherung einfügen', placeholder: 'Sicherung hier einfügen, dann „Einspielen“.' });
    const msg = h('p', { class: 'fine', 'aria-live': 'polite' });
    let armed = false;
    const wipe = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      if (!armed) { armed = true; wipe.textContent = 'Wirklich alles löschen? Nochmal tippen'; setTimeout(() => { armed = false; wipe.textContent = 'Alles löschen'; }, 4000); return; }
      store.wipe(); msg.textContent = 'Gelöscht. Lade die Seite neu.'; armed = false; wipe.textContent = 'Alles löschen';
    } }, 'Alles löschen');
    const data = h('div', { class: 'panel' }, h('h2', null, 'Deine Daten ', h('span', { class: 'en' }, 'Your data')),
      h('p', null, 'Alles liegt nur auf diesem Gerät: Karten-Fortschritt, Favoriten, Notizen, Einstellungen. Es gibt kein Konto und keine Verfolgung.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const j = JSON.stringify(store.dump(), null, 1); const a = h('a', { href: URL.createObjectURL(new Blob([j], { type: 'application/json' })), download: 'klartextkit-sicherung.json' }); document.body.append(a); a.click(); a.remove(); msg.textContent = 'Sicherung gespeichert.'; } }, 'Sicherung speichern'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { navigator.clipboard?.writeText(JSON.stringify(store.dump())).then(() => (msg.textContent = 'In die Zwischenablage kopiert.'), () => (msg.textContent = 'Kopieren geht hier nicht.')); } }, 'Kopieren')),
      io,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { try { const n = store.load(JSON.parse(io.value)); msg.textContent = `${n} Einträge eingespielt. Lade die Seite neu.`; } catch (err) { msg.textContent = 'Das ist keine gültige Sicherung.'; } } }, 'Einspielen'), wipe), msg);

    /* what this device can do */
    const caps = h('table', { class: 'tbl' }, h('tbody'));
    vr.caps().then((c) => {
      const yn = (b) => (b ? 'ja' : 'nein');
      const rows = [['Meta Quest Browser', yn(c.quest)], ['WebXR', yn(c.webxr)], ['Echtes VR (immersive)', yn(c.immersiveVR)], ['Sprachausgabe', yn(c.speechOut)], ['Deutsche Stimme', tts.hasGerman ? tts.voiceName() || 'ja' : 'nein'], ['Spracheingabe', yn(c.speechIn)], ['Bildschirm wach halten', yn(c.wakeLock)], ['WebGL', yn(c.webgl)], ['Prozessorkerne', c.cores || '?'], ['Speicher (GB, gerundet)', c.memoryGB || '?'], ['Online', yn(c.online)]];
      caps.tBodies[0].replaceChildren(...rows.map(([a, b]) => h('tr', null, h('th', null, a), h('td', null, String(b)))));
    });

    /* corrections */
    const fb = brand.feedback && brand.feedbackUrl ? (() => {
      const ta = h('textarea', { class: 'field', rows: 3, maxlength: 500, 'aria-label': 'Korrektur', placeholder: 'Welcher Satz ist falsch? Wie klingt er richtig? (kein Name, keine Mail nötig)' });
      const out = h('p', { class: 'fine', 'aria-live': 'polite' });
      return h('div', { class: 'panel' }, h('h2', null, 'Fehler melden ', h('span', { class: 'en' }, 'Report a mistake')),
        h('p', null, 'Das Deutsch hier wurde von einer KI geschrieben und noch nicht von Muttersprachlern geprüft. Wenn du Deutsch sprichst: bitte sag, was nicht stimmt.'),
        ta, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
          const text = ta.value.trim(); if (!text) return; out.textContent = 'Sende …';
          try { const r = await fetch(brand.feedbackUrl, { method: 'POST', body: text, headers: { Title: `${brand.name}: Korrektur`, Tags: 'speech_balloon' } }); out.textContent = r.ok ? 'Danke! Gesendet.' : 'Das hat nicht geklappt.'; if (r.ok) ta.value = ''; } catch (err) { out.textContent = 'Du bist offline oder die Verbindung wurde blockiert.'; }
        } }, 'Senden')), h('p', { class: 'fine' }, 'Das ist der einzige Moment, in dem diese Seite etwas verschickt: nur der Text, den du hier schreibst, nur wenn du „Senden“ tippst.'), out);
    })() : null;

    put(root, head('Info', 'About and settings'), settings, data,
      h('div', { class: 'panel' }, h('h2', null, 'Dieses Gerät ', h('span', { class: 'en' }, 'This device')), caps), fb,
      h('div', { class: 'panel' }, h('h2', null, 'Über das Kit'),
        h('p', null, `${brand.name}: ein kleines, modulares Werkzeug-Set, gebaut von ${brand.owner}. Es lädt nur die Werkzeuge, die du öffnest. Kein Framework, keine Anzeigen, keine Schriften von fremden Servern, keine Konten.`),
        h('p', null, 'Lizenz: MIT. Der VR-Raum nutzt three.js (MIT-Lizenz), sonst kein fremder Code. Die deutschen Texte sind neu geschrieben.'),
        h('p', { class: 'fine' }, 'C&C, Hyper Dash, Hero Drop, GTA und alle anderen Namen gehören ihren Inhabern. Nicht verbunden mit und nicht gebilligt von den Inhabern der genannten Spiele.'),
        h('p', { class: 'fine' }, h('a', { href: '../' }, 'Zurück zu Darklabs'))));
  },
};

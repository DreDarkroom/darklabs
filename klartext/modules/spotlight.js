/* Spiele (games spotlight): the three kinds of talk this kit is built around, with honest notes. Names belong to their owners; links go to official pages;
   nothing here is copied from any game, its dialogue, its art or its manuals. This kit is not made, endorsed or approved by any of the studios named. */
import { h, icon, put, fill } from '../core/dom.js';
import { CATS } from '../data/cats.js';
import { head } from './ui.js';

const card = (cat, title, sub, lines, game, fine, extra) => h('section', { class: 'panel game', 'data-cat': cat },
  h('h2', null, icon(CATS[cat].shape, 'ic shape'), title, ' ', h('span', { class: 'en' }, sub)),
  lines.map((l) => h('p', null, l)),
  h('div', { class: 'row' },
    h('a', { class: 'btn', href: `#/comms?game=${game}` }, 'Funk'),
    h('a', { class: 'btn ghost', href: `#/cards?game=${game}` }, 'Karten'),
    h('a', { class: 'btn ghost', href: `#/quiz?game=${game}` }, 'Quiz'),
    h('a', { class: 'btn ghost', href: `#/scenes?game=${game}` }, 'Szenen')),
  extra || null,
  h('p', { class: 'fine' }, fine));

export default {
  mount(root) {
    put(root, 
      head('Spiele', 'Games spotlight', 'Drei Arten von Spielerdeutsch, und woher du sie kennst.'),
      card('econ', 'C&C: Rivals', 'and other strategy games',
        ['Strategie lebt von kurzen Wörtern: Eco, Rush, Tech, Counter, Expansion. Viele davon sind Denglisch: englisch, aber mit deutscher Grammatik (ich rushe, du boomst).', 'Du lernst, einen Angriff anzukündigen, die Wirtschaft zu besprechen und Einheiten zu kontern.'],
        'rts', 'Command & Conquer and Rivals belong to their owners (Electronic Arts). Not affiliated, not endorsed. Check the game\'s own pages for whether and where it is currently available.'),
      card('attack', 'Hyper Dash // Hero Drop', 'VR team shooters',
        ['Im VR-Shooter muss alles schnell gehen: Gegner links! Deckung! Ich bin down! Hier zählen kurze Rufe, Richtungen und Orte, und der Unterschied zwischen „wo“ und „wohin“.', 'Hero Drop ist das Projekt, das ich unterstützen möchte: „If there\'s one project you\'re going to support, make it this one.“'],
        'vrfps', 'Hyper Dash is by Triangle Factory; its online servers are announced to close on 1 November 2026, with a final offline update. Not affiliated, not endorsed. Official pages and sources are on the VR Lab page.',
        h('div', { class: 'row' },
          h('a', { class: 'btn ghost', href: 'https://www.patreon.com/HeroDropVR', rel: 'noopener' }, 'Hero Drop unterstützen'),
          h('a', { class: 'btn ghost', href: '../vr/#hyperdash' }, 'Hyper Dash im VR Lab'))),
      card('heist', 'Heist-Deutsch', 'open-world crime games',
        ['Ein Gruß an Open-World-Spiele wie GTA 5 und an das Spiel, auf das alle warten. Rockstar hat für GTA VI den 19. November 2026 angekündigt. Termine können sich ändern: schau auf Rockstars eigene Seiten.', 'Hier lernst du Heist-Wörter: Fluchtauto, Beute, Tresor, Schmiere stehen, Gib Gas! Alle Sätze sind neu geschrieben, nichts stammt aus einem Spiel.'],
        'crime', 'GTA and Grand Theft Auto are trademarks of their owners (Rockstar Games / Take-Two). Not affiliated, not endorsed; no game text, names of characters or art are used.',
        h('div', { class: 'row' }, h('a', { class: 'btn ghost', href: 'https://www.rockstargames.com/', rel: 'noopener' }, 'Rockstar Games (offizielle Seite)'))));
  },
};

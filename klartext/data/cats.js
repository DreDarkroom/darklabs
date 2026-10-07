/* KlartextKit: the small, always-loaded part of the content: categories (colour + shape + words), game tags and registers.
   Colour is never the only signal: every category also has its own shape and its own label (WCAG 1.4.1). The big phrase list is in phrases.js and loads on demand. */
export const CATS = {
  attack: { de: 'Angriff', en: 'Attack', hue: '#ff2500', shape: 'tri' },
  defend: { de: 'Verteidigung', en: 'Defend', hue: '#3d8bff', shape: 'sq' },
  spot: { de: 'Spotten', en: 'Spot / info', hue: '#ffd400', shape: 'eye' },
  help: { de: 'Hilfe', en: 'Help', hue: '#19d46a', shape: 'plus' },
  econ: { de: 'Aufbau', en: 'Build / economy', hue: '#ff9a1f', shape: 'hex' },
  chat: { de: 'Chat', en: 'Chat', hue: '#b07cff', shape: 'star' },
  heist: { de: 'Heist', en: 'Heist', hue: '#1fd1c6', shape: 'dia' },
};

/** Where a phrase is useful. These are not official in-game texts; they only say which kind of game the words fit. */
export const GAMES = {
  rts: { de: 'Strategie', en: 'Strategy', name: 'C&C: Rivals and other real-time strategy games' },
  vrfps: { de: 'VR-Shooter', en: 'VR / team shooter', name: 'Hyper Dash // Hero Drop and other team shooters' },
  crime: { de: 'Open World', en: 'Open-world crime', name: 'Open-world crime games (GTA-style)' },
};

/** How a phrase sounds to a German ear. */
export const REG = {
  everyday: { de: 'Alltag', en: 'Everyday: fine anywhere' },
  slang: { de: 'Slang', en: 'Slang: friends and teammates' },
  denglisch: { de: 'Denglisch', en: 'An English word with German grammar' },
  crude: { de: 'Derb', en: 'Rude: learn to understand it, do not say it' },
};

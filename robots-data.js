/* The six robots: names (two words joined, a capital in the middle), what they do, and the one word each teaches. Plain data, so tests can read it without a browser. */
export const ROBOTS = [
  { id: 'ClankCog', parts: ['Clank', 'Cog'], role: 'builder', body: '#6b5a5e', accent: '#ff7a3d', head: 'box', term: 'portmanteau',
    lines: ['Clank! I join parts together. Clank + Cog = ClankCog. That is a portmanteau.', 'I build things one piece at a time.', 'A portmanteau is a new word made from two words. Press the link to learn more.'] },
  { id: 'WobbleWire', parts: ['Wobble', 'Wire'], role: 'cable keeper', body: '#566a6a', accent: '#40f0d0', head: 'round', term: 'offline',
    lines: ['I plug everything in. I wobble a lot, but it works.', 'No internet? Many labs still work. That is called offline.', 'Wires, wires, everywhere!'] },
  { id: 'SparkSprocket', parts: ['Spark', 'Sprocket'], role: 'sound maker', body: '#6a6350', accent: '#ffe14d', head: 'tall', term: 'synthesiser',
    lines: ['Spark! I make sounds from nothing. No recordings.', 'A machine that makes sound from numbers is a synthesiser.', 'Every sound in these labs is made live.'] },
  { id: 'PixelPatch', parts: ['Pixel', 'Patch'], role: 'picture fixer', body: '#5e5670', accent: '#9670ff', head: 'visor', term: 'pixel',
    lines: ['I paint pictures with tiny dots. Each dot is a pixel.', 'I fix the little holes in the picture.', 'Look closely at your screen. Dots, dots, dots.'] },
  { id: 'GlitchGizmo', parts: ['Glitch', 'Gizmo'], role: 'mischief maker', body: '#6b4e5c', accent: '#ff2f6d', head: 'box', term: 'glitch',
    lines: ['A glitch is a small mistake that looks strange. I do it on purpose.', 'Did you see that? Zzzt!', 'Do not worry. It is only style.'] },
  { id: 'BeepBolt', parts: ['Beep', 'Bolt'], role: 'tester', body: '#4f6070', accent: '#6ab8ff', head: 'round', term: 'bpm',
    lines: ['Beep. I count the beat. BPM means beats per minute.', 'Fast music has more beats in a minute.', 'Beep beep. Test passed!'] },
];

/* ParaProg content. Every song carries a confidence level and a source.
   solid  = the time signature is well documented and was checked against more than one source.
   approx = widely cited, but sources disagree on the detail or it was not re-checked. Treat the counting as a teaching suggestion.
   "groups" is how this app teaches the bar to be felt; a source rarely states the grouping, so it is a suggestion, not a fact. */

export const PRESETS = [
  { id: '4-4', name: '4/4', unit: 4, groups: [1, 1, 1, 1], tip: 'The default. Four beats, count 1 2 3 4.' },
  { id: '3-4', name: '3/4', unit: 4, groups: [1, 1, 1], tip: 'Waltz time. Three beats: ONE two three.' },
  { id: '6-8', name: '6/8', unit: 8, groups: [3, 3], tip: 'Compound: two big beats, each split in three. ONE two three FOUR five six.' },
  { id: '5-4a', name: '5/4 (3+2)', unit: 4, groups: [3, 2], tip: 'Mission: Impossible and Take Five both feel like this: a long group of three, then a short group of two.' },
  { id: '5-4b', name: '5/4 (2+3)', unit: 4, groups: [2, 3], tip: 'Same five beats, the other way round. Swapping the groups changes the whole feel.' },
  { id: '5-8', name: '5/8', unit: 8, groups: [3, 2], tip: 'Five eighth notes, felt as 3+2. A limping, forward-leaning pulse.' },
  { id: '7-8a', name: '7/8 (2+2+3)', unit: 8, groups: [2, 2, 3], tip: 'Two shorts then a long. Common in Balkan music and prog.' },
  { id: '7-8b', name: '7/8 (3+2+2)', unit: 8, groups: [3, 2, 2], tip: 'The long group first.' },
  { id: '7-8c', name: '7/8 (2+3+2)', unit: 8, groups: [2, 3, 2], tip: 'The long group in the middle.' },
  { id: '7-4', name: '7/4 (4+3)', unit: 4, groups: [4, 3], tip: 'Seven quarter-note beats. Money by Pink Floyd is counted in seven.' },
  { id: '9-8a', name: '9/8 (2+2+2+3)', unit: 8, groups: [2, 2, 2, 3], tip: 'The "Turkish" nine, with a long beat on the end.' },
  { id: '9-8b', name: '9/8 (3+3+3)', unit: 8, groups: [3, 3, 3], tip: 'The compound nine: three big beats, each split in three.' },
  { id: '11-8', name: '11/8 (3+3+3+2)', unit: 8, groups: [3, 3, 3, 2], tip: 'Three long groups and a short tail that pulls the bar round.' },
  { id: '13-16', name: '6½/8 = 13/16', unit: 16, groups: [3, 3, 3, 2, 2], tip: 'Thirteen sixteenths: written as 6½ eighth notes. One suggested grouping of Schism’s opening meter (see the Bands tab).' },
];

export const LESSONS = [
  {
    id: 'what', title: 'What a time signature tells you',
    body: [
      'The top number is how many pulses are in one bar. The bottom number says which note is the pulse: 4 is a quarter note, 8 is an eighth note, 16 is a sixteenth.',
      '4/4 means four quarter notes per bar. 7/8 means seven eighth notes per bar. The bar is a loop: after the last pulse you land back on ONE.',
      'The number alone does not tell you how it feels. The same seven eighth notes can be 2+2+3, 3+2+2 or 2+3+2. The grouping is what makes odd time groove rather than lurch.',
    ],
  },
  {
    id: 'simple-compound', title: 'Simple, compound and odd (irregular)',
    body: [
      'Simple time splits each beat in two: 2/4, 3/4, 4/4. Compound time splits each beat in three: 6/8, 9/8, 12/8. The big beats are the dotted notes, so 6/8 has two big beats, not six.',
      'Odd (also called irregular or asymmetric) time mixes groups of 2 and 3: 5/8 = 3+2, 7/8 = 2+2+3, 11/8 = 3+3+3+2. You count the groups, and the long and short groups are what you feel.',
      'Tip: 6/8 and 3/4 hold the same six eighth notes. 6/8 is 3+3 and 3/4 is 2+2+2. Switching between them is a hemiola, and it is the engine of a lot of Latin and prog grooves.',
    ],
  },
  {
    id: 'count', title: 'How to count odd time',
    body: [
      'Do not count 1-2-3-4-5-6-7. Count the groups and restart at each one: 1-2, 1-2, 1-2-3 for 7/8 as 2+2+3. Every "1" is a landmark you can aim at.',
      'Say it out loud while you tap the pulse with your foot. Counting in your head is not enough until the groups are automatic.',
      'Word trick (a common teaching aid): "ap-ple" for a group of two, "pine-ap-ple" for a group of three. 7/8 as 2+2+3 is "ap-ple ap-ple pine-ap-ple".',
      'Start with one drum: kick on 1, snare on the start of each later group. When that feels like a groove rather than a sum, add the hi-hat, then fills.',
      'Use the Meter Lab tab. Pick a preset, listen with the count showing, then switch the count off and keep it going in your head.',
    ],
  },
  {
    id: 'poly', title: 'Polyrhythm, polymeter and why they are different',
    body: [
      'A polyrhythm plays two rhythms across the same span of time, such as 3 against 2 in one bar. The bar line stays; the divisions differ.',
      'A polymeter runs two different bar lengths at once, such as a 4-beat pattern against a 3-beat pattern. They line up again only after lcm(4,3) = 12 beats.',
      'The same idea applies to paradiddles in odd time. A single paradiddle is 8 notes long. Over a 7-note bar it takes 8 bars to come back to the start, because lcm(8,7) = 56 = 8 x 7. The Paradiddles tab shows you this.',
    ],
  },
  {
    id: 'practice', title: 'A practice routine',
    body: [
      'Warm up with 5 minutes of slow single strokes on a pad before anything else.',
      'Start slow enough that you never make a mistake. Speed comes from clean repetition, not from pushing.',
      'Practise with the click on the bar start only, then with no click for a bar, then back. If you drift, you will hear it.',
      'Record yourself and compare it to the app. You will hear your timing more honestly than you feel it.',
    ],
  },
];

/* Songs. sections[]: { label, groups, bars }. Played in order, then looped. */
export const SONGS = [
  {
    id: 'lateralus', artist: 'Tool', title: 'Lateralus', year: 2001, bpm: 96, confidence: 'solid',
    meterText: '9/8, 8/8, 7/8',
    sections: [
      { label: '9/8', groups: [2, 2, 2, 3], bars: 1 },
      { label: '8/8', groups: [3, 3, 2], bars: 1 },
      { label: '7/8', groups: [2, 2, 3], bars: 1 },
    ],
    notes: [
      'The chorus runs 9/8, then 8/8, then 7/8. Danny Carey has said the working title for the song was "9-8-7". Those digits make 987, a number in the Fibonacci sequence.',
      'The verse lyric syllables are said to follow the Fibonacci sequence too: the opening lines run 1-1-2-3-5-8 syllables, then back down. Sources describing the full syllable pattern are mostly fan analysis, so treat the exact counts as likely rather than certain.',
      'The groupings above (2+2+2+3, 3+3+2, 2+2+3) are a way to feel the bars, not a transcription. Listen and move the groups if your ear disagrees.',
    ],
    sources: [
      ['Lateralus (song), Wikipedia', 'https://en.wikipedia.org/wiki/Lateralus_(song)'],
      ['Kerrang: the maths hidden in Lateralus', 'https://kerrang.com/why-some-tool-fans-think-their-lateralus-album-is-hiding-a-huge-secret'],
    ],
  },
  {
    id: 'schism', artist: 'Tool', title: 'Schism', year: 2001, bpm: 100, confidence: 'approx',
    meterText: '6½/8, with 5/8 and 7/8 bars',
    sections: [
      { label: '5/8', groups: [3, 2], bars: 1 },
      { label: '7/8', groups: [2, 2, 3], bars: 1 },
    ],
    notes: [
      'The song is commonly labelled 6½/8, with the half acting as an average of many changing bars. The count of "47 changes" is often quoted but I could not confirm it from a primary source.',
      'Descriptions of the signature riff disagree: one source says it alternates 5/8 and 7/8, another gives different opening bars (5/4 and 4/4 before the 5/8, 7/8 pattern). Wikipedia says the last riff is 8/8, while other write-ups describe a 7/8 ending.',
      'Because transcriptions disagree, the loop here is the 5/8 + 7/8 alternation only. Use it as a drill, then check it against your own ear and a transcription before you quote it.',
    ],
    sources: [
      ['Schism (song), Wikipedia', 'https://en.wikipedia.org/wiki/Schism_(song)'],
    ],
  },
  {
    id: 'takefive', artist: 'The Dave Brubeck Quartet', title: 'Take Five', year: 1959, bpm: 172, confidence: 'solid',
    meterText: '5/4',
    sections: [{ label: '5/4', groups: [3, 2], bars: 2 }],
    notes: [
      'Written by Paul Desmond, on the album Time Out, with drummer Joe Morello. The vamp feels like 3+2: ONE two three FOUR five.',
    ],
    sources: [['Take Five, Wikipedia', 'https://en.wikipedia.org/wiki/Take_Five']],
  },
  {
    id: 'bluerondo', artist: 'The Dave Brubeck Quartet', title: 'Blue Rondo à la Turk', year: 1959, bpm: 120, confidence: 'solid',
    meterText: '9/8 (2+2+2+3), then 4/4',
    sections: [
      { label: '9/8', groups: [2, 2, 2, 3], bars: 2 },
      { label: '4/4', groups: [1, 1, 1, 1], bars: 1 },
    ],
    notes: [
      'The 9/8 sections are in the Turkish aksak grouping 2+2+2+3, then the tune swings into 4/4 for the solos. The 4/4 section here is shown with a pulse of one quarter note; in the original it is a swung feel, which the app does not model.',
      'The relative speed of the 9/8 eighth note and the 4/4 beat is approximate here.',
    ],
    sources: [['Blue Rondo à la Turk, Wikipedia', 'https://en.wikipedia.org/wiki/Blue_Rondo_%C3%A0_la_Turk']],
  },
  {
    id: 'money', artist: 'Pink Floyd', title: 'Money', year: 1973, bpm: 120, confidence: 'solid',
    meterText: '7/4, then 4/4 for the solo',
    sections: [{ label: '7/4', groups: [4, 3], bars: 2 }],
    notes: [
      'The famous bass riff is in 7/4 and the guitar solo moves into 4/4. Nick Mason is on drums. Counting 4+3 is one way to feel the seven; you could also count 2+2+3.',
    ],
    sources: [['Money (Pink Floyd song), Wikipedia', 'https://en.wikipedia.org/wiki/Money_(Pink_Floyd_song)']],
  },
  {
    id: 'mission', artist: 'Lalo Schifrin', title: 'Theme from Mission: Impossible', year: 1966, bpm: 150, confidence: 'solid',
    meterText: '5/4',
    sections: [{ label: '5/4', groups: [3, 2], bars: 2 }],
    notes: ['The riff is 5/4, often counted as 3+2. This is one of the most recognisable odd-time pieces in popular music.'],
    sources: [['Theme from Mission: Impossible, Wikipedia', 'https://en.wikipedia.org/wiki/Theme_from_Mission:_Impossible']],
  },
  {
    id: 'solsbury', artist: 'Peter Gabriel', title: 'Solsbury Hill', year: 1977, bpm: 100, confidence: 'solid',
    meterText: '7/4',
    sections: [{ label: '7/4', groups: [4, 3], bars: 2 }],
    notes: ['Often held up as odd time that does not sound odd. The 4+3 grouping here is a suggestion; the song itself is just very natural to sing along to.'],
    sources: [
      ['Solsbury Hill, Wikipedia', 'https://en.wikipedia.org/wiki/Solsbury_Hill'],
      ['Drumspy: songs in 7/8 and 7/4', 'https://drumspy.com/academy/9-must-learn-intermediate-rock-songs-in-7-8-and-7-4/'],
    ],
  },
  {
    id: 'allyouneed', artist: 'The Beatles', title: 'All You Need Is Love', year: 1967, bpm: 106, confidence: 'approx',
    meterText: '7/4 verses, 4/4 chorus (as commonly described)',
    sections: [
      { label: '7/4', groups: [4, 3], bars: 1 },
      { label: '4/4', groups: [1, 1, 1, 1], bars: 1 },
    ],
    notes: ['Widely described as alternating 7/4 and 4/4. I did not re-check the bar-by-bar layout, so treat the alternation here as a rough model.'],
    sources: [['All You Need Is Love, Wikipedia', 'https://en.wikipedia.org/wiki/All_You_Need_Is_Love']],
  },
  {
    id: '15step', artist: 'Radiohead', title: '15 Step', year: 2007, bpm: 150, confidence: 'approx',
    meterText: '5/4',
    sections: [{ label: '5/4', groups: [3, 2], bars: 2 }],
    notes: ['Widely cited as 5/4 (the title hints at the count). My searches did not confirm it from a source I could open, so check it before relying on it.'],
    sources: [['15 Step, Wikipedia', 'https://en.wikipedia.org/wiki/15_Step']],
  },
];

/* things still to add, shown honestly on the Bands tab */
export const WISHLIST = [
  'More Tool: I will only add songs once I can source their counts, not guess them.',
  'Rush (Tom Sawyer, YYZ): sources I found disagree on the sections, so they are left out for now.',
  'Meshuggah, Dream Theater, Mars Volta and Balkan folk metres.',
];

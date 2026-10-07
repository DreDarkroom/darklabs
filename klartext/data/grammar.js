/* KlartextKit: the short grammar notes. Only the rules that gaming German keeps tripping people on. Plain sentences on purpose.
   Provenance: written by an AI assistant, not yet checked by a native speaker. */
export const RULES = [
  {
    id: 'du', title: 'Du, not Sie',
    body: ['In games everyone says "du" (you). "Sie" is for strangers in formal places: shops, support, official pages.', 'A teammate who hears "Sie" will think you are joking. Use du.'],
    ex: [{ de: 'Kannst du mich hören?', en: 'Can you hear me?' }, { de: 'Können Sie mir helfen?', en: 'Can you help me? (formal: support, a shop)' }],
  },
  {
    id: 'v2', title: 'The verb is second',
    body: ['In a normal sentence the verb that carries the ending stays in second place.', 'Put something else first and the subject moves behind the verb.'],
    ex: [{ de: 'Ich gehe jetzt rein.', en: 'I am going in now.' }, { de: 'Jetzt gehe ich rein.', en: 'Now I am going in.' }],
  },
  {
    id: 'commands', title: 'Commands',
    body: ['To one person: drop "du" and use the stem. To a team: use the ihr form. Add "bitte" to be nice.'],
    ex: [{ de: 'Geh in Deckung!', en: 'Get behind cover! (one person)' }, { de: 'Geht in Deckung!', en: 'Get behind cover! (the team)' }, { de: 'Heil mich bitte!', en: 'Heal me please!' }],
  },
  {
    id: 'separable', title: 'Verbs that split',
    body: ['Some verbs split in two. The small front part jumps to the end of the sentence.', 'In the perfect tense they stay together.'],
    ex: [{ de: 'Wir greifen an.', en: 'We attack. (angreifen)' }, { de: 'Ich lade nach.', en: 'I reload. (nachladen)' }, { de: 'Ich baue die Basis auf.', en: 'I build up the base. (aufbauen)' }, { de: 'Wir haben angegriffen.', en: 'We have attacked.' }],
  },
  {
    id: 'denglisch', title: 'English verbs, German endings',
    body: ['Take an English game verb and add -en: push becomes pushen. Then it behaves like a normal German verb.', 'ich pushe, du pushst, er pusht, wir pushen, ihr pusht. Perfect: ich habe gepusht.', 'The Bauen tool does this for you.'],
    ex: [{ de: 'Wir pushen die Mitte.', en: 'We push the middle.' }, { de: 'Ich habe gecampt.', en: 'I have camped.' }],
  },
  {
    id: 'gender', title: 'Der, die, das',
    body: ['Every noun has a gender. Learn each noun with its word: der Gegner, die Basis, das Spiel.', 'In the plural it is always "die": die Gegner, die Basen, die Spiele.'],
    ex: [{ de: 'der Gegner / die Gegner', en: 'the enemy / the enemies' }, { de: 'die Basis / die Basen', en: 'the base / the bases' }],
  },
  {
    id: 'wo-wohin', title: 'Where, and where to',
    body: ['With words like auf, in and an: where something IS (Wo?) takes the dative; where it is GOING (Wohin?) takes the accusative.', 'Same words, different article. This is the most useful rule for callouts.', 'Masculine shows it best: der Turm becomes "im Turm" (is there) and "in den Turm" (goes there). With "zu" (zum Tor, zur Flagge) the dative is used for going, too.'],
    ex: [{ de: 'Er ist auf der Brücke.', en: 'He is on the bridge.' }, { de: 'Ich dashe auf die Brücke.', en: 'I dash onto the bridge.' }, { de: 'Er ist im Turm.', en: 'He is in the tower.' }, { de: 'Ich renne in den Turm.', en: 'I run into the tower.' }],
  },
  {
    id: 'questions', title: 'Questions',
    body: ['A yes/no question starts with the verb. A question with a question word puts the verb straight after it.'],
    ex: [{ de: 'Hast du Munition?', en: 'Do you have ammo?' }, { de: 'Wo ist der Letzte?', en: 'Where is the last one?' }],
  },
  {
    id: 'numbers', title: 'Numbers for timers',
    body: ['10 zehn, 20 zwanzig, 30 dreißig, 40 vierzig, 50 fünfzig, 60 sechzig.', '"Noch" means still, or left: "Noch zehn Sekunden!" = ten seconds left.'],
    ex: [{ de: 'Noch dreißig Sekunden!', en: 'Thirty seconds left!' }, { de: 'Angriff in zehn Sekunden!', en: 'Attack in ten seconds!' }],
  },
  {
    id: 'sounds', title: 'Sounds that trip people up',
    body: ['ä is like the e in "bed". ö: round your lips and say e. ü: round your lips and say ee.', 'ß is a sharp ss. w sounds like English v. v usually sounds like f. z sounds like ts.', 'sch is "sh". At the start of a word, sp and st are "shp" and "sht": Spiel, Stellung.', 'ie is "ee". ei is "eye". eu is "oy". ch is soft after e and i (ich), rough after a, o, u (Buch).'],
    ex: [{ de: 'Spiel', en: 'SHPEEL' }, { de: 'Verstärkung', en: 'fer-SHTEHR-koong' }, { de: 'Deckung', en: 'DEK-oong' }, { de: 'Zeit', en: 'TSIGHT' }],
  },
];

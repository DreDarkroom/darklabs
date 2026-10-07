/* KlartextKit: read German aloud with the device's own speech voices (browser SpeechSynthesis: free, offline on most devices, nothing sent anywhere).
   Voices load late on some browsers, so the choice is re-made when the list changes. A device with no German voice still shows every word. */
const syn = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let voice = null;

function pick() {
  if (!syn) return null;
  const de = syn.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang));
  voice = de.find((v) => /^de[-_]DE/i.test(v.lang)) || de[0] || null;
  return voice;
}
if (syn) { pick(); syn.addEventListener?.('voiceschanged', pick); }

export const tts = {
  get supported() { return !!syn; },
  get hasGerman() { pick(); return !!voice; },
  voiceName() { return voice ? voice.name : ''; },
  speak(text, { rate = 1, pitch = 1, onend } = {}) {
    if (!syn || !text) return false;
    syn.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE'; if (voice) u.voice = voice;
    u.rate = rate; u.pitch = pitch;
    if (onend) u.onend = onend;
    syn.speak(u);
    return true;
  },
  stop() { syn?.cancel(); },
};

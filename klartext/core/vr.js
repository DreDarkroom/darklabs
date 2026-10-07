/* KlartextKit: VR awareness. Open this page in the Meta Quest Browser and it switches to the VR layout by itself: bigger text, bigger buttons,
   more space (Meta's own guidance is at least 60x60 px for primary controls, and the browser panel can be 500 to 2000 px wide).
   The user can force it on or off. Nothing here uses the user-agent string to decide what works: features are tested when they are needed. */
export const isQuestUA = (ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) => /OculusBrowser|Quest/i.test(ua);
export const VR_PREFS = ['auto', 'on', 'off'];

export function createVR(store, doc = document) {
  const root = doc.documentElement;
  const api = {
    pref() { const p = store.get('vr', 'auto'); return VR_PREFS.includes(p) ? p : 'auto'; },
    set(p) { if (VR_PREFS.includes(p)) { store.set('vr', p); api.apply(); } },
    cycle() { api.set(VR_PREFS[(VR_PREFS.indexOf(api.pref()) + 1) % VR_PREFS.length]); return api.pref(); },
    /** Is the large VR layout in use right now? */
    on() { const p = api.pref(); return p === 'on' || (p === 'auto' && isQuestUA()); },
    apply() { root.dataset.vr = api.on() ? 'on' : 'off'; },

    /** What this device can do, tested properly. Used by the About page and the VR Room. */
    async caps() {
      const n = typeof navigator !== 'undefined' ? navigator : {};
      let immersive = false;
      try { immersive = !!(n.xr && (await n.xr.isSessionSupported('immersive-vr'))); } catch (err) { /* not supported */ }
      return {
        quest: isQuestUA(),
        webxr: !!n.xr,
        immersiveVR: immersive,
        speechOut: typeof speechSynthesis !== 'undefined',
        speechIn: !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition),
        wakeLock: 'wakeLock' in n,
        webgl: (() => { try { return !!doc.createElement('canvas').getContext('webgl'); } catch (err) { return false; } })(),
        pointerCoarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
        cores: n.hardwareConcurrency || 0,
        memoryGB: n.deviceMemory || 0,
        online: n.onLine !== false,
      };
    },
  };
  api.apply();
  return api;
}

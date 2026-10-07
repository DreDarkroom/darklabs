/* KlartextKit: white-labelling. The kit ships as DreDarkroom's, but a different name, logo, colour and module list can be dropped in
   by adding a brand.json next to index.html: no code to change. Anything missing or the wrong type is ignored, so a bad file cannot break the app.
   Example brand.json:
     { "name": "Clan Coach", "tagline": "Talk like the team", "logo": "my-logo.png", "accent": "#00b7ff", "modules": ["comms","cards","timers"], "footer": "Made for the Clan" } */
export const BRAND = {
  name: 'KlartextKit',
  owner: 'DreDarkroom',
  tagline: 'Gaming-Deutsch für Funk, Strategie und VR',
  logo: 'icon-512.png',
  accent: '#ff2500',
  modules: null,          // null = every module; or a list of module ids, in the order to show them
  footer: '',
  feedback: true,         // show the "send a correction" box
  feedbackUrl: 'https://ntfy.sh/glassgroove-fb-kw0ofz6geo83rn',   // where a correction is sent (a public ntfy topic; a white-label build sets its own, or "")
  credit: true,           // keep the small "built with KlartextKit" line (the MIT licence only asks that the licence text stays with the code)
};

const HEX = /^#[0-9a-f]{6}$/i;
export function mergeBrand(extra) {
  const out = { ...BRAND };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of ['name', 'owner', 'tagline', 'footer']) if (typeof extra[k] === 'string' && extra[k].length <= 120) out[k] = extra[k];
  if (typeof extra.logo === 'string' && /^[\w./-]+$/.test(extra.logo) && !extra.logo.includes('..')) out.logo = extra.logo;
  if (typeof extra.accent === 'string' && HEX.test(extra.accent)) out.accent = extra.accent.toLowerCase();
  if (Array.isArray(extra.modules) && extra.modules.every((m) => typeof m === 'string')) out.modules = extra.modules;
  for (const k of ['feedback', 'credit']) if (typeof extra[k] === 'boolean') out[k] = extra[k];
  if (typeof extra.feedbackUrl === 'string' && (extra.feedbackUrl === '' || /^https:\/\/[\w.-]+\/[\w./-]+$/.test(extra.feedbackUrl))) out.feedbackUrl = extra.feedbackUrl;
  return out;
}

export async function loadBrand(url = 'brand.json', fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url, { cache: 'no-store' });
    return r.ok ? mergeBrand(await r.json()) : { ...BRAND };
  } catch (err) { return { ...BRAND }; }
}

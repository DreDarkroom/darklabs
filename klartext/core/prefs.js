/* KlartextKit: reading preferences (text size, higher contrast). Kept on this device; applied to the page by two attributes the stylesheet reads. */
export const SIZES = [100, 125, 150];

export function applyPrefs(store, doc = document) {
  const root = doc.documentElement;
  const size = SIZES.includes(store.get('size', 100)) ? store.get('size', 100) : 100;
  root.style.setProperty('--scale', String(size / 100));
  root.dataset.hc = store.get('hc', false) ? 'on' : 'off';
}

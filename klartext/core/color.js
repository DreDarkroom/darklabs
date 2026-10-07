/* KlartextKit: colour maths, so every colour-coded button gets text that can be read (WCAG contrast ratio). */
export const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
/** Black or white, whichever reads better on this colour. */
export const onColor = (hex) => (ratio(hex, '#000000') >= ratio(hex, '#ffffff') ? '#000000' : '#ffffff');

// File writers: WAV (16/24-bit PCM with TPDF dither, or 32-bit float) and Standard MIDI.
// The WAV writer is adapted from sonicsmithy/js/io.js, the most complete encoder in
// the repo; the MIDI writer from blueheronbass/js/files.js. No libraries.

export function encodeWav(chs, sr, bits = 16) {
  const n = chs[0].length, nc = chs.length, bps = bits / 8, dataLen = n * nc * bps, isF = bits === 32;
  const buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
  let o = 0;
  const s = (t) => { for (let i = 0; i < t.length; i++) v.setUint8(o++, t.charCodeAt(i)); };
  s("RIFF"); v.setUint32(o, 36 + dataLen, true); o += 4; s("WAVE"); s("fmt "); v.setUint32(o, 16, true); o += 4;
  v.setUint16(o, isF ? 3 : 1, true); o += 2; v.setUint16(o, nc, true); o += 2; v.setUint32(o, sr, true); o += 4;
  v.setUint32(o, sr * nc * bps, true); o += 4; v.setUint16(o, nc * bps, true); o += 2; v.setUint16(o, bits, true); o += 2;
  s("data"); v.setUint32(o, dataLen, true); o += 4;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const x = Math.max(-1, Math.min(1, chs[c][i]));
      if (bits === 16) {
        const d = (rnd() - rnd()) / 32768;
        v.setInt16(o, Math.round(Math.max(-1, Math.min(1, x + d)) * 32767), true); o += 2;
      } else if (bits === 24) {
        const q = Math.round(x * 8388607);
        v.setUint8(o++, q & 255); v.setUint8(o++, (q >> 8) & 255); v.setUint8(o++, (q >> 16) & 255);
      } else { v.setFloat32(o, x, true); o += 4; }
    }
  }
  return new Uint8Array(buf);
}

export function peakOf(chs) { let p = 0; for (const d of chs) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } return p; }

/** Scale so the peak sits at `db` dBFS (only ever turns it down if it would clip, up to a ceiling). */
export function normalise(chs, db = -1) {
  const pk = peakOf(chs); if (pk <= 1e-6) return chs;
  const g = Math.min(Math.pow(10, db / 20) / pk, 4);
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g;
  return chs;
}

/** Smooth the end of a render so a still-ringing reverb/echo tail never ends in a click. */
export function fadeOut(chs, sr, sec = 1.2) {
  for (const d of chs) {
    const n = Math.min(d.length, Math.floor(sec * sr));
    for (let i = 0; i < n; i++) { const k = i / n; d[d.length - 1 - i] *= k * k * (3 - 2 * k); }
  }
  return chs;
}

function vlq(n) { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; }
function chunk(id, data) { const l = data.length; return [...id].map((c) => c.charCodeAt(0)).concat([(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255], data); }

/** events: [{t (s), dur (s), midi, vel 0..1, ch?}] -> type-0 SMF at `bpm`. Percussion goes to channel 10. */
export function encodeMidi(events, bpm, name = "GlowGrain") {
  const PPQ = 480, tick = (s) => Math.max(0, Math.round((s * bpm / 60) * PPQ));
  const ev = [];
  for (const n of events) {
    const k = Math.max(0, Math.min(127, Math.round(n.midi))), ch = n.ch || 0;
    const on = tick(n.t), off = Math.max(on + 1, tick(n.t + (n.dur || 0.2)));
    ev.push({ t: on, o: 1, b: [0x90 | ch, k, Math.max(1, Math.min(127, Math.round(n.vel * 127)))] });
    ev.push({ t: off, o: 0, b: [0x80 | ch, k, 64] });
  }
  ev.sort((a, b) => a.t - b.t || a.o - b.o);
  const us = Math.round(60000000 / bpm), nameB = [...name].map((c) => c.charCodeAt(0) & 127);
  let data = [0, 0xff, 0x03, ...vlq(nameB.length), ...nameB, 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xc0, 0];
  let last = 0;
  for (const e of ev) { data = data.concat(vlq(e.t - last), e.b); last = e.t; }
  data = data.concat([0, 0xff, 0x2f, 0]);
  return new Uint8Array(chunk("MThd", [0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255]).concat(chunk("MTrk", data)));
}

export function download(data, name, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

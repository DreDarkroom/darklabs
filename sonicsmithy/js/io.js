// WAV / zip writers and the Godot manifest. No DOM needed (Blob is used only in the browser helpers).
import { SR, resample, peakOf } from './dsp.js';

/** chs: Float32Array[] (1 or 2). bits: 16 | 24 | 32 (float). loop: {start,end} in samples -> smpl chunk (Godot reads it). */
export function encodeWav(chs, sr = SR, bits = 16, loop = null) {
  const n = chs[0].length, nc = chs.length, bps = bits / 8, dataLen = n * nc * bps, isF = bits === 32;
  const smpl = loop ? 68 : 0, size = 44 + dataLen + (smpl ? smpl : 0) + (isF ? 0 : 0);
  const buf = new ArrayBuffer(size), v = new DataView(buf); let o = 0;
  const s = (t) => { for (let i = 0; i < t.length; i++) v.setUint8(o++, t.charCodeAt(i)); };
  s('RIFF'); v.setUint32(o, size - 8, true); o += 4; s('WAVE'); s('fmt '); v.setUint32(o, 16, true); o += 4;
  v.setUint16(o, isF ? 3 : 1, true); o += 2; v.setUint16(o, nc, true); o += 2; v.setUint32(o, sr, true); o += 4;
  v.setUint32(o, sr * nc * bps, true); o += 4; v.setUint16(o, nc * bps, true); o += 2; v.setUint16(o, bits, true); o += 2;
  s('data'); v.setUint32(o, dataLen, true); o += 4;
  // TPDF dither for 16-bit only
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const x = Math.max(-1, Math.min(1, chs[c][i]));
    if (bits === 16) { const d = (rnd() - rnd()) / 32768; v.setInt16(o, Math.round(Math.max(-1, Math.min(1, x + d)) * 32767), true); o += 2; }
    else if (bits === 24) { const q = Math.round(x * 8388607); v.setUint8(o++, q & 255); v.setUint8(o++, (q >> 8) & 255); v.setUint8(o++, (q >> 16) & 255); }
    else { v.setFloat32(o, x, true); o += 4; }
  }
  if (loop) { // 'smpl' chunk with one forward loop
    s('smpl'); v.setUint32(o, 60, true); o += 4;
    for (const val of [0, 0, Math.round(1e9 / sr), 60, 0, 0, 0, 1, 0]) { v.setUint32(o, val, true); o += 4; }
    for (const val of [0, 0, loop.start, loop.end - 1, 0, 0]) { v.setUint32(o, val, true); o += 4; }
  }
  return new Uint8Array(buf);
}

export function convertRate(chs, from, to) { return from === to ? chs : chs.map((c) => resample(c, from / to)); }

// ---- zip (store only; audio is already compressed or incompressible enough) ----
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipStore(files) { // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  let cs = 0; for (const c of central) cs += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export const slug = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sound';
export { peakOf };

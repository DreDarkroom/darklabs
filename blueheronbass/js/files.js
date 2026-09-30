// File writers: WAV, Standard MIDI, ZIP (stored) and a Reaper .RPP project.
// Plain byte-pushing, no libraries.

export function encodeWav(chs, rate, bits = 16) {
  const nch = chs.length, n = chs[0].length, bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * nch * bps);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * nch * bps, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * nch * bps, true); v.setUint16(32, nch * bps, true); v.setUint16(34, bits, true);
  str(36, "data"); v.setUint32(40, n * nch * bps, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, chs[c][i]));
      if (bits === 16) { v.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true); o += 2; }
      else { const s = Math.round(x < 0 ? x * 8388608 : x * 8388607); v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
    }
  }
  return new Uint8Array(buf);
}

export function peakOf(chs) { let p = 0; for (const d of chs) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } return p; }
export function normalise(chs, db = -1) {
  const pk = peakOf(chs); if (pk <= 0) return chs;
  const g = Math.pow(10, db / 20) / pk;
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g;
  return chs;
}

// ---------------------------------------------------------------- MIDI

function vlq(n) { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; }
function chunk(id, data) { const l = data.length; return [...id].map((c) => c.charCodeAt(0)).concat([(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255], data); }

/**
 * notes: [{t (s), d (s), midi, vel 0..1}] → type-0 SMF at the given BPM.
 * Fractional MIDI (slides) are written as the nearest note plus pitch bend (±2 st).
 */
export function encodeMidi(notes, bpm, name = "BlueHeronBass") {
  const PPQ = 480;
  const tick = (s) => Math.max(0, Math.round((s * bpm / 60) * PPQ));
  const ev = [];
  for (const n of notes) {
    const k = Math.max(0, Math.min(127, Math.round(n.midi)));
    const bend = n.midi - k;
    const on = tick(n.t), off = Math.max(on + 1, tick(n.t + n.d));
    if (Math.abs(bend) > 0.01) {
      const b = Math.max(0, Math.min(16383, Math.round(8192 + (bend / 2) * 8192)));
      ev.push({ t: on, o: 0, b: [0xe0, b & 127, b >> 7] });
    }
    ev.push({ t: on, o: 1, b: [0x90, k, Math.max(1, Math.min(127, Math.round(n.vel * 127)))] });
    ev.push({ t: off, o: 0, b: [0x80, k, 64] });
  }
  ev.sort((a, b) => a.t - b.t || a.o - b.o);
  const us = Math.round(60000000 / bpm);
  const nameB = [...name].map((c) => c.charCodeAt(0) & 127);
  let data = [0, 0xff, 0x03, ...vlq(nameB.length), ...nameB, 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8,
    0, 0xc0, 33]; // GM program 34 = Electric Bass (finger)
  let last = 0;
  for (const e of ev) { data = data.concat(vlq(e.t - last), e.b); last = e.t; }
  data = data.concat([0, 0xff, 0x2f, 0]);
  return new Uint8Array(chunk("MThd", [0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255]).concat(chunk("MTrk", data)));
}

// ---------------------------------------------------------------- ZIP (store only)

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}

// ---------------------------------------------------------------- Reaper project

/** stems: [{name, file}] all starting at 0 and lenSec long. */
export function encodeRpp(stems, lenSec, bpm, title = "BlueHeronBass") {
  const guid = () => "{" + "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16).toUpperCase(); }) + "}";
  const lines = [
    `<REAPER_PROJECT 0.1 "6.0" 0`,
    `  TEMPO ${bpm.toFixed(3)} 4 4`,
    `  SAMPLERATE 48000 0 0`,
    `  <NOTES 0 2`, `    |${title} — exported from BlueHeronBass (Dre Darklabs)`, `  >`,
  ];
  for (const s of stems) {
    lines.push(`  <TRACK ${guid()}`, `    NAME "${s.name.replace(/"/g, "'")}"`, `    VOLPAN 1 0 -1 -1 1`,
      `    <ITEM`, `      POSITION 0`, `      LENGTH ${lenSec.toFixed(6)}`, `      NAME "${s.file}"`,
      `      <SOURCE WAVE`, `        FILE "${s.file}"`, `      >`, `    >`, `  >`);
  }
  lines.push(">");
  return lines.join("\n");
}

// ---------------------------------------------------------------- download

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

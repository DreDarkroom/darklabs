/* DarkDesk: the vault. Your notes are kept on this device only. With a passcode they are encrypted before they are stored:
   the passcode is stretched into a key with PBKDF2 (SHA-256, 310 000 rounds, a random salt), and the data is sealed with AES-GCM (a fresh random number for each save).
   A wrong passcode cannot open it (GCM checks the data), and nothing here can recover a forgotten passcode: that is the point.
   The key lives only in memory while the desk is unlocked, and is dropped when it locks. No network is used anywhere in this file. */
const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const subtle = () => (globalThis.crypto && crypto.subtle) || null;

export const available = () => !!subtle();

export async function deriveKey(passcode, salt, iter = ITER) {
  const base = await subtle().importKey('raw', enc.encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

/** Seal any JSON value. Returns { iv, data } as text. */
export async function seal(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64(iv), data: b64(data) };
}

/** Open a sealed value. Throws if the key is wrong or the data was changed. */
export async function open(box, key) {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return JSON.parse(dec.decode(plain));
}

/** A whole stored record: { v, mode: 'locked', salt, iter, iv, data }. */
export async function lockWith(passcode, value) {
  const salt = newSalt(), key = await deriveKey(passcode, salt);
  return { key, record: { v: 1, mode: 'locked', salt: b64(salt), iter: ITER, ...(await seal(value, key)) } };
}
export async function unlockWith(passcode, record) {
  if (!record || record.v !== 1 || record.mode !== 'locked') throw new Error('Nothing to unlock.');
  if (!Number.isInteger(record.iter) || record.iter < 100000 || record.iter > 2000000) throw new Error('This record cannot be read.');
  const key = await deriveKey(passcode, unb64(record.salt), record.iter);
  return { key, value: await open(record, key) };
}

/** A rough judgement of a passcode: only to help, never to block. */
export function strength(p) {
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^\w]/.test(p) ? 20 : 0);
  const bits = p.length * Math.log2(Math.max(pool, 1));
  return { bits: Math.round(bits), label: bits < 28 ? 'Weak: add words or length' : bits < 45 ? 'Okay' : bits < 60 ? 'Good' : 'Strong' };
}

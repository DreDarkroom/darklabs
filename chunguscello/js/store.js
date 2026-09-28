// Persistence: small settings in localStorage, recordings in IndexedDB.
// Every call is wrapped — private windows and blocked storage just mean
// nothing is remembered, never a broken page.

const LS_PREFIX = "chunguscello:";
const DB_NAME = "chunguscello";
const DB_STORE = "kv";

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(LS_PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
export function lsDel(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* */ } }

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } catch (e) { reject(e); }
  });
  return dbp;
}
export async function kvSet(k, v) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return true;
  } catch (e) { return false; }
}
export async function kvGet(k) {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const r = d.transaction(DB_STORE).objectStore(DB_STORE).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  } catch (e) { return undefined; }
}
export async function kvDel(k) {
  try {
    const d = await db();
    await new Promise((res) => { const tx = d.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).delete(k); tx.oncomplete = res; tx.onerror = res; });
  } catch (e) { /* */ }
}

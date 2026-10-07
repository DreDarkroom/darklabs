/* KlartextKit: small, safe, namespaced storage. Everything stays on this device. Every call is wrapped, because private windows,
   blocked site data and thumbnail capture can all make localStorage throw. `createStore` takes any backend so tests can use a Map. */
const PREFIX = 'kk.';

export function createStore(backend) {
  const ok = (fn, fallback) => { try { return fn(); } catch (err) { return fallback; } };
  return {
    get(key, fallback) {
      const raw = ok(() => backend.getItem(PREFIX + key), null);
      if (raw == null) return fallback;
      return ok(() => JSON.parse(raw), fallback);
    },
    set(key, value) { return ok(() => { backend.setItem(PREFIX + key, JSON.stringify(value)); return true; }, false); },
    del(key) { ok(() => backend.removeItem(PREFIX + key)); },
    /** Everything this app keeps, as one plain object (for export / backup). */
    dump() {
      const out = {};
      const n = ok(() => backend.length, 0);
      for (let i = 0; i < n; i++) {                       // one unreadable value must not stop the rest being saved
        const k = ok(() => backend.key(i), null);
        if (k && k.startsWith(PREFIX)) { const v = ok(() => JSON.parse(backend.getItem(k)), undefined); if (v !== undefined) out[k.slice(PREFIX.length)] = v; }
      }
      return out;
    },
    load(obj) { let n = 0; for (const [k, v] of Object.entries(obj || {})) if (this.set(k, v)) n++; return n; },
    wipe() { for (const k of Object.keys(this.dump())) this.del(k); },
  };
}

function safeLocal() { try { return globalThis.localStorage || memory(); } catch (err) { return memory(); } }
function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
}

export const store = createStore(safeLocal());

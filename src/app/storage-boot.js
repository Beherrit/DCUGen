// Storage that doesn't fill up. Runs before the app (a plain script, not a module).
//
// The app reads and writes localStorage everywhere, synchronously. Browsers cap localStorage at about
// 5 MB, and saved portraits fill that fast (then saves fail and work is lost). This puts localStorage on
// top of IndexedDB, which holds hundreds of MB: reads come from memory, every write goes to IndexedDB
// (batched), and is mirrored to the real localStorage too whenever it still fits, so nothing changes
// for code that uses localStorage, older versions of the app, or the desktop app's vault mirror.
// The built app waits for window.__dcugenStorageReady before it starts.
(() => {
  let real;
  try { real = window.localStorage; } catch { real = null; }
  if (!real || !window.indexedDB || !window.Storage) { window.__dcugenStorageReady = Promise.resolve(); return; }
  const proto = Storage.prototype;
  const orig = {
    get: proto.getItem, set: proto.setItem, remove: proto.removeItem, key: proto.key, clear: proto.clear,
    length: Object.getOwnPropertyDescriptor(proto, 'length').get,
  };
  const map = new Map();
  try { for (let i = 0; i < orig.length.call(real); i++) { const k = orig.key.call(real, i); if (k != null) map.set(k, orig.get.call(real, k)); } } catch { /* blocked */ }

  let db = null;
  let failed = false;
  const dirty = new Map();
  let timer = null;
  const open = () => new Promise((resolve, reject) => {
    const r = indexedDB.open('dcugen', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      if (!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!db || !dirty.size) return;
    try {
      const tx = db.transaction('kv', 'readwrite');
      const st = tx.objectStore('kv');
      for (const [k, v] of dirty) { if (v === null) st.delete(k); else st.put(v, k); }
      dirty.clear();
    } catch { /* closing */ }
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, 200); };

  proto.getItem = function getItem(k) {
    if (this !== real) return orig.get.call(this, k);
    k = String(k);
    return map.has(k) ? map.get(k) : null;
  };
  proto.setItem = function setItem(k, v) {
    if (this !== real) return orig.set.call(this, k, v);
    k = String(k); v = String(v);
    let mirrored = true;
    try { orig.set.call(real, k, v); } catch (e) {
      mirrored = false;
      // Too big for localStorage: drop the stale copy there so it can't come back, keep it in IndexedDB.
      try { orig.remove.call(real, k); } catch { /* ignore */ }
      if (failed) throw e; // no IndexedDB either: behave like before (callers handle a full store)
    }
    map.set(k, v);
    dirty.set(k, v);
    schedule();
    return mirrored ? undefined : undefined;
  };
  proto.removeItem = function removeItem(k) {
    if (this !== real) return orig.remove.call(this, k);
    k = String(k);
    map.delete(k); dirty.set(k, null); schedule();
    try { orig.remove.call(real, k); } catch { /* ignore */ }
  };
  proto.key = function key(i) {
    if (this !== real) return orig.key.call(this, i);
    return [...map.keys()][i] ?? null;
  };
  proto.clear = function clear() {
    if (this !== real) return orig.clear.call(this);
    for (const k of map.keys()) dirty.set(k, null);
    map.clear(); schedule();
    try { orig.clear.call(real); } catch { /* ignore */ }
  };
  Object.defineProperty(proto, 'length', { configurable: true, get() { return this === real ? map.size : orig.length.call(this); } });

  // Save before the page goes away.
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  const hydrate = open().then((d) => new Promise((resolve) => {
    db = d;
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').openCursor();
    const fromIdb = new Map();
    req.onsuccess = () => { const c = req.result; if (c) { fromIdb.set(String(c.key), c.value); c.continue(); } else resolve(fromIdb); };
    req.onerror = () => resolve(fromIdb);
  })).then((fromIdb) => {
    // localStorage holds everything that fit, written synchronously, so it is never older than IndexedDB.
    // What is only in IndexedDB is what didn't fit there: take it.
    for (const [k, v] of fromIdb) if (!map.has(k)) map.set(k, v);
    // First run (or anything new in localStorage): copy it all into IndexedDB.
    for (const [k, v] of map) if (fromIdb.get(k) !== v) dirty.set(k, v);
    flush();
    try { navigator.storage?.persist?.(); } catch { /* best effort: ask the browser not to evict */ }
  }).catch(() => { failed = true; });

  const timeout = new Promise((r) => setTimeout(r, 2500));
  window.__dcugenStorageReady = Promise.race([hydrate, timeout]);
  window.__dcugenStorage = {
    flush,
    get db() { return db; },
    get backend() { return db ? 'IndexedDB' : 'localStorage'; },
    /** Bytes used by the app's data (rough: string lengths × 2). */
    bytes() { let n = 0; for (const [k, v] of map) if (k.startsWith('dcugen.')) n += (k.length + (v ? v.length : 0)) * 2; return n; },
    handle(name, value) {
      if (!db) return Promise.resolve(null);
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('handles', value === undefined ? 'readonly' : 'readwrite');
          const st = tx.objectStore('handles');
          const req = value === undefined ? st.get(name) : value === null ? st.delete(name) : st.put(value, name);
          req.onsuccess = () => resolve(value === undefined ? req.result || null : true);
          req.onerror = () => resolve(null);
        } catch { resolve(null); }
      });
    },
  };
})();

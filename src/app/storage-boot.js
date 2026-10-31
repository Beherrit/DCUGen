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
  const inLocal = new Set(map.keys());
  // Until IndexedDB has been read, a key that lives only there (too big for localStorage) looks empty.
  // Writes made in that window are remembered, so they can never replace the real data (see hydrate).
  let ready = false;
  const early = new Set();

  // Other tabs of the app: every write is announced, so this tab's copy never goes stale and can't
  // overwrite newer data with an old in-memory state (see the end of this file).
  let channel = null;
  try { channel = new BroadcastChannel('dcugen-storage'); } catch { /* old browser */ }
  const announce = (k, v) => { try { channel?.postMessage({ k, v }); } catch { /* too big or closed */ } };

  let db = null;
  let failed = false;
  const dirty = new Map();
  let timer = null;
  let aborts = 0;
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
      // 'strict': the write is on the disk when it completes, not still in a cache a power cut would empty.
      const tx = db.transaction('kv', 'readwrite', { durability: 'strict' });
      const st = tx.objectStore('kv');
      const batch = new Map(dirty);
      for (const [k, v] of batch) { if (v === null) st.delete(k); else st.put(v, k); }
      dirty.clear();
      // A write that failed is tried again, unless the key has changed since.
      tx.onabort = () => { for (const [k, v] of batch) if (!dirty.has(k)) dirty.set(k, v); if (++aborts < 5) schedule(); };
      tx.oncomplete = () => { aborts = 0; };
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
    try { orig.set.call(real, k, v); } catch (e) {
      // Too big for localStorage: drop the stale copy there so it can't come back, keep it in IndexedDB.
      try { orig.remove.call(real, k); } catch { /* ignore */ }
      if (failed) throw e; // no IndexedDB either: behave like before (callers handle a full store)
    }
    map.set(k, v);
    if (!ready) early.add(k);
    dirty.set(k, v);
    schedule();
    announce(k, v);
    return undefined;
  };
  proto.removeItem = function removeItem(k) {
    if (this !== real) return orig.remove.call(this, k);
    k = String(k);
    if (!ready) early.add(k);
    map.delete(k); dirty.set(k, null); schedule();
    try { orig.remove.call(real, k); } catch { /* ignore */ }
    announce(k, null);
  };
  proto.key = function key(i) {
    if (this !== real) return orig.key.call(this, i);
    return [...map.keys()][i] ?? null;
  };
  proto.clear = function clear() {
    if (this !== real) return orig.clear.call(this);
    for (const k of map.keys()) { dirty.set(k, null); announce(k, null); }
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
    // What is only in IndexedDB is what didn't fit there: take it. If the app already started (IndexedDB
    // was slow) and wrote such a key, it wrote it without having seen the real value: the stored one wins.
    const clobbered = [];
    for (const [k, v] of fromIdb) {
      if (!map.has(k) && !early.has(k)) map.set(k, v);
      else if (early.has(k) && !inLocal.has(k) && map.get(k) !== v) { map.set(k, v); dirty.delete(k); clobbered.push(k); }
    }
    ready = true;
    early.clear();
    // First run (or anything new in localStorage): copy it all into IndexedDB.
    for (const [k, v] of map) if (fromIdb.get(k) !== v) dirty.set(k, v);
    flush();
    try { navigator.storage?.persist?.(); } catch { /* best effort: ask the browser not to evict */ }
    // The app is running on data it never saw: start it again on the real data.
    if (started && clobbered.length) location.reload();
  }).catch(() => { failed = true; ready = true; }).then(() => fromVault());

  // Desktop app: every change is forced onto the disk in the vault moments after it is made, while the
  // browser's own stores can lag a few seconds and lose them in a crash or power cut. So before the app
  // starts, take the vault's value of any key that differs, except the keys the last run changed and had
  // not yet got onto disk (app.js lists them under dcugenVaultPending): those are newer here.
  function fromVault() {
    const d = window.dcugenDesktop;
    if (started || !d?.vaultLoad) return undefined;
    const wait = new Promise((r) => setTimeout(() => r(null), 5000));
    return Promise.race([d.vaultLoad(), wait]).then((vault) => {
      if (started || !vault) return;
      let pending = [];
      try { pending = JSON.parse(map.get('dcugenVaultPending') || '[]'); } catch { /* none */ }
      const skip = new Set(Array.isArray(pending) ? pending : []);
      for (const [k, v] of Object.entries(vault)) {
        if (!k.startsWith('dcugen.') || typeof v !== 'string' || skip.has(k) || early.has(k) || map.get(k) === v) continue;
        try { proto.setItem.call(real, k, v); } catch { /* full: keep what is here */ }
      }
      flush();
    }).catch(() => { /* no vault: carry on with what is here */ });
  }

  // Normally IndexedDB answers in milliseconds. If it hangs, start anyway after a while (the guard above
  // keeps the data safe) rather than show a blank page.
  let started = false;
  const timeout = new Promise((r) => setTimeout(() => { started = true; r(); }, 10000));
  window.__dcugenStorageReady = Promise.race([hydrate.then(() => { started = true; }), timeout]);

  // Another tab changed something: keep this tab's copy current. The app also holds data in memory, so
  // start it again on the new data the next time this tab is looked at (nothing is lost: the other tab
  // has already saved).
  let stale = false;
  let pendingReload = false;
  const maybeReload = () => { if (stale && pendingReload && document.visibilityState === 'visible') { flush(); location.reload(); } };
  if (channel) {
    channel.onmessage = (ev) => {
      const { k, v } = ev.data || {};
      if (typeof k !== 'string') return;
      if (v === null) map.delete(k); else map.set(k, String(v));
      dirty.delete(k);
      if (k.startsWith('dcugen.') && !/^dcugen\.(tab|theme|sheetview|gmtab|roster\.view|sync\.|table\.)/.test(k)) stale = true;
      if (stale && document.visibilityState === 'hidden') pendingReload = true;
    };
  }
  document.addEventListener('visibilitychange', maybeReload);
  addEventListener('focus', () => { if (stale) { pendingReload = true; maybeReload(); } });
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

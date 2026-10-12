// App state, saved roster and preferences (kept in this browser's storage).

const ROSTER_KEY = 'dcugen.roster.v1';
const PREFS_KEY = 'dcugen.prefs.v1';
// Deleted characters, so a sync or a merged backup doesn't bring them back: [{ rosterId, at }].
export const DELETED_KEY = 'dcugen.roster.deleted.v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set();

export const state = {
  current: null,      // the character on the Forge
  editing: false,
  history: [],        // recent rolls (not saved)
  roster: readJson(ROSTER_KEY, []),
  prefs: readJson(PREFS_KEY, { pl: 10, plRandom: false, archetype: '', theme: '', alignment: 'hero', chaos: 0.35, gender: 'random', teamSize: 4 }),
  lab: null,          // the power being edited in the Power Lab
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(what) {
  for (const fn of listeners) fn(what);
}

export function savePrefs() {
  writeJson(PREFS_KEY, state.prefs);
}

export function saveRoster() {
  const ok = writeJson(ROSTER_KEY, state.roster);
  emit('roster');
  return ok;
}

export function newId() {
  return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Add or update a character in the roster. Returns the stored copy. */
export function upsert(ch) {
  const copy = JSON.parse(JSON.stringify(ch));
  if (!copy.rosterId) copy.rosterId = newId();
  copy.savedAt = new Date().toISOString();
  const i = state.roster.findIndex((x) => x.rosterId === copy.rosterId);
  if (i >= 0) state.roster[i] = copy; else state.roster.unshift(copy);
  const tombs = readJson(DELETED_KEY, []);
  if (tombs.some((t) => t.rosterId === copy.rosterId)) writeJson(DELETED_KEY, tombs.filter((t) => t.rosterId !== copy.rosterId));
  saveRoster();
  state.lastUpsert = copy;
  emit('roster-upsert');
  return copy;
}

export function removeFromRoster(rosterId) {
  state.roster = state.roster.filter((x) => x.rosterId !== rosterId);
  writeJson(DELETED_KEY, [...readJson(DELETED_KEY, []).filter((t) => t.rosterId !== rosterId), { rosterId, at: new Date().toISOString() }].slice(-500));
  saveRoster();
  state.lastRemoved = rosterId;
  emit('roster-remove');
}

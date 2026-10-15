// Sort lists of characters by name or power level, wherever a list of them is picked from. Each list remembers
// its own choice.

import { h } from './dom.js';

export const SORTS = { name: 'Name A–Z', plDesc: 'PL, high first', plAsc: 'PL, low first', recent: 'Recent first' };

const nameOf = (c) => String(c?.identity?.codename || c?.identity?.realName || c?.name || '').toLowerCase();
const plOf = (c) => Number(c?.pl ?? 0);

/** Sort a list (a copy): get(item) gives the character or entry to sort by. 'recent' keeps the order given. */
export function sortChars(list, mode, get = (x) => x) {
  const out = [...list];
  const byName = (a, b) => nameOf(get(a)).localeCompare(nameOf(get(b)));
  if (mode === 'name') out.sort(byName);
  else if (mode === 'plDesc') out.sort((a, b) => plOf(get(b)) - plOf(get(a)) || byName(a, b));
  else if (mode === 'plAsc') out.sort((a, b) => plOf(get(a)) - plOf(get(b)) || byName(a, b));
  return out;
}

export function sortPref(key, fallback = 'recent') {
  try { const v = localStorage.getItem(`dcugen.sort.${key}`); return SORTS[v] ? v : fallback; } catch { return fallback; }
}

/** A small "Sort" select for one list; onChange(mode) after it's remembered. */
export function sortSelect(key, onChange, { fallback = 'recent', modes = Object.keys(SORTS), id = null } = {}) {
  const cur = sortPref(key, fallback);
  return h('select', { class: 'sort-sel', id, 'aria-label': 'Sort', title: 'Sort', onChange: (e) => { try { localStorage.setItem(`dcugen.sort.${key}`, e.target.value); } catch { /* ignore */ } onChange(e.target.value); } },
    modes.map((m) => h('option', { value: m, selected: m === cur }, SORTS[m])));
}

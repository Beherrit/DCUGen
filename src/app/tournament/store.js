// The Tournament page's saved state in the browser under one key: the setup being built (the draft) and the running
// tournament, if any. Every call is wrapped: when storage is blocked or full, nothing throws.

import { reviveTournament, serializeTournament, DEFAULT_SETTINGS } from '../../engine/tournament.js';
import { randomSeed } from '../../engine/rng.js';

const KEY = 'dcugen.tournament.v1';

/** A new setup: single elimination, one game a match, no entrants yet. */
export function freshDraft() {
  return { format: 'single', bestOf: 1, seeding: 'given', settings: { ...DEFAULT_SETTINGS }, seed: randomSeed(), entrants: [], nextUid: 1 };
}

/** The saved page state: { draft, t } (t is the running tournament or null). Anything unreadable gives a fresh page. */
export function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.draft && Array.isArray(raw.draft.entrants)) {
      let t = null;
      try { t = raw.tournament ? reviveTournament(raw.tournament) : null; } catch { t = null; }
      return { draft: { ...freshDraft(), ...raw.draft, settings: { ...DEFAULT_SETTINGS, ...raw.draft.settings } }, t };
    }
  } catch { /* fall through to a new page */ }
  return { draft: freshDraft(), t: null };
}

/** Save the page state. Returns false when the browser would not take it. */
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, draft: state.draft, tournament: state.t ? serializeTournament(state.t) : null }));
    return true;
  } catch { return false; }
}

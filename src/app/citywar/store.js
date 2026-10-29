// The City war's own saved state in the browser: the war itself (map, teams, log, fights) under one key.
// Every call is wrapped: when storage is blocked or full, nothing throws.

import { createCityWar, reviveCity, serializeCity } from '../../engine/citywar.js';
import { randomSeed } from '../../engine/rng.js';

const KEY = 'dcugen.citywar.v1';

/** The saved war, or a fresh empty one with a new seed. */
export function loadWar() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.teams)) return reviveCity(raw);
  } catch { /* fall through to a new war */ }
  return createCityWar({ seed: randomSeed() });
}

/** Save the war. Returns false when the browser would not take it. */
export function saveWar(war) {
  try { localStorage.setItem(KEY, JSON.stringify(serializeCity(war))); return true; } catch { return false; }
}

// Keeping the campaign's fights in Fights (source 'city-war'), once each: a replay of the same war plays the same
// fights, so a fight already kept is not saved a second time.

import { fightRecord, recordId } from '../../engine/records/record.js';
import { saveRecord, loadRecord, keepLogs, freeId, pruneRecords } from '../records/store.js';

/** Is this saved record the same fight as the one just played? */
function sameFight(saved, b, label) {
  return !!saved && saved.label === label && saved.log.length === b.log.length && saved.result?.rounds === Math.max(1, Math.min(b.round, b.options.maxRounds));
}

/** The onFight hook for stepCity/runCity: keeps each finished fight unless "Keep fight logs" is off. */
export function keepCityFight(b, rec, war, label) {
  if (!keepLogs()) return null;
  try {
    const first = recordId(rec.seed, 1);
    if (sameFight(loadRecord(first), b, label)) return first;
    const saved = fightRecord(b, { source: 'city-war', label, counter: freeId(rec.seed) });
    return saveRecord(saved);
  } catch { return null; }
}

/** After a batch of fights, drop the oldest beyond the limit. */
export const trimKept = () => { try { pruneRecords(); } catch { /* ignore */ } };

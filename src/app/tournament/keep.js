// Keeping the tournament's games in Fights (source 'tournament'). A game has a fixed record id (from its seed), so playing
// the same tournament again writes the same records over themselves instead of piling up copies.

import { saveRecord, keepLogs, pruneRecords, hasRecord } from '../records/store.js';

/** The onGame hook for playNextMatch/playRound/playAll: keeps each finished game unless "Keep fight logs" is off. */
export function keepTournamentGame(record) {
  if (!keepLogs()) return null;
  try { return saveRecord(record); } catch { return null; }
}

/** After a batch of games, drop the oldest beyond the limit. */
export const trimKept = () => { try { pruneRecords(); } catch { /* ignore */ } };

/** Is this game's fight still in Fights (kept, and not deleted since)? */
export const gameKept = (recordId) => !!recordId && hasRecord(recordId);

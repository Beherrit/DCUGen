// Tournaments: brackets and round robins of fights, every game saved as a fight record.
// The code lives in src/engine/tournament/; this file keeps the names the rest of the app imports.

import { createTournament, restart, withSeed, copyTournament, serializeTournament, reviveTournament, normalizeSettings, FORMATS, FORMAT_LABELS, MAX_ENTRANTS, DEFAULT_SETTINGS, SCENERY } from './tournament/state.js';
import { playNextMatch, playRound, playAll } from './tournament/play.js';
import { standings, championOf } from './tournament/standings.js';
import { bracketView, matchView } from './tournament/view.js';
import { tournamentOdds, playOdds, tallyOdds, newTally } from './tournament/odds.js';
import { nextMatch, matchById } from './tournament/resolve.js';
import { seedOf, entrantOf, MAX_REPLAYS } from './tournament/match.js';
import { bracketOrder, nextPow2 } from './tournament/seeding.js';
import { quickEntrants } from './tournament/quickfill.js';

export { createTournament, restart, withSeed, copyTournament, serializeTournament, reviveTournament, normalizeSettings, FORMATS, FORMAT_LABELS, MAX_ENTRANTS, DEFAULT_SETTINGS, SCENERY, playNextMatch, playRound, playAll, standings, championOf, bracketView, matchView, tournamentOdds, playOdds, tallyOdds, newTally, nextMatch, matchById, seedOf, entrantOf, MAX_REPLAYS, bracketOrder, nextPow2, quickEntrants };

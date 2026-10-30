// A tournament as plain data: creating one, starting it over, a new seed, copying, saving and loading.
// Everything about a tournament is in this one object (entrants with their characters, seeding, matches and results),
// so it round-trips through JSON and a saved tournament carries on exactly where it stopped.

import { seedOrder } from './seeding.js';
import { buildSingle, buildDouble } from './bracket.js';
import { buildRoundRobin } from './roundrobin.js';
import { resolve } from './resolve.js';
import { championOf } from './standings.js';

export const FORMATS = ['single', 'double', 'round-robin'];
export const FORMAT_LABELS = { single: 'Single elimination', double: 'Double elimination', 'round-robin': 'Round robin' };
export const MAX_ENTRANTS = 64;
export const SCENERY = ['none', 'street', 'park'];
export const DEFAULT_SETTINGS = { enclosed: false, knockback: true, shootThrough: true, scenery: 'none', ambush: 'none' };

/** The match settings with every field present: scenery is none, street or park; ambush is none or alternate. */
export function normalizeSettings(s = {}) {
  const m = { ...DEFAULT_SETTINGS, ...s };
  return {
    enclosed: !!m.enclosed, knockback: !!m.knockback, shootThrough: !!m.shootThrough,
    scenery: SCENERY.includes(m.scenery) ? m.scenery : 'none', ambush: m.ambush === 'alternate' ? 'alternate' : 'none',
  };
}

function normalizeEntrant(e, i) {
  const members = (e.members || []).map((ch) => JSON.parse(JSON.stringify(ch)));
  if (!members.length) throw new Error(`Entrant ${i + 1} has no one on the team.`);
  return { id: `e${i + 1}`, name: String(e.name || '').trim() || `Entrant ${i + 1}`, tactic: e.tactic || 'none', members };
}

const BUILDERS = { single: buildSingle, double: buildDouble, 'round-robin': buildRoundRobin };

/** Where the tournament stands after a change: ready, running or over, and who won. */
export function refresh(t) {
  const champ = championOf(t);
  t.champion = champ ? champ.id : null;
  const all = t.matches.every((m) => m.done);
  t.status = all ? 'over' : t.played > 0 ? 'running' : 'ready';
  return t;
}

/** Build the matches again from the entrants and the seed order: nothing has been played. */
export function rebuild(t) {
  t.matches = BUILDERS[t.format](t.order);
  t.played = 0;
  return refresh(resolve(t));
}

/**
 * A new tournament. entrants: [{ name, members: [characters], tactic }]. seeding is 'given' (the order they come in) or
 * 'random' (shuffled by the seed). bestOf is an odd number of games per match (a round robin always plays one).
 */
export function createTournament({ seed = 'tournament', format = 'single', entrants = [], bestOf = 1, settings = {}, seeding = 'given' } = {}) {
  if (!FORMATS.includes(format)) throw new Error(`Unknown format: ${format}`);
  if (entrants.length < 2) throw new Error('A tournament needs at least two entrants.');
  if (entrants.length > MAX_ENTRANTS) throw new Error(`A tournament holds at most ${MAX_ENTRANTS} entrants.`);
  const list = entrants.map(normalizeEntrant);
  const odd = Math.max(1, Math.min(9, Math.floor(Number(bestOf) || 1)));
  const t = {
    v: 1, seed: String(seed), format, bestOf: format === 'round-robin' ? 1 : odd % 2 ? odd : odd - 1, settings: normalizeSettings(settings),
    seeding: seeding === 'random' ? 'random' : 'given', entrants: list, order: [], matches: [], status: 'ready', champion: null, played: 0,
  };
  t.order = seedOrder(list.map((e) => e.id), t.seed, t.seeding);
  return rebuild(t);
}

/** Play it again from the start with the same seed and the same seeding: the same tournament. */
export const restart = (t) => rebuild(t);

/** A new seed: new dice (and a new shuffle when the seeding is random), and nothing played. */
export function withSeed(t, seed) {
  t.seed = String(seed);
  t.order = seedOrder(t.entrants.map((e) => e.id), t.seed, t.seeding);
  return rebuild(t);
}

export const copyTournament = (t) => JSON.parse(JSON.stringify(t));
export const serializeTournament = (t) => JSON.parse(JSON.stringify(t));

/** Read a saved tournament back. Throws when it is not one. */
export function reviveTournament(raw) {
  const ok = raw && raw.v === 1 && FORMATS.includes(raw.format) && Array.isArray(raw.entrants) && Array.isArray(raw.order) && Array.isArray(raw.matches);
  if (!ok || raw.entrants.length < 2 || raw.order.length !== raw.entrants.length) throw new Error('That is not a saved tournament.');
  const t = copyTournament(raw);
  t.settings = normalizeSettings(t.settings);
  return refresh(resolve(t));
}

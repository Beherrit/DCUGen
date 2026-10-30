// One game of a match: how the battle is set up (the same code builds it live, for a replay and for the odds run),
// running it, and reading the result. Team A and team B are two entrants; every game has its own seed.

import { createBattle, addCombatant, makeCombatant, runToEnd, TEAM_TACTICS } from '../battle.js';
import { addScenery } from '../citywar/scenery.js';
import { fightRecord, recordId } from '../records/record.js';

/** The seed of a game: the tournament seed, the match and the game number, plus the replay number after a stalemate. */
export const gameSeed = (t, m, game, replay = 0) => `${t.seed}::${m.id}::g${game}${replay ? `::r${replay}` : ''}`;

/** The label a saved game carries: "Quarterfinal 2, game 1", and ", replay 1" after a stalemate. */
export const gameLabel = (m, game, replay = 0) => `${m.label}, game ${game}${replay ? `, replay ${replay}` : ''}`;

/** Names within one fight must differ so the log can tell them apart: a second "Thug" becomes "Thug 2". */
function uniqueName(seen, name) {
  const n = (seen.get(name) || 0) + 1;
  seen.set(name, n);
  return n === 1 ? name : `${name} ${n}`;
}

/** Build the battle of one game (not yet started). A and B are entrants; ambush is 'A', 'B' or null. */
export function buildGame(t, R, A, B, seed, ambush = null) {
  const b = createBattle({ seed, name: `${A.name} vs ${B.name}` });
  const s = t.settings;
  Object.assign(b.options, { knockback: !!s.knockback, shootThrough: !!s.shootThrough, enclosed: !!s.enclosed, lethal: !!s.lethal, ambush });
  b.options.teamTactics = Object.fromEntries([['A', A], ['B', B]].filter(([, e]) => e.tactic && e.tactic !== 'none' && TEAM_TACTICS[e.tactic]).map(([letter, e]) => [letter, e.tactic]));
  const seen = new Map();
  for (const [letter, e] of [['A', A], ['B', B]]) {
    e.members.forEach((ch, i) => {
      const base = ch.identity?.codename || ch.identity?.realName || 'Fighter';
      addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify(ch)), { team: letter, id: `${e.id}-m${i}`, name: uniqueName(seen, base) }));
    });
  }
  if (!b.options.enclosed && s.scenery && s.scenery !== 'none') addScenery(b, s.scenery);
  return b;
}

const gone = (c) => c.out || (c.fled && !c.escaped);

/** What the battle came to: the winning letter (null for a stalemate), rounds, and the knockouts each side dealt. */
export function readResult(b) {
  const kos = (letter) => b.combatants.filter((c) => c.team === letter).reduce((s, c) => s + c.stats.kos, 0);
  const left = (letter) => b.combatants.filter((c) => c.team === letter && !gone(c)).length;
  return {
    winner: b.winner || null, gotAway: !!b.gotAway, rounds: Math.max(1, Math.min(b.round, b.options.maxRounds)),
    kosA: kos('A'), kosB: kos('B'), leftA: left('A'), leftB: left('B'),
  };
}

/**
 * Play one game and return its entry for the match (without who is who; the match fills that in). onGame(record, battle)
 * is called with the finished fight's record when given. Nothing is built for the record otherwise.
 */
export function playGame(t, R, m, A, B, { game, replay, ambush, onGame, date }) {
  const seed = gameSeed(t, m, game, replay);
  const b = runToEnd(buildGame(t, R, A, B, seed, ambush), R);
  const label = gameLabel(m, game, replay);
  if (onGame) onGame(fightRecord(b, { source: 'tournament', label, counter: 1, date }), b);
  return { game, replay, seed, label, recordId: recordId(seed, 1), ...readResult(b) };
}

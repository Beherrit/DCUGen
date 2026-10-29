// One fight of the campaign: how it is set up (the same code builds it live and for a replay), which side is
// ambushing, running it, and writing the result back onto the teams.

import { createBattle, addCombatant, makeCombatant, runToEnd, TEAM_TACTICS } from '../battle.js';
import { addScenery } from './scenery.js';
import { teamById, fighters, terrainOf } from './war.js';
import { cellName, TERRAIN_LABELS } from './terrain.js';

/** The combatant id of member i of a team: stable, so a replay and the campaign agree. */
export const memberId = (team, i) => `${team.id}-m${i}`;

/**
 * Which side ambushes: the attacker (A) when the defender fought on the previous campaign turn or is resting in the open
 * or in a building; the defender (B) when it is resting in a park (hidden) and is attacked there; otherwise nobody.
 */
export function ambushFor(war, defender) {
  const hereIs = terrainOf(war, defender);
  if (defender.resting && hereIs === 'park') return 'B';
  if (defender.resting || defender.lastFight >= war.turn - 1) return 'A';
  return null;
}

/** The fight record to store before the fight is run: who, where, which members and what each carries in. */
export function planFight(war, attacker, defender) {
  const list = (team) => fighters(team).map(({ i, s }) => ({ i, bruises: s.bruises, fatigue: s.fatigue }));
  const n = war.battles.length + 1;
  const terrain = terrainOf(war, defender);
  return {
    n, turn: war.turn, attacker: attacker.id, defender: defender.id, cell: cellName(defender.x, defender.y), terrain,
    ambush: ambushFor(war, defender), seed: `${war.seed}::fight::${n}`,
    tactics: { A: attacker.tactic, B: defender.tactic }, a: list(attacker), b: list(defender),
  };
}

/** Rebuild the battle of a record (not yet started): the same seed, members, carry, tactics, arena and ambush. */
export function buildFightBattle(war, R, rec) {
  const A = teamById(war, rec.attacker); const B = teamById(war, rec.defender);
  const b = createBattle({ seed: rec.seed, name: `${A.name} vs ${B.name}` });
  b.options.knockback = true; // the Battle Room's defaults
  b.options.shootThrough = true;
  b.options.enclosed = rec.terrain === 'building';
  b.options.ambush = rec.ambush || null;
  b.options.teamTactics = Object.fromEntries(Object.entries(rec.tactics || {}).filter(([, id]) => id && id !== 'none' && TEAM_TACTICS[id]));
  const add = (team, letter, list) => {
    for (const { i, bruises, fatigue } of list) addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify(team.members[i])), { team: letter, id: memberId(team, i), carry: { bruises, fatigue } }));
  };
  add(A, 'A', rec.a); add(B, 'B', rec.b);
  if (!b.options.enclosed) addScenery(b, rec.terrain);
  return b;
}

/** Run a fight to the end and add what happened to the record. Returns the finished battle. */
export function playFight(war, R, rec) {
  const b = runToEnd(buildFightBattle(war, R, rec), R);
  const gone = (c) => c.out || (c.fled && !c.escaped);
  const side = (letter) => b.combatants.filter((c) => c.team === letter);
  Object.assign(rec, {
    winner: b.winner || null, rounds: Math.max(1, Math.min(b.round, b.options.maxRounds)),
    koA: side('A').filter(gone).length, koB: side('B').filter(gone).length,
  });
  return b;
}

/** Copy the outcome of a played fight onto the teams' members: who is out, and the bruises and fatigue that carry on. */
export function applyOutcome(war, b, rec) {
  for (const [team, list] of [[teamById(war, rec.attacker), rec.a], [teamById(war, rec.defender), rec.b]]) {
    for (const { i } of list) {
      const c = b.combatants.find((x) => x.id === memberId(team, i));
      if (!c) continue;
      const s = team.state[i];
      s.out = c.out || (c.fled && !c.escaped);
      s.bruises = c.bruises; s.fatigue = c.fatigue;
      team.kos += c.stats.kos;
    }
    team.fights++;
    team.lastFight = war.turn;
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tacticName = (team) => (team.tactic && team.tactic !== 'none' ? ` (${TEAM_TACTICS[team.tactic]?.label || team.tactic})` : '');

/** "Turn 3: Harbor Kings (Focus Fire) ambush Ninth Street at F7, a building (enclosed)." */
export function fightHeadline(war, rec) {
  const A = teamById(war, rec.attacker); const B = teamById(war, rec.defender);
  const place = `at ${rec.cell}, ${TERRAIN_LABELS[rec.terrain]}${rec.terrain === 'building' ? ' (enclosed)' : ''}`;
  const verb = rec.ambush === 'A' ? 'ambush' : rec.ambush === 'B' ? 'walk into an ambush by' : 'fight';
  return `Turn ${rec.turn}: ${A.name}${tacticName(A)} ${verb} ${B.name}${tacticName(B)} ${place}.`;
}

/** How it ended, in one sentence: "Harbor Kings win in 4 rounds and lose 1 fighter." */
export function fightResultLine(war, rec) {
  const A = teamById(war, rec.attacker); const B = teamById(war, rec.defender);
  if (!rec.winner) return `Nobody wins: the fight ends after ${plural(rec.rounds, 'round')} and both teams stay.`;
  const won = rec.winner === 'A' ? A : B;
  const lose = rec.winner === 'A' ? rec.koA : rec.koB;
  return `${won.name} win in ${plural(rec.rounds, 'round')} and ${lose ? `lose ${plural(lose, 'fighter')}` : 'lose no one'}.`;
}

/** The label a saved fight carries: "Turn 3: Harbor Kings ambush Ninth Street at F7". */
export function fightLabel(war, rec) {
  const A = teamById(war, rec.attacker); const B = teamById(war, rec.defender);
  const verb = rec.ambush === 'A' ? 'ambush' : rec.ambush === 'B' ? 'walk into an ambush by' : 'fight';
  return `Turn ${rec.turn}: ${A.name} ${verb} ${B.name} at ${rec.cell}`;
}

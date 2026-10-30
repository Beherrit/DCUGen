// Summon and Duplication as a utility: what a minion is worth over the rest of the fight, beside the best attack. A minion
// adds its own best attack every round it lives. The worth is its expected value against the foes, over the next few rounds,
// less the chance it goes down first (minions drop on any failed Damage check) and halved for a dazed one (a standard action
// only). A duplicate and an Active or Heroic minion act in full. More minions are worth a little less each.

import { canAct } from './conditions.js';
import { feet } from './geometry.js';
import { bestEvNow } from './odds.js';
import { makeCombatant } from './combatant.js';
import { roleWeight } from './roles.js';
import { summonsOf, summonRoom, resisted, liveSummons } from './summon.js';
import { minionOf } from './summon-build.js';
import { callSummons, issueCommand, batchSize } from './summon-run.js';

const HORIZON = 4;          // rounds a new minion is counted over
const SURVIVAL = 0.8;       // a minion may be knocked out before it has done all that
const DAZED_SHARE = 0.5;    // a dazed minion has a standard action only
const CROWD = 0.85;         // each minion already standing makes the next worth a little less

const probes = new WeakMap();

/** A stand-in for the minion a power would call, built once per fight (and kept off the saved summoner, never put in the battle). */
function probeFor(b, R, c, s) {
  const key = `${b.seed}|${s.name}|${s.rank}`;
  const mine = probes.get(c) || probes.set(c, new Map()).get(c);
  if (!mine.has(key)) mine.set(key, makeCombatant(R, minionOf(R, c, s, 0, b.seed), { id: `${c.id}-probe`, team: c.team, name: 'probe', ...(s.heroic ? { style: 'duelist' } : {}) }));
  const probe = mine.get(key);
  probe.x = c.x; probe.y = c.y;
  return probe;
}

/** The expected value of one minion of this power over the horizon, against the foes in the fight. */
function minionWorth(b, R, c, s, enemies) {
  const probe = probeFor(b, R, c, s);
  const hit = Math.max(0, ...enemies.map((e) => bestEvNow(probe, e, feet(b, c, e), 0, true)));
  const rounds = Math.max(1, Math.min(HORIZON, (b.options.maxRounds || 20) - b.round));
  return hit * rounds * SURVIVAL * (s.active ? 1 : DAZED_SHARE);
}

/** The best Summon or Duplication c could use this turn: { kind: 'summon', u, run }, or null. */
export function summonOption(b, R, c, enemies, mode) {
  if (canAct(c) === 'none' || !enemies.length) return null;
  let best = null;
  for (const s of summonsOf(c.ch)) {
    if (!summonRoom(b, c, s) || resisted(c, s)) continue;
    const n = batchSize(b, c, s);
    const crowd = CROWD ** liveSummons(b, c).length;
    const u = n * minionWorth(b, R, c, s, enemies) * crowd * roleWeight(c, 'summoner');
    if (u > 0 && (!best || u > best.u)) best = { kind: 'summon', u, run: runSummon(s, mode) };
  }
  return best;
}

function runSummon(s, mode) {
  return (b, R, c, rng) => {
    const came = callSummons(b, R, c, s, rng);
    if (came.length && mode === 'full') issueCommand(b, c); // the move action goes on the orders
  };
}

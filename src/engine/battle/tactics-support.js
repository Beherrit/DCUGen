// The roles in the Intimidate and Break and Aid the Champion tactics: who demoralizes, who the champion is, and
// how the demoralized flee.

import { alive, byId, enemiesOf } from './util.js';
import { isImpaired } from './conditions.js';
import { bestEvNow } from './odds.js';
import { feet, squares, inReach } from './geometry.js';
import { tacticOf } from './tactics-list.js';
import { pickMark } from './tactics-marks.js';
import { demoralSkill, canDemoralize } from './support-actions.js';

/** The team member with the best Intimidation (or Deception, with Taunt). */
export function demoralizerOf(b, team) {
  let best = null;
  for (const m of alive(b).filter((x) => x.team === team)) if (!best || demoralSkill(m).value > demoralSkill(best).value) best = m;
  return best;
}

/** The most threatening enemy that is not already impaired and could be demoralized. */
export const demoralizeTarget = (b, team) => pickMark(b, team, 'demo', (e) => canDemoralize(e) && !isImpaired(e));

/** The best any of c's attacks could do to one of these foes if they were in reach. */
export const potentialEv = (c, foes) => Math.max(0, ...foes.map((e) => bestEvNow(c, e, 0)));

/** The champion of Aid the Champion: the member with the highest best-attack expected value, kept for the round. Null if none. */
export function championOf(b, team) {
  const cache = ((b.tac ||= {}).champion ||= {});
  const held = cache[team];
  const heldUnit = held?.round === b.round ? byId(b, held.id) : null;
  if (heldUnit && !heldUnit.out && !heldUnit.fled) return { unit: heldUnit, ev: held.ev };
  const foes = alive(b).filter((x) => x.team !== team);
  let best = null;
  for (const m of alive(b).filter((x) => x.team === team)) {
    const ev = potentialEv(m, foes);
    if (!best || ev > best.ev) best = { id: m.id, ev, round: b.round };
  }
  cache[team] = best;
  return best && best.ev > 0 ? { unit: byId(b, best.id), ev: best.ev } : null;
}

/** The foe the champion is most likely to attack: what it can hit now, then what it could hit, then the nearest. */
export function championFoe(b, champ) {
  const key = (e) => [bestEvNow(champ, e, feet(b, champ, e), 0, inReach(b, champ, e)), bestEvNow(champ, e, 0), -squares(champ, e)];
  const scored = enemiesOf(b, champ).map((e) => ({ e, k: key(e) }));
  scored.sort((x, y) => y.k[0] - x.k[0] || y.k[1] - x.k[1] || y.k[2] - x.k[2] || x.e.id.localeCompare(y.e.id));
  return scored[0]?.e || null;
}

/** Intimidate and Break: a demoralized minion breaks half again as readily when the one who demoralized it plays that tactic. */
export function fleeChance(b, c, chance) {
  const by = byId(b, c.conditions.find((x) => x.source === 'demoralize')?.from);
  return c.minion && by && tacticOf(b, by) === 'intimidate' ? chance * 1.5 : chance;
}

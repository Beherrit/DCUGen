// Split (Hero's Handbook p132): a resisted effect that works on one target can be divided between two. The attacker picks how
// many ranks each gets (they add up to the effect's rank, at least 1 apiece) and makes one attack check, compared against
// each target; the effect works on each at its reduced rank. Each extra rank of Split allows one more target.
//
// The AI splits when two foes are in reach and the two smaller effects are worth clearly more than one big one (a big
// Damage on one foe wastes rank it did not need; Afflictions and Weaken lose less by being divided).

import { log, enemiesOf, sign } from './util.js';
import { defenseVs } from './conditions.js';
import { expectedValue } from './odds.js';
import { inRangeNow } from './geometry.js';
import { toHitMod } from './attack-roll.js';
import { critImmune } from './immunity.js';

const GAIN = 1.1; // the split must be worth this much more than the whole

/** The best way to split this attack between the target and another foe in range: { others: [{ t, rank }], first } or null. */
export function splitPlan(b, c, atk, t) {
  const ways = atk.ex?.split;
  if (!ways || !atk.roll || atk.area || atk.perception || atk.rank < 2) return null;
  const foes = enemiesOf(b, c).filter((e) => e !== t && inRangeNow(b, c, atk, e)).slice(0, ways);
  if (!foes.length) return null;
  const value = (target, rank) => expectedValue(c, { ...atk, rank }, target, { b });
  const whole = value(t, atk.rank);
  let best = null;
  const least = Math.max(1, Math.ceil(atk.rank / 3)); // no sliver for either target: each gets at least a third
  for (const e of foes) {
    for (let r1 = least; r1 <= atk.rank - least; r1++) {
      const v = value(t, r1) + value(e, atk.rank - r1);
      if (!best || v > best.v) best = { v, e, r1 };
    }
  }
  if (!best || best.v <= whole * GAIN) return null;
  return { first: best.r1, others: [{ t: best.e, rank: atk.rank - best.r1 }] };
}

/**
 * The second target of a split: it is compared against the same attack check (its own range, cover and concealment still
 * count). `land(target, roll, shift)` carries out a hit. Returns whether it landed.
 */
export function splitSecond(b, c, atk, other, r, m, aimed, land) {
  const t2 = other.t;
  const roll = r.total - r.mod; // the die as it ended up (a re-roll counts)
  const mod = toHitMod(b, c, atk, t2, m, aimed, []);
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const dc = 10 + defenseVs(t2, which, c);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  const crit = hit && !(c.minion && !t2.minion) && (roll === 20 ? total >= dc : roll >= atk.crit) && !critImmune(t2);
  const text = `${c.name} splits ${atk.name} onto ${t2.name} (rank ${other.rank}): same d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc}`;
  const dice = [{ label: 'Attack', roll, mod, total, dc }];
  if (!hit) { log(b, { kind: 'miss', actor: c.id, target: t2.id, text: `${text} — miss.`, dice }); return false; }
  return land(t2, { ...r, roll, mod, total, dcUsed: dc, hit, crit, dice, text }, other.rank - atk.rank);
}

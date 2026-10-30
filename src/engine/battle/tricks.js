// The skill tricks in a fight: which skill a feint uses (Agile Feint, Startle: Hero's Handbook p78) and what the
// target resists it with, and Set-up (p78), which hands a feint's benefit to allies. Daze is in daze.js.

import { alliesOf } from './util.js';
import { resistOf } from './conditions.js';
import { squares, squaresInMove, reachSquares, interacts } from './geometry.js';
import { expectedValue } from './odds.js';

/**
 * How c feints t: the skill it uses (Deception; Acrobatics with Agile Feint; Intimidation with Startle, whichever is
 * best), its bonus, and the bonus the target resists with. A Startle resists with Insight, Intimidation or Will.
 */
export function feintPick(c, t) {
  let name = 'Deception'; let mine = c.skills.Deception;
  if (c.adv['Agile Feint'] && c.skills.Acrobatics > mine) { name = 'Acrobatics'; mine = c.skills.Acrobatics; }
  if (c.adv.Startle && c.skills.Intimidation > mine) { name = 'Intimidation'; mine = c.skills.Intimidation; }
  const theirs = name === 'Intimidation'
    ? Math.max(t.skills.Insight, t.skills.Intimidation, resistOf(t, 'Will') ?? -99)
    : Math.max(t.skills.Insight, t.skills.Deception);
  return { name, mine, theirs };
}

/** a's best close attack on t, with its worth: only attacks a can bring to bear on its coming turn count (a move and a charge). */
export function closeBest(b, a, t) {
  let best = { atk: null, ev: 0 };
  for (const atk of a.attacks) {
    if (atk.range !== 'close' || !atk.roll) continue;
    if (squares(a, t) - reachSquares(b, a, atk) > squaresInMove(b, a) * 2) continue;
    const ev = expectedValue(a, atk, t, { dist: 0 });
    if (ev > best.ev) best = { atk, ev };
  }
  return best;
}

/**
 * Set-up: the allies a feinter hands the feint to, one per rank. They must be able to interact with the feinter, and
 * each must have a close attack worth more against the target than the feinter's own (the best go first). Empty when
 * the feinter has no Set-up or keeps the benefit.
 */
export function setUpAllies(b, c, t) {
  const ranks = c.adv['Set-up'] || 0;
  if (!ranks) return [];
  const own = closeBest(b, c, t).ev;
  return alliesOf(b, c)
    .filter((a) => !a.out && interacts(b, c, a))
    .map((a) => ({ a, ev: closeBest(b, a, t).ev }))
    .filter((x) => x.ev > Math.max(0.05, own))
    .sort((x, y) => y.ev - x.ev || x.a.id.localeCompare(y.a.id))
    .slice(0, ranks)
    .map((x) => x.a);
}

// Disarm (Hero's Handbook p176; Improved Disarm p75): an attack check at -2 (-5 with a ranged attack), then the attack's
// damage rank against the target's Strength in an opposed check. Win: the item drops and its attacks are gone.
// With a melee weapon, a loss lets the target try to disarm the attacker (its damage rank against the attacker's Strength).

import { log } from './util.js';
import { checkPenalty, defenseVs } from './conditions.js';
import { hitOdds, rangePenalty } from './odds.js';
import { attackCheck, opposedCheck, opposedOdds } from './maneuver-checks.js';
import { proneMod } from './prone.js';
import { loseItem } from './items.js';

export const DISARM_PENALTY = 2;
export const DISARM_RANGED_PENALTY = 5;

const penaltyOf = (c, atk) => (c.adv['Improved Disarm'] ? 0 : atk.kind === 'close' ? DISARM_PENALTY : DISARM_RANGED_PENALTY);
const strengthOf = (c) => (c.d.abilities.Strength ?? 0) - checkPenalty(c);
const whichOf = (atk) => (atk.kind === 'close' ? 'Parry' : 'Dodge');

export const disarmMod = (c, t, atk, dist) => atk.bonus - penaltyOf(c, atk) - checkPenalty(c) - rangePenalty(atk, dist) + proneMod(c, t, atk);

/** The chance that this attack knocks an item out of the target's hands. */
export function disarmOdds(c, t, atk, dist) {
  return hitOdds(disarmMod(c, t, atk, dist), defenseVs(t, whichOf(atk), c)).hit * opposedOdds(atk.rank, strengthOf(t));
}

/** The loser of a disarm with a melee weapon is open to a counter: the target's best close damage rank against the attacker's Strength. */
function counterDisarm(b, c, atk, t, rng) {
  const rank = Math.max(0, ...t.attacks.filter((a) => a.kind === 'close' && a.roll).map((a) => a.rank));
  const back = opposedCheck(rng, rank, strengthOf(c));
  if (back.won) loseItem(c, atk.item);
  log(b, { kind: back.won ? 'condition' : 'resist', actor: t.id, target: c.id, text: `${t.name} tries to disarm ${c.name} in return (damage ${rank} against Strength): ${back.text} — ${back.won ? `${c.name} drops the ${atk.item.name}` : 'it holds on'}.`, dice: back.dice, important: back.won });
}

/** c disarms t of `item` with `atk`; c is in range for it. */
export function disarm(b, c, atk, t, item, rng, dist) {
  c.stats.attacks++;
  const improved = !!c.adv['Improved Disarm'];
  const check = attackCheck(c, t, rng, whichOf(atk), disarmMod(c, t, atk, dist));
  const lead = `${c.name} tries to disarm ${t.name} of the ${item.name}${improved ? ' (Improved Disarm)' : ` at -${penaltyOf(c, atk)}`}: ${check.text}`;
  if (!check.hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${lead} — miss.`, dice: check.dice }); return; }
  c.stats.hits++;
  const duel = opposedCheck(rng, atk.rank, strengthOf(t));
  const detail = `${lead} — hit. Damage ${atk.rank} against Strength, ${duel.text}`;
  const dice = [...check.dice, ...duel.dice];
  if (duel.won) {
    loseItem(t, item);
    const snatch = atk.unarmed ? ` ${c.name} may snatch it up as a free action.` : '';
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${detail}: the ${item.name} is knocked from ${t.name}'s hands, and its attacks are gone.${snatch}`, dice, important: true });
    return;
  }
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${detail}: ${t.name} keeps hold of it.`, dice });
  if (atk.kind === 'close' && atk.item && !improved) counterDisarm(b, c, atk, t, rng);
}

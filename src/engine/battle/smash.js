// Smash (Hero's Handbook p177; Improved Smash p75): an attack on an object held or worn by an opponent, against the
// holder's defense with a -5 penalty (printed page 177: "a -5 circumstance penalty if you are attacking a held object"),
// then the object's Toughness check against the damage (p94). Two degrees of failure break it and three or more destroy
// it; either way its attacks are gone. The holder defends the object, so a hit on it is not an automatic critical.

import { sign, log } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { checkPenalty, defenseVs } from './conditions.js';
import { hitOdds, rangePenalty, resistOdds } from './odds.js';
import { attackCheck } from './maneuver-checks.js';
import { proneMod } from './prone.js';
import { loseItem } from './items.js';

export const SMASH_PENALTY = 5;

const whichOf = (atk) => (atk.kind === 'close' ? 'Parry' : 'Dodge');
const dcOf = (atk) => 15 + atk.rank;

export const smashMod = (c, t, atk, dist) => atk.bonus - (c.adv['Improved Smash'] ? 0 : SMASH_PENALTY) - checkPenalty(c) - rangePenalty(atk, dist) + proneMod(c, t, atk);

/** The chance that this attack hits the held item and breaks it (two or more degrees on the item's Toughness check). */
export function breakOdds(c, t, atk, item, dist) {
  const odds = resistOdds(item.toughness, dcOf(atk));
  return hitOdds(smashMod(c, t, atk, dist), defenseVs(t, whichOf(atk), c)).hit * (odds[2] + odds[3] + odds[4]);
}

/** c smashes the `item` t is holding or wearing, with `atk`. */
export function smash(b, c, atk, t, item, rng, dist) {
  c.stats.attacks++;
  const improved = !!c.adv['Improved Smash'];
  const check = attackCheck(c, t, rng, whichOf(atk), smashMod(c, t, atk, dist));
  const lead = `${c.name} smashes at the ${item.name} in ${t.name}'s grip${improved ? ' (Improved Smash)' : ` at -${SMASH_PENALTY}`}: ${check.text}`;
  if (!check.hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${lead} — miss.`, dice: check.dice }); return; }
  c.stats.hits++;
  const dc = dcOf(atk);
  const r = rollCheck(rng, item.toughness, dc);
  const { roll, total, fails } = r;
  const dice = [...check.dice, { label: 'Toughness check', roll, mod: item.toughness, total, dc }];
  const detail = `${lead} — hit. The ${item.name} resists Damage ${atk.rank}: Toughness d20 ${roll} ${sign(item.toughness)} = ${total} vs DC ${dc}${critNote(r)}`;
  if (fails >= 2) {
    loseItem(t, item);
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${detail} — ${fails >= 3 ? 'destroyed' : 'broken'} (${fails} degrees), and its attacks are gone.`, dice, important: true });
    return;
  }
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${detail} — ${fails ? 'scarred but still works (1 degree)' : 'holds'}.`, dice });
}

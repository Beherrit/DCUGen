// Trip (Hero's Handbook p177; Improved Trip p77): a close attack against Parry at -2, then an opposed check of
// Acrobatics or Athletics (whichever is better on each side). Win: the target is prone. Lose: the target gets a
// check to trip the attacker. Improved Trip has no penalty and no counter, and the attacker picks the target's weaker skill.

import { log } from './util.js';
import { checkPenalty, defenseVs } from './conditions.js';
import { hitOdds } from './odds.js';
import { closeBonus, attackCheck, contest } from './maneuver-checks.js';
import { opposedOdds } from './checks.js';
import { makeProne, proneMod } from './prone.js';
import { plainFx, hurt } from './fortune.js';
import { stanceDefense } from './mods-martial.js';

export const TRIP_PENALTY = 2;
const CLOSE = { kind: 'close' };

const skillOf = (c) => Math.max(c.skills.Acrobatics, c.skills.Athletics) - checkPenalty(c);

/** What the target rolls to stay up: its better skill, or its weaker one against Improved Trip. */
function defendWith(c, t) {
  const pair = [t.skills.Acrobatics, t.skills.Athletics];
  return (c.adv['Improved Trip'] ? Math.min(...pair) : Math.max(...pair)) - checkPenalty(t) + stanceDefense(t, 'trip'); // Low, Grounded (+) and High (-) stances
}

const tripMod = (c, t) => closeBonus(c) - (c.adv['Improved Trip'] ? 0 : TRIP_PENALTY) - checkPenalty(c) + proneMod(c, t, CLOSE);

/** The chance that a trip puts the target on the ground: the attack hits, then the opposed check is won. */
export function tripOdds(c, t) {
  return hitOdds(tripMod(c, t), defenseVs(t, 'Parry', c)).hit * opposedOdds(skillOf(c), defendWith(c, t));
}

/** The target is to be tripped by c, who is within reach of it. */
export function trip(b, c, t, rng) {
  c.stats.attacks++;
  const improved = !!c.adv['Improved Trip'];
  const check = attackCheck(c, t, rng, 'Parry', tripMod(c, t));
  const lead = `${c.name} tries to trip ${t.name}${improved ? ' (Improved Trip)' : ` at -${TRIP_PENALTY}`}: ${check.text}`;
  if (!check.hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${lead} — miss.`, dice: check.dice }); return; }
  c.stats.hits++;
  const duel = contest(rng, skillOf(c), defendWith(c, t), null, plainFx(b, t, 'trip resistance', () => hurt(t)));
  const dice = [...check.dice, ...duel.dice];
  if (duel.won) {
    makeProne(t, c, 'trip', 'tripped');
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${lead} — hit. Acrobatics or Athletics ${duel.text}: ${t.name} is thrown to the ground, PRONE.`, dice, important: true });
    return;
  }
  const tail = improved ? '' : ` and tries to throw ${c.name} in return`;
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${lead} — hit. Acrobatics or Athletics ${duel.text}: ${t.name} keeps its feet${tail}.`, dice });
  if (improved) return;
  const back = contest(rng, skillOf(t), skillOf(c));
  if (back.won) makeProne(c, t, 'trip', 'tripped');
  log(b, { kind: back.won ? 'condition' : 'resist', actor: t.id, target: c.id, text: `${t.name}'s counter-trip: ${back.text} — ${back.won ? `${c.name} is thrown to the ground, PRONE` : `${c.name} stays up`}.`, dice: back.dice, important: back.won });
}

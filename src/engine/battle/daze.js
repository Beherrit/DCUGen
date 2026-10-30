// Daze (Hero's Handbook p73): a Deception or Intimidation check as a standard action against the target's best of the
// same skill, Insight or Will defense. Win: the target is dazed (a single standard action) until the end of its next
// turn, which is how long the dazed condition lasts in this engine. Each skill is its own rank of the advantage.

import { sign, log, alliesOf } from './util.js';
import { activeConditions, checkPenalty, resistOf } from './conditions.js';
import { opposedCheck, opposedNote, opposedOdds } from './checks.js';
import { inEarshot } from './geometry.js';
import { plainFx, hurt } from './fortune.js';
import { ownValue, potentialEv } from './tactics-support.js';

/** Worth a Daze: the target is still up and not already limited, and has a Will defense to resist with. */
export function canDaze(t) {
  const s = activeConditions(t);
  return !t.out && !t.fled && !t.dazed && !t.staggered && !s.has('Stunned') && !s.has('Unaware') && resistOf(t, 'Will') !== null;
}

/** What the target resists a Daze with: the same skill, Insight, or Will, whichever is best. */
export function dazeResistance(t, skill) {
  return Math.max(t.skills[skill] - checkPenalty(t), t.skills.Insight - checkPenalty(t), resistOf(t, 'Will'));
}

/** The skill c should Daze t with (the one it is likeliest to win with), or null if it has none. */
export function dazeSkillFor(c, t) {
  let best = null; let bestOdds = -1;
  for (const skill of c.dazeSkills || []) {
    const odds = opposedOdds(c.skills[skill] - checkPenalty(c), dazeResistance(t, skill));
    if (odds > bestOdds) { best = skill; bestOdds = odds; }
  }
  return best ? { skill: best, odds: bestOdds } : null;
}

/** c Dazes t with the skill. Returns true when the target is dazed. */
export function daze(b, c, t, rng, skill) {
  const mine = c.skills[skill] - checkPenalty(c);
  const theirs = dazeResistance(t, skill);
  const duel = opposedCheck(rng, { bonus: mine, fx: plainFx(b, c, 'Daze check', () => false) }, { bonus: theirs, fx: plainFx(b, t, 'Daze resistance', () => hurt(t)) });
  const [r1, r2] = duel.rolls;
  const ok = duel.winner === 'a';
  if (ok) t.dazed = true;
  const check = `${skill} d20 ${r1} ${sign(mine)} = ${duel.totals.a} vs resistance d20 ${r2} ${sign(theirs)} = ${duel.totals.b}${opposedNote(duel)}`;
  log(b, { kind: ok ? 'condition' : 'miss', actor: c.id, target: t.id, text: `${c.name} tries to daze ${t.name}: ${check} — ${ok ? `${t.name} is DAZED (a single standard action) until the end of ${c.name}'s next round` : 'they shake it off'}.`, dice: [{ label: 'Daze', roll: r1, mod: mine, total: duel.totals.a, dc: duel.totals.b }], important: ok });
  return ok;
}

const DANGER = 0.25; // the foe could do this much harm to the team: worth slowing down
const EVEN = 0.5;    // the odds of winning the Daze it takes

/**
 * Daze instead of the usual plan: the fighter's own attack is poor, and a foe within earshot that is dangerous to the
 * team could be slowed with at least even odds. True when the turn was used.
 */
export function dazeByChoice(b, c, choice, enemies, rng) {
  if (!c.dazeSkills?.length || ownValue(choice) >= 0.5) return false;
  const team = [c, ...alliesOf(b, c)];
  const picks = enemies
    .filter((e) => inEarshot(b, c, e) && canDaze(e))
    .map((e) => ({ e, how: dazeSkillFor(c, e), danger: potentialEv(e, team) }))
    .filter((x) => x.how && x.how.odds >= EVEN && x.danger >= DANGER)
    .sort((x, y) => y.danger - x.danger || x.e.id.localeCompare(y.e.id));
  if (!picks.length) return false;
  daze(b, c, picks[0].e, rng, picks[0].how.skill);
  return true;
}

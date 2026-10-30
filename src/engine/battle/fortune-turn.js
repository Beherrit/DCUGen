// The turn actions that spend fortune: recovering from fatigue with a hero point (Hero's Handbook p20), Leadership and
// Inspire (p76-77). Each is a small decision that the turn code calls; the spending rules for re-rolls are in fortune.js.

import { log, alliesOf, enemiesOf } from './util.js';
import { STYLES } from './styles.js';
import { interacts } from './geometry.js';
import { hasPoint } from './fortune.js';
import { spendHeroPoint } from './support.js';
import { tacticOf } from './tactics-list.js';
import { ownValue, potentialEv } from './tactics-support.js';

/**
 * At the start of a turn: a hero point takes away fatigue, or turns exhausted into fatigued, without an action (p20).
 * Exhausted fighters always do; a merely fatigued one does only if it fights up close, where hindered movement hurts.
 */
export function recoverFatigue(b, c) {
  if (!hasPoint(b, c) || c.minion || c.fatigue < 1) return false;
  const S = STYLES[c.style];
  if (c.fatigue === 1 && S.close < S.ranged) return false;
  return spendHeroPoint(b, c, 'fatigue');
}

/** The stun on a fighter that a hero point can lift: not a surprise (it ends by itself) and not one that put the fighter out. */
const stunOf = (a) => (a.out ? null : a.conditions.find((x) => x.name === 'Stunned' && x.source !== 'surprise' && x.degree <= 2));

/** What Leadership could take off this ally, worst first: stunned, dazed (not while staggered), fatigued (only when asked for). */
function problemOf(a, withFatigue) {
  if (stunOf(a)) return 'stunned';
  if (a.dazed && !a.staggered) return 'dazed';
  if (withFatigue && a.fatigue === 1) return 'fatigued';
  return null;
}
const ORDER = ['stunned', 'dazed', 'fatigued'];

/** Leadership: take the condition off the ally. */
function rally(b, c, a, problem) {
  if (problem === 'stunned') { const s = stunOf(a); a.conditions = a.conditions.filter((x) => x.source !== s.source); }
  else if (problem === 'dazed') a.dazed = false;
  else a.fatigue = 0;
  c.heroPoints--;
  log(b, { kind: 'hero', actor: c.id, target: a.id, text: `${c.name} spends a hero point to rally ${a.name} (Leadership): no longer ${problem} (${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left).`, important: true });
}

/**
 * Leadership (a standard action and a hero point): lift stunned, dazed or fatigued from an ally within interaction range.
 * The AI does it when an ally is stunned or dazed and its own attack is worth less than that ally's; a Sustain team also
 * rallies fatigued allies, and always. True when the turn was used.
 */
export function leadershipTurn(b, c, choice, enemies) {
  if (!c.adv.Leadership || !hasPoint(b, c)) return false;
  const sustain = tacticOf(b, c) === 'sustain';
  const own = ownValue(choice);
  const picks = alliesOf(b, c)
    .filter((a) => interacts(b, c, a))
    .map((a) => ({ a, problem: problemOf(a, sustain), worth: potentialEv(a, enemies) }))
    .filter((x) => x.problem && (sustain || x.worth > own))
    .sort((x, y) => ORDER.indexOf(x.problem) - ORDER.indexOf(y.problem) || y.worth - x.worth || x.a.id.localeCompare(y.a.id));
  if (!picks.length) return false;
  rally(b, c, picks[0].a, picks[0].problem);
  return true;
}

/** How well a team is doing: its fighters still up, less what their wounds have cost. */
function strength(members) {
  return members.reduce((s, m) => s + 1 - (m.staggered ? 0.3 : 0) - 0.15 * Math.min(3, m.bruises), 0);
}

/**
 * Inspire (a standard action and a hero point, once a fight): allies within interaction range get +1 per rank on all
 * checks until the start of the inspirer's next turn. The AI does it on its first round, or when its side is losing,
 * with at least two allies to inspire. True when the turn was used.
 */
export function inspireTurn(b, c) {
  if (!c.adv.Inspire || c.inspireUsed || !hasPoint(b, c)) return false;
  const near = alliesOf(b, c).filter((a) => interacts(b, c, a));
  if (near.length < 2) return false;
  const foes = enemiesOf(b, c);
  const losing = strength([c, ...alliesOf(b, c)]) < strength(foes);
  if (b.round > 1 && !losing) return false;
  const bonus = Math.min(5, c.adv.Inspire);
  for (const a of near) if (!a.inspired || a.inspired.bonus < bonus) a.inspired = { by: c.id, bonus, round: b.round };
  c.heroPoints--; c.inspireUsed = true;
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point to inspire ${near.map((a) => a.name).join(', ')} (Inspire ${c.adv.Inspire}): +${bonus} on all checks until the start of ${c.name}'s next round (${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left).`, important: true });
  return true;
}

/** At the start of c's turn: the inspiration it gave lapses, and any whose giver never got another turn is over after two rounds. */
export function expireInspire(b, c) {
  for (const x of b.combatants) if (x.inspired && (x.inspired.by === c.id || x.inspired.round < b.round - 1)) x.inspired = null;
}

/** Inspire first, then Leadership. True when the fighter used its turn on either. */
export function fortuneTurn(b, c, choice, enemies) {
  return inspireTurn(b, c) || leadershipTurn(b, c, choice, enemies);
}

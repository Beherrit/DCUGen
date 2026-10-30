// The attack roll: how the attack is worded, the to-hit modifier, the roll against defense (a Defend or a Deflect may raise it),
// Luck Control forcing a hit to be re-rolled, and the hero point re-roll of a miss (which Luck Control may grant or negate).

import { sign, d20 } from './util.js';
import { activeConditions, checkPenalty, defenseVs, feintedBy, useFeint, aidBonus, weakenedAttack } from './conditions.js';
import { rangePenalty, concealmentPenalty, hitOdds } from './odds.js';
import { feet } from './geometry.js';
import { proneMod } from './prone.js';
import { coverPenalty, coverLevel, shieldFor } from './cover.js';
import { ultimateAim } from './fortune.js';
import { payReroll } from './points.js';
import { assistReroll } from './luck.js';
import { wantsReroll, negatesReroll, forcesHit } from './luck-attack.js';
import { deflectAgainst, deflectCovers } from './deflect.js';
import { critImmune } from './immunity.js';
import { opposingBonus } from './style-bonus.js';

const VERBS = {
  brawler: ['swings at', 'hammers', 'slams', 'pounds on'], duelist: ['cuts at', 'strikes at', 'lunges at', 'snaps a strike at'],
  gunner: ['opens fire on', 'lines up', 'squeezes off a shot at', 'levels a weapon at'], blaster: ['unleashes', 'blasts', 'fires', 'lets fly'],
  mage: ['casts', 'weaves', 'hurls', 'invokes'], mentalist: ['reaches into the mind of', 'lashes out at', 'presses on', 'focuses on'],
  tank: ['charges', 'crashes into', 'smashes at', 'bears down on'], speedster: ['streaks past', 'blitzes', 'darts in on', 'strikes in a blur at'],
  support: ['targets', 'attacks', 'turns on', 'moves against'], beast: ['lunges at', 'tears at', 'snaps at', 'claws at'],
  minion: ['takes a shot at', 'goes after', 'rushes', 'swings at'], omni: ['reconfigures and strikes', 'shifts form and hits', 'unleashes', 'turns'],
};
// Styles whose verbs only fit a blow; their ranged attacks use these instead.
const MELEE_STYLES = ['brawler', 'duelist', 'tank', 'speedster', 'beast'];
const RANGED_VERBS = ['hurls', 'throws', 'flings', 'lets fly with'];

export function attackVerb(c, atk, t, rng) {
  const ranged = atk.range !== 'close' && MELEE_STYLES.includes(c.style);
  const v = rng.pick(ranged ? RANGED_VERBS : VERBS[c.style] || VERBS.brawler);
  if (ranged || c.style === 'blaster' || c.style === 'mage' || c.style === 'omni') return `${v} ${atk.name} at ${t.name}`;
  if (atk.unarmed) return `${v} ${t.name}`;
  return `${v} ${t.name} with ${atk.name}`;
}

/** Minions don't crit non-minions (DCA 175), and a routine attack never crits. */
const critOk = (c, t, routine) => !(c.minion && !t.minion) && !routine;

/** Finishing attack (p178): against a defenseless target the check is routine (it hits) or rolled for a critical. Routine only when the bonus is so low that a roll would often miss. */
const ROUTINE_BELOW = 0.7;
function finishingRoutine(c, t, mod, dcUsed) {
  if (10 + mod < dcUsed) return false;
  return !critOk(c, t, false) || hitOdds(mod, dcUsed - 10).hit < ROUTINE_BELOW;
}

/** The to-hit modifier: the attack bonus, trade-offs, conditions, range, concealment and cover. Adds notes for the last two. */
export function toHitMod(b, c, atk, t, m, aimed, notes) {
  const dist = feet(b, c, t);
  const conceal = concealmentPenalty(c, t, atk);
  const cover = coverPenalty(b, c, t, atk);
  const aid = aidBonus(c, t);
  const range = rangePenalty(atk, dist);
  const hurt = checkPenalty(c);
  const prone = proneMod(c, t, atk);
  const weak = weakenedAttack(c, atk).bonus;
  let mod = atk.bonus - m.trade + m.allOut - m.defensive - hurt - range - conceal - cover - (m.charge ? 2 : 0) + aimed + aid - weak + (m.bonus || 0);
  mod += prone + (c.envAttack || 0);
  const opposing = opposingBonus(c, t); // a foe in the style the fighter has studied against (style-bonus.js)
  if (opposing.n) { mod += opposing.n; notes.push(`Opposing Style (${opposing.style}): +${opposing.n}`); }
  if (c.envAttack) notes.push(`favored environment: +${c.envAttack}`);
  // Every penalty the attacker carries is named, so a low bonus in the log can be traced
  if (range) notes.push(`${range >= 5 ? 'long' : 'medium'} range: −${range}`);
  if (hurt) notes.push(hurt > 0 ? `${c.name} is impaired: −${hurt}` : `inspired: +${-hurt}`); // checkPenalty nets Impaired or Disabled against Inspire
  if (prone) notes.push(`prone: ${prone > 0 ? '+' : '−'}${Math.abs(prone)}`);
  if (weak) notes.push(`weakened: −${weak}`);
  for (const [src, n] of Object.entries(atk.bn || {})) notes.push(`${src}: ${n > 0 ? '+' : '−'}${Math.abs(n)}`); // stance, Student and style bonuses already in the attack bonus
  if (atk.flaws?.inaccurate) notes.push(`Inaccurate: −${2 * atk.flaws.inaccurate} (already in the bonus)`);
  if (aid) notes.push(`aid: +${aid}`);
  if (conceal) notes.push(`${conceal === 5 ? 'total' : 'partial'} concealment: −${conceal}`);
  if (cover) notes.push(`${coverLevel(shieldFor(b, c, atk, t))} cover: −${cover}`);
  return mod;
}

/**
 * Roll to hit: d20 against the defense, with the target's Defend roll, routine attacks on minions, and the hero
 * point re-roll of a miss. m holds the trade-offs { trade, allOut, defensive, charge }. Returns the outcome and the log text so far.
 */
export function rollToHit(b, c, atk, t, rng, m, aimed, notes) {
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const def = defenseVs(t, which, c);
  const mod = toHitMod(b, c, atk, t, m, aimed, notes);
  // Defend (DCA 175): the target rolls its defense instead of the flat 10; a 10 or less counts as +10. Deflect's rank stands in for the defense when it is higher.
  let dcUsed = 10 + def;
  if (t.defending) {
    const r = d20(rng); const defRoll = r <= 10 ? r + 10 : r;
    const imp = t.adv['Improved Defense'] ? 2 : 0;
    const base = t.deflecting && deflectCovers(t, atk) ? Math.max(def, t.deflect.rank) : def;
    dcUsed = defRoll + base + imp;
    notes.push(`${t.name} is defending: d20 ${r}${r <= 10 ? ' (+10)' : ''} + ${base}${base !== def ? ' (Deflect)' : ''}${imp ? ' + 2 (Improved Defense)' : ''} = ${dcUsed}`);
  }
  const deflect = deflectAgainst(b, atk, t, rng, dcUsed, notes);
  if (deflect) dcUsed = deflect.dc;
  // Against a minion, a non-minion can take the attack as a routine check (DCA 175): no roll when 10 does it.
  const finishing = atk.kind === 'close' && activeConditions(t).has('Defenseless');
  const routine = finishing ? finishingRoutine(c, t, mod, dcUsed) : t.minion && !c.minion && !t.defending && 10 + mod >= dcUsed;
  // Ultimate Effort (p79): a roll of 20 that is not a natural 20, so it is no automatic hit and no critical.
  const ultimate = !routine && ultimateAim(b, c, t, mod, dcUsed);
  let roll = ultimate ? 20 : routine ? 10 : d20(rng);
  const missMax = 1 + (atk.flaws?.uncertain || 0); // Uncertain (MA 98): the critical miss range grows by a rank
  let v = judge(roll, mod, dcUsed, routine, ultimate, missMax);
  // Luck Control: an enemy controller can make a hit that matters be re-rolled at the worse of the two.
  const forced = v.hit && !routine && !ultimate ? forcesHit(b, c, atk, t, rng, { roll, mod, dcUsed }) : null;
  if (forced) { notes.push(`Luck Control forced the roll from ${roll} to ${forced.roll}`); roll = forced.roll; v = judge(roll, mod, dcUsed, routine, ultimate, missMax); }
  const { total, hit } = v;
  if (missMax > 1 && roll > 1 && roll <= missMax && !routine) notes.push(`Uncertain: a natural ${roll} is a critical miss`);
  // A natural 20 always hits, but is a critical only if the total also reaches the defense (DCA 172).
  const crit = !ultimate && critOk(c, t, routine) && hit && (roll === 20 ? total >= dcUsed : roll >= atk.crit);
  const dice = routine ? [] : [{ label: 'Attack', roll, mod, total, dc: dcUsed }];
  let text = routine
    ? `${c.name} ${attackVerb(c, atk, t, rng)}: ${finishing ? 'finishing attack as a routine check' : 'routine attack against a minion'}, ${10 + mod} vs ${which} DC ${dcUsed}`
    : `${c.name} ${attackVerb(c, atk, t, rng)}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} ${t.defending ? '' : 'DC '}${dcUsed}${finishing ? ' (finishing attack)' : ''}`;
  if (feintedBy(t, c)) { text += ` (${t.feinted.why || 'feinted'}: vulnerable to this attack)`; useFeint(t, c); }
  const out = { roll, total, mod, hit, crit, dice, text, dcUsed, which, deflect };
  if (!hit && !ultimate && wantsReroll(b, c, t, roll, rng)) rerollMiss(b, c, atk, t, rng, out, routine);
  if (activeConditions(t).has('Defenseless') && out.hit && critOk(c, t, routine)) out.crit = true;
  if (out.crit && critImmune(t)) { out.crit = false; out.text += ` (a critical threat, but ${t.name} is immune to critical hits: a normal hit)`; }
  return out;
}

/** The total and whether it hits. A routine attack always hits, a natural 20 always hits, a natural 1 never does. */
function judge(roll, mod, dcUsed, routine, ultimate, missMax = 1) {
  const total = roll + mod;
  return { total, hit: routine || (roll === 20 && !ultimate) || (roll > missMax && total >= dcUsed) };
}

/** Luck, a hero point or an ally's grant: re-roll a miss and take the better; 1-10 on the re-roll counts +10 (DCA 21, 77). An enemy's Luck Control can waste it. */
function rerollMiss(b, c, atk, t, rng, out, routine) {
  const { roll, mod, dcUsed } = out;
  const how = payReroll(b, c) ?? assistReroll(b, c, 'attack roll');
  if (!how) return;
  if (negatesReroll(b, c, t, out)) {
    out.text += `. Miss! ${c.name} ${how === 'Luck' ? 'uses Luck' : how === 'granted' ? 'is granted a re-roll' : 'spends a hero point'} to re-roll, but it is negated`;
    return;
  }
  const r2 = d20(rng);
  const r2b = r2 <= 10 ? r2 + 10 : r2;
  const better = Math.max(roll, r2b);
  out.total = better + mod;
  out.hit = r2 === 20 || out.total >= dcUsed;
  out.crit = critOk(c, t, routine) && out.hit && (r2 === 20 ? out.total >= dcUsed : better >= atk.crit);
  out.dice.push({ label: 'Hero point re-roll', roll: r2b, mod, total: out.total, dc: dcUsed });
  out.text += `. Miss! ${c.name} ${how === 'Luck' ? 'uses Luck' : how === 'granted' ? 'takes the granted re-roll' : 'spends a hero point'} to re-roll: ${r2}${r2 <= 10 ? ' (+10, below 11)' : ''} ${sign(mod)} = ${out.total}`;
}

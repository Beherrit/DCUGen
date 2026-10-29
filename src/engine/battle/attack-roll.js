// The attack roll: how the attack is worded, the to-hit modifier, the roll against defense, and the hero point re-roll.

import { sign, d20 } from './util.js';
import { activeConditions, checkPenalty, defenseVs, feintedBy, aidBonus } from './conditions.js';
import { rangePenalty, concealmentPenalty } from './odds.js';
import { spendOnMiss } from './tactics.js';
import { coverPenalty, coverLevel, shieldFor } from './cover.js';

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
  const ranged = atk.kind !== 'close' && MELEE_STYLES.includes(c.style);
  const v = rng.pick(ranged ? RANGED_VERBS : VERBS[c.style] || VERBS.brawler);
  if (ranged || c.style === 'blaster' || c.style === 'mage' || c.style === 'omni') return `${v} ${atk.name} at ${t.name}`;
  if (atk.unarmed) return `${v} ${t.name}`;
  return `${v} ${t.name} with ${atk.name}`;
}

/** Minions don't crit non-minions (DCA 175), and a routine attack never crits. */
const critOk = (c, t, routine) => !(c.minion && !t.minion) && !routine;

/** The to-hit modifier: the attack bonus, trade-offs, conditions, range, concealment and cover. Adds notes for the last two. */
function toHitMod(b, c, atk, t, m, aimed, notes) {
  const dist = Math.abs(c.pos - t.pos);
  const conceal = concealmentPenalty(c, t, atk);
  const cover = coverPenalty(b, c, t, atk);
  const aid = aidBonus(c, t);
  let mod = atk.bonus - m.trade + m.allOut - m.defensive - checkPenalty(c) - rangePenalty(atk, dist) - conceal - cover - (m.charge ? 2 : 0) + aimed + aid;
  const tc = activeConditions(t); const cc = activeConditions(c);
  if (tc.has('Prone')) mod += atk.kind === 'close' ? 5 : -5;
  if (cc.has('Prone') && atk.kind === 'close') mod -= 5;
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
  // Defend (DCA 175): the target rolls its defense instead of the flat 10; a 10 or less counts as +10.
  let dcUsed = 10 + def;
  if (t.defending) {
    const r = d20(rng); const defRoll = r <= 10 ? r + 10 : r;
    dcUsed = defRoll + def;
    notes.push(`${t.name} is defending: d20 ${r}${r <= 10 ? ' (+10)' : ''} + ${def} = ${dcUsed}`);
  }
  // Against a minion, a non-minion can take the attack as a routine check (DCA 175): no roll when 10 does it.
  const routine = t.minion && !c.minion && !t.defending && 10 + mod >= dcUsed;
  const roll = routine ? 10 : d20(rng);
  const total = roll + mod;
  const hit = routine || roll === 20 || (roll !== 1 && total >= dcUsed);
  // A natural 20 always hits, but is a critical only if the total also reaches the defense (DCA 172).
  const crit = critOk(c, t, routine) && hit && (roll === 20 ? total >= dcUsed : roll >= atk.crit);
  const dice = routine ? [] : [{ label: 'Attack', roll, mod, total, dc: dcUsed }];
  let text = routine
    ? `${c.name} ${attackVerb(c, atk, t, rng)}: routine attack against a minion, ${10 + mod} vs ${which} DC ${dcUsed}`
    : `${c.name} ${attackVerb(c, atk, t, rng)}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} ${t.defending ? '' : 'DC '}${dcUsed}`;
  if (feintedBy(t, c)) { text += ' (feinted: vulnerable to this attack)'; t.feinted = null; }
  const out = { roll, total, mod, hit, crit, dice, text, dcUsed, which };
  if (!hit && b.options.heroPoints && c.heroPoints > 0 && roll !== 1 && (c.style !== 'minion') && (spendOnMiss(b, c) || t.staggered || c.staggered || rng.chance(0.5))) rerollMiss(c, atk, t, rng, out, routine);
  if (activeConditions(t).has('Defenseless') && out.hit && critOk(c, t, routine)) out.crit = true;
  return out;
}

/** Hero point: re-roll a miss and take the better; 1-10 on the re-roll counts +10 (DCA 21). */
function rerollMiss(c, atk, t, rng, out, routine) {
  const { roll, mod, dcUsed } = out;
  c.heroPoints--;
  const r2 = d20(rng);
  const r2b = r2 <= 10 ? r2 + 10 : r2;
  const better = Math.max(roll, r2b);
  out.total = better + mod;
  out.hit = r2 === 20 || out.total >= dcUsed;
  out.crit = critOk(c, t, routine) && out.hit && (r2 === 20 ? out.total >= dcUsed : better >= atk.crit);
  out.dice.push({ label: 'Hero point re-roll', roll: r2b, mod, total: out.total, dc: dcUsed });
  out.text += `. Miss! ${c.name} spends a hero point to re-roll: ${r2}${r2 <= 10 ? ' (+10, below 11)' : ''} ${sign(mod)} = ${out.total}`;
}

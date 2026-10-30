// Fortune in a fight (Hero's Handbook p20 and p77-79): hero points and Luck spent to improve a fighter's own roll, and
// Ultimate Effort. checks.js asks the hook built here (`fx`) for a better roll when a check has failed, or for a fixed
// roll of 20 before the die is thrown. Which checks are worth the spend is decided by small `matters` rules per kind.
// The turn actions that use fortune (Leadership, Inspire, recovering) are in fortune-turn.js, Heroic Feat in feat.js.
//
// - Improve Roll: re-roll and keep the better; a re-roll of 1 to 10 counts +10 (so it lands on 11 to 20).
// - Luck: the same, once per round, up to its rank in times a fight, and it is spent before a hero point.
// - Ultimate Effort: a hero point turns one named kind of check into a roll of 20 that is not a natural 20.

import { log, d20, alive } from './util.js';
import { fortuneOn, hasPoint, luckReady, canReroll, payReroll } from './points.js';
import { assistReady, assistReroll, forceWorse } from './luck.js';
import { checkResult } from './checks.js';
import { SEVERITY, resistOf } from './conditions.js';
import { dcOf, resistOdds, hitOdds } from './odds.js';
import { alphaNow } from './tactics-list.js';

export { fortuneOn, hasPoint, luckReady, canReroll, payReroll };
const ultimateReady = (b, c, kind) => hasPoint(b, c) && !!c.ultimate?.includes(kind);

/** The better of the first roll and a re-roll, where 1 to 10 on the re-roll count +10. Returns { roll, natural, second } (`second` is the die as thrown). */
export function improvedRoll(rng, first, firstNatural = first === 20) {
  const second = d20(rng);
  const counted = second <= 10 ? second + 10 : second;
  if (counted > first) return { roll: counted, natural: second === 20, second };
  return { roll: first, natural: firstNatural || (counted === first && second === 20), second };
}

/** What is left after a spend, for the log. */
const leftOf = (how, c) => (how === 'Luck' ? `${c.luck} Luck left` : `${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left`);

/** Re-roll a failed check when it matters and a re-roll could plausibly fix it. */
function improveRoll(b, c, rng, info, label, matters) {
  // The re-roll lands between 11 and 20, so a check that needs more than 15 on the die is not worth the spend.
  if (info.dc - info.bonus > 15 || info.roll >= 20 || !matters(info)) return null;
  const how = payReroll(b, c) ?? assistReroll(b, c, label);
  if (!how) return null;
  const r = improvedRoll(rng, info.roll, info.roll === 20);
  const kept = r.roll === info.roll ? 'keeps the first' : `takes ${r.roll}`;
  const verb = how === 'Luck' ? 'uses Luck' : how === 'granted' ? 'takes the granted re-roll' : 'spends a hero point';
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} ${verb} to re-roll the ${label}: d20 ${info.roll}, then ${r.second}${r.second <= 10 ? ' (+10, below 11)' : ''} — ${kept} (${how === 'granted' ? 'granted by Luck Control' : leftOf(how, c)}).`, important: true });
  return r;
}

/** The chance (0 to 1) that a die roll fails in a way that matters. */
function badChance(bonus, dc, matters) {
  let n = 0;
  for (let roll = 1; roll <= 20; roll++) {
    const r = checkResult(roll, bonus, dc);
    if (!r.success && matters({ ...r, roll, bonus, fails: r.degrees })) n++;
  }
  return n / 20;
}

const ULTIMATE_BAD = 0.4; // spend an Ultimate Effort when the check goes badly this often without it

/** Ultimate Effort on a check, before the die is thrown: only when a 20 would carry it and the check often goes badly. */
function ultimateRoll(b, c, label, bonus, dc, matters) {
  if (bonus + 20 < dc || badChance(bonus, dc, matters) < ULTIMATE_BAD) return null;
  c.heroPoints--;
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point on Ultimate Effort: the ${label} counts as a roll of 20 (${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left).`, important: true });
  return { roll: 20, natural: false };
}

/**
 * The fortune hook for one of c's own checks, or null when c has nothing to spend. `label` names the check in the log,
 * `kind` is the Ultimate Effort kind that covers it (if any), and `matters(info)` says whether a result (info.fails,
 * the degrees of failure) is bad enough to spend on.
 */
export function checkFx(b, c, { label, kind = null, matters = () => true, curse = null }) {
  const ult = !!kind && ultimateReady(b, c, kind);
  if (!canReroll(b, c) && !ult && !curse && !assistReady(b, c)) return null;
  return {
    fixed: ult ? (bonus, dc) => ultimateRoll(b, c, label, bonus, dc, matters) : null,
    improve: (rng, info) => improveRoll(b, c, rng, info, label, matters),
    curse,
  };
}

/** Badly hurt: staggered, or two bruises in. */
export const hurt = (c) => !!(c.staggered || c.bruises >= 2);

/** The fewest degrees of failure on c's resistance check that matter against this attack: staggered or worse for Damage, a severe condition for an Affliction. */
export function mattersFrom(atk) {
  if (atk.effect === 'Damage' || atk.effect === 'Mental Blast' || atk.effect === 'Weaken') return 3;
  const tiers = atk.tiers || [];
  const at = tiers.findIndex((names, i) => i < (atk.maxDegree || tiers.length) && Math.max(...names.map((n) => SEVERITY[n] || 0)) >= 6);
  return at < 0 ? Infinity : at + 1;
}

/** The chance that a hit with this attack at this rank leaves the target with a failure that matters. */
export function harmChance(t, atk, rank, extra = 0) {
  const resist = resistOf(t, atk.resistance);
  const from = mattersFrom(atk);
  if (resist === null || from === Infinity) return 0;
  return resistOdds(resist, dcOf(atk, rank) + extra).slice(Math.min(4, from)).reduce((s, x) => s + x, 0);
}

/**
 * Ultimate Aim: c's attack check, before the die is thrown, may count as a roll of 20 for a hero point. Spent when the
 * 20 would carry the hit, the attack often misses, and it matters (a foe that is hurt, or a fighter that is hurt);
 * an Alpha Strike team spends it more readily.
 */
export function ultimateAim(b, c, t, mod, dcUsed) {
  if (!ultimateReady(b, c, 'attack') || mod + 20 < dcUsed) return false;
  const eager = alphaNow(b, c);
  if (hitOdds(mod, dcUsed - 10).hit >= (eager ? 0.75 : 0.5)) return false;
  if (!(eager || t.staggered || t.bruises >= 1 || hurt(c))) return false;
  c.heroPoints--;
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point on Ultimate Effort: the attack check on ${t.name} counts as a roll of 20 (${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left).`, important: true });
  return true;
}

const ULT_RESISTS = ['Toughness', 'Will', 'Fortitude'];

/**
 * Luck Control on a resistance check t just passed against the attacker's best attack: an enemy of t forces a re-roll at
 * the worse of the two when a second die alone would often fail the check by enough to matter. Null when it is not worth it.
 */
function resistCurse(b, t, atk, attacker, from) {
  if (!attacker || from === Infinity || !alive(b).some((x) => x.team === attacker.team && x.luckCtl)) return null;
  const best = Math.max(...alive(b).filter((x) => x.team === attacker.team).flatMap((x) => x.attacks.map((a) => a.rank)));
  if (atk.rank < best) return null;
  return (rng, info) => {
    const chance = Math.max(0, Math.min(1, (info.dc - 1 - 5 * (from - 1) - info.bonus) / 20));
    if (!info.success || chance < 0.3) return null;
    return forceWorse(b, t, rng, { on: attacker, label: `${atk.resistance} check`, roll: info.roll });
  };
}

/** The hook for t's resistance check against a hit (by `attacker`, when known). */
export function resistFx(b, t, atk, attacker = null) {
  const from = mattersFrom(atk);
  const kind = ULT_RESISTS.includes(atk.resistance) ? atk.resistance : null;
  return checkFx(b, t, { label: `${atk.resistance} check`, kind, matters: (i) => i.fails >= from, curse: resistCurse(b, t, atk, attacker, from) });
}

/** The hook for v's Dodge check against an area attack: it matters when a full effect would often do real harm. */
export function dodgeFx(b, v, atk, fullRank) {
  return checkFx(b, v, { label: 'Dodge check', kind: 'Dodge', matters: () => harmChance(v, atk, fullRank) >= 0.3 });
}

/** The hook for c's recovery check against the condition `lead`: it matters when the condition is a severe one. */
export function recoveryFx(b, c, lead) {
  const severe = Math.max(...(lead.names || [lead.name]).map((n) => SEVERITY[n] || 0)) >= 6;
  return checkFx(b, c, { label: 'recovery check', matters: () => severe });
}

/** The hook for an ordinary check (a grab, an escape, an opposed skill check); `matters` is a plain yes or no. */
export function plainFx(b, c, label, matters = () => true) {
  return checkFx(b, c, { label, matters: typeof matters === 'function' ? matters : () => matters });
}

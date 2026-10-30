// What a hit does: the resistance check and its result (damage, Weaken, Affliction, Nullify, an Attack-extra effect).

import { log } from './util.js';
import { opposedCheck, opposedNote } from './checks.js';
import { resistOf, weakenedAttack } from './conditions.js';
import { halfImmune, dcOf } from './odds.js';
import { immunityHit } from './immunity.js';
import { retune } from './variable-descriptor.js';
import { insubLoss, formWords, entraps } from './insubstantial.js';
import { releaseHolds } from './maneuvers.js';
import { weakenTraits, traitLabel } from './weaken-traits.js';
import { flawRankLoss } from './flaw-odds.js';
import { senseStops } from './flaw-resist.js';
import { staminaGone } from './dying.js';
import { damageResult } from './damage-result.js';
import { resistStep } from './resist-step.js';
import { scheduleAfter } from './extra-after.js';
import { attackFormResult } from './attack-form-effect.js';
import { manifestationFeedback } from './feedback.js';
import { absorbEnergy } from './absorb.js';

export { damageResult };

// Reflect on an Immunity (DCA 102) sends the attack it stops back; reflect.js sets the hook (it needs this file, so it cannot be imported here).
let reflectHook = null;
export function onImmuneReflect(fn) { reflectHook = fn; }

/** Variable Descriptor (DCA 133): against a target immune to the attack's descriptor, switch to one it is not immune to, and say so. */
function retuned(b, c, atk, t) {
  const v = retune(t, atk);
  if (!v) return atk;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: ${c.name} changes its descriptor from ${v.from} to ${v.to} (Variable Descriptor), because ${t.name} is ${v.because}.` });
  return v.atk;
}

/**
 * Resolve the effect of a hit (or an automatic effect). Returns { landed, ko, degrees, rank } (the rank for Damage).
 * `later` marks an effect that comes back by itself (Secondary Effect, a held effect, Homing): it is not scheduled again.
 */
export function applyEffect(b, R, c, atk, t, rng, opts = {}) {
  if (t.absorbs?.length) absorbEnergy(b, c, atk, t, opts.rankShift || 0); // Energy Absorption: the attack feeds a trait, whatever it does (absorb.js)
  const res = applyBase(b, R, c, atk, t, rng, opts);
  if (atk.ex && !opts.later) scheduleAfter(b, c, atk, t, res, opts); // Secondary Effect, Increased Duration, Contagious (extra-after.js)
  if (res?.landed && t.summon?.feedback && res.rank > 0 && (atk.effect === 'Damage' || atk.effect === 'Mental Blast')) { // a damaged minion hurts a summoner with Feedback (feedback.js)
    manifestationFeedback(b, c, b.combatants.find((x) => x.id === t.summon.by), { rank: t.summon.rank, damage: res.rank, what: t.name }, rng);
  }
  return res;
}

function applyBase(b, R, c, atk, t, rng, { crit = false, rankShift = 0, multi = 0 } = {}) {
  atk = retuned(b, c, atk, t);
  const lost = insubLoss(c, atk);
  let rank = Math.max(0, atk.rank + rankShift - weakenedAttack(c, atk).rank - lost - flawRankLoss(b, c, atk, t));
  if (atk.flaws && !flawedRank(b, c, atk, t, rank)) return { landed: false };
  if (lost && rank <= 0) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${atk.name}: ${c.name} is ${formWords(c.insub)} and ${c.insub.rank === 4 ? 'cannot affect the physical world with it' : 'has no Strength to put behind it'}: no effect.` }); return { landed: false }; }
  const stopped = immunityHit(t, atk);
  if (stopped) {
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${atk.name}: ${t.name} is ${stopped.why}: no effect.` });
    if (stopped.entry?.reflect && reflectHook) reflectHook(b, R, c, atk, t, stopped.entry, rng, rankShift);
    return { landed: false };
  }
  const half = halfImmune(t, atk);
  if (half) { rank = Math.floor(rank / 2); log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${atk.name}: ${t.name} is partly ${half} (half effect): rank ${rank}.` }); rankShift = rank - atk.rank; }
  if (atk.effect === 'Damage' && !atk.penetrating && t.impervious && rank <= Math.floor(t.impervious / 2)) {
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name}'s Impervious ${t.impervious} shrugs off Damage ${rank} without a check.` });
    return { landed: false };
  }
  if (atk.effect === 'Nullify') return nullify(b, c, atk, t, rng, rank);
  const resistName = atk.resistance;
  const resist = resistOf(t, resistName);
  if (resist === null) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} has no ${resistName} to affect: no effect.` }); return { landed: false }; }
  if (senseStops(b, c, atk, t, rng, dcOf(atk, rank) + (crit ? 5 : 0) + multi, rank)) return { landed: false }; // Sense-Dependent: the target could not perceive it, or looked away
  const step = resistStep(b, c, atk, t, rng, { rank, crit, multi, resistName, resist });
  if (step.result) return step.result;
  const { fails, base, dice } = step;
  rank = step.rank;
  c.stats.degrees += fails;
  t.stats.taken += fails;
  if (atk.effect === 'Damage' || atk.effect === 'Mental Blast') return { ...damageResult(b, c, t, fails, base, dice, atk, rng), rank };
  if (atk.ex?.attackForm) return attackFormResult(b, c, atk, t, fails, base, dice, rank);
  if (atk.effect === 'Weaken') {
    const trait = atk.weakens || 'Toughness';
    const lostRanks = Math.min(fails, rank);
    const now = weakenTraits(t, trait, lostRanks);
    if (atk.flaws?.fastReturn) t.fastReturn = Math.max(t.fastReturn || 0, atk.flaws.fastReturn); // Fast Return (MA 96): more comes back each round
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} loses ${lostRanks} rank${lostRanks > 1 ? 's' : ''} of ${traitLabel(trait)} (now −${now}).`, dice });
    staminaGone(b, t, rng); // Debilitated Stamina means dying (dying.js)
    return { landed: true, degrees: fails };
  }
  return afflictionResult(b, c, atk, t, fails, base, dice);
}

/** Fades and Dulled take ranks off this use: say so in the log. False when a Completely Dulled effect is down to nothing (MA 96) and does nothing. */
function flawedRank(b, c, atk, t, rank) {
  const loss = flawRankLoss(b, c, atk, t);
  if (!loss) return true;
  const why = [atk.flaws.fades && 'Fades', atk.flaws.dulled && 'Dulled'].filter(Boolean).join(' and ');
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: ${why} takes ${loss} rank${loss > 1 ? 's' : ''} off: rank ${rank}.` });
  if (rank > 0 || !atk.flaws.dulled?.complete) return true;
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${atk.name}: Completely Dulled down to rank 0 is nullified: no effect.` });
  return false;
}

function afflictionResult(b, c, atk, t, fails, base, dice) {
  const tiers = atk.tiers || [['Dazed'], ['Stunned'], ['Incapacitated']];
  const maxDeg = atk.maxDegree || tiers.length;
  let degree = Math.min(maxDeg, fails);
  const existing = t.conditions.find((x) => x.source === atk.id && x.from === c.id);
  if (atk.cumulative && existing) degree = Math.min(maxDeg, existing.degree + fails);
  else if (existing) degree = Math.max(existing.degree, degree);
  const names = atk.ex?.sleep ? tiers[degree - 1].map((n) => (n === 'Incapacitated' ? 'Asleep' : n)) : tiers[degree - 1]; // Sleep (DCA 132): asleep rather than incapacitated
  if (atk.extraCondition && degree === 1 && tiers[1]) names.push(...tiers[1].filter((n) => !names.includes(n)));
  const cond = { name: names[0], names, degree, from: c.id, source: atk.id, label: atk.name, dc: dcOf(atk, atk.rank), resist: atk.resistance, cumulative: !!atk.cumulative, progressive: !!atk.progressive, tiers, maxDegree: maxDeg, ...(entraps(atk) ? { entrap: true } : {}), ...(atk.flaws?.concentration ? { concentrate: true } : {}) };
  t.conditions = t.conditions.filter((x) => x !== existing);
  for (const n of names.slice(1)) t.conditions.push({ ...cond, name: n });
  t.conditions.push(cond);
  let ko = false;
  if (names.includes('Incapacitated') || names.includes('Asleep') || names.includes('Paralyzed') && degree >= 3 && atk.effect !== 'Snare') {
    t.out = true; t.outReason = names.includes('Asleep') ? 'asleep' : names.includes('Paralyzed') ? 'paralyzed' : 'affliction'; ko = true; c.stats.kos++; releaseHolds(b, t);
  }
  if (names.includes('Controlled')) {
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} is CONTROLLED by ${c.name}.`, dice, important: true });
    return { landed: true, degrees: fails };
  }
  const extra = names.includes('Prone') ? ' and knocked prone' : '';
  log(b, { kind: ko ? 'ko' : 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}${atk.cumulative && existing ? ' (cumulative)' : ''}: ${t.name} is ${names.map((n) => n.toUpperCase()).join(' and ')}${extra}${ko ? ' and out of the fight' : ''}.`, dice, important: ko || degree >= 2 });
  return { landed: true, ko, degrees: fails };
}

function nullify(b, c, atk, t, rng, rank) {
  const prot = t.sustainedProtection;
  if (!prot) {
    const why = t.innateProtection ? `${t.name}'s protection is Innate and cannot be nullified` : `${t.name} has no sustained defense for ${atk.name} to counter`;
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${why}: no effect.` });
    return { landed: false };
  }
  const bonus = Math.max(prot, resistOf(t, 'Will') ?? 0);
  const mine = rank + 2 * (atk.ex?.proficient || 0); // Proficient (MA 93): +2 on the effect's power checks per rank
  const duel = opposedCheck(rng, { bonus: mine }, { bonus });
  const [r1, r2] = duel.rolls;
  const total1 = duel.totals.a; const total2 = duel.totals.b;
  const prof = atk.ex?.proficient ? ` (includes +${2 * atk.ex.proficient}, Proficient)` : '';
  if (duel.winner === 'a') {
    t.nullified = prot;
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${mine} = ${total1}${prof}) overpowers ${t.name}'s defenses (d20 ${r2} + ${bonus} = ${total2})${opposedNote(duel)}: ${prot} ranks of protection wink out until ${t.name} restores them.`, important: true });
    return { landed: true, degrees: 1 };
  }
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${mine} = ${total1}${prof}) fails to crack ${t.name}'s defenses (${total2})${opposedNote(duel)}.` });
  return { landed: false };
}

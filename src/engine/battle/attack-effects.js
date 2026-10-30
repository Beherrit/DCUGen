// What a hit does: the resistance check and its result (damage, Weaken, Affliction, Nullify).

import { sign, log } from './util.js';
import { rollCheck, critNote, opposedCheck, opposedNote } from './checks.js';
import { resistOf } from './conditions.js';
import { dcOf, isImmune, halfImmune } from './odds.js';
import { releaseHolds } from './maneuvers.js';
import { resistFx } from './fortune.js';

/** Resolve the effect of a hit (or an automatic effect). Returns { landed, ko, degrees, rank } (the rank for Damage). */
export function applyEffect(b, R, c, atk, t, rng, { crit = false, rankShift = 0, multi = 0 } = {}) {
  let rank = Math.max(0, atk.rank + rankShift);
  const why = isImmune(t, atk);
  if (why) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} is ${why}: no effect.` }); return { landed: false }; }
  const half = halfImmune(t, atk);
  if (half) { rank = Math.floor(rank / 2); log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} is partly ${half.replace(/^immune/, 'immune')} (half effect): rank ${rank}.` }); rankShift = rank - atk.rank; }
  if (atk.effect === 'Damage' && !atk.penetrating && t.impervious && rank <= Math.floor(t.impervious / 2)) {
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name}'s Impervious ${t.impervious} shrugs off Damage ${rank} without a check.` });
    return { landed: false };
  }
  if (atk.effect === 'Nullify') return nullify(b, c, atk, t, rng, rank);
  const resistName = atk.resistance;
  const resist = resistOf(t, resistName);
  if (resist === null) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} has no ${resistName} to affect: no effect.` }); return { landed: false }; }
  const dc = dcOf(atk, rank) + (crit ? 5 : 0) + multi;
  const r = rollCheck(rng, resist, dc, resistFx(b, t, atk, c));
  const { roll, total, fails } = r;
  const dice = [{ label: `${resistName} check`, roll, mod: resist, total, dc }];
  const base = `${t.name} resists with ${resistName}: d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}${crit ? ' (+5, critical)' : ''}${critNote(r)}`;
  if (!fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${base} — ${r.crit && r.base.success ? 'natural 20, ' : ''}resisted.`, dice }); return { landed: false, degrees: 0, rank }; }
  c.stats.degrees += fails;
  t.stats.taken += fails;
  if (atk.effect === 'Damage' || atk.effect === 'Mental Blast') return { ...damageResult(b, c, t, fails, base, dice), rank };
  if (atk.effect === 'Weaken') {
    const trait = atk.weakens || 'Toughness';
    const lost = Math.min(fails, rank);
    t.weakened[trait] = (t.weakened[trait] || 0) + lost;
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} loses ${lost} rank${lost > 1 ? 's' : ''} of ${trait} (now −${t.weakened[trait]}).`, dice });
    return { landed: true, degrees: fails };
  }
  return afflictionResult(b, c, atk, t, fails, dc, base, dice, rng);
}

function damageResult(b, c, t, fails, base, dice) {
  const minionDown = t.minion && b.options.minionRule;
  let text; let ko = false;
  if (minionDown) { t.out = true; t.outReason = 'minion'; ko = true; text = `${base} — failed: ${t.name} goes down (minions drop on any failed check).`; }
  else {
    const deg = Math.min(4, fails);
    t.bruises++;
    if (deg === 1) text = `${base} — 1 degree: bruised (−${t.bruises} to Toughness).`;
    else if (deg === 2) { t.dazed = true; text = `${base} — 2 degrees: dazed and bruised (−${t.bruises}).`; }
    else if (deg === 3) {
      if (t.staggered) { t.out = true; ko = true; text = `${base} — 3 degrees, and already staggered: ${t.name} is INCAPACITATED.`; }
      else { t.staggered = true; text = `${base} — 3 degrees: staggered and bruised (−${t.bruises}).`; }
    } else { t.out = true; ko = true; text = `${base} — ${fails} degrees: ${t.name} is INCAPACITATED.`; }
    // Hero point recover from a knockout? (not in the rules: incapacitated needs recovery time)
  }
  if (ko) { t.outReason = t.outReason || 'ko'; c.stats.kos++; releaseHolds(b, t); }
  log(b, { kind: ko ? 'ko' : 'condition', actor: c.id, target: t.id, text, dice, important: ko || fails >= 3 });
  return { landed: true, ko, degrees: fails };
}

function afflictionResult(b, c, atk, t, fails, dc, base, dice, rng) {
  const tiers = atk.tiers || [['Dazed'], ['Stunned'], ['Incapacitated']];
  const maxDeg = atk.maxDegree || tiers.length;
  let degree = Math.min(maxDeg, fails);
  const existing = t.conditions.find((x) => x.source === atk.id && x.from === c.id);
  if (atk.cumulative && existing) degree = Math.min(maxDeg, existing.degree + fails);
  else if (existing) degree = Math.max(existing.degree, degree);
  const names = tiers[degree - 1];
  if (atk.extraCondition && degree === 1 && tiers[1]) names.push(...tiers[1].filter((n) => !names.includes(n)));
  const cond = { name: names[0], names, degree, from: c.id, source: atk.id, label: atk.name, dc: dcOf(atk, atk.rank), resist: atk.resistance, cumulative: !!atk.cumulative, progressive: !!atk.progressive, tiers, maxDegree: maxDeg };
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
  void rng;
  return { landed: true, ko, degrees: fails };
}

function nullify(b, c, atk, t, rng, rank) {
  const prot = t.sustainedProtection;
  if (!prot) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} has no sustained defense for ${atk.name} to counter: no effect.` }); return { landed: false }; }
  const bonus = Math.max(prot, resistOf(t, 'Will') ?? 0);
  const duel = opposedCheck(rng, { bonus: rank }, { bonus });
  const [r1, r2] = duel.rolls;
  const mine = duel.totals.a; const theirs = duel.totals.b;
  if (duel.winner === 'a') {
    t.nullified = prot;
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${rank} = ${mine}) overpowers ${t.name}'s defenses (d20 ${r2} + ${bonus} = ${theirs})${opposedNote(duel)}: ${prot} ranks of protection wink out until ${t.name} restores them.`, important: true });
    return { landed: true, degrees: 1 };
  }
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${rank} = ${mine}) fails to crack ${t.name}'s defenses (${theirs})${opposedNote(duel)}.` });
  return { landed: false };
}

// Countering effects (Hero's Handbook p85-86, Instant Counter p20-21; Martial Arts p92-93). One effect can counter another
// when their descriptors are opposed (fire and cold, light and darkness...) or, for magic and mental effects, the same. Both
// sides make an effect check (d20 + rank): if the counter wins, the two cancel and nothing happens; if it loses, the attack
// works normally. Countering needs a readied action (ready.js), or a hero point to counter at once as a reaction.
//
// Martial Arts extras on the countering power:
// - Improved Counter: one more descriptor per rank that it may counter (the AI picks the one that is coming).
// - Diminishing Counter: a counter that fails still saps the attack: its rank is cut to the margin by which it won the check, plus one.
// - Overwhelming Counter: a counter that wins sends one rank of itself back at the attacker per degree of the win.
// - Proficient: +2 on the power check per rank (MA 93).
// house rule: the book leaves the pairs of opposed descriptors to the GM; these are the ones the engine uses.

import { log, sign, d20 } from './util.js';
import { opposedOdds } from './checks.js';
import { hasPoint, harmChance } from './fortune.js';
import { applyEffect } from './attack-effects.js';

const OPPOSED = [['fire', 'cold'], ['fire', 'water'], ['heat', 'cold'], ['light', 'darkness'], ['electricity', 'magnetism'], ['sonic', 'vibration'], ['earth', 'wind'], ['plasma', 'cold']];
const LIKE = ['magic', 'necromantic', 'psychic', 'emotion']; // the same descriptor can counter itself (p85: magical and mental effects)

/** Can a power with these descriptors counter an effect with those? `spare` is how many extra descriptors Improved Counter lets it choose. */
export function countersByDescriptor(mine, theirs, spare = 0) {
  const pair = (a, b) => OPPOSED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const direct = mine.some((m) => theirs.some((t) => pair(m, t) || (m === t && LIKE.includes(m))));
  return direct || (spare > 0 && theirs.length > 0);
}

/** The attack of t's that can best counter this incoming attack: { atk, bonus, odds } or null. A counter must be a power (not Unarmed). */
export function bestCounter(t, incoming) {
  let best = null;
  for (const a of t.attacks) {
    if (!a.power || a.area || a === incoming || !countersByDescriptor(a.descriptors || [], incoming.descriptors || [], a.ex?.improvedCounter || 0)) continue;
    const bonus = a.rank + 2 * (a.ex?.proficient || 0);
    const odds = opposedOdds(bonus, incoming.rank);
    if (!best || odds > best.odds) best = { atk: a, bonus, odds };
  }
  return best;
}

/** Is it worth a hero point (an Instant Counter)? The hit would often do real harm and the counter would often win. */
function worthIt(t, incoming, rank, cnt) {
  return cnt.odds >= 0.45 && harmChance(t, incoming, rank) >= 0.35;
}

/**
 * The target tries to counter the attack that hit it. It does so with a readied counter (t.ready), or a hero point (Instant
 * Counter). Returns { countered, rankCut } : countered ends the attack; rankCut is how many ranks a failed Diminishing Counter took off.
 */
export function counterTry(b, R, attacker, atk, t, rng, rank) {
  const none = { countered: false, rankCut: 0 };
  if (atk.effect === 'Nullify' || t.out || !t.attacks.some((a) => a.power)) return none;
  const cnt = bestCounter(t, atk);
  if (!cnt) return none;
  const readied = t.ready?.kind === 'counter' && t.ready.round >= b.round - 1;
  const instant = !readied && hasPoint(b, t) && worthIt(t, atk, rank, cnt);
  if (!readied && !instant) return none;
  if (readied) t.ready = null; else t.heroPoints--;
  const mine = d20(rng); const theirs = d20(rng);
  const tm = mine + cnt.bonus; const tt = theirs + rank;
  const won = tm > tt || (tm === tt && cnt.bonus >= rank);
  const how = readied ? 'a readied action' : `a hero point (Instant Counter, ${t.heroPoints} left)`;
  const head = `${t.name} counters ${atk.name} with ${cnt.atk.name} using ${how}: d20 ${mine} ${sign(cnt.bonus)} = ${tm} against d20 ${theirs} ${sign(rank)} = ${tt}`;
  const dice = [{ label: `${cnt.atk.name} counter`, roll: mine, mod: cnt.bonus, total: tm, dc: tt }];
  if (won) {
    log(b, { kind: 'resist', actor: t.id, target: attacker.id, text: `${head} — the two effects cancel out.`, dice, important: true });
    overwhelm(b, R, t, cnt.atk, attacker, rng, Math.floor((tm - tt) / 5) + 1);
    return { countered: true, rankCut: 0 };
  }
  const cut = cnt.atk.ex?.diminishing ? Math.max(0, rank - Math.min(rank, tt - tm + 1)) : 0;
  log(b, { kind: 'miss', actor: t.id, target: attacker.id, text: `${head} — the counter fails${cut ? `; Diminishing Counter saps ${atk.name} down to rank ${rank - cut}` : ''}.`, dice });
  return { countered: false, rankCut: cut };
}

/** Overwhelming Counter: one rank of the countering power per degree of the win surges back at the attacker (the attacker defends and resists as normal). */
function overwhelm(b, R, t, counter, attacker, rng, degrees) {
  if (!counter.ex?.overwhelming || counter.effect === 'Nullify' || attacker.out) return;
  const rank = Math.min(counter.rank, degrees);
  log(b, { kind: 'attack', actor: t.id, target: attacker.id, text: `${counter.name}: Overwhelming Counter: ${rank} rank${rank > 1 ? 's' : ''} surge back at ${attacker.name}.`, important: true });
  applyEffect(b, R, t, counter, attacker, rng, { auto: true, crit: false, rankShift: rank - counter.rank, later: true });
}

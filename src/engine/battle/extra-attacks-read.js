// Reading a fighter's Extra Attacks (Martial Arts p83-84) and what they are worth to the AI. The attacks themselves are in
// extra-attacks.js. Flaws read: Activation (Move Action: it takes the whole round), Chain (any miss ends the series), Declining (each
// extra attack after the first has a cumulative -5), Limited (only the attacks the detail names). Dispersed (later attacks at a lower
// initiative) is not played out: the attacks are all made at once.

import { allPowers } from '../derive.js';

/** The fighter's Extra Attacks, or null: { rank, move, chain, declining, limited }. Several powers add their ranks. */
export function extraAttacksOf(ch) {
  const mine = allPowers(ch, { includeAlternates: false }).map((x) => x.power).filter((p) => p.effect === 'Extra Attacks' && p.rank > 0);
  if (!mine.length) return null;
  const has = (re) => mine.some((p) => (p.flaws || []).some((f) => re.test(`${f.name} ${f.option || ''}`)));
  const limited = mine.flatMap((p) => (p.flaws || []).filter((f) => f.name === 'Limited').map((f) => String(f.detail || '').toLowerCase())).filter(Boolean);
  return { rank: mine.reduce((s, p) => s + p.rank, 0), move: has(/^activation.*move/i), chain: has(/^chain/i), declining: has(/^declining/i), limited };
}

/** Does the Limited flaw allow Extra Attacks with this attack? With no limit named, every attack does. */
export const allowed = (ea, atk) => !ea.limited.length || ea.limited.some((word) => word.split(/\W+/).some((w) => w.length > 3 && `${atk.name} ${atk.power?.name || ''}`.toLowerCase().includes(w)));

/** How many attacks' worth a turn's attack with this power is, for the AI: the regular attack and each extra one, the later ones less when Declining or Chained (they may not happen). */
export function attackCount(c, atk) {
  const ea = c.extraAttacks;
  if (!ea || !atk.roll || atk.area || !allowed(ea, atk)) return 1;
  let n = 1;
  for (let k = 1; k <= ea.rank; k++) n += ea.declining ? Math.max(0, 1 - 0.25 * k) : ea.chain ? 0.6 ** k : 1;
  return n;
}

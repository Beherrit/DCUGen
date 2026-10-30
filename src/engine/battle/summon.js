// Summon and Duplication (Hero's Handbook p94 and p118), read from the power and kept as fight state.
//
// Summon: a minion built on (rank x 15) points, called as a standard action into the nearest open space beside the
// summoner. It has its own initiative and acts from the round after it comes. It is dazed (a standard action only)
// unless the power is Active or Heroic. Directing a minion is a move action (Command, p175). A downed minion
// disappears but is not free to summon again until it has recovered (p118), so every minion ever called counts toward
// the cap. Minions vanish when the summoner is out (the effect is sustained). Duplication is Summon Duplicate, Active:
// a copy of the summoner that thinks and acts like it.
//
// Extras read: Multiple Minions (each step doubles the number), Horde (all at once, vulnerable until the next turn),
// Active, Heroic (a normal character, not a minion), Controlled (needs orders), Sacrifice (a hero point sends a hit to
// a minion), Mental Link. Flaws read: Calling (MA 95: the minion walks in from the team's edge and a downed one stays
// where it fell) and Resistible (the minion gets a Will check against 10 + rank). Attitude and Variable Type are not
// modelled.

import { allPowers } from '../derive.js';
import { hasExtra, byId } from './util.js';
import { flawsOf } from './flaws.js';

/** Every Summon or Duplication power of a character as { power, name, rank, duplicate, max, ... }. */
export function summonsOf(ch) {
  const out = [];
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if ((p.effect !== 'Summon' && p.effect !== 'Duplication') || !(p.rank > 0)) continue;
    const steps = (p.extras || []).filter((m) => m.name === 'Multiple Minions').reduce((s, m) => s + (m.steps ?? 1), 0);
    const duplicate = p.effect === 'Duplication';
    const f = flawsOf(p) || {};
    out.push({
      power: p, name: p.name, rank: p.rank, detail: p.detail || '', duplicate,
      max: 2 ** steps, horde: hasExtra(p, 'Horde') && steps > 0,
      heroic: !duplicate && hasExtra(p, 'Heroic'), active: duplicate || hasExtra(p, 'Active') || hasExtra(p, 'Heroic'),
      controlled: hasExtra(p, 'Controlled'), sacrifice: hasExtra(p, 'Sacrifice'), mentalLink: hasExtra(p, 'Mental Link'),
      calling: !!f.calling, feedback: !!f.feedback, resistible: f.resistible === null && (p.flaws || []).some((x) => /^resistible/i.test(x.name)) ? 'Will' : f.resistible || null,
    });
  }
  return out;
}

/** The summons c has called in this fight, as combatants (downed and vanished ones too). */
export const summonsOfFighter = (b, c) => (c.summoned || []).map((id) => byId(b, id)).filter(Boolean);

/** The ones still in the fight. */
export const liveSummons = (b, c) => summonsOfFighter(b, c).filter((m) => !m.out && !m.fled);

/** Is this fighter a summoned minion or duplicate? */
export const isSummon = (c) => !!c?.summon;

/** Does this summoned fighter still wait for the summoner's orders (Command, p175)? Active, Heroic and duplicate summons do not need them. */
export const awaitsOrders = (m) => !!m.summon && m.summon.needsOrders && !m.summon.commanded;

/** The summon cap left for this power: the number the Multiple Minions steps allow less everything called already. */
export function summonRoom(b, c, s) {
  const used = summonsOfFighter(b, c).filter((m) => m.summon.power === s.name).length;
  return Math.max(0, s.max - used);
}

/** The summoned fighters that wait for orders and are still in the fight. */
export const uncommanded = (b, c) => liveSummons(b, c).filter(awaitsOrders);

/** A Resistible summon cannot be tried again in a scene once the minion has resisted. */
export const resisted = (c, s) => !!c.resistedSummon?.[s.name];

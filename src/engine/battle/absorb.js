// Energy Absorption (Hero's Handbook p95): "You take the energy from a particular type of attack, chosen when you take this power,
// and use it to enhance one of your traits. Typically this is either Strength or a Ranged Damage effect of the same energy type as
// the initial attack... The enhancement to your trait is equal to your power rank or the attack's rank, whichever is less. The
// enhancement occurs automatically when you are subjected to the attack. Thereafter, the enhanced trait fades at a rate of 1 point per
// turn until it is gone. Further attacks can 'top off' your Enhanced Trait, restoring it to its full rank again... Your rank is the
// limit. This power does not provide any resistance to attacks; the character suffers the effects of any attacks normally."
// The type of attack is the descriptors the power's words name (fire, electricity, kinetic...), the trait the one it names (Strength,
// a defense, speed), else a Ranged Damage effect. Not modelled: Enhanced Trait choices beyond those.

import { allPowers } from '../derive.js';
import { log } from './util.js';
import { canonical } from './descriptors.js';
import { addMods } from './mods.js';

/** The Energy Absorption powers of a character: [{ name, rank, descriptors, trait }]. */
export function absorbsOf(ch) {
  return allPowers(ch, { includeAlternates: false }).filter(({ power: p }) => p.effect === 'Energy Absorption' && p.rank > 0 && p.role !== 'defense').map(({ power: p }) => {
    const text = `${p.name} ${p.detail || ''} ${p.option || ''}`;
    const trait = /strength|melee|punch|brawn/i.test(text) ? 'strength' : /toughness|protection|armor/i.test(text) ? 'Toughness' : /dodge/i.test(text) ? 'Dodge' : /parry/i.test(text) ? 'Parry' : /speed|quick/i.test(text) ? 'speed' : 'ranged damage';
    return { name: p.name, rank: p.rank, descriptors: canonical(text), trait };
  });
}

/** The changes an absorbed amount makes to the trait. */
function modsFor(trait, amount) {
  if (trait === 'strength') return [{ kind: 'strength', amount }];
  if (trait === 'speed') return [{ kind: 'speed', amount }];
  if (trait === 'ranged damage') return [{ kind: 'rank', range: 'ranged', amount }];
  return [{ kind: 'defense', trait, amount }];
}

/** The target is hit by an attack of the type it absorbs: its trait rises to the lower of its rank and the attack's rank, if that tops what it has. */
export function absorbEnergy(b, c, atk, t, rankShift = 0) {
  for (const s of t.absorbs || []) {
    if (!s.descriptors.some((d) => (atk.descriptors || []).includes(d))) continue;
    const amount = Math.min(s.rank, Math.max(0, atk.rank + rankShift));
    const now = (t.mods || []).filter((e) => e.source === 'absorb' && e.key === s.name).flatMap((e) => e.mods).reduce((m, x) => Math.max(m, x.amount || 0), 0);
    if (amount <= now) continue;
    addMods(t, 'absorb', s.name, modsFor(s.trait, amount), 1);
    log(b, { kind: 'note', actor: t.id, target: c.id, text: `Energy Absorption: ${t.name} takes in the ${s.descriptors.join(' and ')} of ${atk.name} and its ${s.trait} rises by ${amount} (${s.name}, rank ${s.rank}; it fades by 1 each turn, and further hits top it off).`, important: true });
  }
}

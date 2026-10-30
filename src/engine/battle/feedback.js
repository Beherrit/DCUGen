// The Feedback flaw on a manifestation (Hero's Handbook p135): "If your power's manifestation is damaged, make a resistance
// check against the attack's damage rank, using your effect's rank as the resistance check bonus." The manifestations the
// engine has are summoned minions and duplicates (summon.js), created objects (create.js) and illusions (illusion.js); a
// Snare has its own version in flaw-effects.js.

import { sign, log } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { damageResult } from './damage-result.js';

/**
 * The owner of a manifestation resists the damage done to it. `from` is the attacker (who gets the credit), `rank` the
 * effect's rank (the bonus), `damage` the attack's damage rank. Returns true when the owner failed the check.
 */
export function manifestationFeedback(b, from, owner, { rank, damage, what }, rng) {
  if (!owner || owner.out || !(damage > 0)) return false;
  const dc = 15 + damage;
  const r = rollCheck(rng, rank, dc);
  const base = `Feedback: ${what} is damaged (Damage ${damage}), so ${owner.name} resists with the effect's rank: d20 ${r.roll} ${sign(rank)} = ${r.total} vs DC ${dc}${critNote(r)}`;
  if (!r.fails) { log(b, { kind: 'resist', actor: owner.id, target: from.id, text: `${base} — unharmed.` }); return false; }
  damageResult(b, from, owner, r.fails, base, [{ label: 'Feedback', roll: r.roll, mod: rank, total: r.total, dc }], null, rng);
  return true;
}

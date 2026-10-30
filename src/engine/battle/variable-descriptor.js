// Variable Descriptor (Hero's Handbook p133): the attacker can change an effect's descriptors as a free action once per
// round. Rank 1 picks within a closely related group (temperature, weather, electromagnetic...), rank 2 within a broad
// one (any mental, magical or technological descriptor). The AI uses it to dodge a target's immunity: when the target
// is immune to the attack as it stands, it switches to a descriptor the target is not immune to.

import { extraOpt } from './util.js';
import { variants, withFamilies, showDescriptors } from './descriptors.js';
import { immunityMatch } from './immunity.js';

/** 0 without the extra, 1 for a closely related group, 2 for a broad group. */
export function variableSize(p) {
  const opt = (p?.extras || []).find((m) => m.name === 'Variable Descriptor');
  if (!opt) return 0;
  return /broad/i.test(String(extraOpt(p, 'Variable Descriptor') || '')) || (opt.steps ?? 1) >= 2 ? 2 : 1;
}

/**
 * The attack as it should be used against this target: unchanged (null) when it is not immune or has no Variable
 * Descriptor, else a copy with a descriptor the target is not immune to. Returns { atk, from, to, because } or null.
 */
export function retune(target, atk) {
  if (!atk.variable) return null;
  const outright = immunityMatch(target, atk, false);
  const because = outright || immunityMatch(target, atk, true);
  if (!because) return null;
  const mine = showDescriptors(atk.descriptors).filter((d) => d !== 'weapon' && d !== 'unarmed');
  let fallback = null;
  for (const d of variants(mine, atk.variable)) {
    const copy = { ...atk, descriptors: withFamilies([d]), variableFrom: mine };
    const full = immunityMatch(target, copy, false);
    if (full) continue;
    if (!immunityMatch(target, copy, true)) return { atk: copy, from: mine.join(' and ') || 'its own descriptors', to: d, because };
    fallback = fallback || { atk: copy, from: mine.join(' and ') || 'its own descriptors', to: d, because };
  }
  return outright ? fallback : null; // a half-effect immunity that no variant improves on is not worth a switch
}

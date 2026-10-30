// Quick fill: a field of generated heroes, one fighter to an entrant, each named after the hero.

import { makeRng } from '../rng.js';
import { generateCharacter } from '../generator.js';
import { FIGHTERS } from '../citywar/quickfill.js';

/** `count` entrants of one generated fighter each, from the seed. Names are kept apart ("Nova", "Nova 2"). */
export function quickEntrants(R, { seed = 'quick', count = 8, pl = 10 } = {}) {
  const rng = makeRng(`${seed}::quickfill`);
  const seen = new Map();
  return Array.from({ length: count }, (_, i) => {
    const ch = generateCharacter(R, { seed: `${seed}::hero::${i}`, pl, archetype: rng.pick(FIGHTERS) });
    const base = ch.identity?.codename || ch.identity?.realName || `Hero ${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { name: n === 1 ? base : `${base} ${n}`, tactic: 'none', members: [ch] };
  });
}

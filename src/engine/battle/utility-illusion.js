// Illusion as a utility: the switch of looks (illusion.js) on the foe whose attack is worth most to us, aimed at the teammate
// it can hurt most. If it works, the foe's next attack lands on its own side instead of ours, so the gain is the harm it would
// have done us plus the harm it does them; the chance is the opposed check of the rank against its Insight; and it lasts for
// the attack and, if the foe does not see through it (an Insight check against 10 + rank), one more.

import { clamp } from './util.js';
import { canAct } from './conditions.js';
import { feet } from './geometry.js';
import { bestEvNow, threatOn } from './odds.js';
import { illusionsOf, foolable, switchable, deceive } from './illusion.js';

/** The chance an opposed d20 + a against d20 + b is won by a (ties go to nobody here, so this is a little low). */
const winChance = (a, b) => clamp(0.5 + (a - b) / 40, 0.03, 0.97);

/** How many attacks a fooled foe makes before it sees through the illusion: the first, and a second if its Insight check fails. */
const attacksFooled = (rank, insight) => 1 + (1 - clamp((21 - (10 + rank - insight)) / 20, 0.05, 0.95));

/** The best switch c could make this turn: { kind: 'illusion', u, run }, or null. */
export function illusionOption(b, c, enemies) {
  if (canAct(c) === 'none' || enemies.length < 2) return null;
  const mine = illusionsOf(c.ch);
  if (!mine.length) return null;
  let best = null;
  for (const s of mine) {
    for (const t of enemies.filter(foolable)) {
      const foes = switchable(b, t).filter((v) => !v.out);
      const harmToUs = Math.max(0, ...b.combatants.filter((a) => a.team === c.team && !a.out && !a.fled).map((a) => threatOn(t, a, feet(b, t, a))));
      for (const v of foes) {
        const toThem = bestEvNow(t, v, feet(b, t, v), 0, true);
        const u = winChance(s.rank, t.skills.Insight) * (harmToUs + toThem) * attacksFooled(s.rank, t.skills.Insight);
        if (u > 0 && (!best || u > best.u)) best = { kind: 'illusion', u, run: (bb, R, cc, rng) => { deceive(bb, cc, s, t, v, rng); } };
      }
    }
  }
  return best;
}


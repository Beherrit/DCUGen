// What a flaw asks before an attack goes off: a limit that must be met, a chain, ranks that have not faded away, a
// hero point (Gallant), a reliability roll (Unreliable) and a skill check (Check Required). Each failure says so in the
// log. `flawGate` returns { go, rankShift }: go is false when the use is lost (the action is spent), and rankShift is
// the ranks a Check Required roll left out. Fights with no flawed attack never reach any of it.

import { log, sign } from './util.js';
import { limitBlock } from './flaw-limits.js';
import { flawKey } from './flaws.js';
import { chainReady, rollCheckRequired } from './flaw-odds.js';
import { fortuneOn } from './points.js';

const STOP = { go: false, rankShift: 0 };
const SPENT = { go: false, rankShift: 0, spent: true }; // the action was used up

/** One line for a use the flaw stopped. */
function stopped(b, c, atk, t, text, kind = 'skip') {
  log(b, { kind, actor: c.id, target: t.id, text: `${atk.name}: ${text}`, important: kind === 'miss' });
  return kind === 'miss' ? SPENT : STOP;
}

/** Limited (DCA 135): a limit the engine knows and the situation does not meet. */
function limited(b, c, atk, t) {
  const hit = limitBlock(atk.flaws.limited, { b, c, t });
  return hit ? stopped(b, c, atk, t, `Limited to ${hit.text || hit.say}: ${t.name} is not ${hit.say}, so ${c.name} cannot use it on ${t.name}.`) : null;
}

/** Unreliable (DCA 138): a number of uses, or a d20 each time (1 to 10 and it does not work). A hero point on the roll makes it work. */
function unreliable(b, c, atk, t, rng) {
  const u = atk.flaws.unreliable;
  const key = flawKey(atk);
  if (u.uses != null) {
    const used = c.flaw.uses[key] || 0;
    if (used >= u.uses) return stopped(b, c, atk, t, `Unreliable (${u.uses} use${u.uses > 1 ? 's' : ''}): all ${u.uses} are spent, so ${c.name} cannot use it again this fight.`);
    c.flaw.uses[key] = used + 1;
    return null;
  }
  const roll = rng.int(1, 20);
  if (roll > 10) { log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Unreliable roll d20 ${roll}: it works.` }); return null; }
  if (fortuneOn(b) && c.heroPoints > 0) {
    c.heroPoints--;
    log(b, { kind: 'hero', actor: c.id, text: `${atk.name}: Unreliable roll d20 ${roll}, but ${c.name} spends a hero point and it works (${c.heroPoints} left).`, important: true });
    return null;
  }
  return stopped(b, c, atk, t, `Unreliable roll d20 ${roll} (10 or less): it fails, and ${c.name}'s action is spent.`, 'miss');
}

/** Check Required (DCA 134): a check against DC 10 plus the flaw's ranks first; the effect gets one rank for each point over it. */
function checkRequired(b, c, atk, t, rng) {
  const r = rollCheckRequired(rng, c, atk);
  const skill = atk.flaws.check.skill || 'attack bonus';
  const text = `Check Required (${skill}): d20 ${r.roll} ${sign(r.bonus)} = ${r.total} vs DC ${r.dc}`;
  const dice = [{ label: 'Required check', roll: r.roll, mod: r.bonus, total: r.total, dc: r.dc }];
  if (!r.ranks) {
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${atk.name}: ${text}${r.roll === 1 ? ' (natural 1)' : ''} — fails, and the action is spent.`, dice, important: true });
    return SPENT;
  }
  const lost = atk.rank - r.ranks;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: ${text} — ${r.ranks} of ${atk.rank} ranks${lost > 0 ? ` (rank ${r.ranks})` : ''}.`, dice });
  return { go: true, rankShift: -lost };
}

/** Gallant (MA 97): a hero point each time the effect is used. With hero points off in the battle the cost is not charged. */
function gallant(b, c, atk, t) {
  if (!fortuneOn(b)) return null;
  if (!(c.heroPoints > 0)) return stopped(b, c, atk, t, `Gallant: ${c.name} has no hero point to spend, so it cannot be used.`);
  c.heroPoints--;
  log(b, { kind: 'hero', actor: c.id, text: `${atk.name}: Gallant costs a hero point (${c.heroPoints} left).`, important: true });
  return null;
}

/** Fades (DCA 135), Chained (MA 95) and a Momentum-Based effect with no run-up (MA 97): the use is not possible. */
function unavailable(b, c, atk, t) {
  const f = atk.flaws;
  if (f.fades && (c.flaw.faded[flawKey(atk)] || 0) >= atk.rank) return stopped(b, c, atk, t, `Fades: all ${atk.rank} ranks are gone, so ${c.name} cannot use it again this fight.`);
  if (f.chained && !chainReady(c, atk, b.round)) return stopped(b, c, atk, t, `Chained to ${f.chained}: ${c.name} did not use ${f.chained} with success last turn, so it will not start.`);
  if (f.momentum && !c.squaresMoved) return stopped(b, c, atk, t, `Momentum-Based: ${c.name} has not moved this turn, so there is no speed behind it and it has no effect.`);
  return null;
}

/** Everything a flawed attack must get past before it is used. */
export function flawGate(b, R, c, atk, t, rng) {
  const f = atk.flaws;
  if (!f) return { go: true, rankShift: 0 };
  const steps = [() => limited(b, c, atk, t), () => unavailable(b, c, atk, t), () => (f.gallant ? gallant(b, c, atk, t) : null), () => (f.unreliable ? unreliable(b, c, atk, t, rng) : null)];
  for (const step of steps) { const out = step(); if (out) return out; }
  return f.check ? checkRequired(b, c, atk, t, rng) : { go: true, rankShift: 0 };
}

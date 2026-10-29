// The end of a turn: recovery checks against Afflictions and the weakened traits coming back.

import { sign, d20, log } from './util.js';
import { resistOf } from './conditions.js';
import { releaseHolds } from './maneuvers.js';

export function endOfTurn(b, c, rng) {
  c.interposed = false;
  // A feint lasts until the end of the feinter's next round (DCA 64).
  for (const t of b.combatants) if (t.feinted?.by === c.id && t.feinted.round < b.round) t.feinted = null;
  if (c.out) return;
  if (c.dazed && !c.staggered) { c.dazed = false; }
  if (c.dazed && c.staggered) { c.dazed = false; } // staggered keeps the hindered part; dazed wears off
  // Sustained defenses come back as a free action
  if (c.nullified) { c.nullified = 0; log(b, { kind: 'recover', actor: c.id, text: `${c.name} restores its defenses.` }); }
  // Recovery checks against afflictions (DCA 95)
  const sources = [...new Set(c.conditions.filter((x) => x.source !== 'grab' && x.source !== 'surprise').map((x) => x.source))];
  for (const src of sources) {
    const group = c.conditions.filter((x) => x.source === src);
    const lead = group[0];
    const resist = resistOf(c, lead.resist || 'Fortitude');
    if (resist === null) { c.conditions = c.conditions.filter((x) => x.source !== src); continue; }
    const roll = d20(rng);
    const total = roll + resist;
    const ok = roll === 20 || total >= lead.dc;
    const dice = [{ label: `Recover (${lead.resist})`, roll, mod: resist, total, dc: lead.dc }];
    if (ok) {
      c.conditions = c.conditions.filter((x) => x.source !== src);
      if (c.out && ['affliction', 'asleep', 'paralyzed'].includes(c.outReason)) { c.out = false; c.outReason = null; }
      log(b, { kind: 'recover', actor: c.id, text: `${c.name} shakes off ${lead.label || 'the effect'}: ${lead.resist} d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc} — recovered.`, dice });
    } else if (lead.progressive && lead.degree < (lead.maxDegree || 3)) {
      const deg = lead.degree + 1;
      const names = lead.tiers[deg - 1];
      c.conditions = c.conditions.filter((x) => x.source !== src);
      for (const n of names) c.conditions.push({ ...lead, name: n, degree: deg, names });
      if (names.includes('Incapacitated') || names.includes('Asleep')) { c.out = true; c.outReason = 'affliction'; releaseHolds(b, c); }
      log(b, { kind: 'condition', actor: c.id, text: `${lead.label} worsens (progressive): d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc} failed — ${c.name} is now ${names.join(' and ').toUpperCase()}.`, dice, important: true });
    } else {
      log(b, { kind: 'miss', actor: c.id, text: `${c.name} fails to shake off ${lead.label || 'the effect'}: d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc}.`, dice });
    }
  }
  // Weakened traits recover a rank per round
  for (const k of Object.keys(c.weakened)) { c.weakened[k] = Math.max(0, c.weakened[k] - 1); if (!c.weakened[k]) delete c.weakened[k]; }
  if (c.fatigue >= 3) { c.out = true; c.outReason = 'exhausted'; log(b, { kind: 'ko', actor: c.id, text: `${c.name} collapses from exhaustion.`, important: true }); }
}

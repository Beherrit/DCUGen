// The end of a turn: recovery checks against Afflictions and the weakened traits coming back.

import { sign, log } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { resistOf, SEVERITY } from './conditions.js';
import { extraResistance } from './effort.js';
import { payOwed } from './effort-pay.js';
import { releaseHolds } from './maneuvers.js';
import { expireSupport } from './support-actions.js';
import { STAND_SOURCES } from './prone.js';
import { recoveryFx } from './fortune.js';
import { expireFeats } from './feat.js';
import { concentrationBroken } from './flaw-turn.js';
import { snareFeedback } from './flaw-effects.js';
import { runSecondary, spreadContagion } from './extra-run.js';

/**
 * A snare-type affliction ("overcome by Damage") is broken with Damage, including Strength, or slipped with Sleight
 * of Hand, whichever is better, not with the defense that resisted it. Returns null for other afflictions.
 */
function overcomeBonus(b, c, lead) {
  const atk = b.combatants.find((x) => x.id === lead.from)?.attacks.find((a) => a.id === lead.source);
  if (atk?.overcome !== 'Damage') return null;
  const damage = Math.max(0, ...c.attacks.filter((a) => a.effect === 'Damage' && !a.area).map((a) => a.rank));
  return Math.max(damage, c.skills?.['Sleight of Hand'] ?? 0);
}

export function endOfTurn(b, c, rng, R = null) {
  c.interposed = false;
  payOwed(b, c, rng); // extra effort for speed: the fatigue it cost arrives at the end of the turn (effort.js)
  if (!c.out) { runSecondary(b, R, c, rng); spreadContagion(b, R, c, rng); } // Secondary Effect and Contagious (extra-run.js)
  c.noMove = false; c.squaresMoved = 0; // this turn's movement is over
  // A feint lasts until the end of the feinter's next round (DCA 64).
  for (const t of b.combatants) if (t.feinted?.by === c.id && t.feinted.round < b.round) t.feinted = null;
  expireSupport(b, c);
  expireFeats(b, c);
  if (c.out) return;
  if (c.dazed && !c.staggered) { c.dazed = false; }
  if (c.dazed && c.staggered) { c.dazed = false; } // staggered keeps the hindered part; dazed wears off
  // Sustained defenses come back as a free action
  if (c.nullified) { c.nullified = 0; log(b, { kind: 'recover', actor: c.id, text: `${c.name} restores its defenses.` }); }
  concentrationBroken(b, c); // effects held by Concentration end when the one concentrating cannot (flaw-turn.js)
  // Recovery checks against afflictions (DCA 95)
  const sources = [...new Set(c.conditions.filter((x) => x.source !== 'grab' && x.source !== 'surprise' && x.source !== 'demoralize' && !STAND_SOURCES.includes(x.source)).map((x) => x.source))];
  for (const src of sources) {
    const group = c.conditions.filter((x) => x.source === src);
    const lead = group[0];
    const breakout = overcomeBonus(b, c, lead);
    const resist = breakout ?? resistOf(c, lead.resist || 'Fortitude');
    const how = breakout == null ? lead.resist : 'Strength, Damage or Sleight of Hand';
    if (resist === null) { c.conditions = c.conditions.filter((x) => x.source !== src); continue; }
    let r = rollCheck(rng, resist, lead.dc, recoveryFx(b, c, lead));
    const severe = Math.max(...(lead.names || [lead.name]).map((n) => SEVERITY[n] || 0)) >= 6;
    if (!r.success && extraResistance(b, c, rng, severe)) r = rollCheck(rng, resist, lead.dc); // extra effort: an immediate extra resistance check (effort.js)
    const { roll, total } = r;
    const ok = r.success;
    const dice = [{ label: `Recover (${how})`, roll, mod: resist, total, dc: lead.dc }];
    if (breakout != null) snareFeedback(b, c, lead, rng); // Feedback (DCA 135): hitting the snare hurts whoever made it
    if (ok) {
      c.conditions = c.conditions.filter((x) => x.source !== src);
      if (c.out && ['affliction', 'asleep', 'paralyzed', 'transformed'].includes(c.outReason)) { c.out = false; c.outReason = null; }
      log(b, { kind: 'recover', actor: c.id, text: `${c.name} shakes off ${lead.label || 'the effect'}: ${how} d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc}${critNote(r)} — recovered.`, dice });
    } else if (lead.progressive && lead.degree < (lead.maxDegree || 3)) {
      const deg = lead.degree + 1;
      const names = lead.tiers[deg - 1];
      c.conditions = c.conditions.filter((x) => x.source !== src);
      for (const n of names) c.conditions.push({ ...lead, name: n, degree: deg, names });
      if (names.includes('Incapacitated') || names.includes('Asleep')) { c.out = true; c.outReason = 'affliction'; releaseHolds(b, c); }
      log(b, { kind: 'condition', actor: c.id, text: `${lead.label} worsens (progressive): d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc}${critNote(r)} failed — ${c.name} is now ${names.join(' and ').toUpperCase()}.`, dice, important: true });
    } else {
      log(b, { kind: 'miss', actor: c.id, text: `${c.name} fails to shake off ${lead.label || 'the effect'}: d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc}${critNote(r)}.`, dice });
    }
  }
  // Weakened traits recover a rank per round, and one more per rank of Fast Return (MA 96)
  const back = 1 + (c.fastReturn || 0);
  if (c.fastReturn && Object.keys(c.weakened).length) log(b, { kind: 'recover', actor: c.id, text: `${c.name} recovers ${back} ranks of each weakened trait this round (Fast Return).` });
  for (const k of Object.keys(c.weakened)) { c.weakened[k] = Math.max(0, c.weakened[k] - back); if (!c.weakened[k]) delete c.weakened[k]; }
  if (!Object.keys(c.weakened).length) c.fastReturn = 0;
  if (c.fatigue >= 3) { c.out = true; c.outReason = 'exhausted'; log(b, { kind: 'ko', actor: c.id, text: `${c.name} collapses from exhaustion.`, important: true }); }
}

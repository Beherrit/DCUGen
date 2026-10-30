// Illusion (Hero's Handbook p101): false impressions at Perception range, resisted by Insight against 10 + rank, sustained.
// "Illusions have no substance and cannot have any real-world effect," and a viewer gets no check to see through one until
// it interacts with it. What it can do in a fight, as the book allows, is the trick it names (p102, "My ally, my enemy"): switch
// the appearances of an enemy and an ally, "causing a foe's teammate to attack that enemy by mistake. You can generally handle
// this with an opposed check of Illusion and Insight; if you win, the target is unaware of the switch and attacks the wrong target."
//
// The fooled fighter (`t.deceived`) uses its next turn's attack on the teammate whose look was switched. That attack is the
// interaction: afterwards it gets an Insight check against 10 + rank to see through it, and the illusion lasts until it does or
// the illusionist can no longer maintain it (a static illusion is a free action to maintain, p101). A sense that Counters
// Illusion sees through at once. Not modelled: decoys and illusory scenery (nothing in the fight is fooled by them that
// the engine could say), a damaging illusion (a Linked Damage is its own attack), Independent, Selective, size.

import { allPowers } from '../derive.js';
import { log, byId, alive } from './util.js';
import { opposedCheck, opposedNote, rollCheck, critNote } from './checks.js';
import { canAct, checkPenalty } from './conditions.js';

/** The Illusion powers of a character: [{ power, name, rank }]. */
export function illusionsOf(ch) {
  return allPowers(ch, { includeAlternates: true }).filter(({ power: p }) => p.effect === 'Illusion' && p.rank > 0 && p.role !== 'defense').map(({ power: p }) => ({ power: p, name: p.name, rank: p.rank }));
}

/** A sense that counters illusions sees through them at once. */
export const countersIllusion = (c) => /counters illusion/i.test(c.senses || '');

/** Can c be fooled: it has an Insight to oppose with (a mind), is not already fooled, and does not see through illusions? */
export const foolable = (c) => !c.out && !c.fled && c.skills?.Insight != null && !c.deceived && !countersIllusion(c);

/** The opposed check of the Illusion rank against the target's Insight, and what it comes to: { won, text, dice }. */
export function switchCheck(c, s, t, rng) {
  const duel = opposedCheck(rng, { bonus: s.rank - checkPenalty(c) }, { bonus: t.skills.Insight - checkPenalty(t) });
  const [r1, r2] = duel.rolls;
  return { won: duel.winner === 'a', duel, r1, r2, note: opposedNote(duel) };
}

/** Use the illusion: switch the look of `victim` (a teammate of `t`) with one of the illusionist's allies. Returns whether t was fooled. */
export function deceive(b, c, s, t, victim, rng) {
  const k = switchCheck(c, s, t, rng);
  const base = `${c.name} uses ${s.name} (rank ${s.rank}) to switch the looks of ${victim.name} and one of its own allies, so ${t.name} sees a foe in ${victim.name}: Illusion d20 ${k.r1} ${s.rank >= 0 ? '+' : ''}${s.rank} = ${k.duel.totals.a} vs ${t.name}'s Insight d20 ${k.r2} ${t.skills.Insight >= 0 ? '+' : ''}${t.skills.Insight} = ${k.duel.totals.b}${k.note}`;
  if (!k.won) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${base} — ${t.name} is not fooled.`, dice: [{ label: 'Illusion', roll: k.r1, mod: s.rank, total: k.duel.totals.a, dc: k.duel.totals.b }] }); return false; }
  t.deceived = { by: c.id, victim: victim.id, rank: s.rank, name: s.name };
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${t.name} is fooled and will attack ${victim.name} by mistake.`, dice: [{ label: 'Illusion', roll: k.r1, mod: s.rank, total: k.duel.totals.a, dc: k.duel.totals.b }], important: true });
  return true;
}

/** After the fooled fighter has attacked its teammate it has interacted with the illusion: an Insight check against 10 + rank to see through it. */
export function disbelieve(b, t, rng) {
  const d = t.deceived;
  if (!d) return;
  const dc = 10 + d.rank;
  const bonus = (t.skills.Insight ?? 0) - checkPenalty(t);
  const r = rollCheck(rng, bonus, dc);
  const text = `${t.name} looks at what it just struck: Insight d20 ${r.roll} ${bonus >= 0 ? '+' : ''}${bonus} = ${r.total} vs DC ${dc}${critNote(r)}`;
  if (r.success) { t.deceived = null; log(b, { kind: 'recover', actor: t.id, text: `${text} — it sees through ${d.name}.`, dice: [{ label: 'Insight', roll: r.roll, mod: bonus, total: r.total, dc }] }); }
  else log(b, { kind: 'miss', actor: t.id, text: `${text} — still fooled.`, dice: [{ label: 'Insight', roll: r.roll, mod: bonus, total: r.total, dc }] });
}

/** An illusion lasts while its maker can keep it up. Called with the other upkeeps before every end check. */
export function illusionUpkeep(b) {
  for (const t of b.combatants) {
    if (!t.deceived) continue;
    const owner = byId(b, t.deceived.by);
    const victim = byId(b, t.deceived.victim);
    if (owner && !owner.out && !owner.fled && canAct(owner) !== 'none' && victim && !victim.out && !victim.fled && victim.team === t.team) continue;
    log(b, { kind: 'recover', actor: t.id, text: `${t.deceived.name} fades: ${t.name} is no longer fooled.` });
    t.deceived = null;
  }
}

/** The teammates of t that an illusion could switch the look of (alive and not t itself). */
export const switchable = (b, t) => alive(b).filter((x) => x.team === t.team && x !== t);

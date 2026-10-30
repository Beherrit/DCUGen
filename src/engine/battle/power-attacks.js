// The attacks hidden inside Control effects that have no attack of their own on the sheet (Hero's Handbook p91, p108, p95).
//
// Create (p91): "Simply dropping an object on a target or targets requires a ranged attack check against Dodge. The object
// inflicts damage equal to its Toughness" (the effect rank), and an object can trap a target: an attack check against Dodge
// and a Dodge resistance check against the effect's rank, "a trapped character can break out of the object normally",
// which is the Snare effect, so the trap is a Snare of the Create rank.
// Move Object and Element Control (p108, p95): "Objects thrown into targets as attacks base their damage off your power rank
// as if it were your Strength rank" (a Throwing Mastery or Improvised Weapon rank adds 1 each), and the effect "can grab" a
// target with a ranged attack check, held with the effect rank, which is again a Snare of the effect's rank. A Perception
// Ranged one (Element Control always is) needs no attack check. house rule: Move Object is given something to throw
// whenever it is used (the fight does not track loose objects), and its disarm and trip uses are left out.
//
// Each comes back as the raw attack line derive.attacks() gives for a power, so combatant.js builds it like any other.

import { allPowers, attackKind, skillRanks, advantageRank } from '../derive.js';

const MOVE_OBJECT = ['Move Object', 'Element Control'];

/** The check bonus of a ranged power attack: Dexterity, Ranged Attack and the Ranged Combat ranks for the power. */
function rangedBonus(ch, abil, p) {
  return (abil.Dexterity ?? 0) + advantageRank(ch, 'Ranged Attack') + skillRanks(ch, 'Ranged Combat', p.attackSkill || p.name);
}

/** Extra damage rank thrown objects get: one per rank of Throwing Mastery and of Improvised Weapon, within twice the power level. */
function throwBonus(ch, p) {
  const want = advantageRank(ch, 'Throwing Mastery') + advantageRank(ch, 'Improvised Weapon');
  return Math.max(0, Math.min(want, 2 * (ch.pl || 0) - p.rank));
}

function lines(ch, R, abil, p, alternateOf) {
  const kind = attackKind(p, R) === 'perception' ? 'perception' : attackKind(p, R) === 'close' ? 'close' : 'ranged';
  const roll = kind !== 'perception';
  const bonus = roll ? rangedBonus(ch, abil, p) : null;
  const proxy = { ...p, effect: 'Snare', detail: '' };
  // The power level limit: attack bonus + effect rank is at most twice the PL (a Move Object of rank 20 on a PL 10 hero is not checked as an attack when built)
  const cap = (rank) => Math.max(1, Math.min(rank, 2 * (ch.pl || 10) - (bonus ?? 0)));
  const damage = p.effect === 'Create' ? { tag: 'dropped object', rank: p.rank } : { tag: 'thrown objects', rank: p.rank + throwBonus(ch, p) };
  const trap = p.effect === 'Create' ? 'trapping object' : 'seized in the air';
  return [
    { name: `${p.name} (${damage.tag})`, kind, effect: 'Damage', resistance: 'Toughness', bonus, rank: cap(damage.rank), roll, alternate: !!alternateOf, power: p },
    { name: `${p.name} (${trap})`, kind, effect: 'Snare', resistance: 'Dodge', bonus, rank: cap(p.rank), roll, alternate: !!alternateOf, power: proxy },
  ];
}

/** The raw attack lines for every Create, Move Object and Element Control power of the character. */
export function powerAttacks(ch, R, abil) {
  const out = [];  for (const { power: p, alternateOf } of allPowers(ch)) {
    if ((p.effect !== 'Create' && !MOVE_OBJECT.includes(p.effect)) || !(p.rank > 0) || p.role === 'defense') continue;
    out.push(...lines(ch, R, abil, p, alternateOf));
  }
  return out;
}

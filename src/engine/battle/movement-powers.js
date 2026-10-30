// What the movement-type and body effects add to a fighter in a fight, read once from its powers (Hero's Handbook p89, p98, p109, p119).
//
//  Super-Speed (p119): "Improved Initiative as an Enhanced Trait, Quickness, and Speed, with a ground speed rank equal to your power
//    rank": +4 to initiative per rank and speed at the rank. Quickness only speeds up routine tasks.
//  Burrowing (p89): "a speed rank equal to your Burrowing rank, minus 5" through soil and sand (hard clay and rock slow it more:
//    house rule, the ground of the fight is soil), under the ground, so past scenery and walls.
//  Movement (p109), one option per rank, chosen by the words of the power:
//    Permeate: through solid objects at speed rank -2, -1 or normal for 1, 2 or 3 ranks of it;
//    Slithering: no penalty for attacking while prone; Sure-footed: each rank takes a rank off the speed lost to obstacles
//    (impeding weather, ground), and Environmental Adaptation to wind, ice, mud or the like takes all of it.
//    Wall-crawling, water-walking, swinging, safe fall, trackless and the travel options have no use on this board.
//  Extra Limbs (p98): "the benefits of the Improved Grab advantage"; all the limbs on a grab give +1 per rank to a maximum of +5.
//    Weak Limbed (MA 98) takes 1 rank of Strength per rank off the limbs: house rule, it takes that much off the +1 per rank bonus,
//    since the limbs add no Strength of their own to the grab. A Distracting flaw leaves the user vulnerable after using them.

import { allPowers } from '../derive.js';

/** The traits as { superSpeed, burrow, permeate (ranks of speed lost, or null), slithers, sureFooted, adaptation, limbs, weakLimbs, limbsDistract }. */
export function movementTraits(ch) {
  const t = { superSpeed: 0, burrow: 0, permeate: null, slithers: false, sureFooted: 0, adaptation: false, limbs: 0, weakLimbs: 0, limbsDistract: false };
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (p.effect === 'Super-Speed') t.superSpeed = Math.max(t.superSpeed, p.rank);
    else if (p.effect === 'Burrowing') t.burrow = Math.max(t.burrow, p.rank);
    else if (p.effect === 'Extra Limbs') {
      t.limbs += p.rank;
      t.weakLimbs += (p.flaws || []).filter((f) => /^weak limbed/i.test(f.name)).reduce((s, f) => s + (f.steps ?? 1), 0);
      if ((p.flaws || []).some((f) => /^distracting/i.test(f.name))) t.limbsDistract = true;
    } else if (p.effect === 'Movement') {
      const text = `${p.detail || ''} ${p.name || ''}`;
      if (/permeate|phas(e|ing)|through (walls|solid)/i.test(text)) { const level = Math.max(1, Math.min(3, Number(/permeate\D{0,3}(\d)/i.exec(text)?.[1]) || p.rank)); t.permeate = Math.min(t.permeate ?? 2, 3 - level); }
      if (/slither/i.test(text)) t.slithers = true;
      if (/sure-?footed/i.test(text)) t.sureFooted = Math.max(t.sureFooted, p.rank);
      if (/adaptation|adapted/i.test(text) && /wind|storm|gale|ice|icy|mud|slick|rain|snow|surface/i.test(text)) t.adaptation = true;
    }
  }
  return t;
}

/** The speed rank Burrowing gives: its rank less 5 (a Burrowing 8 is speed rank 3), or 0. */
export const burrowSpeed = (rank) => Math.max(0, rank - 5);

/** The bonus all of a fighter's limbs add to a grab: +1 per rank to a maximum of +5, less what Weak Limbed takes. */
export const limbBonus = (t) => Math.max(0, Math.min(5, t.limbs) - t.weakLimbs);

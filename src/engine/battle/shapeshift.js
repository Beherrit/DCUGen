// Shapeshift (Hero's Handbook p116): a move action to take another form, "gaining the physical traits (abilities, skills,
// advantages and powers) of the assumed form. You gain (Shapeshift rank x 5) power points worth of traits." The character does not
// list its forms, so the fight offers a short menu of shapes, each costing exactly those points at the book's prices (a rank of
// Strength 2 points, of Toughness or a defense 1, of Damage 1), and the fighter takes the shape that scores best against the foes
// (form-score.js) when it beats the one it has by enough. The shape is sustained: it ends when the shapeshifter cannot keep it up.
// house rule: the shapes themselves are the menu below, since the book leaves the forms to the player. Not modelled: redistributing
// points spent on its own physical traits, skills and advantages of a form, and mental traits (which the book says are not gained).

import { allPowers } from '../derive.js';
import { log } from './util.js';
import { effectWeights } from './combatant.js';
import { canAct } from './conditions.js';
import { addMods, dropMods, withMods } from './mods.js';

/** The Shapeshift powers of a character: [{ power, name, rank, points }]. */
export function shapeshiftsOf(ch) {
  return allPowers(ch, { includeAlternates: true }).filter(({ power: p }) => p.effect === 'Shapeshift' && p.rank > 0 && p.role !== 'defense').map(({ power: p }) => ({ power: p, name: p.name, rank: p.rank, points: p.rank * 5 }));
}

/** The shapes: a label and the changes the points buy. */
export const SHAPES = [
  { key: 'brute', label: 'a hulking brute', mods: (P) => [{ kind: 'strength', amount: Math.floor(P / 2) }] },
  { key: 'armored', label: 'an armored hide', mods: (P) => [{ kind: 'defense', trait: 'Toughness', amount: P }] },
  { key: 'nimble', label: 'a lithe, quick body', mods: (P) => [{ kind: 'defense', trait: 'Dodge', amount: Math.floor(P / 2) }, { kind: 'defense', trait: 'Parry', amount: Math.ceil(P / 2) }] },
  { key: 'clawed', label: 'a clawed beast', mods: (P, c) => [{ kind: 'attack', attack: clawAttack(c, P) }] },
];

/** A claw attack of the given rank (Damage costs 1 point a rank), made with the fighter's Fighting. */
function clawAttack(c, rank) {
  const a = { id: `shape|claws|${rank}`, name: 'Claws', effect: 'Damage', kind: 'close', range: 'close', ext: 0, reachFt: 0, rank, bonus: c.d.abilities.Fighting ?? 0, roll: true, resistance: 'Toughness', descriptors: ['physical'], crit: 20, power: null };
  a.weights = effectWeights(a);
  return a;
}

/** The shape the fighter is in now (its key), or null. */
export const shapeOf = (c) => (c.mods || []).find((e) => e.source === 'shape')?.key || null;

/** Take a shape (a move action): the changes go on, the old shape's off. */
export function assumeShape(b, c, s, shape) {
  dropMods(c, 'shape');
  addMods(c, 'shape', shape.key, shape.mods(s.points, c));
  log(b, { kind: 'note', actor: c.id, text: `${c.name} uses ${s.name} (rank ${s.rank}) and becomes ${shape.label}: ${s.points} points of traits for the fight.`, important: true });
}

/** Back to its own body (the shape's changes come off). */
export function dropShape(b, c) {
  if (dropMods(c, 'shape')) log(b, { kind: 'note', actor: c.id, text: `${c.name} is itself again.` });
}

/** The shapes worth scoring from the fighter's own body: runs `score` for each with its changes on, with the current shape off. Returns [{ shape, score }]. */
export function scoreShapes(c, s, score) {
  const keep = (c.mods || []).filter((e) => e.source === 'shape');
  for (const e of keep) dropMods(c, 'shape', e.key);
  try { return SHAPES.map((shape) => ({ shape, score: withMods(c, shape.mods(s.points, c), () => score()) })); } finally { for (const e of keep) addMods(c, 'shape', e.key, e.mods, e.fades); }
}

/** A shape or a copy ends when its owner is down or cannot act (both are sustained). Called with the upkeeps before every end check. */
export function shapeUpkeep(b) {
  for (const c of b.combatants) {
    if (!(c.mods || []).some((e) => e.source === 'shape' || e.source === 'mimic') || (!c.out && !c.fled && canAct(c) !== 'none')) continue;
    dropMods(c, 'shape'); dropMods(c, 'mimic');
    log(b, { kind: 'note', actor: c.id, text: `${c.name} cannot keep up its borrowed traits any longer.` });
  }
}

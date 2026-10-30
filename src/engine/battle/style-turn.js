// A martial artist's changes through a round that are not part of its stance (Martial Arts 3e):
//   maneuver defense, p137: the change a basic maneuver makes to Parry and Dodge stays until the fighter's next turn.
//   Kata, p76: +2 to active defense in a round the fighter uses one of the style's maneuvers from one of its stances (not Neutral).
//   Mobile, p133: +2 to Parry or Dodge in a round the fighter moved more than 15 feet; Fixed, p132: the same when it moved no more than 5.
//   Impractical, p136: a natural 1 on a style attack costs the style's rank on all its checks for a round.
// Each is a short-lived entry of mods.js with its own source, taken off at the start of the fighter's next turn.

import { log } from './util.js';
import { addMods, dropMods } from './mods.js';
import { rollCheck } from './checks.js';
import { checkPenalty } from './conditions.js';
import { inReach } from './geometry.js';
import { stanceName, styleCheckMod } from './stance-fight.js';
import { bestBonus } from './stance-contest.js';

const SOURCES = ['maneuver', 'kata', 'mobile', 'fixed', 'impractical'];
const TRAITS = ['Parry', 'Dodge'];

/** Start of the fighter's turn: the round's defense changes end. */
export function styleStartTurn(c) {
  for (const s of SOURCES) dropMods(c, s);
}

/** A bonus to active defense, held within the power level limit (Dodge or Toughness together stay within twice the PL). */
function defenseBonus(c, trait, n) {
  const room = 2 * (c.pl || 10) - c.d.defenses.Toughness - (c.d.defenses[trait] + (c.actDef?.[trait] || 0));
  return Math.max(0, Math.min(n, room));
}

/** Before a style attack: the maneuver's change to Parry and Dodge, and Kata's bonus. */
export function beforeStyleAttack(b, c, atk) {
  if (atk.styleOwner) c.maRound = { struck: b.round };
  if (atk.manDef && (atk.manDef.Parry || atk.manDef.Dodge)) {
    addMods(c, 'maneuver', 'def', TRAITS.filter((t) => atk.manDef[t]).map((t) => ({ kind: 'active', trait: t, amount: atk.manDef[t] })));
  }
  const style = atk.styleOwner && c.ma?.styles.find((s) => s.name === atk.styleOwner);
  if (!style?.kata || c.stance?.style !== style.name || c.mods.some((e) => e.source === 'kata')) return;
  const mods = TRAITS.map((t) => ({ kind: 'active', trait: t, amount: defenseBonus(c, t, 2) })).filter((m) => m.amount);
  if (!mods.length) return;
  addMods(c, 'kata', 'kata', mods);
  log(b, { kind: 'note', actor: c.id, text: `Kata: ${c.name} moves through the ${style.name} form from ${stanceName(c)} stance: +${mods[0].amount} to Parry and Dodge for the round.` });
}

/** A natural 1 on an attack of a style with the Impractical flaw. */
export function impractical(b, c, atk) {
  const style = c.ma?.styles.find((s) => s.name === atk.styleOwner);
  const n = style?.fl.impractical || 0;
  if (!n || c.mods.some((e) => e.source === 'impractical')) return;
  const mods = [...c.attacks.filter((a) => a.roll).map((a) => ({ kind: 'tune', id: a.id, bonus: -n, src: 'Impractical' })), ...TRAITS.map((t) => ({ kind: 'active', trait: t, amount: -n }))];
  addMods(c, 'impractical', 'pen', mods);
  log(b, { kind: 'note', actor: c.id, text: `${c.name} fumbles: the ${style.name} style is impractical, and every check is at −${n} until its next turn.` });
}

/**
 * Bob and Weave (MA 74): a Close Combat: Fighting Style check, DC 10, as a move action; +1 to active defense for each degree of
 * success, kept until the fighter changes stance. The AI takes it when a foe is already in reach, so the move action is spare.
 */
export function bobAndWeave(b, c, enemies, mode, rng) {
  if (!c.adv['Bob and Weave'] || !c.ma || mode !== 'full' || c.mods.some((e) => e.source === 'bobweave') || !enemies.some((e) => inReach(b, c, e))) return mode;
  const bonus = bestBonus(c) - checkPenalty(c) + styleCheckMod(c);
  if (bonus < -50 || !TRAITS.some((t) => defenseBonus(c, t, 1))) return mode; // no stance skill, or no room under the power level limit
  const r = rollCheck(rng, bonus, 10);
  const n = r.success ? r.degrees : 0;
  const mods = TRAITS.map((t) => ({ kind: 'active', trait: t, amount: defenseBonus(c, t, n) })).filter((m) => m.amount);
  if (mods.length) addMods(c, 'bobweave', 'bobweave', mods);
  log(b, { kind: 'note', actor: c.id, text: `Bob and Weave: ${c.name} d20 ${r.roll} ${bonus >= 0 ? '+' : ''}${bonus} = ${r.total} vs DC 10 — ${mods.length ? `+${mods[0].amount} to Parry and Dodge until it changes stance` : 'no bonus'}.` });
  return 'standard';
}

/** End of the fighter's turn: Mobile and Fixed, from how far it moved. */
export function styleEndTurn(b, c) {
  if (!c.ma || c.out) return;
  const moved = (c.squaresMoved || 0) * b.grid.squareFt;
  for (const s of c.ma.styles) {
    const ranks = moved > 15 ? s.ex.mobile : moved <= 5 && c.maRound.struck === b.round ? s.ex.fixed : 0;
    if (!ranks || c.mods.some((e) => e.source === 'mobile' || e.source === 'fixed')) continue;
    const source = moved > 15 ? 'mobile' : 'fixed';
    const order = c.d.defenses.Parry <= c.d.defenses.Dodge ? TRAITS : [...TRAITS].reverse(); // the first rank goes to the lower defense
    const mods = order.slice(0, Math.min(2, ranks)).map((t) => ({ kind: 'active', trait: t, amount: defenseBonus(c, t, 2) })).filter((m) => m.amount);
    if (mods.length) { addMods(c, source, source, mods); log(b, { kind: 'note', actor: c.id, text: `${s.name} (${source === 'mobile' ? 'Mobile' : 'Fixed'}): ${c.name} ${source === 'mobile' ? 'kept moving' : 'held its ground'}, +2 to ${mods.map((m) => m.trait).join(' and ')} until its next turn.` }); }
  }
}

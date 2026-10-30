// Assessment (Hero's Handbook p70): a free action to size up a foe's combat capabilities. The fighter's Insight is
// opposed by the foe's Deception. A win tells it whether the foe's attack and defense bonuses are lower, higher or equal to
// its own; each further degree of success gives one of the foe's bonuses exactly. A loss tells it nothing, and more than one
// degree of failure may hand it a lie, which the log notes.
//
// The AI already works from every fighter's real numbers, so what Assessment changes here is its choice of target: it
// leans toward a foe whose defense it learned is lower than its own attack bonus, and away from a higher one.

import { log, sign } from './util.js';
import { opposedCheck, opposedNote } from './checks.js';
import { checkPenalty } from './conditions.js';
import { foeBonus } from './favored.js';
import { plainFx } from './fortune.js';

const attackOf = (c) => Math.max(0, ...c.attacks.filter((a) => a.roll).map((a) => a.bonus));
const defenseOf = (c) => Math.max(c.d.defenses.Dodge ?? 0, c.d.defenses.Parry ?? 0);
const compare = (theirs, mine) => (theirs > mine ? 'higher' : theirs < mine ? 'lower' : 'equal');

/** c sizes up t. Returns what it learned ({ attack, defense, exact }) or null. */
export function assess(b, c, t, rng) {
  const mine = c.skills.Insight + foeBonus(c, t, 'Insight') - checkPenalty(c);
  const theirs = t.skills.Deception - checkPenalty(t);
  const duel = opposedCheck(rng, { bonus: mine, fx: plainFx(b, c, 'assessment', () => false) }, { bonus: theirs });
  const [r1, r2] = duel.rolls;
  const head = `${c.name} sizes up ${t.name} (Assessment): Insight d20 ${r1} ${sign(mine)} = ${duel.totals.a} vs Deception d20 ${r2} ${sign(theirs)} = ${duel.totals.b}${opposedNote(duel)}`;
  if (duel.winner !== 'a') {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${head} — ${duel.degrees > 1 ? `${t.name} bluffs: ${c.name} may be misled` : 'it learns nothing'}.` });
    return null;
  }
  const found = { attack: compare(attackOf(t), attackOf(c)), defense: compare(defenseOf(t), defenseOf(c)), exact: [] };
  if (duel.degrees >= 2) found.exact.push(`attack bonus ${attackOf(t)}`);
  if (duel.degrees >= 3) found.exact.push(`best defense ${defenseOf(t)}`);
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${head} — ${t.name}'s attack bonus is ${found.attack} than ${c.name}'s, its best defense is ${found.defense} than ${c.name}'s${found.exact.length ? ` (exactly: ${found.exact.join(', ')})` : ''}.` });
  return found;
}

/** The start of a turn: size up each foe once. */
export function assessTurn(b, c, enemies, rng) {
  if (!c.adv.Assessment) return;
  c.assessed ||= {};
  for (const t of enemies) if (!(t.id in c.assessed)) c.assessed[t.id] = assess(b, c, t, rng);
}

/** How much more (or less) the fighter wants a foe it has sized up: a foe with the lower defense is the easier mark. */
export function assessBias(c, t) {
  const known = c.assessed?.[t.id];
  if (!known) return 1;
  return known.defense === 'lower' ? 1.1 : known.defense === 'higher' ? 0.92 : 1;
}

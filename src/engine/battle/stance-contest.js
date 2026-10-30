// Reading and breaking a foe's stance (Martial Arts 3e, Close Combat: Fighting Style, pp 49-50).
//
// Identify Stance: a Close Combat: Fighting Style check against the stance's DC, a free action, +2 to the DC for each stance
// identified after the first in a round, automatic for a fighter with Expertise in the subject's own style; line of sight needed.
// What it is worth: a fighter picks its own stance against the foes' stances it has identified; a foe in a stance it has not
// identified is judged as if it were in Neutral (stance-plan.js).
//
// Disrupt Stance: an attack declared disruptive takes -5 to hit and -2 Damage. If it lands (even with no damage) the two fighters
// roll opposed Close Combat: Fighting Style checks, and a defender who loses is thrown back to Neutral.
//
// What makes it harder or easier (pp 74, 77, 129, 133-135): Deceptive Stance -4 a rank against the checks, Esoteric -2 (one rank)
// or -5 (two or more), Predictable +2 a rank for the foe, Opposing Style +2 for the one who named the foe's style (opposing styles
// are not kept on the fighter, so it is not played), the Disruptive stance +8 on a disrupt and -4 on its other style checks.

import { log, sign } from './util.js';
import { rollCheck, opposedCheck, opposedNote, opposedOdds } from './checks.js';
import { checkPenalty } from './conditions.js';
import { lineClear, squares } from './geometry.js';
import { stanceName, choiceFor, leaveStance, styleCheckMod } from './stance-fight.js';

/** The best Fighting Style check bonus a fighter has (its stance choices all share the skill of their style). */
export const bestBonus = (c) => Math.max(-99, ...(c.ma?.choices || []).filter((x) => x.name !== 'Neutral').map((x) => x.bonus));

/** What the target's style does to checks made against it: Deceptive Stance, Esoteric and Predictable (negative helps the target). */
export function againstStyle(t, styleName) {
  const st = t.ma?.styles.find((s) => s.name === styleName) || t.ma?.styles[0];
  const esoteric = st?.ex.esoteric ? (st.ex.esoteric >= 2 ? -5 : -2) : 0;
  return -4 * (t.ma?.deceptive || 0) + esoteric + 2 * (st?.fl.predictable || 0);
}

/** Does c have Expertise in the style the foe's stance belongs to (automatic identification)? */
const knowsStyle = (c, styleName) => (c.ch.skills || []).some((s) => s.name === 'Expertise' && String(s.spec || '').toLowerCase().includes(String(styleName).toLowerCase()) && (s.ranks || 0) > 0);

/** Try to identify the stances of the foes in sight: a free action, the DC rising 2 for each after the first. */
export function identifyStances(b, c, enemies, rng) {
  if (!c.ma || bestBonus(c) < -50) return;
  const targets = enemies.filter((t) => t.stance && c.ma.known[t.id] !== t.stance.name && lineClear(b, c, t)).sort((x, y) => squares(c, x) - squares(c, y)).slice(0, 2);
  targets.forEach((t, i) => {
    const dc = (choiceFor(t, t.stance.name)?.dc ?? 13) + 2 * i;
    if (knowsStyle(c, t.stance.style)) { c.ma.known[t.id] = t.stance.name; log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} knows the ${t.stance.style} style and reads ${t.name}'s ${t.stance.name} stance at once.` }); return; }
    const bonus = bestBonus(c) - checkPenalty(c) + styleCheckMod(c) + againstStyle(t, t.stance.style);
    const r = rollCheck(rng, bonus, dc);
    if (r.success) c.ma.known[t.id] = t.stance.name;
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} studies ${t.name}: Identify Stance d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${dc} — ${r.success ? `${t.stance.name} stance` : 'cannot make out the stance'}.` });
  });
}

/** Does c see t's stance as it is? A foe in Neutral is always seen right. */
export const sees = (c, t) => !t.stance || c.ma?.known[t.id] === t.stance.name;

/** The two sides' bonuses in a disrupt contest. */
function contestBonuses(c, t) {
  const mine = bestBonus(c) - checkPenalty(c) + (stanceName(c) === 'Disruptive' ? 8 : 0) + againstStyle(t, t.stance?.style);
  const theirs = (choiceFor(t, t.stance?.name)?.bonus ?? bestBonus(t)) - checkPenalty(t) + (stanceName(t) === 'Disruptive' ? -4 : 0);
  return { mine, theirs };
}

/** The chance that a disruptive hit throws the target's stance (for the AI). */
export const disruptOdds = (c, t) => { const { mine, theirs } = contestBonuses(c, t); return opposedOdds(mine, theirs); };

/** A disruptive attack hit: the opposed checks, and the stance falls back to Neutral if the target loses. */
export function disruptContest(b, c, t, rng) {
  if (!t.stance || t.out) return;
  const { mine, theirs } = contestBonuses(c, t);
  const duel = opposedCheck(rng, { bonus: mine }, { bonus: theirs });
  const won = duel.winner === 'a';
  const [r1, r2] = duel.rolls;
  log(b, { kind: won ? 'condition' : 'note', actor: c.id, target: t.id, text: `Disrupt Stance: ${c.name} d20 ${r1} ${sign(mine)} = ${duel.totals.a} against ${t.name}'s d20 ${r2} ${sign(theirs)} = ${duel.totals.b}${opposedNote(duel)} — ${won ? `${t.name}'s ${t.stance.name} stance is thrown into disarray` : `${t.name} holds the ${t.stance.name} stance`}.`, important: won });
  if (won) leaveStance(b, t, `disrupted by ${c.name}`);
}

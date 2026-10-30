// One fighter's turn: the checks that can end it early, then the choice of plan. The attack itself is in turn-attack.js.

import { log, byId, enemiesOf, alliesOf } from './util.js';
import { STYLES } from './styles.js';
import { activeConditions, conditionLabels, canAct } from './conditions.js';
import { reachSquares, inReach, inRangeNow, shootSquares } from './geometry.js';
import { choosePlan, bestAttackVs } from './plan.js';
import { moveToward } from './movement.js';
import { resolveAttack } from './attacks.js';
import { applyEffect } from './attack-effects.js';
import { feint, grab, tryEscape } from './maneuvers.js';
import { spendHeroPoint, recoverAction } from './support.js';
import { attackTurn } from './turn-attack.js';
import { markTurn, mayFlee, mayDefend, recoverEarly, coverDefends, fleeChance, withdrawTurn, withdrawHolds } from './tactics.js';
import { supportTurn } from './support-plan.js';
import { recoverFatigue, fortuneTurn } from './fortune-turn.js';
import { shootCover } from './cover-damage.js';
import { planStanding, standOrDrop } from './stand.js';
import { deflectTurn } from './deflect-plan.js';
import { utilityTurn } from './utility.js';
import { refreshGrants } from './grants.js';
import { insubTurn } from './insub-turn.js';
import { flawsStartTurn, concentrationLost, uncontrolledFire, concentrate } from './flaw-turn.js';
import { heldAttack } from './flaw-grab.js';
import { steadyIdle } from './stabilize.js';
import { favoredTurn } from './favored.js';
import { readyTurn, dropReady } from './ready.js';
import { trickTurn } from './trick.js';
import { trapTurn } from './trap.js';
import { assessTurn } from './assessment.js';
import { weaponDefends, fetchWeapon } from './weapon-reactions.js';
import { runHoming, freeHeld, concentrateHeld } from './extra-run.js';
import { issueCommand } from './summon-run.js';
import { deceivedTurn } from './illusion-turn.js';
import { refreshEnvironment } from './environment.js';

const isHurt = (c) => c.staggered || c.bruises >= 2;

/** Every step below returns true when it used up the turn. */
export function takeTurn(b, R, c, rng) {
  c.defMod = 0;
  c.speedBoost = false; // extra effort for speed lasts until the start of the next turn
  dropReady(b, c); // a readied action that did not happen is lost (ready.js)
  markTurn(b, c);
  refreshGrants(b);
  refreshEnvironment(b); // speed lost to impeding weather and the light on each fighter (environment.js)
  let mode = canAct(c);
  const conds = conditionLabels(c).filter((x) => x !== 'Fled');
  c.defending = false;
  c.deflecting = false;
  flawsStartTurn(c);
  concentrationLost(b, c, mode);
  if (mode === 'none' && cannotAct(b, c, conds)) return;
  fetchWeapon(b, R, c, mode); // a disarmed fighter gets its weapon back: free with Quick Draw (weapon-reactions.js)
  favoredTurn(b, c, enemiesOf(b, c).length, alliesOf(b, c).length); // Favored Environment: +2 on attacks or defenses (favored.js)
  if (mode === 'controlled') { controlledTurn(b, R, c, rng); return; }
  if (deceivedTurn(b, R, c, rng)) return; // fooled by an Illusion: turns on the teammate whose look was switched (illusion-turn.js)
  const enemies = enemiesOf(b, c);
  assessTurn(b, c, enemies, rng); // Assessment: size up each foe once, a free action (assessment.js)
  if (!enemies.length) { steadyIdle(b, R, c, mode, rng); return; } // nobody left to fight: a medic tends a dying teammate (stabilize.js)
  if (losesNerve(b, c, enemies, rng)) return;
  if (mode === 'full' && issueCommand(b, c)) mode = 'standard'; // Command, a move action: orders to minions still waiting for them (summon-run.js)
  insubTurn(b, c, enemies); // a free action: change form, and flow out of a hold
  uncontrolledFire(b, R, c, enemies, rng); // an Uncontrolled power may go off by itself
  runHoming(b, R, c, rng); // a Homing attack that missed tries again, as a free action (extra-run.js)
  freeHeld(b, R, c, rng); // effects held with a free action or none (Increased Duration)
  if (escapeGrab(b, c, rng)) return;
  recoverFromDaze(b, c, mode, rng);
  recoverFatigue(b, c);
  if (concentrate(b, c)) return; // keeping a Concentration effect up takes the standard action
  if (withdrawTurn(b, c)) return;
  if (catchBreath(b, c, rng)) return;
  if (takeAimedShot(b, R, c, rng)) return;
  if (crushHeld(b, R, c, rng)) return;
  const choice = planStanding(c, () => choosePlan(b, R, c, enemies, rng, mode)); // a prone fighter plans as if it were on its feet
  if (utilityTurn(b, R, c, choice, enemies, mode, rng)) return; // a heal or a buff that beats the best attack
  if (concentrateHeld(b, R, c, choice, rng)) return; // an Increased Duration (concentration) effect kept up with the standard action
  if (!choice) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} finds nothing worth doing and holds position.` }); return; }
  if (withdrawHolds(b, c, choice)) return;
  if (fortuneTurn(b, c, choice, enemies)) return;
  if (supportTurn(b, c, choice, enemies, mode, rng)) return;
  if (digIn(b, c, choice, enemies, mode) || weaponDefends(b, c, choice, enemies)) return;
  if (deflectTurn(b, c, choice, enemies, mode)) return;
  if (trickTurn(b, c, choice, enemies, mode, rng)) return; // Trick, to set up a Redirect (trick.js)
  if (trapTurn(b, c, choice, enemies, mode)) return; // set a Triggered effect on the way a foe is coming (trap.js)
  if (readyTurn(b, c, choice, enemies, mode)) return; // hold the standard action for a foe walking into reach, or for a counter (ready.js)
  standOrDrop(b, c, choice, enemies, mode, rng);
  if (nonAttackPlan(b, R, c, choice, mode, rng)) return;
  attackTurn(b, R, c, choice, enemies, mode, rng);
}

/** Stunned or worse: a hero point can get the fighter back on its feet. True when the turn is lost. */
function cannotAct(b, c, conds) {
  // Hero point: recover from stunned (DCA 21)
  if (b.options.heroPoints && c.heroPoints > 0 && c.conditions.some((x) => x.name === 'Stunned' && x.degree <= 2)) {
    spendHeroPoint(b, c, 'recover');
    if (canAct(c) === 'none') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and loses the turn.` }); return true; }
    return false;
  }
  log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and can't act.` });
  return true;
}

/** Controlled by an enemy: attack one of your own side. Always uses up the turn. */
function controlledTurn(b, R, c, rng) {
  const ctrl = c.conditions.find((x) => x.name === 'Controlled');
  const master = byId(b, ctrl?.from);
  const victims = alliesOf(b, c);
  if (master && victims.length) {
    const t = victims[Math.floor(rng.next() * victims.length)];
    log(b, { kind: 'condition', actor: c.id, text: `${c.name} is controlled by ${master.name} and turns on ${t.name}!`, important: true });
    const atk = bestAttackVs(b, c, t, rng, { full: true }).attack;
    if (atk) {
      moveToward(b, c, t, rng, 1, atk.range === 'close' ? reachSquares(b, c, atk) : shootSquares(b, c));
      if (inRangeNow(b, c, atk, t)) resolveAttack(b, R, c, atk, t, rng, {}); // a controlled fighter that cannot get there swings at nothing
    }
    return;
  }
  log(b, { kind: 'skip', actor: c.id, text: `${c.name} stands controlled, with no one to turn on.` });
}

/** Morale: beasts and minions may break and run. */
function losesNerve(b, c, enemies, rng) {
  const S = STYLES[c.style];
  if (c.summon || !mayFlee(b, c)) return false; // a summoned minion is helpful to the summoner and does not run (summon.js)
  if (!(S.flees && !c.adv.Fearless && (c.staggered || (c.minion && c.bruises >= 1 && alliesOf(b, c).length < enemies.length)) && rng.chance(fleeChance(b, c, c.minion ? 0.35 : 0.3)))) return false;
  c.fled = true;
  log(b, { kind: 'flee', actor: c.id, text: `${c.name} has had enough and ${c.style === 'beast' ? 'bolts for cover' : 'runs for it'}.`, important: true });
  return true;
}

/** Escape a grab? True when the struggle used up the turn. */
function escapeGrab(b, c, rng) {
  if (!c.grabbedBy) return false;
  const holder = byId(b, c.grabbedBy);
  if (!holder || holder.out || holder.fled) { c.grabbedBy = null; return false; }
  if (tryEscape(b, c, holder, rng)) return true;
  return activeConditions(c).has('Bound');
}

/** Hero point on a dazed turn: recover to act fully (a hero point removes dazed, not staggered: DCA 21). */
function recoverFromDaze(b, c, mode, rng) {
  if (mode === 'standard' && b.options.heroPoints && c.heroPoints > 0 && c.dazed && !c.staggered && (isHurt(c) || rng.chance(0.4))) {
    spendHeroPoint(b, c, 'recover');
  }
}

/** Recover (once per conflict, DCA 177): badly hurt with no healer coming, catch your breath. */
function catchBreath(b, c, rng) {
  if (recoverEarly(b, c) && c.staggered && !c.recovered && !c.minion) { recoverAction(b, c); return true; }
  if (!c.recovered && !c.minion && (c.staggered || c.fatigue >= 2 || (c.bruises >= 3 && c.dazed)) && !alliesOf(b, c).some((a) => a.healing && !a.out)
    && (c.style === 'tank' || c.style === 'support' || c.style === 'duelist' || alliesOf(b, c).length > 0 || rng.chance(0.5))) {
    recoverAction(b, c);
    return true;
  }
  return false;
}

/** An aimed attack: take the shot lined up last turn (DCA 175). */
function takeAimedShot(b, R, c, rng) {
  if (!c.aiming) return false;
  const t = byId(b, c.aiming.target);
  const atk = c.attacks.find((a) => a.id === c.aiming.attack);
  if (t && !t.out && !t.fled && atk && inRangeNow(b, c, atk, t)) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} takes the aimed shot (+${c.aiming.bonus}).` });
    resolveAttack(b, R, c, atk, t, rng, { aimed: c.aiming.bonus });
    c.aiming = null;
    return true;
  }
  c.aiming = null;
  return false;
}

/** Hold: keep crushing a grabbed enemy. */
function crushHeld(b, R, c, rng) {
  if (!c.holding) return false;
  const victim = byId(b, c.holding);
  if (!victim || victim.out || victim.fled || victim.grabbedBy !== c.id) { c.holding = null; return false; }
  const unarmed = c.attacks.find((a) => a.unarmed) || c.attacks.find((a) => a.kind === 'close');
  const special = heldAttack(c, victim, unarmed); // a Grab-Based effect works on the held victim (flaw-grab.js)
  if (special) { resolveAttack(b, R, c, special, victim, rng, {}); return true; }
  if (!unarmed) return false;
  log(b, { kind: 'attack', actor: c.id, target: victim.id, text: `${c.name} ${c.style === 'beast' ? 'worries' : 'crushes'} ${victim.name} in ${c.style === 'beast' ? 'its jaws' : 'the hold'}: Damage ${unarmed.rank}, no attack roll needed.` });
  applyEffect(b, R, c, unarmed, victim, rng, { auto: true, crit: false });
  return true;
}

/** Defend (DCA 175): hurt, already recovered, outnumbered and with nothing that would land: dig in. */
function digIn(b, c, choice, enemies, mode) {
  if (!mayDefend(b, c)) return false;
  if (coverDefends(b, c, choice, enemies, mode)) {
    c.defending = true;
    log(b, { kind: 'note', actor: c.id, text: `${c.name} keeps their head down and defends: attackers must beat a rolled defense until their next turn.` });
    return true;
  }
  if (!(choice.plan === 'attack' && c.staggered && c.recovered && (choice.ev ?? 1) < 0.12 && enemies.length > alliesOf(b, c).length && ['support', 'duelist', 'tank'].includes(c.style))) return false;
  c.defending = true;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} goes on the defensive: attackers must beat a rolled defense until their next turn.` });
  return true;
}

/** The plans that are not an attack: close in, feint, grab. (Trip, disarm and smash go on to attackTurn, which gets the fighter in position first.) */
function nonAttackPlan(b, R, c, choice, mode, rng) {
  const { target, plan } = choice;
  if (plan === 'cover') { shootCover(b, c, choice, rng); return true; }
  if (plan === 'move') { moveToward(b, c, target, rng, mode === 'full' ? 2 : 1, choice.stopAt || reachSquares(b, c)); return true; }
  if (plan === 'feint') {
    if (mode === 'full') moveToward(b, c, target, rng, 1, reachSquares(b, c));
    feint(b, c, target, rng);
    return true;
  }
  if (plan === 'grab') {
    if (mode === 'full') moveToward(b, c, target, rng, 1, reachSquares(b, c));
    if (inReach(b, c, target)) grab(b, R, c, target, rng);
    return true;
  }
  return false;
}

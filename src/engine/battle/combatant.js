// Building a combatant from a character: its attacks, defenses, immunities and fight state.

import { deriveAll, advantageRank, allPowers, reducedRange } from '../derive.js';
import { repairPowerRoles } from '../repair.js';
import { hasExtra, extraOpt, clamp } from './util.js';
import { STYLES, detectStyle } from './styles.js';
import { SEVERITY, parseAffliction } from './conditions.js';
import { itemFor, deviceOf } from './items.js';
import { AREA_BASE, rankFt } from '../range.js';
import { ultimateKinds, dazeSkills } from './fortune-kinds.js';
import { deflectOf } from './deflect.js';
import { luckControlOf } from './luck.js';
import { parseWeakenTrait } from './weaken-traits.js';
import { giftsOf, applyGrants } from './grants.js';
import { detectRoles } from './roles.js';
import { attackDescriptors } from './descriptors.js';
import { immunitiesOf, fearImmune } from './immunity.js';
import { variableSize } from './variable-descriptor.js';
import { restoreForm } from './insubstantial.js';
import { flawsOf, shapeAttack, freshFlawState } from './flaws.js';
import { extrasOf } from './extras.js';
import { formAttack } from './attack-form.js';
import { powerAttacks } from './power-attacks.js';

export function effectWeights(attack) {
  if (attack.effect === 'Damage') return [0, 1, 2.3, 3.8, 6.5];
  if (attack.effect === 'Weaken') return [0, 0.8, 1.6, 2.6, 3.2];
  if (attack.effect === 'Nullify') return [0, 0.9, 1.4, 1.8, 2];
  // afflictions: worth depends on how bad the top tier is
  const w = [0];
  for (let i = 0; i < 3; i++) {
    const tier = attack.tiers?.[Math.min(i, (attack.tiers?.length || 1) - 1)] || ['Impaired'];
    const sev = Math.max(...tier.map((c) => SEVERITY[c] || 2));
    w.push(i < (attack.tiers?.length || 3) ? sev * 0.55 : w[w.length - 1]);
  }
  w.push(w[3]);
  return w;
}

/** Everything the simulator needs about one attack, from derive.attacks() plus the power itself. */
/** Blast, Strike, Energy Control, Magic and Energy Aura are Damage with a range or Reaction added (DCA 89-110). */
function combatEffect(name, R) {
  try { return name === 'Damage' || /^Damage\b/.test(R.effect(name).built_from || '') ? 'Damage' : name; } catch { return name; }
}

/**
 * How far an attack reaches, for the grid: its delivery (close, ranged or perception; an area follows its power's range),
 * Extended Range steps, the feet Reach adds to a close attack, and the size in feet of an area.
 */
function reachOf(a, p, R) {
  const steps = (name) => (p?.extras || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);
  let range = a.kind;
  if (a.kind === 'area') {
    let eff = null;
    try { eff = R.effect(p.effect).range; } catch { eff = null; }
    range = { Ranged: 'ranged', Perception: 'perception' }[reducedRange(p, p?.range || eff)] || 'close';
  }
  const out = { range, ext: range === 'ranged' ? steps('Extended Range') : 0, reachFt: range === 'close' ? 5 * steps('Reach') : 0 };
  if (a.kind === 'area') {
    const base = AREA_BASE[extraOpt(p, 'Area') || 'Burst'] || AREA_BASE.Burst;
    out.areaFt = (base.ft ?? AREA_BASE.Burst.ft) * 2 ** Math.max(0, steps('Area') - 1);
  }
  return out;
}

/** The Affects Insubstantial extra as 0 (none), 1 (half rank) or 2 (full rank), and Affects Corporeal as its steps (DCA 125). */
function insubExtras(p) {
  const ai = (p?.extras || []).find((m) => m.name === 'Affects Insubstantial');
  const ac = (p?.extras || []).filter((m) => m.name === 'Affects Corporeal').reduce((s, m) => s + (m.steps ?? 1), 0);
  return { affectsInsub: ai ? (/full/i.test(String(ai.option || '')) || (ai.steps ?? 1) >= 2 ? 2 : 1) : 0, affectsCorporeal: ac };
}

function buildAttack(c, a0, R, where = new Map()) {
  const a = { ...a0, effect: combatEffect(a0.effect, R) };
  const p = a.power || null;
  const eff = R.effect(a.effect);
  const atk = {
    id: `${a.name}|${a.effect}|${a.rank}|${a.kind}`,
    name: a.name, effect: a.effect, kind: a.kind, rank: a.rank, bonus: a.roll ? a.bonus : null, roll: !!a.roll,
    resistance: a.resistance || eff.resistance || 'Toughness',
    equipment: !!a.equipment, device: !!(p && deviceOf(c.ch, p)), item: itemFor(c.ch, a, p, R),
    unarmed: a.name === 'Unarmed', alternate: !!a.alternate,
    crit: a.crit || (p ? Math.max(16, 20 - advantageRank(c.ch, 'Improved Critical', p.name) - advantageRank(c.ch, 'Improved Critical')) : 20),
    descriptors: attackDescriptors(R, c.ch, a, p, where.get(p) || {}),
    variable: variableSize(p), ...insubExtras(p),
    multiattack: hasExtra(p, 'Multiattack'), penetrating: hasExtra(p, 'Penetrating'), selective: hasExtra(p, 'Selective'),
    area: a.kind === 'area' ? (extraOpt(p, 'Area') || 'Burst') : null,
    perception: a.kind === 'perception',
    ...reachOf(a, p, R),
    fear: /terror|fear|despair|cowering/i.test(p?.detail || ''),
    flaws: flawsOf(p),     // the flaws that change a fight, read once (flaws.js)
    ex: extrasOf(p),       // the extras that change a fight, read once (extras.js)
    power: p,
  };
  shapeAttack(atk);
  formAttack(atk, p, eff); // the Attack extra on a personal effect (attack-form.js)
  if (['Affliction', 'Dazzle', 'Sleep', 'Snare', 'Mind Control', 'Suffocation'].includes(a.effect)) Object.assign(atk, parseAffliction(p || { effect: a.effect }, R));
  if (a.effect === 'Weaken') {
    const detail = String(p?.detail || '');
    atk.resist = (/resisted by ([A-Za-z]+)/i.exec(detail)?.[1]) || 'Fortitude';
    atk.weakens = parseWeakenTrait(detail);
    atk.resistance = atk.resist;
  }
  if (a.effect === 'Nullify') atk.resistance = 'Rank or Will';
  if (a.effect === 'Mental Blast') atk.resistance = 'Will';
  if (atk.resist && !atk.resistance) atk.resistance = atk.resist;
  if (atk.resistance === 'Fortitude or Will') atk.resistance = atk.resist || 'Fortitude';
  if (/^(Will|Fortitude|Dodge|Toughness|Parry)$/i.test(atk.resistance)) atk.resistance = atk.resistance.replace(/^./, (x) => x.toUpperCase());
  atk.weights = effectWeights(atk);
  return atk;
}

function bestMoveRank(ch) {
  let best = 0;
  let flying = false;
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (['Speed', 'Flight', 'Teleport', 'Swimming'].includes(p.effect)) { best = Math.max(best, p.rank); if (p.effect === 'Flight') flying = true; }
    if (p.effect === 'Leaping') best = Math.max(best, Math.floor(p.rank / 2));
  }
  return { rank: best, flying };
}

/** The feet an Elongation power stretches the fighter's reach: the distance of its rank (Hero's Handbook p96). */
function elongationFt(ch) {
  const ranks = allPowers(ch, { includeAlternates: false }).filter(({ power: p }) => p.effect === 'Elongation').map(({ power: p }) => p.rank);
  return ranks.length ? rankFt(Math.max(...ranks)) : 0;
}
/** Build a combatant from a character. opts: { team, style, tactics, heroPoints, name, carry: { bruises, fatigue } }. A carry is damage taken in an earlier fight, put back when the battle starts (startBattle). */
export function makeCombatant(R, ch, opts = {}) {
  repairPowerRoles(ch, R);
  const d = deriveAll(ch, R);
  const style = opts.style && STYLES[opts.style] ? opts.style : detectStyle(ch, R);
  const c = {
    id: opts.id || `b-${Math.random().toString(36).slice(2, 9)}`,
    name: opts.name || ch.identity?.codename || ch.identity?.realName || 'Fighter',
    team: opts.team || 'A',
    color: ch.theme?.color || '#6b7480',
    ch,
    pl: ch.pl || 10,
    minion: !!ch.minion || style === 'minion',
    style, tactics: opts.tactics || 'auto',
    heroPoints: opts.heroPoints ?? (ch.minion || style === 'minion' || style === 'beast' ? 0 : 1),
    luck: opts.luck ?? (ch.minion || style === 'minion' || style === 'beast' ? 0 : advantageRank(ch, 'Luck')), // re-rolls left this fight (Luck, p78)
    x: 0, y: 0,
    carry: opts.carry ? { bruises: opts.carry.bruises || 0, fatigue: opts.carry.fatigue || 0 } : null,
  };
  resetCombatant(c);
  rebuildCombatant(c, R, d);
  return c;
}

/** The fight-state part of a combatant (kept when a battle is reset). */
export function resetCombatant(c) {
  Object.assign(c, {
    insub: null,           // the Insubstantial form in force (insubstantial.js), set again by rebuildCombatant for an innate one
    init: 0, initRoll: 0, bruises: 0, dazed: false, staggered: false, out: false, outReason: null, fled: false,
    ready: null,           // { kind: 'attack' | 'counter', atk, round }: an action held for a trigger (ready.js)
    lasting: [], homing: [], contagion: [], secondary: [], stacks: {}, // extras that come back later (extra-after.js, extra-run.js, resist-step.js)
    incurable: null, surprisedBy: [], assessed: null, // Incurable damage (damage-result.js), who has surprised this fighter (extra-bounce.js), Assessment (assessment.js)
    disarmed: [],          // keys of items lost to a disarm, which can be picked up again (weapon-reactions.js)
    tricked: null,         // { by, round } after another fighter's Trick: its missed attack can be redirected (trick.js)
    envAttack: 0,          // +2 on attack checks from Favored Environment, until the start of the next turn (favored.js)
    speedBoost: false, owesFatigue: false, effortRound: null, // extra effort: +1 speed rank this turn; the round extra effort was last used (effort.js)
    dying: false, dead: false, stable: false, diehard: false, dyingFails: 0, dyingRound: null, // dying and death in a lethal fight (dying.js)
    conditions: [],        // [{ name, degree, from, source, dc, resist, cumulative, progressive, tiers, extraCondition, until }]
    weakened: {},          // trait -> ranks lost
    fatigue: 0, defMod: 0, feinted: false, grabbedBy: null, holding: null, nullified: 0, regen: 0, interposed: false,
    lastAttackId: null, usedEffort: 0, luckRound: null, inspired: null, inspireUsed: false, feats: [], teamedRound: null, surpriseActor: false,
    dropped: [],           // keys of items lost to a disarm or a smash: their attacks stay removed (items.js)
    flaw: freshFlawState(), // what is switched on, used, faded or done for the flaws (flaws.js)
    distracted: false,     // used a Distracting effect: vulnerable until the start of the next turn
    fastReturn: 0,         // extra ranks of Weaken that return each round (Fast Return)
    noMove: false,         // the move action went on standing up this turn
    squaresMoved: 0,       // squares moved so far this turn (Move-by Action splits the speed)
    grants: [],            // traits lent by an ally's Affects Others power: [{ by, key, trait, kinds, amount }] (grants.js)
    healFailed: false,     // a Healing check on this fighter failed: no second try this fight (the book says wait a minute)
    aid: [],               // Aid received: [{ by, vs, mode, amount, until }]
    escaped: false,        // got away under Fighting Withdrawal (also marked fled, so it leaves the fight)
    recovered: false,      // the Recover action: once per conflict (DCA 177)
    behind: null,          // the cover piece this fighter stands behind (its id)
    aiming: null,          // { target, bonus } after an Aim action (DCA 175)
    defending: false,      // the Defend action, until the start of their next turn (DCA 175)
    deflecting: false,     // the Defend action taken to deflect for the team (deflect.js), until their next turn
    deflectRound: null,    // the round a Reaction deflect was last used
    luckCtlRound: null,    // the round a Luck Control reaction was last used (luck.js)
    bestowedRound: null,   // the round an ally last bestowed a luck point on this fighter
    deceived: null,        // { by, victim, rank, name } while an Illusion has this fighter taking a teammate for a foe (illusion.js)
    slowed: 0, lit: 0, envChecks: 0, // ranks of speed lost and the light on it from an Environment, and the heat or cold checks made (environment.js)
    summon: null,          // set on a summoned minion or duplicate: { by, power, since, needsOrders, commanded, ... } (summon.js)
    summonDazed: false,    // a summoned minion is dazed unless its power is Active (summon.js)
    summoned: [],          // the ids of the minions this fighter has called in this fight
    resistedSummon: {},    // Resistible Summon powers whose minion resisted: no second try (summon-run.js)
    stats: { attacks: 0, hits: 0, crits: 0, degrees: 0, kos: 0, healed: 0, taken: 0 },
  });
}

/** Derived numbers (recomputed on load, since only the character is saved). */
export function rebuildCombatant(c, R, d = null) {
  // A fighter saved before hand-built attack powers were repaired: repair it, and redo the style that was
  // guessed from the broken build (it saw no attacks, so a ranged fighter read as a brawler or powerhouse).
  const was = JSON.stringify(c.ch?.powers || []);
  repairPowerRoles(c.ch, R);
  if (!d && JSON.stringify(c.ch?.powers || []) !== was && c.style !== 'minion') c.style = detectStyle(c.ch, R);
  d = d || deriveAll(c.ch, R);
  c.d = d;
  c.flaw ||= freshFlawState();           // a battle saved before the flaws were simulated has none
  c.initBonus = d.initiative;
  const where = new Map(allPowers(c.ch).map((x) => [x.power, x]));
  c.attacks = [...d.attacks, ...powerAttacks(c.ch, R, d.abilities)].map((a) => buildAttack(c, a, R, where)).filter((a) => (a.rank > 0 || a.effect !== 'Damage') && !(a.item && (c.dropped || []).includes(a.item.key)) && !(a.ex?.attackForm && !a.formOk));
  powerStats(c);
  c.immune = immunitiesOf(c.ch, d);      // [{ label, half, hits(atk), crit, interaction, fear, grab, environment }] (immunity.js)
  c.insub = restoreForm(c);              // the Insubstantial form the fighter is in, or null (insubstantial.js)
  const mv = bestMoveRank(c.ch);
  c.speed = 1 + Math.min(4, Math.floor(mv.rank / 3));
  c.flying = mv.flying;
  c.adv = Object.fromEntries(['Power Attack', 'Accurate Attack', 'All-out Attack', 'Defensive Attack', 'Takedown', 'Interpose', 'Evasion', 'Fearless', 'Seize Initiative', 'Move-by Action', 'Fast Grab', 'Improved Grab', 'Improved Hold', 'Chokehold', 'Agile Feint', 'Uncanny Dodge', 'Improved Initiative', 'Diehard', 'Instant Up', 'Luck', 'Taunt', 'Teamwork', 'Improved Trip', 'Improved Disarm', 'Improved Smash', 'Prone Fighting', 'Improved Aim', 'Improved Defense', 'Grabbing Finesse', 'Leadership', 'Inspire', 'Set-up', 'Startle', 'Great Endurance', 'Extraordinary Effort', 'Assessment', 'Quick Draw', 'Improvised Weapon', 'Redirect', 'Weapon Bind', 'Weapon Break', 'Fascinate'].map((n) => [n, advantageRank(c.ch, n)]));
  if (fearImmune(c)) c.adv.Fearless = Math.max(1, c.adv.Fearless || 0); // Immunity to fear is Fearless (DCA 77, 102)
  const sk = (name) => d.skills.find((s) => s.name === name)?.bonus ?? (d.abilities[R.skillAbility(name)] ?? 0);
  c.skills = { Deception: sk('Deception'), Insight: sk('Insight'), Acrobatics: sk('Acrobatics'), Athletics: sk('Athletics'), Intimidation: sk('Intimidation'), 'Sleight of Hand': sk('Sleight of Hand'), Treatment: d.skills.find((s) => s.name === 'Treatment')?.bonus ?? null };
  c.ultimate = ultimateKinds(c.ch);      // the checks an Ultimate Effort covers
  c.dazeSkills = dazeSkills(c.ch);       // the skills a Daze can use
  c.moveRank = mv.rank;
  c.moveFt = rankFt(mv.rank);
  c.elongFt = elongationFt(c.ch);
  c.deflect = deflectOf(c.ch);           // Deflect: { rank, reaction, reflect, redirect } or null
  c.luckCtl = luckControlOf(c.ch);       // Luck Control: { caps, mineOnly } or null
  // Precise Attack is bought per pairing, like "Ranged, Cover" (DCA 77)
  c.precise = (c.ch.advantages || []).filter((a) => a.name === 'Precise Attack').map((a) => String(a.param || '').toLowerCase());
  c.gifts = giftsOf(c.ch);               // traits this fighter can lend to an ally
  addOmniStunts(c, d);
  applyGrants(c);
  c.roles = detectRoles(c);
  return c;
}

/** What the character's powers add up to: Impervious, sustained protection, Regeneration, Healing, Concealment, senses, Variable. */
function powerStats(c) {
  const pw = allPowers(c.ch, { includeAlternates: false }).map((x) => x.power);
  c.impervious = pw.filter((p) => ['Protection', 'Force Field'].includes(p.effect) && hasExtra(p, 'Impervious')).reduce((s, p) => s + p.rank, 0);
  const sustained = pw.filter((p) => p.effect === 'Force Field' || (p.effect === 'Protection' && hasExtra(p, 'Sustained')));
  c.sustainedProtection = sustained.filter((p) => !hasExtra(p, 'Innate')).reduce((s, p) => s + p.rank, 0); // Innate powers cannot be nullified (DCA 130)
  c.innateProtection = sustained.filter((p) => hasExtra(p, 'Innate')).reduce((s, p) => s + p.rank, 0);
  c.regenRank = pw.filter((p) => p.effect === 'Regeneration').reduce((s, p) => s + p.rank, 0);
  const heal = allPowers(c.ch).map((x) => x.power).find((p) => p.effect === 'Healing');
  c.healing = heal ? { name: heal.name, rank: heal.rank, ranged: reducedRange(heal, heal.range || 'Close') !== 'Close', proficient: extrasOf(heal)?.proficient || 0 } : null;
  const conceal = pw.find((p) => ['Concealment', 'Invisibility'].includes(p.effect) && (!p.detail || /visual|sight|vision/i.test(p.detail)));
  c.concealment = conceal ? ((conceal.flaws || []).some((f) => /Blending|Limited|Partial/i.test(f.name)) || conceal.rank < 2 ? 'partial' : 'total') : null;
  c.concealDark = !!conceal && /dark|shadow|night|gloom|murk/i.test(`${conceal.name} ${conceal.detail || ''} ${(conceal.descriptors || []).join(' ')}`);
  c.senses = pw.filter((p) => p.effect === 'Senses').map((p) => p.detail || '').join(' ');
  const variable = pw.find((p) => p.effect === 'Variable');
  c.variable = variable ? { name: variable.name, points: variable.rank * 5 } : null;
}

/** Omni-powers: a Variable pool can be configured into an attack each turn. */
function addOmniStunts(c, d) {
  if (c.variable && c.style === 'omni') {
    const base = d.abilities.Dexterity ?? 0;
    const rank = clamp(Math.floor(c.variable.points / 2), 1, 2 * c.pl - base);
    const stunt = (name, effect, extra) => ({ id: `variable|${effect}|${name}`, name: `${c.variable.name}: ${name}`, effect, kind: 'ranged', range: 'ranged', ext: 0, reachFt: 0, rank, bonus: base, roll: true, resistance: 'Toughness', descriptors: ['variable'], crit: 20, weights: null, stunt: true, power: null, ...extra });
    const stunts = [
      stunt('Energy Blast', 'Damage', { resistance: 'Toughness' }),
      stunt('Stunning Pulse', 'Affliction', { resistance: 'Fortitude', resist: 'Fortitude', tiers: [['Dazed'], ['Stunned'], ['Incapacitated']], maxDegree: 3 }),
      stunt('Mind Lock', 'Affliction', { resistance: 'Will', resist: 'Will', tiers: [['Entranced'], ['Compelled'], ['Controlled']], maxDegree: 3 }),
      stunt('Binding Field', 'Affliction', { resistance: 'Dodge', resist: 'Dodge', tiers: [['Hindered', 'Vulnerable'], ['Defenseless', 'Immobile']], maxDegree: 2 }),
    ];
    for (const s of stunts) s.weights = effectWeights(s);
    c.attacks.push(...stunts);
  }
}

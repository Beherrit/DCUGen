// The recurring villain: every defeat feeds a grudge. The villain earns power points the way heroes
// do (DCA 190) and spends them on counters to whatever beat them: the defense that kept failing gets
// stronger, within the power level limits. Between sessions a scheme clock ticks toward the villain's
// plan, and each step leaves a hint the GM can put in the newspaper.

import { startAdvancement, awardPoints, recordChanges } from './advancement.js';
import { checkLimits } from './limits.js';
import { costBreakdown } from './costs.js';

export const isNemesis = (ch) => !!ch?.nemesis;

export function makeNemesis(ch, { scheme = '', steps = 6, perDefeat = 2 } = {}) {
  const c = JSON.parse(JSON.stringify(ch));
  c.nemesis = { grudge: 0, defeats: [], perDefeat, scheme: { name: scheme || 'a scheme no one has seen yet', steps, progress: 0, hints: [] } };
  return c;
}

// Which defense a logged roll tested, from its dice label and text.
function defenseOf(entry, die) {
  const l = String(die.label || '');
  if (/Toughness/.test(l)) return 'Toughness';
  if (/Fortitude/.test(l)) return 'Fortitude';
  if (/Will/.test(l)) return 'Will';
  if (/^Dodge/.test(l)) return 'Dodge';
  if (/Attack/.test(l)) return /vs Parry/.test(entry.text) ? 'Parry' : /vs Dodge/.test(entry.text) ? 'Dodge' : null;
  return null;
}

/**
 * What a battle taught a combatant: how often each defense failed it, who hurt it most, and whether it
 * lost. Returns { lost, failures: { Toughness: n, ... }, beatenBy: [names], worst }.
 */
export function lessonsFromBattle(battle, cid) {
  const me = battle.combatants.find((c) => c.id === cid);
  if (!me) return null;
  const failures = {};
  const by = {};
  for (const e of battle.log || []) {
    if (e.target !== cid || !Array.isArray(e.dice)) continue;
    for (const die of e.dice) {
      if (die.dc == null || die.total == null) continue;
      const def = defenseOf(e, die);
      if (!def) continue;
      // Resistance checks fail when the total is short of the DC; attack rolls "fail" the defense when they hit.
      const failed = /Attack/.test(die.label) ? die.total >= die.dc : die.total < die.dc;
      if (!failed) continue;
      failures[def] = (failures[def] || 0) + 1;
      const who = battle.combatants.find((c) => c.id === e.actor);
      if (who && who.team !== me.team) by[who.name] = (by[who.name] || 0) + 1;
    }
  }
  const lost = me.out || me.fled || (battle.winner && battle.winner !== me.team);
  const worst = Object.entries(failures).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { lost: !!lost, failures, worst, beatenBy: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k]) => k) };
}

/** Buy one rank of a defense (Toughness through Protection). Mutates; returns an undo function. */
function buyRank(ch, def) {
  if (def === 'Toughness') {
    let p = (ch.powers || []).find((x) => x.effect === 'Protection');
    if (!p) { p = { name: 'Hardened (learned from defeat)', effect: 'Protection', rank: 0, extras: [], flaws: [], descriptors: [], alternates: [], role: 'defense' }; ch.powers = [...(ch.powers || []), p]; }
    p.rank += 1;
    return () => { p.rank -= 1; if (!p.rank) ch.powers = ch.powers.filter((x) => x !== p); };
  }
  ch.defenses = ch.defenses || {};
  ch.defenses[def] = (ch.defenses[def] || 0) + 1;
  return () => { ch.defenses[def] -= 1; };
}

/**
 * After a defeat: grudge +1, the villain earns points and spends them on the defenses that failed,
 * staying inside the PL limits. Leftover points stay saved. Mutates a copy and returns
 * { ch, bought: { Will: 2 }, saved, text }.
 */
export function adaptNemesis(ch0, R, lesson, { date = new Date().toISOString().slice(0, 10), battleName = 'a fight' } = {}) {
  const ch = JSON.parse(JSON.stringify(ch0));
  if (!ch.nemesis) Object.assign(ch, makeNemesis(ch));
  const n = ch.nemesis;
  n.grudge += 1;
  const points = n.perDefeat ?? 2;
  startAdvancement(ch, R);
  awardPoints(ch, R, points, `Defeated in ${battleName}${lesson.beatenBy.length ? ` by ${lesson.beatenBy.slice(0, 2).join(' and ')}` : ''}: the grudge grows`);
  const order = [...lesson.worst, 'Toughness', 'Will', 'Dodge', 'Parry', 'Fortitude'].filter((d, i, a) => a.indexOf(d) === i);
  const bought = {};
  const plErrors = () => checkLimits(ch, R).filter((i) => i.severity === 'error' && i.pl).length;
  const baseErrors = plErrors();
  // Spend only what this defeat earned (not slack in the villain's PL budget).
  const cap = costBreakdown(ch, R).total + points;
  let guard = 0;
  while (costBreakdown(ch, R).total < cap && guard++ < 40) {
    let got = false;
    for (const def of order) {
      const undo = buyRank(ch, def);
      if (plErrors() > baseErrors || costBreakdown(ch, R).total > cap) { undo(); continue; }
      bought[def] = (bought[def] || 0) + 1; got = true; break;
    }
    if (!got) break;
  }
  const left = cap - costBreakdown(ch, R).total;
  const lessonText = Object.keys(bought).length ? Object.entries(bought).map(([d, k]) => `${d} +${k}`).join(', ') : 'nothing fits under the power level yet; the points wait';
  recordChanges(ch, R, `Learned from defeat${lesson.beatenBy.length ? ` by ${lesson.beatenBy[0]}` : ''}: ${lessonText}`);
  n.defeats.push({ date, battle: battleName, by: lesson.beatenBy.slice(0, 3), failed: lesson.worst.slice(0, 2), bought });
  const name = ch.identity?.codename || 'The villain';
  const text = `${name} lost ${battleName} and won't forget it (grudge ${n.grudge}). ${points} power points earned${Object.keys(bought).length ? `, spent on ${lessonText}` : ''}${lesson.worst[0] ? `: ${lesson.worst[0]} kept failing` : ''}.`;
  return { ch, bought, saved: Math.max(0, left), text };
}

// ---- the scheme clock ---------------------------------------------------------------------------------

const HINTS = {
  rumor: [
    'Strange shipments are turning up at the docks, signed for by a company no one can find.',
    'Three scientists have quietly resigned from the university in the same week.',
    'Power flickers across {city} at the same minute every night.',
    'An anonymous buyer is paying triple for {thing}.',
    'Street informants won\'t say {villain}\'s name out loud any more.',
  ],
  evidence: [
    'A warehouse fire turns up blueprints for something no one can identify.',
    'Security footage shows {villain}\'s associates casing {place}.',
    'A stolen shipment of {thing} is traced to an empty lot that wasn\'t empty last week.',
    'A courier with a coded ledger is pulled out of the river, alive and terrified.',
    'Readings from the observatory spike every time {villain} is sighted.',
  ],
  imminent: [
    'Evacuation drills are quietly scheduled near {place}.',
    'Every hired gun in {city} has been paid in advance for the same night.',
    '{villain} sends the heroes an invitation. RSVP not required.',
    'The device is nearly built: the last component is {thing}.',
    'A countdown appears on every screen in {city}, and nobody can turn it off.',
  ],
  climax: ['{villain}\'s plan, {scheme}, comes to a head: tonight.'],
};
const THINGS = ['rare earth magnets', 'a museum\'s meteorite', 'quantum processors', 'an ancient relic', 'industrial coolant', 'satellite time', 'the city\'s blood bank', 'a prototype battery'];
const PLACES = ['the waterfront', 'the old observatory', 'City Hall', 'the power plant', 'the stadium', 'the museum district', 'the train yards'];

/** Advance the scheme clock one step. Returns { ch, hint, phase, done }. */
export function advanceScheme(ch0, { city = 'the city', rng = Math.random } = {}) {
  const ch = JSON.parse(JSON.stringify(ch0));
  if (!ch.nemesis) Object.assign(ch, makeNemesis(ch));
  const s = ch.nemesis.scheme;
  s.progress = Math.min(s.steps, s.progress + 1);
  const f = s.progress / s.steps;
  const phase = s.progress >= s.steps ? 'climax' : f < 0.34 ? 'rumor' : f < 0.67 ? 'evidence' : 'imminent';
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const used = new Set(s.hints.map((x) => x.template));
  const options = HINTS[phase].filter((t) => !used.has(t));
  const template = pick(options.length ? options : HINTS[phase]);
  const hint = template.replace(/\{villain\}/g, ch.identity?.codename || 'the villain').replace(/\{scheme\}/g, s.name).replace(/\{city\}/g, city).replace(/\{thing\}/g, pick(THINGS)).replace(/\{place\}/g, pick(PLACES));
  s.hints.push({ step: s.progress, phase, template, text: hint, date: new Date().toISOString().slice(0, 10) });
  return { ch, hint, phase, done: s.progress >= s.steps };
}

export function schemeLabel(ch) {
  const s = ch?.nemesis?.scheme;
  if (!s) return '';
  return `${s.progress} of ${s.steps}: ${s.progress >= s.steps ? 'it happens now' : s.progress / s.steps >= 0.67 ? 'nearly ready' : s.progress / s.steps >= 0.34 ? 'taking shape' : 'barely begun'}`;
}

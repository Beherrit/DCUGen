// Session in a Box: five-minute prep from the players' own characters. A villain (a recurring one if
// the campaign has one, else someone from a hero's past, else a fresh one) checked against the party
// with the Battle Room's balance tool; a minion squad; four scenes (a hook from a bio, an investigation
// set where a complication will bite, an ambush, the showdown), each giving a different hero the
// spotlight; a rumor for the newspaper.

import { makeRng, randomSeed } from './rng.js';
import { generateCharacter } from './generator.js';
import { generateMinionSquad } from './workshop.js';
import { rogueCandidates, makeRogue } from './rogues.js';
import { createBattle, addCombatant, makeCombatant } from './battle.js';
import { tuneBattle, scaleCharacter, verdict, DIFFICULTIES } from './balance.js';
import { deriveAll } from './derive.js';

const name = (c) => c?.identity?.codename || c?.identity?.realName || 'Someone';
const first = (c) => String(c?.identity?.realName || name(c)).split(/\s+/)[0];

// Where a complication bites: a setting that brings it into play (the words the GM screen matches on).
function settingFor(comp, rng) {
  const t = String(comp?.type || '').toLowerCase();
  const word = (/to ([a-z]+)/.exec(t) || /fear of ([a-z]+)/.exec(t) || [])[1];
  if (/identity|secret/.test(t)) return rng.pick(['a press conference with cameras everywhere', 'a family dinner across town', 'a charity gala full of reporters']);
  if (/weakness/.test(t) && word) return `a vault stacked with ${word}`;
  if (/phobia|fear/.test(t) && word) return `somewhere full of ${word}`;
  if (/relationship|dependent|love/.test(t)) return rng.pick(['a hospital where someone they love is a patient', 'the school play they promised to attend']);
  if (/responsib|job|work/.test(t)) return rng.pick(['their workplace, on a shift they can\'t skip', 'an exam they can\'t miss']);
  if (/reputation|famous/.test(t)) return rng.pick(['a live TV interview', 'a crowd of fans and paparazzi']);
  if (/prejudice|hatred/.test(t)) return rng.pick(['a protest that turns ugly', 'a police checkpoint']);
  if (/honor|code|motivation/.test(t)) return rng.pick(['a hostage standoff', 'a deal that would save lives and break a promise']);
  if (/enemy|rival/.test(t)) return 'an old enemy\'s turf';
  if (/temper/.test(t)) return 'a room full of people mocking them';
  return null;
}

const SKILL_SCENES = [
  { skill: 'Investigation', verb: 'piece together the clues' },
  { skill: 'Perception', verb: 'spot what everyone missed' },
  { skill: 'Insight', verb: 'read who is lying' },
  { skill: 'Persuasion', verb: 'talk the witness into helping' },
  { skill: 'Technology', verb: 'crack the villain\'s gear' },
  { skill: 'Expertise', verb: 'know what the strange evidence means' },
  { skill: 'Intimidation', verb: 'lean on the informant' },
];

/** The hero best at a skill (their bonus), for the spotlight. */
function bestAt(heroes, R, skill) {
  let best = null;
  for (const h of heroes) {
    let d; try { d = deriveAll(h, R); } catch { continue; }
    const s = d.skills.filter((x) => x.name === skill).sort((a, b) => b.bonus - a.bonus)[0];
    if (s && (!best || s.bonus > best.bonus)) best = { hero: h, bonus: s.bonus };
  }
  return best;
}

/**
 * Build a session. heroes: the party (characters). roster: everyone saved (for recurring villains).
 * quiet: hero names with the least spotlight so far (they get the first scenes).
 * Returns { villain: { ch, why, k, odds }, minions, scenes, rumor, city, seed }.
 */
export function prepSession(R, { heroes, roster = [], quiet = [], difficulty = 'tense', seed = randomSeed(), tune = true, n = 40 }) {
  if (!heroes?.length) throw new Error('Put the party on the board (or save their characters to the roster) first.');
  const rng = makeRng(`prep::${seed}`);
  const pl = Math.round(heroes.reduce((s, h) => s + (h.pl || 10), 0) / heroes.length);
  const order = [...heroes].sort((a, b) => (quiet.indexOf(name(a)) < 0 ? 99 : quiet.indexOf(name(a))) - (quiet.indexOf(name(b)) < 0 ? 99 : quiet.indexOf(name(b))));
  const city = order.map((h) => h.identity?.base).find(Boolean) || 'the city';

  // ---- the villain
  let villain; let why;
  const nemesis = roster.find((c) => c.nemesis && c.nemesis.scheme && c.nemesis.scheme.progress < c.nemesis.scheme.steps);
  if (nemesis) { villain = nemesis; why = `Your recurring villain: ${name(nemesis)}'s scheme, ${nemesis.nemesis.scheme.name}, is at step ${nemesis.nemesis.scheme.progress} of ${nemesis.nemesis.scheme.steps}.`; }
  if (!villain) {
    const cand = rogueCandidates(order, roster)[0];
    if (cand) { const r = makeRogue(R, cand.hero, cand.person); villain = r.ch; why = r.text; }
  }
  if (!villain) { villain = generateCharacter(R, { seed: `${seed}-villain`, pl: pl + 1, alignment: 'villain' }); why = `A new villain at PL ${villain.pl}.`; }

  // ---- minions
  const squad = generateMinionSquad(R, { count: Math.max(3, heroes.length * 2), villainPl: villain.pl, seed: `${seed}-squad` });

  // ---- balance the showdown
  let k = 0; let odds = null;
  if (tune) {
    const b = createBattle({ seed: `prep-${seed}` });
    for (const h of heroes) addCombatant(b, makeCombatant(R, h, { team: 'A' }));
    addCombatant(b, makeCombatant(R, villain, { team: 'B' }));
    try {
      const t = tuneBattle(b, R, { heroTeam: 'A', target: (DIFFICULTIES[difficulty] || DIFFICULTIES.tense).target, n, range: 6 });
      k = t.best.k; odds = t.best.rate;
    } catch { k = 0; }
  }
  const tuned = k ? scaleCharacter(villain, k, R) : villain;
  if (k && villain.rosterId) delete tuned.rosterId; // a tuned copy for tonight; the saved villain stays as is

  // ---- scenes
  const scenes = [];
  const spot = (i) => order[i % order.length];
  // 1. The hook: from a hero's own bio
  const h1 = spot(0);
  const hook = (h1.bio?.hooks || []).length ? rng.pick(h1.bio.hooks) : `${first(h1)} gets a call from someone who shouldn't have this number.`;
  scenes.push({ kind: 'hook', title: 'The hook', spotlight: name(h1), text: hook, stakes: `It leads, one way or another, to ${name(villain)}.`, scene: hook });
  // 2. Investigation, set where someone's complication bites
  const withComp = order.find((h) => (h.complications || []).some((c) => settingFor(c, rng))) || null;
  const comp = withComp ? (withComp.complications || []).find((c) => settingFor(c, rng)) : null;
  const where = comp ? settingFor(comp, rng) : rng.pick(['the docks at night', 'a museum after hours', 'an abandoned subway station', 'a rooftop party']);
  const task = rng.pick(SKILL_SCENES);
  const ace = bestAt(heroes, R, task.skill);
  scenes.push({
    kind: 'investigation', title: 'The trail', spotlight: ace ? name(ace.hero) : name(spot(1)),
    text: `The trail leads to ${where}. The heroes need to ${task.verb} (${task.skill} DC ${10 + pl}, DC ${15 + pl} for everything).`,
    stakes: comp ? `${name(withComp)}'s complication (${comp.type}) is right here: invoke it for a hero point.` : 'Fail, and the villain knows they\'re coming.',
    scene: `${where}, ${task.verb}`, checks: [{ skill: task.skill, dc: 10 + pl }, { skill: task.skill, dc: 15 + pl }],
    complication: comp ? { hero: name(withComp), type: comp.type } : null,
  });
  // 3. Ambush
  scenes.push({ kind: 'action', title: 'Ambush!', spotlight: name(spot(2)), text: `${squad.count} ${squad.name} hit the heroes before they can regroup. Minions go down on any failed Toughness check.`, stakes: 'Protect the bystanders, or the newspaper will say they didn\'t.', scene: `an ambush by ${squad.name}`, minions: true });
  // 4. Showdown
  scenes.push({ kind: 'climax', title: 'The showdown', spotlight: name(spot(3)), text: `${name(tuned)} makes their move${villain.nemesis ? `: ${villain.nemesis.scheme.name}` : ''}.${odds != null ? ` Balanced to be ${verdict(odds)} (heroes win about ${Math.round(odds * 100)}%${k ? `, villain ${k > 0 ? '+' : ''}${k}` : ''}).` : ''}`, stakes: villain.foilOf ? `This is personal for ${villain.foilOf.name}: ${villain.identity?.realName} was their ${String(villain.foilOf.relation).toLowerCase()}.` : 'Win, and the city breathes again. Lose, and the scheme moves on.', scene: `the final confrontation with ${name(villain)}`, villain: true });

  const rumor = villain.nemesis
    ? `Hints keep piling up about ${villain.nemesis.scheme.name}.`
    : rng.pick([`Witnesses describe a figure calling themselves ${name(villain)} near ${where}.`, `Police are baffled by a string of break-ins across ${city}.`, `A new name is whispered on the street: ${name(villain)}.`]);

  return { seed, pl, city, villain: { ch: tuned, base: villain, why, k, odds }, minions: squad, scenes, rumor, heroes: heroes.map(name), difficulty };
}

// Favored Foe and Favored Environment (Hero's Handbook p74).
// - Favored Foe: a +2 circumstance bonus on Deception, Intimidation, Insight and Perception checks dealing with the
//   foe the advantage names (a creature type, a profession, a name). Here that is the feint, the Daze and the Demoralize against it.
// - Favored Environment: in the environment the advantage names the fighter gets +2 on attack checks or on its active defenses,
//   chosen at the start of each round and kept until the start of its next. The arena's environment is a Battle Room option
//   (`b.options.environment`); an enclosed room counts as 'enclosed'.

import { log } from './util.js';

export const ENVIRONMENTS = [
  { id: 'urban', label: 'City streets and rooftops', words: /urban|city|cities|street|building|rooftop|alley|skyscraper/i },
  { id: 'aerial', label: 'In the air', words: /\bair\b|aerial|\bsky\b|cloud|flying|flight/i },
  { id: 'aquatic', label: 'In or under water', words: /water|aqua|\bsea\b|ocean|submerg|river|underwater|swamp/i },
  { id: 'wilderness', label: 'Jungle, forest or mountains', words: /jungle|wood|forest|wild|mountain|cliff/i },
  { id: 'extreme', label: 'Extreme heat or cold', words: /heat|cold|arctic|desert|volcan|\bice\b|\bfire\b|frozen|inferno/i },
  { id: 'space', label: 'Space', words: /space|vacuum|orbit|zero-g/i },
];
const ENCLOSED = /enclosed|indoor|\broom\b|\bcave|tunnel|corridor|interior|dungeon/i;

/** The environments the battle is fought in: the one picked in the Arena tab, and 'enclosed' for a walled room. */
export function environmentsOf(b) {
  const out = [];
  if (b.options?.environment) out.push(b.options.environment);
  if (b.options?.enclosed) out.push('enclosed');
  return out;
}

/** Does the advantage's text name this environment? */
function names(text, env) {
  if (env === 'enclosed') return ENCLOSED.test(text);
  return ENVIRONMENTS.find((e) => e.id === env)?.words.test(text) || false;
}

/** Is the fighter in an environment its Favored Environment names? */
export function inFavoredEnvironment(b, c) {
  const envs = environmentsOf(b);
  return (c.ch?.advantages || []).some((a) => a.name === 'Favored Environment' && envs.some((e) => names(String(a.param || ''), e)));
}

/** The start of the round: a fighter in its favored environment picks +2 on attacks or on defenses (defenses when hurt or outnumbered). */
export function favoredTurn(b, c, enemyCount, allyCount) {
  c.envAttack = 0;
  if (!inFavoredEnvironment(b, c)) return;
  const defend = c.staggered || c.bruises >= 2 || enemyCount > allyCount + 1;
  if (defend) c.defMod += 2; else c.envAttack = 2;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} is in its favored environment: +2 to ${defend ? 'active defenses' : 'attack checks'} until its next turn (Favored Environment).` });
}

const words = (s) => String(s).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/s$/, ''));

/** Is the foe one the fighter's Favored Foe names? Every word of the advantage's text must show in the foe's name, type or style. */
export function isFavoredFoe(c, t) {
  const text = `${t.name} ${t.ch?.identity?.codename || ''} ${t.ch?.archetype || ''} ${(t.ch?.tags || []).join(' ')} ${t.style} ${t.minion ? 'minion' : ''}`;
  const have = new Set(words(text));
  return (c.ch?.advantages || []).some((a) => {
    if (a.name !== 'Favored Foe') return false;
    const need = words(a.param || '');
    return need.length > 0 && need.every((w) => have.has(w));
  });
}

const SOCIAL = ['Deception', 'Intimidation', 'Insight', 'Perception'];

/** The Favored Foe bonus on one of c's skill checks against t: +2 on the four social skills, else 0. */
export const foeBonus = (c, t, skill) => (t && SOCIAL.includes(skill) && isFavoredFoe(c, t) ? 2 : 0);

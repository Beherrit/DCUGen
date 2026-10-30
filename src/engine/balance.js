// "Will this fight wreck my party?" Run a Battle Room match-up many times, read the heroes' odds, and
// tune the other side up or down until the fight lands where the GM wants it.
//
// Tuning scales the opposition by a step k: every attack power's rank and every bought defense goes
// up or down by k (with Protection), so the villain stays recognisably the same character.

import { createBattle, addCombatant, makeCombatant, simulateMany } from './battle.js';
import { isAttackPower } from './derive.js';

export const DIFFICULTIES = {
  romp: { label: 'An easy win', target: 0.9, blurb: 'The heroes should cruise.' },
  tense: { label: 'A tense win', target: 0.65, blurb: 'The heroes should win, but it should hurt.' },
  even: { label: 'A coin flip', target: 0.5, blurb: 'Either side could take it.' },
  deadly: { label: 'Deadly', target: 0.3, blurb: 'The heroes probably lose unless they get clever.' },
  doomed: { label: 'A planned defeat', target: 0.08, blurb: 'For the story: the villain wins this round.' },
};

/** What a win rate means for the table. */
export function verdict(rate) {
  if (rate >= 0.85) return 'an easy win';
  if (rate >= 0.6) return 'a tense win';
  if (rate >= 0.4) return 'a coin flip';
  if (rate >= 0.15) return 'too deadly for most tables';
  return 'a near-certain defeat';
}

/** A copy of a character made stronger (k > 0) or weaker (k < 0). */
export function scaleCharacter(ch, k, R) {
  const c = JSON.parse(JSON.stringify(ch));
  if (!k) return c;
  const visit = (list) => (list || []).forEach((p) => {
    let attack = false;
    try { attack = isAttackPower(p, R); } catch { attack = false; }
    if (attack || p.effect === 'Protection') p.rank = Math.max(1, (p.rank || 1) + k);
    for (const a of p.alternates || []) visit([a]);
  });
  visit(c.powers);
  for (const d of c.devices || []) visit(d.powers);
  for (const d of ['Dodge', 'Parry', 'Fortitude', 'Will']) if (c.defenses && d in c.defenses) c.defenses[d] = Math.max(0, (c.defenses[d] || 0) + k);
  for (const e of c.equipment || []) if (e.attack) e.attack = { ...e.attack, rank: Math.max(1, e.attack.rank + k) };
  c.identity = { ...c.identity, codename: `${c.identity?.codename || 'Foe'}${k > 0 ? ` (+${k})` : ` (${k})`}` };
  return c;
}

/** The heroes' win rate in a battle setup. */
export function heroOdds(b, R, heroTeam, n = 100, seed = 'balance') {
  const r = simulateMany(b, R, n, { seed });
  return { rate: (r.wins[heroTeam] || 0) / r.n, wins: r.wins, avgRounds: r.avgRounds, n: r.n };
}

/** A copy of a battle with every non-hero combatant scaled by k. */
export function scaledBattle(b, R, heroTeam, k) {
  const copy = createBattle({ seed: b.seed, name: b.name });
  copy.options = { ...b.options };
  for (const c of b.combatants.filter((x) => !x.summon)) { // minions called in the fight are not fighters to scale
    const ch = c.team === heroTeam ? c.ch : scaleCharacter(c.ch, k, R);
    addCombatant(copy, makeCombatant(R, ch, { id: c.id, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.team === heroTeam ? c.name : ch.identity.codename }));
  }
  return copy;
}

/**
 * Find the scaling step that brings the heroes' odds closest to a target.
 * Returns { before, best: { k, rate }, tried: [{ k, rate }] }.
 */
export function tuneBattle(b, R, { heroTeam = 'A', target = 0.65, n = 60, range = 8 } = {}) {
  const tried = new Map();
  const odds = (k) => { if (!tried.has(k)) tried.set(k, heroOdds(k ? scaledBattle(b, R, heroTeam, k) : b, R, heroTeam, n, `tune-${k}`).rate); return tried.get(k); };
  const before = odds(0);
  // Odds fall as k rises: walk towards the target, then keep the closest step.
  let k = 0;
  const dir = before > target ? 1 : -1;
  while (Math.abs(k) < range) {
    const next = k + dir;
    const r = odds(next);
    if ((dir > 0 && r <= target) || (dir < 0 && r >= target)) { k = next; break; }
    k = next;
  }
  const near = [...tried.entries()].sort((a, b2) => Math.abs(a[1] - target) - Math.abs(b2[1] - target) || Math.abs(a[0]) - Math.abs(b2[0]))[0];
  return { before, best: { k: near[0], rate: near[1] }, tried: [...tried.entries()].sort((a, b2) => a[0] - b2[0]).map(([kk, rate]) => ({ k: kk, rate })) };
}

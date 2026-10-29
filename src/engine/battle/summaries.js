// Plain-text summaries, many-run tallies, and saving and loading a battle.

import { STYLES } from './styles.js';
import { conditionLabels } from './conditions.js';
import { makeCombatant, rebuildCombatant } from './combatant.js';
import { createBattle, addCombatant, runToEnd } from './battle-flow.js';

export function statusLine(c) {
  if (c.fled) return c.escaped ? 'Got away' : 'Fled';
  if (c.out) return c.outReason === 'minion' ? 'Down' : c.outReason === 'asleep' ? 'Asleep' : c.outReason === 'exhausted' ? 'Collapsed' : 'Incapacitated';
  const bits = [];
  if (c.bruises) bits.push(`${c.bruises} bruise${c.bruises > 1 ? 's' : ''}`);
  const conds = conditionLabels(c).filter((x) => !['Incapacitated'].includes(x));
  if (conds.length) bits.push(conds.join(', '));
  return bits.length ? bits.join(' · ') : 'Unhurt';
}

export function battleText(b) {
  const out = [`${b.name || 'Battle'} (seed ${b.seed})`, ''];
  for (const team of [...new Set(b.combatants.map((c) => c.team))].sort()) {
    out.push(`Team ${team}: ${b.combatants.filter((c) => c.team === team).map((c) => `${c.name} (PL ${c.pl}, ${STYLES[c.style]?.label || c.style})`).join(', ')}`);
  }
  out.push('');
  for (const e of b.log) out.push(`${e.kind === 'round' ? '' : '  '}${e.text}`);
  if (b.status === 'over') {
    out.push('', 'Final state:');
    for (const c of b.combatants) out.push(`  ${c.name}: ${statusLine(c)} · ${c.stats.hits}/${c.stats.attacks} hits, ${c.stats.kos} KOs`);
  }
  return out.join('\n');
}

/** Run the same match-up many times (fresh seeds) and tally the results. */
export function simulateMany(b, R, n = 100, { seed = b.seed } = {}) {
  const wins = {};
  const rounds = [];
  const kos = {};
  const survived = {};
  const out = {};
  const escaped = {};
  let gotAway = 0;
  for (const c of b.combatants) { kos[c.id] = 0; survived[c.id] = 0; out[c.id] = 0; escaped[c.id] = 0; }
  for (let i = 0; i < n; i++) {
    const copy = createBattle({ seed: `${seed}-run-${i}`, name: b.name });
    copy.options = { ...b.options };
    copy.cover = (b.cover || []).map((p) => ({ ...p, state: 'intact' }));
    for (const c of b.combatants) addCombatant(copy, makeCombatant(R, c.ch, { id: c.id, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name }));
    runToEnd(copy, R);
    wins[copy.winner || 'draw'] = (wins[copy.winner || 'draw'] || 0) + 1;
    rounds.push(copy.round);
    if (copy.gotAway) gotAway++;
    for (const c of copy.combatants) { if (c.escaped) escaped[c.id]++; kos[c.id] += c.stats.kos; if (!c.out && !c.fled) survived[c.id]++; if (c.out) out[c.id]++; }
  }
  return { n, wins, avgRounds: rounds.reduce((s, r) => s + r, 0) / Math.max(1, rounds.length), kos, survived, out, escaped, gotAway };
}

/** Strip a battle to what needs saving (characters and settings; derived numbers are rebuilt). */
export function serializeBattle(b) {
  return {
    ...b,
    combatants: b.combatants.map((c) => {
      const { d, attacks, adv, skills, immune, ...rest } = c;
      return rest;
    }),
  };
}

export function reviveBattle(R, data) {
  const b = { ...createBattle({ seed: data.seed, name: data.name }), ...data };
  b.options = { ...createBattle().options, ...(data.options || {}) };
  b.cover = (data.cover || []).map((p) => ({ ...p }));
  b.combatants = (data.combatants || []).map((c) => rebuildCombatant({ ...c, stats: c.stats || { attacks: 0, hits: 0, crits: 0, degrees: 0, kos: 0, healed: 0, taken: 0 }, conditions: c.conditions || [], weakened: c.weakened || {} }, R));
  return b;
}

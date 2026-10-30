// The build report on a fighter: which of its powers, modifiers, advantages and skills the simulator uses in a fight and
// which it ignores. The source of truth is tools/battle-coverage/coverage.json, shipped as src/generated/battle-coverage.js.
// A trait with status "none" is ignored, "partial" is used with a short note, "full" is used, and n/a or unknown traits
// are not listed at all.

import { BATTLE_COVERAGE } from '../../generated/battle-coverage.js';
import { allPowers } from '../derive.js';

const BY_KIND = new Map();
for (const e of BATTLE_COVERAGE) BY_KIND.set(`${e.kind}:${e.name}`, e);

/** The coverage entries a character's traits point at, as [{ kind, name }] without repeats. */
function traitsOf(ch) {
  const out = new Map();
  const add = (kind, name) => { if (name) out.set(`${kind}:${name}`, { kind, name }); };
  for (const { power: p } of allPowers(ch)) {
    add('effect', p.effect);
    for (const m of p.extras || []) add('extra', m.name);
    for (const m of p.flaws || []) add('flaw', m.name);
  }
  for (const a of ch.advantages || []) add('advantage', a.name);
  for (const s of ch.skills || []) add('skill', s.name);
  return [...out.values()];
}

/**
 * What the simulator does with a fighter's build: { used: [names], partial: [{ name, note }], ignored: [{ name, why, kind }] }.
 * `used` holds the full and partial ones (partial ones are repeated in `partial` with the note). Takes a combatant or a character.
 */
export function buildReport(c) {
  const ch = c?.ch || c;
  const report = { used: [], partial: [], ignored: [] };
  for (const { kind, name } of traitsOf(ch || {})) {
    const e = BY_KIND.get(`${kind}:${name}`);
    if (!e) continue;
    if (e.status === 'none') report.ignored.push({ name, kind, why: e.note });
    else {
      report.used.push(name);
      if (e.status === 'partial') report.partial.push({ name, kind, note: e.note });
    }
  }
  return report;
}

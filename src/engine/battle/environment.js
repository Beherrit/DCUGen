// Environment (Hero's Handbook p97, with Heat and Cold, Light and Darkness on p169-170): a change to the surroundings in a radius
// around the user, sustained. At rank 1 the radius is 30 feet and each rank is one distance rank more (30 ft x 2 per rank less one).
// Each of these is a separate effect, and one user keeps one up at a time (an alternate effect), unless it has Selective:
//   cold / heat: intense (1 point) or extreme (2 points). The book has Fortitude checks (DC 10, +1 per earlier check) to avoid
//     fatigue, once a minute for extreme heat or cold and once per 10 minutes for intense: so in a fight, extreme heat or cold
//     asks one check every 10 rounds (a round is 6 seconds), and intense none. Fatigued, then exhausted, then incapacitated.
//     Immunity to the environment (cold, heat) needs no checks.
//   impede movement: movement speed through the area is reduced by 1 rank (1 point) or 2 ranks (2 points).
//   light: 1 point makes total concealment partial and partial none; 2 points removes the concealment of natural darkness. Only
//     the concealment of darkness is affected, "not other forms" (a Concealment power whose words say darkness or shadow).
//   visibility: -2 or -5 to Perception checks. Perception is not part of the fight, so it does nothing here.
// The area follows the user and every fighter in it is affected, allies too (no Selective).
// b.env holds the effects now in force: { id, owner, kind, level, rank, power }.

import { allPowers } from '../derive.js';
import { hasExtra, log, byId } from './util.js';
import { squares } from './geometry.js';
import { canAct, resistOf } from './conditions.js';
import { rollCheck, critNote } from './checks.js';

export const KIND_WORDS = {
  cold: /cold|ice|frost|freez|winter|chill/i, heat: /heat|hot|fire|flame|burn|scorch|summer|desert/i, impede: /impede|wind|storm|gale|rain|slick|mud|ice\b|snow|surface|slow/i,
  light: /\blight|sun|bright|glow|radian|daylight/i, visibility: /visib|fog|mist|smoke|dust|haze|obscur/i,
};

/** The radius of an Environment of this rank in feet: 30 at rank 1, one distance rank more for each rank above. */
export const radiusFt = (rank) => 30 * 2 ** Math.max(0, rank - 1);

/** Every Environment power of a character: [{ power, name, rank, kinds, level, selective }]; level 2 is extreme / the stronger version. */
export function environmentsOf(ch) {
  const out = [];
  for (const { power: p } of allPowers(ch, { includeAlternates: true })) {
    if (p.effect !== 'Environment' || !(p.rank > 0)) continue;
    const text = `${p.option || ''} ${p.detail || ''} ${p.name}`;
    const kinds = Object.keys(KIND_WORDS).filter((k) => KIND_WORDS[k].test(text));
    out.push({ power: p, name: p.name, rank: p.rank, kinds: kinds.length ? kinds : ['impede'], level: /greater|extreme|2 points|bright as/i.test(text) ? 2 : 1, selective: hasExtra(p, 'Selective') });
  }
  return out;
}

/** The effects in force. */
export const envOf = (b) => b.env || [];

/** Is the fighter inside this effect's radius (measured from its user)? */
export function inside(b, e, c) {
  const owner = byId(b, e.owner);
  return !!owner && squares(owner, c) * b.grid.squareFt <= radiusFt(e.rank);
}

/** Put an effect into force for its user, replacing the one it had (one at a time unless Selective). Returns the entry. */
export function startEnvironment(b, c, s, kinds) {
  b.env ||= [];
  b.env = b.env.filter((e) => !(e.owner === c.id && !s.selective));
  const made = kinds.map((kind) => ({ id: `env-${c.id}-${kind}`, owner: c.id, kind, level: s.level, rank: s.rank, power: s.name }));
  b.env = b.env.filter((e) => !made.some((m) => m.id === e.id)).concat(made);
  const what = kinds.map((k) => ({ cold: s.level === 2 ? 'extreme cold' : 'intense cold', heat: s.level === 2 ? 'extreme heat' : 'intense heat', impede: `impeded movement (-${s.level} speed rank${s.level > 1 ? 's' : ''})`, light: s.level === 2 ? 'bright daylight' : 'more light', visibility: 'poor visibility' }[k])).join(' and ');
  refreshEnvironment(b);
  log(b, { kind: 'note', actor: c.id, text: `${c.name} uses ${s.name} (rank ${s.rank}): ${what} in a ${radiusFt(s.rank)} ft radius around ${c.name}, for as long as ${c.name} keeps it up.`, important: true });
  return made;
}

/** Ranks of speed lost by a fighter standing in impeding weather, wind or ground. */
export function slowOf(b, c) {
  return envOf(b).filter((e) => e.kind === 'impede' && inside(b, e, c)).reduce((m, e) => Math.max(m, e.level), 0);
}

/** The light level on a fighter (0 none, 1 more light, 2 daylight). Set on each fighter at the start of its turn and read by the concealment penalty. */
export function lightOn(b, c) {
  return envOf(b).filter((e) => e.kind === 'light' && inside(b, e, c)).reduce((m, e) => Math.max(m, e.level), 0);
}

/** Set what the effects do to each fighter now: ranks of speed lost and the light on it. Run when an effect starts and at the start of every turn. */
export function refreshEnvironment(b) {
  for (const c of b.combatants) { c.slowed = slowOf(b, c); c.lit = lightOn(b, c); }
}

/** An effect lasts while its user can keep it up. Called with the other upkeeps before every end check. */
export function environmentUpkeep(b) {
  if (!b.env?.length) return;
  const gone = b.env.filter((e) => { const o = byId(b, e.owner); return !o || o.out || o.fled || canAct(o) === 'none'; });
  if (!gone.length) return;
  b.env = b.env.filter((e) => !gone.includes(e));
  for (const e of gone) log(b, { kind: 'note', actor: e.owner, text: `${e.power} ends: ${byId(b, e.owner)?.name || 'its user'} can no longer keep it up.` });
}

const IMMUNE_WORDS = { cold: /cold|ice|frost|freez|environment/i, heat: /heat|fire|flame|hot|temperature|environment/i };

/** One round ends at the start of round `round`: every tenth round the extreme cold and heat ask their Fortitude check. */
export function environmentRound(b, round, nextRng) {
  if (round < 11 || (round - 1) % 10 !== 0) return;
  const extreme = envOf(b).filter((x) => (x.kind === 'cold' || x.kind === 'heat') && x.level === 2);
  if (!extreme.length) return;
  const rng = typeof nextRng === 'function' ? nextRng() : nextRng; // a random stream is only taken when a check is due, so a fight with no extreme weather rolls the same dice as before
  for (const e of extreme) {
    for (const c of b.combatants.filter((x) => !x.out && !x.fled && inside(b, e, x))) {
      if (c.immune?.some((i) => i.environment && IMMUNE_WORDS[e.kind].test(i.label || 'environment'))) continue;
      const bonus = resistOf(c, 'Fortitude');
      if (bonus === null) continue;
      c.envChecks = (c.envChecks || 0) + 1;
      const dc = 9 + c.envChecks; // DC 10, +1 for each earlier check
      const r = rollCheck(rng, bonus, dc);
      const base = `${c.name} in the ${e.kind === 'cold' ? 'extreme cold' : 'extreme heat'} of ${e.power}: Fortitude d20 ${r.roll} ${bonus >= 0 ? '+' : ''}${bonus} = ${r.total} vs DC ${dc}${critNote(r)}`;
      if (r.success) { log(b, { kind: 'resist', actor: c.id, text: `${base} — holds out.`, dice: [{ label: 'Fortitude', roll: r.roll, mod: bonus, total: r.total, dc }] }); continue; }
      c.fatigue += 1;
      log(b, { kind: 'condition', actor: c.id, text: `${base} — fails and becomes ${c.fatigue === 1 ? 'fatigued' : c.fatigue === 2 ? 'exhausted' : 'incapacitated'}.`, dice: [{ label: 'Fortitude', roll: r.roll, mod: bonus, total: r.total, dc }], important: true });
    }
  }
}

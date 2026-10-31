// Companions: sidekicks, minions, pets and other followers attached to a character, each a full
// character sheet of its own (ch.companions[i]). They travel with the character: roster, exports, keys.
//
//   Sidekick advantage: 5 power points per rank for the sidekick's build, and fewer points than the hero (DCA 78)
//   Minion advantage:  15 power points per rank, and the follower uses the minion rules (DCA 77)
//   Summon power:      15 power points per rank of the owner's Summon effect (DCA 118)
//   Other: pets bought as a power, story NPCs. No budget is checked.
//   Minions (advantage or Summon) cannot have minions of their own: no Minion or Sidekick advantage, no Summon or
//   Duplication, no companions (DCA 77, 118). Every follower is held to the series power level, here the owner's.

import { costBreakdown } from './costs.js';

export const COMPANION_KINDS = {
  sidekick: { label: 'Sidekick', advantage: 'Sidekick', perRank: 5, blurb: 'A full character built on 5 power points per rank of the Sidekick advantage.' },
  minion: { label: 'Minion', advantage: 'Minion', perRank: 15, blurb: 'A follower built on 15 power points per rank of the Minion advantage; uses the minion rules.' },
  summon: { label: 'Summoned', advantage: null, power: 'Summon', perRank: 15, blurb: 'A creature called up by one of the hero\'s Summon powers: 15 power points per rank of the power, and it uses the minion rules.' },
  companion: { label: 'Companion', advantage: null, perRank: 0, blurb: 'An animal companion, ally or anyone else. No point budget is checked.' },
};

/** Kinds that follow the minion rules and so cannot have minions of their own. */
const MINION_KINDS = new Set(['minion', 'summon']);

export const companionsOf = (ch) => (Array.isArray(ch?.companions) ? ch.companions : []);
const nameOf = (c) => c.identity?.codename || c.identity?.realName || 'Companion';

/** The owner's advantage entry that pays for a companion, if any. */
export function payingAdvantage(owner, comp) {
  const kind = COMPANION_KINDS[comp.companionKind];
  if (!kind?.advantage) return null;
  const list = (owner.advantages || []).filter((a) => a.name === kind.advantage);
  const name = nameOf(comp).toLowerCase();
  return list.find((a) => String(a.param || '').toLowerCase() === name) || (list.length === 1 ? list[0] : null);
}

/** The owner's Summon power that calls up this companion: the one whose name or detail names it, else the only one. */
export function payingPower(owner, comp) {
  const list = [];
  const visit = (ps) => (ps || []).forEach((p) => { if (p.effect === 'Summon') list.push(p); visit(p.alternates); });
  visit(owner.powers);
  for (const d of owner.devices || []) visit(d.powers);
  const name = nameOf(comp).toLowerCase();
  const named = list.find((p) => name && (`${p.name || ''} ${p.detail || ''}`).toLowerCase().includes(name));
  return named || (list.length === 1 ? list[0] : list.sort((a, b) => (b.rank || 0) - (a.rank || 0))[0] || null);
}

/** What a minion has that the rules forbid it: its own minions (DCA 77, 118). */
export function minionsOfMinion(comp) {
  const out = [];
  for (const a of comp.advantages || []) if (a.name === 'Minion' || a.name === 'Sidekick') out.push(`the ${a.name} advantage`);
  const visit = (ps) => (ps || []).forEach((p) => { if (p.effect === 'Summon' || p.effect === 'Duplication') out.push(`${p.name || p.effect} (${p.effect})`); visit(p.alternates); visit(p.linked); });
  visit(comp.powers);
  for (const d of comp.devices || []) visit(d.powers);
  if (companionsOf(comp).length) out.push('companions of its own');
  return out;
}

/** { budget, cost, advantage, power, ok, message, problems } for a companion. budget is null when nothing is checked. */
export function companionBudget(owner, comp, R) {
  const kindId = COMPANION_KINDS[comp.companionKind] ? comp.companionKind : 'companion';
  const kind = COMPANION_KINDS[kindId];
  let cost = null;
  try { cost = costBreakdown(comp, R).total; } catch { /* unknown traits */ }
  // Rules that hold whatever pays for the follower.
  const problems = [];
  if (MINION_KINDS.has(kindId)) {
    const extra = minionsOfMinion(comp);
    if (extra.length) problems.push(`Minions can't have minions of their own (DCA 77): remove ${extra.join(', ')}.`);
  }
  if (kindId !== 'companion' && owner.pl != null && comp.pl > owner.pl) problems.push(`PL ${comp.pl} is over the series power level (PL ${owner.pl}).`);
  if (kindId === 'sidekick' && cost != null) {
    let ownerCost = null;
    try { ownerCost = costBreakdown(owner, R).total; } catch { /* unknown traits */ }
    if (ownerCost != null && cost >= ownerCost) problems.push(`A sidekick's power point total must be less than ${nameOf(owner)}'s (${cost} vs ${ownerCost}, DCA 78).`);
  }
  const withProblems = (r) => (problems.length ? { ...r, ok: false, problems, message: [r.ok ? null : r.message, ...problems].filter(Boolean).join(' ') } : { ...r, problems });

  if (kind.power) {
    const power = payingPower(owner, comp);
    if (!power) return withProblems({ budget: null, cost, advantage: null, power: null, ok: false, message: `${nameOf(owner)} needs a Summon power to call up ${nameOf(comp)} (15 power points per rank).` });
    const budget = (power.rank || 0) * kind.perRank;
    const over = cost != null && cost > budget;
    return withProblems({ budget, cost, advantage: null, power, ok: !over, message: over ? `${cost} power points, but ${power.name || 'Summon'} ${power.rank} calls up ${budget}. Raise its rank to ${Math.ceil(cost / kind.perRank)} or trim the build.` : `${power.name || 'Summon'} ${power.rank}: ${budget} power points, ${cost ?? '?'} spent.` });
  }
  if (!kind.advantage) return withProblems({ budget: null, cost, advantage: null, ok: true, message: 'No point budget is checked.' });
  const adv = payingAdvantage(owner, comp);
  if (!adv) return withProblems({ budget: null, cost, advantage: null, ok: false, message: `${nameOf(owner)} needs the ${kind.advantage} advantage to pay for ${nameOf(comp)} (${kind.perRank} power points per rank). Add ${kind.advantage} ${Math.max(1, Math.ceil((cost || 0) / kind.perRank))}${nameOf(comp) ? ` (${nameOf(comp)})` : ''} in Edit mode.` });
  const budget = (adv.rank || 1) * kind.perRank;
  return withProblems({ budget, cost, advantage: adv, ok: cost == null || cost <= budget, message: cost != null && cost > budget ? `${cost} power points, but ${kind.advantage} ${adv.rank || 1} pays for ${budget}. Raise the advantage to ${Math.ceil(cost / kind.perRank)} or trim the build.` : `${kind.advantage} ${adv.rank || 1}: ${budget} power points, ${cost ?? '?'} spent.` });
}

/** Prepare a character to be someone's companion. */
export function asCompanion(c, kind) {
  const out = JSON.parse(JSON.stringify(c));
  for (const k of ['rosterId', 'savedAt', 'folder', 'companions', 'companionOf', 'lobbyOwner', 'lobbyOwnerName', 'lobbyShared']) delete out[k];
  out.companionKind = COMPANION_KINDS[kind] ? kind : 'companion';
  out.id = out.id || `c-comp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (MINION_KINDS.has(out.companionKind)) {
    out.minion = true;
    // A minion cannot have minions of its own (DCA 77, 118): a rolled or copied sheet gives them up.
    const keep = (p) => p.effect !== 'Summon' && p.effect !== 'Duplication';
    out.powers = (out.powers || []).filter(keep).map((p) => (p.alternates ? { ...p, alternates: p.alternates.filter(keep) } : p));
    out.advantages = (out.advantages || []).filter((a) => a.name !== 'Minion' && a.name !== 'Sidekick');
  }
  return out;
}

export function blankCompanion(pl, name) {
  return {
    pl,
    abilities: { Strength: 0, Stamina: 0, Agility: 0, Dexterity: 0, Fighting: 0, Intellect: 0, Awareness: 0, Presence: 0 },
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
    skills: [], advantages: [], powers: [], devices: [], equipment: [],
    archetype: { id: 'custom', name: 'Custom' },
    theme: { id: 'custom', name: 'Custom', color: '#5b6b4a' },
    alignment: 'hero',
    identity: { codename: name || 'New companion', realName: '', languages: ['English'] },
    complications: [], notes: '',
    createdAt: new Date().toISOString(),
  };
}

/** A sensible power level for a companion: what its budget buys at 15 points per PL. */
export function suggestedPl(owner, kind, rank) {
  const k = COMPANION_KINDS[kind];
  if (k?.power) rank = rank || payingPower(owner, { identity: {} })?.rank;
  if (!k?.perRank || !rank) return Math.max(1, (owner.pl || 10) - 2);
  return Math.max(1, Math.min(owner.pl || 10, Math.floor((rank * k.perRank) / 15)));
}

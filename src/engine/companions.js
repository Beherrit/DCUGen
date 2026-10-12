// Companions: sidekicks, minions, pets and other followers attached to a character, each a full
// character sheet of its own (ch.companions[i]). They travel with the character: roster, exports, keys.
//
//   Sidekick advantage: 5 power points per rank for the sidekick's build (DCA 78)
//   Minion advantage:  15 power points per rank, and the follower uses the minion rules (DCA 77)
//   Other: summoned creatures, pets bought as a power, story NPCs. No budget is checked.

import { costBreakdown } from './costs.js';

export const COMPANION_KINDS = {
  sidekick: { label: 'Sidekick', advantage: 'Sidekick', perRank: 5, blurb: 'A full character built on 5 power points per rank of the Sidekick advantage.' },
  minion: { label: 'Minion', advantage: 'Minion', perRank: 15, blurb: 'A follower built on 15 power points per rank of the Minion advantage; uses the minion rules.' },
  companion: { label: 'Companion', advantage: null, perRank: 0, blurb: 'An animal companion, summoned creature, ally or anyone else. No point budget is checked.' },
};

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

/** { budget, cost, advantage, ok, message } for a companion. budget is null when nothing is checked. */
export function companionBudget(owner, comp, R) {
  const kind = COMPANION_KINDS[comp.companionKind] || COMPANION_KINDS.companion;
  let cost = null;
  try { cost = costBreakdown(comp, R).total; } catch { /* unknown traits */ }
  if (!kind.advantage) return { budget: null, cost, advantage: null, ok: true, message: 'No point budget is checked.' };
  const adv = payingAdvantage(owner, comp);
  if (!adv) return { budget: null, cost, advantage: null, ok: false, message: `${nameOf(owner)} needs the ${kind.advantage} advantage to pay for ${nameOf(comp)} (${kind.perRank} power points per rank). Add ${kind.advantage} ${Math.max(1, Math.ceil((cost || 0) / kind.perRank))}${nameOf(comp) ? ` (${nameOf(comp)})` : ''} in Edit mode.` };
  const budget = (adv.rank || 1) * kind.perRank;
  return { budget, cost, advantage: adv, ok: cost == null || cost <= budget, message: cost != null && cost > budget ? `${cost} power points, but ${kind.advantage} ${adv.rank || 1} pays for ${budget}. Raise the advantage to ${Math.ceil(cost / kind.perRank)} or trim the build.` : `${kind.advantage} ${adv.rank || 1}: ${budget} power points, ${cost ?? '?'} spent.` };
}

/** Prepare a character to be someone's companion. */
export function asCompanion(c, kind) {
  const out = JSON.parse(JSON.stringify(c));
  for (const k of ['rosterId', 'savedAt', 'folder', 'companions', 'companionOf', 'lobbyOwner', 'lobbyOwnerName', 'lobbyShared']) delete out[k];
  out.companionKind = COMPANION_KINDS[kind] ? kind : 'companion';
  out.id = out.id || `c-comp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (out.companionKind === 'minion') out.minion = true;
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
  if (!k?.perRank || !rank) return Math.max(1, (owner.pl || 10) - 2);
  return Math.max(1, Math.min(owner.pl || 10, Math.floor((rank * k.perRank) / 15)));
}

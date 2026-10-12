// A rogues' gallery from the heroes' own pasts. Every bio names rivals, enemies, exes, mentors and
// friends; any of them can come back as a villain, built as a foil to that hero: their main attack goes
// after the hero's weakest defense, and they're hardened against the hero's best attack.

import { generateCharacter } from './generator.js';
import { deriveAll, isAttackPower } from './derive.js';
import { checkLimits } from './limits.js';
import { costBreakdown } from './costs.js';

// Who makes a good villain, and how they turned.
const TURNS = {
  enemy: { score: 10, origin: (p, h) => `${p.who} ${p.status} Now ${p.name} has power of their own, and one name on their list: ${h}.` },
  rival: { score: 9, origin: (p, h) => `${p.who} ${p.name} never stopped keeping score. They found power, and a way to finally beat ${h}.` },
  ex: { score: 7, origin: (p, h) => `${p.who} Whatever ${p.name} and ${h} had ended badly, and ${p.name} took it as a declaration of war.` },
  mentor: { score: 6, origin: (p, h) => `${p.who} Everything ${h} knows about the game, ${p.name} taught. Now the teacher plays for the other side, and knows every one of ${h}'s moves.` },
  love: { score: 4, origin: (p, h) => `${p.who} ${p.name} learned the truth about ${h} the worst way, and something in them broke.` },
  sibling: { score: 5, origin: (p, h) => `${p.who} ${p.name} grew up in ${h}'s shadow. Not any more.` },
  parent: { score: 4, origin: (p, h) => `${p.who} ${p.name} has their own plans for ${h}, and calls it protection.` },
  ally: { score: 3, origin: (p, h) => `${p.who} ${p.name} was on ${h}'s side, right up until the betrayal.` },
  friend: { score: 3, origin: (p, h) => `${p.who} ${p.name} was a friend. Something happened, and ${h} wasn't there.` },
};
function turnOf(relation) {
  const r = String(relation || '').toLowerCase();
  if (/enem|nemesis/.test(r)) return 'enemy';
  if (/rival/.test(r)) return 'rival';
  if (/^ex|former (love|partner)|ex-/.test(r)) return 'ex';
  if (/mentor|teacher|trainer/.test(r)) return 'mentor';
  if (/love|partner|spouse/.test(r)) return 'love';
  if (/brother|sister|sibling/.test(r)) return 'sibling';
  if (/father|mother|parent/.test(r)) return 'parent';
  if (/ally/.test(r)) return 'ally';
  if (/friend/.test(r)) return 'friend';
  return null;
}

const heroName = (h) => h.identity?.codename || h.identity?.realName || 'the hero';

/** People from the heroes' bios who could come back as villains, best first. */
export function rogueCandidates(heroes, existing = []) {
  const made = new Set(existing.filter((c) => c.foilOf).map((c) => `${c.foilOf.rosterId || c.foilOf.name}::${c.identity?.realName}`));
  const out = [];
  for (const h of heroes) {
    for (const p of h.bio?.people || []) {
      const turn = turnOf(p.relation);
      if (!turn || /deceased|dead/i.test(p.status || '')) continue;
      if (made.has(`${h.rosterId || heroName(h)}::${p.name}`)) continue;
      out.push({ hero: h, person: p, turn, score: TURNS[turn].score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const DEFENSES = ['Dodge', 'Parry', 'Toughness', 'Fortitude', 'Will'];

/** The hero's weakest defense and the resistance of their best attack. */
export function heroProfile(hero, R) {
  const d = deriveAll(hero, R);
  const vals = DEFENSES.map((k) => [k, d.defenses[k] ?? 99]);
  const weakest = vals.sort((a, b) => a[1] - b[1])[0][0];
  const best = d.attacks.filter((a) => a.name !== 'Unarmed').sort((a, b) => (b.rank + (b.bonus || 0)) - (a.rank + (a.bonus || 0)))[0];
  const res = best ? (best.resistance || 'Toughness') : 'Toughness';
  const hits = best ? (best.kind === 'close' ? 'Parry' : best.kind === 'ranged' ? 'Dodge' : null) : null;
  return { weakest, bestAttack: best?.name || null, resists: /Will/.test(res) ? 'Will' : /Fort/.test(res) ? 'Fortitude' : 'Toughness', hits };
}

// The main attack, reshaped to go after a defense.
function aimAt(p, weakest) {
  p.extras = (p.extras || []).filter((m) => m.name !== 'Area');
  if (weakest === 'Will') Object.assign(p, { effect: 'Affliction', range: 'Perception', detail: 'Resisted by Will; Dazed, Compelled, Controlled', name: 'Mind Lash' });
  else if (weakest === 'Fortitude') Object.assign(p, { effect: 'Affliction', range: 'Ranged', detail: 'Resisted by Fortitude; Fatigued, Exhausted, Incapacitated', name: 'Withering Touch' });
  else if (weakest === 'Dodge') Object.assign(p, { effect: 'Damage', range: 'Ranged', detail: undefined });
  else if (weakest === 'Parry') Object.assign(p, { effect: 'Damage', range: 'Close', detail: undefined });
  else Object.assign(p, { effect: 'Damage', detail: undefined });
}

const plErrors = (ch, R) => checkLimits(ch, R).filter((i) => i.severity === 'error' && (i.pl || i.rule === 'budget')).length;

/**
 * Build a villain from someone in a hero's past, as that hero's foil. Returns the new character
 * (not saved): { ch, profile, text }.
 */
export function makeRogue(R, hero, person, { turn = turnOf(person.relation) || 'enemy' } = {}) {
  const v = generateCharacter(R, { seed: `${hero.seed || hero.id || heroName(hero)}::rogue::${person.name}`, pl: hero.pl || 10, alignment: 'villain', chaos: 0.4 });
  const prof = heroProfile(hero, R);
  const main = (v.powers || []).find((p) => { try { return isAttackPower(p, R); } catch { return false; } });
  const changes = [];
  if (main) {
    const before = JSON.stringify(main);
    aimAt(main, prof.weakest);
    // keep it legal: lower the rank until the PL limits and budget hold
    let guard = 0;
    while (plErrors(v, R) > 0 && main.rank > 1 && guard++ < 30) main.rank -= 1;
    if (JSON.stringify(main) !== before) changes.push(`${main.name} goes after ${heroName(hero)}'s ${prof.weakest}`);
  }
  // hardened against the hero's best attack (a few ranks, as far as the limits allow)
  const harden = prof.resists === 'Toughness' ? null : prof.resists;
  const defs = [harden, prof.hits].filter(Boolean);
  let bought = 0;
  for (const def of defs) {
    for (let i = 0; i < 3; i++) {
      v.defenses[def] = (v.defenses[def] || 0) + 1;
      if (plErrors(v, R) > 0) { v.defenses[def] -= 1; break; }
      bought++;
    }
  }
  if (bought) changes.push(`hardened against ${prof.bestAttack || 'their attacks'} (${defs.join(', ')})`);
  // Spend no more than the PL allows: trim abilities if the hardening went over budget.
  let guard = 0;
  while (costBreakdown(v, R).total > costBreakdown(v, R).budget && guard++ < 20) {
    const a = Object.entries(v.abilities).filter(([, x]) => x > 0).sort((x, y) => y[1] - x[1])[0];
    if (!a) break; v.abilities[a[0]] -= 1;
  }
  const hn = heroName(hero);
  v.identity = { ...v.identity, realName: person.name };
  const origin = TURNS[turn].origin(person, hn).replace(/\s+/g, ' ').trim();
  v.origin = { ...(v.origin || {}), label: 'Personal', text: origin };
  v.notes = `${origin}${changes.length ? `\n\nBuilt as ${hn}'s foil: ${changes.join('; ')}.` : ''}`;
  v.complications = [...(v.complications || []), { type: `Obsession: ${hn}`, text: `${person.name} can't let go of ${hn}.` }];
  v.foilOf = { rosterId: hero.rosterId || null, name: hn, relation: person.relation };
  if (v.bio) v.bio = { ...v.bio, summary: `${origin} ${v.bio.summary || ''}`.trim() };
  delete v.rosterId;
  return { ch: v, profile: prof, text: `${person.name}, ${hn}'s ${String(person.relation).toLowerCase()}, returns as ${v.identity.codename}. ${changes.length ? `Built to beat ${hn}: ${changes.join('; ')}.` : ''}` };
}

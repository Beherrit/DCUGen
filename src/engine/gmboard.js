// The GM screen's rules: a character's live status, hits typed in plain words and resolved on the
// character (each player's app rolls its own resistance), the spotlight count, and complications that
// fit the scene.

import { deriveAll } from './derive.js';
import { playState, effectiveDefenses, applyDamage, checkPenalty, QUICK_CONDITIONS } from './play.js';
import { poolPowers, poolSpent, poolAvailable } from './pools.js';
import { weakenPoints } from './house.js';
import { hasForms, activeForm } from './forms.js';
import { rangeInfo } from './range.js';

// ---- status ----------------------------------------------------------------------------------------------

/** What the GM sees for a character: small, so it can go over the lobby every time something changes. */
export function statusOf(ch, R) {
  let d;
  try { d = deriveAll(ch, R); } catch { return null; }
  const s = playState(ch);
  const def = effectiveDefenses(d, s);
  const drains = [];
  const visit = (list) => (list || []).forEach((p) => { if (p.effect === 'Weaken' && p.drained) drains.push({ name: p.name, held: p.drained, rank: p.rank }); });
  visit(ch.powers);
  return {
    rosterId: ch.rosterId || null,
    id: ch.id || null,
    name: ch.identity?.codename || ch.identity?.realName || 'Someone',
    color: ch.theme?.color || '#888888',
    pl: ch.pl,
    villain: ch.alignment === 'villain',
    form: hasForms(ch) ? ch.forms[activeForm(ch)]?.name : null,
    play: s,
    defenses: def,
    initiative: d.initiative,
    penalty: checkPenalty(s),
    pools: poolPowers(ch).map(({ power }) => ({ name: power.name, spent: poolSpent(ch, power, R), avail: poolAvailable(ch, power, R) })),
    drains,
    complications: (ch.complications || []).map((c) => ({ type: c.type || '', text: c.text || '' })),
    // How far each attack reaches, for the battle map's range rings (feet).
    ranges: d.attacks.filter((a) => a.power).map((a) => { const r = rangeInfo(a.power, R); return r?.kind === 'Ranged' ? { name: a.name, short: r.bands[0].ft, medium: r.bands[1].ft, long: r.bands[2].ft } : { name: a.name, kind: r?.kind || a.kind }; }),
    at: Date.now(),
  };
}

// ---- hits ------------------------------------------------------------------------------------------------

const EFFECTS = {
  damage: { effect: 'Damage', resist: 'Toughness', base: 15 },
  blast: { effect: 'Damage', resist: 'Toughness', base: 15 },
  strike: { effect: 'Damage', resist: 'Toughness', base: 15 },
  'mental blast': { effect: 'Mental Blast', resist: 'Will', base: 15 },
  affliction: { effect: 'Affliction', resist: 'Will', base: 10 },
  dazzle: { effect: 'Affliction', resist: 'Fortitude', base: 10 },
  snare: { effect: 'Affliction', resist: 'Dodge', base: 10 },
  weaken: { effect: 'Weaken', resist: 'Fortitude', base: 10 },
  drain: { effect: 'Weaken', resist: 'Fortitude', base: 10 },
};
const AREAS = ['burst', 'area', 'cone', 'line', 'cloud', 'cylinder', 'explosion'];

/**
 * Read a hit typed in plain words: "Burst Damage 10 hits Shadowshot and Spark",
 * "Affliction 8 vs Fortitude on Spark", "Weaken Strength 6 hits everyone".
 * names: the characters on the board. Returns { effect, rank, resist, dc, area, trait, targets, error }.
 */
export function parseHit(text, names) {
  const t = ` ${String(text || '').toLowerCase().replace(/[.,;!]+/g, ' ')} `;
  const key = Object.keys(EFFECTS).sort((a, b) => b.length - a.length).find((k) => t.includes(` ${k} `));
  const rank = Number((/\b(\d{1,2})\b/.exec(t) || [])[1]);
  if (!key) return { error: 'Say what hits: Damage, Affliction, Weaken, Mental Blast…' };
  if (!(rank > 0)) return { error: 'Give the rank, e.g. "Damage 10".' };
  const e = EFFECTS[key];
  let resist = e.resist;
  for (const r of ['fortitude', 'will', 'toughness', 'dodge']) if (new RegExp(`\\b(vs|against|resisted by)\\s+${r}\\b`).test(t)) resist = r[0].toUpperCase() + r.slice(1);
  const trait = e.effect === 'Weaken' ? ((/weaken\s+([a-z]+)/.exec(t) || [])[1] || null) : null;
  if (trait && ['awareness', 'intellect', 'presence', 'will'].includes(trait) && e.resist === 'Fortitude') resist = 'Will';
  const area = AREAS.some((a) => t.includes(` ${a} `));
  const everyone = /\b(everyone|everybody|all of them|the party|all)\b/.test(t);
  const targets = everyone ? [...names] : names.filter((n) => {
    const nm = n.toLowerCase();
    return t.includes(` ${nm} `) || t.includes(` ${nm.split(/\s+/)[0]} `) && nm.split(/\s+/)[0].length > 2;
  });
  if (!targets.length) return { error: 'Name who it hits (or say "everyone").' };
  return { effect: e.effect, rank, resist, dc: e.base + rank, area, trait: trait ? trait[0].toUpperCase() + trait.slice(1) : null, targets };
}

export function describeHit(hit) {
  return `${hit.area ? 'Area ' : ''}${hit.effect}${hit.trait ? ` (${hit.trait})` : ''} ${hit.rank}: ${hit.resist} DC ${hit.dc}${hit.area ? ', Dodge DC ' + (10 + hit.rank) + ' for half' : ''}`;
}

const degreesBelow = (total, dc) => (total >= dc ? 0 : 1 + Math.floor((dc - total - 1) / 5));
const AFFLICTION_TIERS = [['Dazed', 'Hindered'], ['Stunned', 'Immobile'], ['Incapacitated']];

/**
 * Resolve a hit on a character: roll the area Dodge (for half) and the resistance, apply the result to
 * its play state. roll() returns a d20 (pass a seeded one in tests). Returns { play, text, dice }.
 * hit.tiers (optional): the Affliction's conditions per degree, e.g. [['Dazed'], ['Stunned'], ['Incapacitated']].
 */
export function resolveHit(ch, hit, R, roll = () => 1 + Math.floor(Math.random() * 20)) {
  const d = deriveAll(ch, R);
  const s = playState(ch);
  const def = effectiveDefenses(d, s);
  const name = ch.identity?.codename || 'Someone';
  const dice = [];
  let rank = hit.rank;
  const parts = [];
  if (hit.area) {
    const r = roll(); const total = r + (def.Dodge ?? 0); const dc = 10 + hit.rank;
    dice.push({ label: 'Dodge (area)', roll: r, mod: def.Dodge, total, dc });
    if (total >= dc) { rank = Math.floor(hit.rank / 2); parts.push(`dives clear (Dodge ${total} vs ${dc}): half effect, rank ${rank}`); } else parts.push(`can't get clear (Dodge ${total} vs ${dc})`);
  }
  const resistMod = hit.resist === 'Toughness' ? def.Toughness : hit.resist === 'Dodge' ? def.Dodge : def[hit.resist];
  if (resistMod == null) return { play: s, text: `${name} is immune (${hit.resist}).`, dice };
  const base = hit.effect === 'Damage' || hit.effect === 'Mental Blast' ? 15 : 10;
  const dc = base + rank;
  const r = roll(); const total = r + resistMod;
  dice.push({ label: `${hit.resist} check`, roll: r, mod: resistMod, total, dc });
  const deg = degreesBelow(total, dc);
  let play = { ...s, conditions: [...s.conditions] };
  let result;
  if (hit.effect === 'Damage' || hit.effect === 'Mental Blast') {
    const a = applyDamage(s, { total, dc });
    play = a.state; result = a.text;
  } else if (hit.effect === 'Affliction') {
    if (!deg) result = 'resists it';
    else {
      const tiers = hit.tiers || AFFLICTION_TIERS;
      const add = tiers[Math.min(deg, tiers.length) - 1] || [];
      for (const c of add) {
        if (c === 'Incapacitated') play.damage = 'incapacitated';
        else if (!play.conditions.includes(c)) play.conditions.push(c);
      }
      // Kept so the end of each turn can roll to shake it off (engine/turns.js).
      const tierSet = tiers.slice(0, 3);
      play.afflictions = [...(play.afflictions || []), { id: `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, label: hit.label || `Affliction ${hit.rank}`, resist: hit.resist, dc, degree: Math.min(deg, tiers.length), tiers: tierSet, conditions: add, wasOut: s.damage === 'incapacitated' }];
      result = `${deg} degree${deg > 1 ? 's' : ''} of failure: ${add.join(' and ').toLowerCase()}`;
    }
  } else if (hit.effect === 'Weaken') {
    const lost = Math.min(rank, weakenPoints(Math.max(0, dc - total)));
    if (!lost) result = 'resists the drain';
    else {
      const trait = hit.trait || 'a trait';
      play.weakened = { ...(play.weakened || {}), [trait]: ((play.weakened || {})[trait] || 0) + lost };
      if (!play.conditions.includes('Weakened')) play.conditions.push('Weakened');
      result = `loses ${lost} power point${lost === 1 ? '' : 's'} of ${trait}`;
    }
  }
  parts.push(`${hit.resist} ${total} vs DC ${dc}: ${result}`);
  return { play, text: `${name} ${parts.join('; ')}.`, dice };
}

// ---- spotlight --------------------------------------------------------------------------------------------

/**
 * Who has had the table's attention this session: their rolls and hits in the feed since the session
 * started, plus moments the GM marked. Least first. characters: [{ key, name }].
 */
export function spotlight(characters, entries, taps = {}, since = 0) {
  const t0 = since ? new Date(since).getTime() : 0;
  const recent = entries.filter((e) => !t0 || new Date(e.t || 0).getTime() >= t0);
  const out = characters.map((c) => {
    const nm = c.name.toLowerCase();
    const mentions = recent.filter((e) => String(e.who || '').toLowerCase() === nm || String(e.text || '').toLowerCase().startsWith(`${nm} `)).length;
    const big = recent.filter((e) => (String(e.who || '').toLowerCase() === nm) && e.dice?.roll === 20).length;
    const marked = taps[c.key] || 0;
    return { ...c, rolls: mentions, nat20s: big, marked, score: mentions + big * 2 + marked * 3 };
  });
  return out.sort((a, b) => a.score - b.score);
}

// ---- complications -------------------------------------------------------------------------------------

const STOP = new Set('the a an and or of to in on at for with from by is are was be this that it its into their his her they them there then than our your you we who what when where while very just over under after before about some any each other more most such only own same so too can will not have has had been were did does done also scene'.split(' '));
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ers|er|es|ed|s)$/, '');

// Scenes that tend to bring each kind of complication into play.
const TRIGGERS = {
  identity: ['press', 'reporter', 'camera', 'photo', 'news', 'public', 'mask', 'party', 'gala', 'family', 'school', 'work', 'office', 'friend', 'date', 'funeral', 'wedding', 'crowd'],
  secret: ['press', 'reporter', 'camera', 'photo', 'investigat', 'detective', 'police', 'family', 'interrogat'],
  enemy: ['villain', 'rival', 'enemy', 'gang', 'boss', 'ambush', 'trap', 'revenge'],
  rival: ['rival', 'competition', 'contest', 'race', 'award', 'tournament'],
  relationship: ['family', 'friend', 'date', 'partner', 'parent', 'child', 'kid', 'wedding', 'hostage', 'home', 'love'],
  responsibility: ['work', 'job', 'school', 'class', 'deadline', 'shift', 'boss', 'exam', 'duty', 'appointment'],
  weakness: ['radiation', 'magic', 'kryptonite', 'gold', 'water', 'fire', 'cold', 'sunlight', 'iron', 'silver'],
  phobia: ['dark', 'height', 'fire', 'water', 'crowd', 'spider', 'tight', 'underground', 'flying'],
  power: ['stress', 'anger', 'taunt', 'overload', 'emp', 'storm', 'machine', 'technology'],
  temper: ['taunt', 'insult', 'bully', 'provok', 'mock', 'injustice'],
  honor: ['innocent', 'hostage', 'civilian', 'prisoner', 'surrender', 'deal', 'bribe', 'lie', 'oath'],
  motivation: ['innocent', 'hostage', 'civilian', 'justice', 'money', 'revenge', 'truth'],
  prejudice: ['police', 'crowd', 'public', 'mob', 'protest', 'government'],
  reputation: ['press', 'news', 'public', 'police', 'reporter', 'interview', 'tv'],
  accident: ['crowd', 'fragile', 'civilian', 'glass', 'hospital', 'museum'],
  addiction: ['bar', 'party', 'casino', 'drug', 'drink'],
  disability: ['stairs', 'chase', 'dark', 'noise'],
  hatred: ['villain', 'alien', 'mutant', 'robot', 'magic'],
  quirk: ['party', 'gala', 'interview', 'date'],
};

function triggerKind(type) {
  const t = String(type || '').toLowerCase();
  if (/identity/.test(t)) return 'identity';
  if (/secret/.test(t)) return 'secret';
  for (const k of Object.keys(TRIGGERS)) if (t.includes(k)) return k;
  if (/enem|nemesis/.test(t)) return 'enemy';
  if (/loss of power|power loss/.test(t)) return 'power';
  if (/fear/.test(t)) return 'phobia';
  return null;
}

/**
 * Complications the scene could bring into play. characters: [{ key, name, complications: [{ type, text }] }].
 * Returns [{ key, name, complication, why: [words] }], best first.
 */
export function complicationPrompts(scene, characters) {
  const sw = words(scene);
  const ss = new Set(sw.map(stem));
  const sceneText = ` ${sw.join(' ')} `;
  const out = [];
  for (const c of characters) {
    for (const comp of c.complications || []) {
      const why = new Set();
      for (const w of words(`${comp.type} ${comp.text}`)) if (ss.has(stem(w))) why.add(w);
      const k = triggerKind(comp.type);
      for (const trig of k ? TRIGGERS[k] : []) if (sceneText.includes(` ${trig}`)) why.add(trig);
      if (why.size) out.push({ key: c.key, name: c.name, complication: comp, why: [...why], score: why.size });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export { QUICK_CONDITIONS };

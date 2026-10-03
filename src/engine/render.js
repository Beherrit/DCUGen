// Turn a character into the stat-block shape used by DC Adventures books, as data and as text.

import { ABILITIES, ABBR, traitKind } from './rules.js';
import { costBreakdown, powerCost, deviceCost, effectCost } from './costs.js';
import { deriveAll } from './derive.js';
import { checkLimits } from './limits.js';
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function effectLabel(p, R) {
  const eff = R.effect(p.effect);
  const parts = [];
  const range = p.range && p.range !== eff.range ? p.range : null;
  if (range === 'Perception') parts.push('Perception Ranged');
  else if (range) parts.push(range);
  const area = (p.extras || []).find((m) => m.name === 'Area');
  if (area) parts.push(`${area.option || 'Burst'} Area`);
  if (p.effect === 'Enhanced Trait' && p.option) parts.push(`Enhanced ${p.option}`);
  else parts.push(eff.name);
  return parts.join(' ');
}

function modText(m) {
  let s = m.name;
  if (m.option && !['Area'].includes(m.name)) s += ` (${m.option})`;
  if ((m.steps ?? 1) > 1) s += ` ${m.steps}`;
  if (m.detail) s += m.name === 'Limited' ? ` ${/^(to|only|while|when|from|along|against)\b/.test(m.detail) ? m.detail : `to ${m.detail}`}` : ` (${m.detail})`;
  return s;
}

// ---- plain-English power descriptions ---------------------------------------------------------

const fmtMph = (rank) => {
  const mph = 2 ** (rank + 1);
  return mph >= 1000000 ? `${(mph / 1000000).toFixed(mph >= 10000000 ? 0 : 1)} million mph` : `${mph.toLocaleString('en-US')} mph`;
};

function distanceAt(rank, R) {
  const row = (R.raw.reference?.measurements || []).find((m) => m.rank === rank);
  return row ? row.distance : null;
}

function massAt(rank, R) {
  const row = (R.raw.reference?.measurements || []).find((m) => m.rank === rank);
  return row ? row.mass : null;
}

/**
 * What a power does at the table, in plain English: the effect, how it's resisted (with DCs),
 * range or area, speeds and distances, and a short note per extra and flaw.
 * Returns { what: string, notes: [{name, kind, text}] }.
 */
export function explainPower(p, R) {
  const eff = R.effect(p.effect);
  const rank = p.rank || 0;
  const range = p.range || eff.range;
  const area = (p.extras || []).find((m) => m.name === 'Area');
  const parts = [];
  const resist = (p.detail && /Resisted by ([A-Za-z]+)/.exec(p.detail)?.[1]) || eff.resistance;
  const conditions = p.detail && p.detail.includes(';') ? p.detail.split(';').slice(1).join(';').trim() : null;

  switch (p.effect) {
    case 'Damage': case 'Blast': case 'Strike': case 'Energy Control': case 'Magic':
      parts.push(`Deals damage: the target makes a Toughness check against DC ${15 + rank + (p.strengthBased ? 0 : 0)}${p.strengthBased ? ' + your Strength (it adds to your Strength damage)' : ''}. Failing by more means bruises, then dazed, staggered and finally incapacitated.`);
      break;
    case 'Affliction': case 'Dazzle': case 'Sleep': case 'Snare': case 'Mind Control':
      parts.push(`Imposes conditions: the target resists with ${resist || 'Fortitude or Will'} against DC ${10 + rank}${conditions ? `. Each failure degree is worse: ${conditions}` : ''}. The target repeats the check at the end of each turn to shake it off.`);
      break;
    case 'Weaken':
      parts.push(`Drains a trait${p.detail ? ` (${p.detail.split(';')[0]})` : ''}: the target resists against DC ${10 + rank} and loses 1 rank per degree of failure, recovering 1 point per round.`);
      break;
    case 'Nullify':
      parts.push(`Shuts down powers${p.detail ? ` (${p.detail})` : ''}: make an opposed check of Nullify ${rank} against the target's power rank or Will; if you win, the effect turns off.`);
      break;
    case 'Mental Blast':
      parts.push(`Mental damage: the target makes a Will check against DC ${15 + rank} instead of Toughness.`);
      break;
    case 'Protection': case 'Force Field':
      parts.push(`Adds +${rank} to Toughness against damage.${(p.extras || []).some((m) => m.name === 'Impervious') ? ` Impervious: ignores any damage of rank ${Math.floor(rank / 2)} or less.` : ''}`);
      break;
    case 'Immunity':
      parts.push(`Automatically succeeds against ${p.detail || 'the chosen effects'}.`);
      break;
    case 'Flight': case 'Speed': case 'Swimming': case 'Burrowing': {
      const verb = { Flight: 'Fly', Speed: 'Run', Swimming: 'Swim', Burrowing: 'Tunnel' }[p.effect];
      const dist = distanceAt(p.effect === 'Burrowing' ? rank - 5 : rank, R);
      parts.push(`${verb} up to ${dist || `distance rank ${rank}`} per move action (about ${fmtMph(p.effect === 'Burrowing' ? rank - 5 : rank)}).`);
      break;
    }
    case 'Leaping': {
      const dist = distanceAt(rank - 2, R);
      parts.push(`Jump up to ${dist || `distance rank ${rank - 2}`} in a single leap.`);
      break;
    }
    case 'Teleport': {
      const dist = distanceAt(rank, R);
      parts.push(`Teleport up to ${dist || `distance rank ${rank}`} as a move action to a place you can sense.`);
      break;
    }
    case 'Move Object': case 'Element Control':
      parts.push(`Moves things at a distance as if lifting with Strength ${rank} (up to ${massAt(rank, R) || `mass rank ${rank}`}).`);
      break;
    case 'Create':
      parts.push(`Creates solid objects with Toughness ${rank} and up to volume rank ${rank}.`);
      break;
    case 'Elongation':
      parts.push(`Stretches to reach up to ${distanceAt(rank, R) || `distance rank ${rank}`} away.`);
      break;
    case 'Growth':
      parts.push(`Grows larger: +${rank} Strength and Stamina, −${Math.floor(rank / 2)} to Dodge and Parry, +${Math.floor(rank / 2)} Intimidation.`);
      break;
    case 'Shrinking':
      parts.push(`Shrinks: +${Math.floor(rank / 2)} to Dodge and Parry, harder to spot, −${Math.floor(rank / 4)} Strength.`);
      break;
    case 'Insubstantial':
      parts.push(['', 'Fluid form: flows through cracks and resists physical harm.', 'Gaseous form: drifts, immune to most physical effects.', 'Energy form: immune to physical damage, only energy affects you.', 'Incorporeal: passes through solid objects; only special effects can touch you.'][Math.min(4, rank)] || eff.summary);
      break;
    case 'Regeneration':
      parts.push(`Recovers from one damage condition every ${Math.max(1, Math.round(10 / Math.max(1, rank)))} rounds or so (rank ${rank} of 20 per minute).`);
      break;
    case 'Healing':
      parts.push(`Heals: a DC 10 check removes one damage condition per degree of success from a subject you touch${range !== 'Close' ? ' (at range)' : ''}.`);
      break;
    case 'Quickness':
      parts.push(`Does routine tasks fast: a task that takes time rank X takes X − ${rank}.`);
      break;
    case 'Enhanced Trait':
      parts.push(`Raises ${p.option || 'a trait'} by ${rank}.`);
      break;
    case 'Movement':
      parts.push(`Special movement: ${p.detail || 'one mode per rank'}.`);
      break;
    case 'Senses':
      parts.push(`Extra senses: ${p.detail || `${rank} points of sense abilities`}.`);
      break;
    case 'Comprehend':
      parts.push(`Understands ${p.detail || 'a kind of communication'}.`);
      break;
    case 'Communication':
      parts.push(`Communicates through ${p.detail || 'a special medium'} across ${['', 'close range', 'about a mile', 'a state or small nation', 'the planet', 'any distance'][Math.min(5, rank)]}.`);
      break;
    case 'Feature':
      parts.push(`${p.detail || 'A minor special ability'}.`);
      break;
    case 'Concealment': case 'Invisibility':
      parts.push(`Hides you from ${p.detail || 'some senses'}; foes can't target you with those senses.`);
      break;
    case 'Illusion':
      parts.push(`Creates illusions (${p.option || 'senses'}); observers see through them with an Insight check against DC ${10 + rank}.`);
      break;
    case 'Mind Reading':
      parts.push(`Reads minds: an opposed check of Mind Reading ${rank} against the target's Will; more degrees reach deeper thoughts.`);
      break;
    case 'Summon':
      parts.push(`Summons ${p.detail || 'a minion'} built on ${rank * 15} power points.`);
      break;
    case 'Variable': case 'Mimic': case 'Shapeshift':
      parts.push(`Reassigns up to ${rank * 5} points of traits${p.detail ? ` (${p.detail})` : ''} as an action.`);
      break;
    case 'Morph':
      parts.push(`Changes appearance${p.detail ? ` (${p.detail})` : ''}; +${rank * 5 > 20 ? 20 : rank * 5} to Deception checks to pass as someone else.`);
      break;
    case 'Environment':
      parts.push(`Changes the environment (${p.detail || 'heat, cold, light...'}) in an area of distance rank ${rank}.`);
      break;
    case 'Remote Sensing':
      parts.push(`Perceives a distant place up to distance rank ${rank} away${p.detail ? ` (${p.detail})` : ''}.`);
      break;
    case 'Deflect':
      parts.push(`Deflects ranged attacks aimed at others: your Deflect ${rank} replaces their Dodge.`);
      break;
    case 'Immortality':
      parts.push(`Comes back from death in about ${['', 'a month', 'a week', 'a day', 'an hour', 'a few minutes'][Math.min(5, rank)] || 'a few minutes'}.`);
      break;
    case 'Transform':
      parts.push(`Transforms ${p.detail || 'targets'} of up to mass rank ${rank} (DC ${10 + rank} to resist).`);
      break;
    case 'Luck Control':
      parts.push('Spends hero points to change luck: grant re-rolls, force them on others, or improve results.');
      break;
    default:
      parts.push(eff.summary || '');
      if (p.detail) parts.push(p.detail.endsWith('.') ? p.detail : `${p.detail}.`);
  }

  if (area) {
    parts.push(`${area.option || 'Burst'} area: no attack roll. Everyone in the area may make a Dodge check (DC ${10 + rank}) to take half the effect.`);
  } else if (range === 'Ranged' && (eff.attack || eff.type === 'Attack' || p.effect === 'Healing')) {
    parts.push(`Ranged attack: roll against the target's Dodge + 10. Short range ${25 * rank} ft, medium ${50 * rank} ft (−2), long ${100 * rank} ft (−5).`);
  } else if (range === 'Perception' && (eff.attack || eff.type === 'Attack' || eff.resistance)) {
    parts.push('Perception range: no attack roll; works on any target you can perceive.');
  } else if (range === 'Close' && (eff.attack || eff.type === 'Attack')) {
    parts.push("Close attack: roll against the target's Parry + 10.");
  }

  const notes = [];
  for (const [kind, list] of [['extra', p.extras], ['flaw', p.flaws]]) {
    for (const m of list || []) {
      if (m.name === 'Area') continue;
      let def;
      try { def = R.modifier(kind, m.name, p.effect); } catch { def = null; }
      notes.push({ name: m.name + (m.detail ? ` (${m.detail})` : ''), kind, text: def?.summary || '' });
    }
  }
  if ((p.alternates || []).length) notes.push({ name: `${p.dynamic ? 'Dynamic ' : ''}Alternate Effects`, kind: 'extra', text: `Use one effect of this array at a time${p.dynamic ? ', or split its points between them' : ''}; switching is a free action.` });
  return { what: parts.filter(Boolean).join(' '), notes };
}

/** "Ranged Burst Area Damage 8 (fire), Accurate 2, Limited to vision" */
export function describeEffect(p, R) {
  const eff = R.effect(p.effect);
  let s = `${effectLabel(p, R)}${eff.fixed_cost ? '' : ` ${p.rank}`}`;
  const notes = [];
  if (p.option && p.effect !== 'Enhanced Trait') notes.push(p.option);
  if (p.detail) notes.push(p.detail);
  if (p.descriptors?.length) notes.push(p.descriptors.join(', '));
  if (notes.length) s += ` (${notes.join('; ')})`;
  const mods = [];
  if (p.strengthBased) mods.push('Strength-based');
  for (const m of p.extras || []) if (m.name !== 'Area') mods.push(modText(m));
  for (const m of p.flaws || []) mods.push(modText(m));
  if (mods.length) s += `, ${mods.join(', ')}`;
  for (const l of p.linked || []) s += `; Linked ${describeEffect(l, R)}`;
  return s;
}

export function powerLines(p, R) {
  const cost = powerCost(p, R);
  const own = effectCost(p, R).total + (p.linked || []).reduce((t, l) => t + effectCost(l, R).total, 0);
  const lines = [{ name: p.name, text: describeEffect(p, R), cost: p.alternates?.length ? own : cost, primary: true, power: p }];
  for (const a of p.alternates || []) {
    lines.push({ name: a.name, text: describeEffect(a, R), cost: p.dynamic ? 2 : 1, alternate: true, dynamic: !!p.dynamic, power: a });
  }
  return { cost, lines, arrayCost: cost };
}

function dcFor(atk, R) {
  const eff = R.effect(atk.effect);
  const base = atk.effect === 'Damage' || eff.resistance === 'Toughness' ? 15 : 10;
  return base + atk.rank;
}

export function offenseLines(ch, R, d = deriveAll(ch, R)) {
  const lines = [{ label: 'Initiative', text: sign(d.initiative) }];
  for (const a of d.attacks) {
    const effectName = a.effect === 'Damage' ? 'Damage' : a.effect;
    let text;
    if (a.roll) text = `${sign(a.bonus)} ${a.kind === 'ranged' ? 'Ranged' : 'Close'}, ${effectName} ${a.rank}`;
    else if (a.kind === 'area') text = `Area, ${effectName} ${a.rank} (DC ${dcFor(a, R)}; Dodge DC ${10 + a.rank} for half)`;
    else text = `Perception, ${effectName} ${a.rank} (DC ${dcFor(a, R)})`;
    if (a.crit && a.crit < 20) text += `, Crit. ${a.crit}-20`;
    lines.push({ label: a.name, text, attack: a });
  }
  return lines;
}

/** Everything the UI and exporters need, in one object. */
export function sheet(ch, R) {
  const d = deriveAll(ch, R);
  const cost = costBreakdown(ch, R);
  const issues = checkLimits(ch, R);
  const powers = (ch.powers || []).map((p) => powerLines(p, R));
  const devices = (ch.devices || []).map((dev) => ({
    name: dev.name,
    kind: dev.kind,
    ...deviceCost(dev, R),
    powers: dev.powers.map((p) => powerLines(p, R)),
  }));
  const skills = d.skills
    .slice()
    .sort((a, b) => (a.name + (a.spec || '')).localeCompare(b.name + (b.spec || '')))
    .map((s) => ({ ...s, label: s.spec ? `${s.name}: ${s.spec}` : s.name }));
  const advantages = (ch.advantages || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ ...a, label: `${a.name}${a.param ? ` (${a.param})` : ''}${(a.rank || 1) > 1 || R.advantage(a.name)?.ranked ? ` ${a.rank || 1}` : ''}` }));
  const def = d.defenses;
  return {
    d, cost, issues,
    legal: issues.every((i) => i.severity !== 'error'),
    abilities: ABILITIES.map((a) => ({ name: a, abbr: ABBR[a], base: ch.abilities[a], total: d.abilities[a] })),
    defenses: [
      { name: 'Dodge', value: def.Dodge, bought: ch.defenses.Dodge || 0 },
      { name: 'Parry', value: def.Parry, bought: ch.defenses.Parry || 0 },
      { name: 'Fortitude', value: def.immune?.Fortitude ? 'Immune' : def.Fortitude, bought: ch.defenses.Fortitude || 0, immune: def.immune?.Fortitude },
      { name: 'Toughness', value: def.Toughness, noRoll: def.ToughnessNoRoll, parts: def.parts },
      { name: 'Will', value: def.immune?.Will ? 'Immune' : def.Will, bought: ch.defenses.Will || 0, immune: def.immune?.Will },
    ],
    caps: {
      dodgeTough: def.Dodge + def.Toughness,
      parryTough: def.Parry + def.Toughness,
      fortWill: def.Fortitude + def.Will,
      limit: 2 * ch.pl,
    },
    powers, devices, skills, advantages,
    offense: offenseLines(ch, R, d),
    equipment: ch.equipment || [],
  };
}

export function statBlockText(ch, R) {
  const s = sheet(ch, R);
  const id = ch.identity || {};
  const out = [];
  const title = `${(id.codename || 'Unnamed').toUpperCase()}${id.realName ? ` (${id.realName})` : ''}`;
  out.push(`${title}    PL ${ch.pl}`);
  const tags = [ch.archetype?.name, ch.theme?.name, ch.theme?.secondary?.name, ch.style ? `${ch.style.name} style` : null, ch.alignment ? (ch.alignment === 'villain' ? 'Villain' : 'Hero') : null].filter(Boolean);
  out.push(tags.join(' • '));
  out.push('');
  out.push(s.abilities.map((a) => `${a.abbr} ${a.total ?? '—'}`).join('  '));
  out.push('');
  const powerBits = [];
  for (const p of s.powers) {
    const [first, ...alts] = p.lines;
    let line = `${first.name}: ${first.text} • ${plural(first.cost, 'point')}`;
    if (alts.length) line += `; ${alts.map((a) => `${a.dynamic ? 'DAE' : 'AE'}: ${a.name}: ${a.text} • ${plural(a.cost, 'point')}`).join('; ')}`;
    powerBits.push(line);
  }
  for (const dev of s.devices) {
    const inner = dev.powers.map((p) => {
      const [first, ...alts] = p.lines;
      let line = `${first.name}: ${first.text}`;
      if (alts.length) line += `; ${alts.map((a) => `AE: ${a.name}: ${a.text}`).join('; ')}`;
      return line;
    }).join('; ');
    const kind = dev.kind === 'easily' ? 'Easily Removable' : 'Removable';
    powerBits.push(`${dev.name}: ${kind} (-${dev.discount} points) • ${plural(dev.total, 'point')}. ${inner}`);
  }
  if (powerBits.length) out.push(`Powers: ${powerBits.join('. ')}.`);
  if (s.equipment.length) out.push(`Equipment: ${s.equipment.map((e) => `${e.name}${e.effect ? ` (${e.effect})` : ''}`).join(', ')}.`);
  if (s.advantages.length) out.push(`Advantages: ${s.advantages.map((a) => a.label).join(', ')}.`);
  if (s.skills.length) out.push(`Skills: ${s.skills.map((k) => `${k.label} ${k.ranks} (${sign(k.bonus)})`).join(', ')}.`);
  out.push(`Offense: ${s.offense.map((o) => `${o.label} ${o.text}`).join(', ')}.`);
  const t = s.defenses.find((x) => x.name === 'Toughness');
  const toughText = t.noRoll !== t.value ? `${t.value}/${t.noRoll}*` : `${t.value}`;
  out.push(`Defense: ${s.defenses.map((x) => `${x.name} ${x.name === 'Toughness' ? toughText : x.value}`).join(', ')}${t.noRoll !== t.value ? ' *Without Defensive Roll bonus.' : ''}`);
  const c = s.cost;
  out.push(`Power Points: Abilities ${c.abilities} + Powers ${c.powers} + Advantages ${c.advantages} + Skills ${c.skills} (${c.skillRanks} ranks) + Defenses ${c.defenses} = ${c.total}`);
  if (ch.complications?.length) out.push(`Complications: ${ch.complications.map((x) => `${x.type}: ${x.text}`).join(' ')}`);
  if (ch.origin?.text) { out.push(''); out.push(`Origin (${ch.origin.label}): ${ch.origin.text}`); }
  return out.join('\n');
}

export { traitKind };

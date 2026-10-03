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

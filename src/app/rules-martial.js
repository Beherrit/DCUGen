// Rules tab cards for Mutants & Masterminds: Martial Arts 3e: fighting styles, stances, combat maneuvers, weapons and
// qualities, headquarters features and the optional rules. rules.js adds them to its cards; each one carries its page.

import { stanceLine, maneuverLine } from '../engine/martial/describe.js';

const money = (v) => (v == null ? '' : String(v));

function styleCards(R) {
  return (R.raw.styles || []).map((s) => {
    const list = (a) => (a || []).map((x) => `${x.name}${x.rank ? ` ${x.rank}` : ''}${x.detail ? ` (${x.detail})` : ''}`).join(', ');
    const parts = [
      s.stances?.length ? `Stances: ${s.stances.join(', ')}.` : null,
      s.weapon_elements?.length ? `Weapon elements: ${s.weapon_elements.join(', ')}.` : null,
      s.skill_list?.length ? `Skills: ${s.skill_list.map((k) => `${k.name} ${k.ranks}`).join(', ')}.` : null,
      s.style_extras?.length ? `Style extras: ${list(s.style_extras)}.` : null,
      s.style_flaws?.length ? `Style flaws: ${list(s.style_flaws)}.` : null,
      s.advantage_list?.length ? `Advantages: ${list(s.advantage_list)}.` : null,
      s.basic_maneuvers?.length ? `Basic maneuvers: ${list(s.basic_maneuvers)}.` : null,
      s.advanced_maneuvers?.length ? `Advanced maneuvers: ${list(s.advanced_maneuvers)}.` : null,
    ].filter(Boolean);
    return { cat: 'Fighting styles', title: s.name, meta: `${s.category} · ${s.type} · ${s.points} points`, summary: s.summary, details: parts.join(' '), source: s.source };
  });
}

function stanceCards(R) {
  const stances = R.raw.stances || [];
  const rules = R.raw.reference?.stance_rules;
  const out = [];
  if (rules) out.push({ cat: 'Stances', title: 'Fighting style stances: the rules', meta: 'Neutral, changing stance, ending a stance', summary: rules.summary, details: (rules.rules || []).join(' '), source: rules.source });
  if (stances.length) {
    out.push({ cat: 'Stances', title: 'Stances (table)', meta: `${stances.length} stances`, summary: 'DC is the Close Combat or Ranged Combat: Fighting Style check to assume the stance. Each style lists the stances it teaches.',
      table: [['Stance', 'DC', 'Benefits', 'Detriments'], ...stances.map((s) => [s.name, s.dc_per_rank ? `${s.dc} + ${s.dc_per_rank} per rank` : s.dc || 'none', s.benefits, s.detriments])], source: 'MA 129-131' });
  }
  for (const s of stances) out.push({ cat: 'Stances', title: `${s.name} stance`, meta: `DC ${s.dc || 'none'}${s.style ? ` · ${s.style}` : ''}`, summary: stanceLine(s), details: [s.text, s.special].filter(Boolean).join(' '), source: s.source });
  return out;
}

function maneuverCards(R) {
  const all = R.raw.maneuvers || [];
  const basic = all.filter((m) => m.tier === 'basic' && !m.style);
  const out = [];
  if (basic.length) {
    out.push({ cat: 'Combat maneuvers', title: 'Basic combat maneuvers (table)', meta: `${basic.length} maneuvers`, summary: 'Mundane attacks: damage is your Strength plus the number shown. Cost is in power points when a style buys the maneuver.',
      table: [['Maneuver', 'Action', 'Damage', 'Crit', 'Attack', 'Defense', 'Cost'], ...basic.map((m) => [m.name, m.action, m.damage, m.crit, m.attack_mod, m.defense_mod, m.cost?.text || ''])], source: 'MA 137-144' });
  }
  for (const m of all) {
    const meta = m.tier === 'basic' ? `Basic${m.mundane ? ' (mundane)' : ''}${m.style ? ` · ${m.style}` : ''}` : `Advanced · ${m.type || ''}${m.style ? ` · ${m.style}` : ''}`;
    out.push({ cat: 'Combat maneuvers', title: m.name, meta: `${meta} · ${m.cost?.text || ''}`, summary: m.summary || m.flavor, details: [maneuverLine(m), m.build ? `Build: ${m.build}.` : null, m.notes, m.suggestions ? `Suggestions: ${m.suggestions}` : null].filter(Boolean).join(' '), source: m.source });
  }
  return out;
}

function gearCards(R) {
  const eq = R.raw.equipment || {};
  const out = [];
  for (const q of eq.weapon_qualities || []) out.push({ cat: 'Weapons', title: q.name, meta: `Weapon quality · ${q.cost}`, summary: q.summary, details: q.text !== q.summary ? q.text : '', source: q.source });
  for (const w of eq.ma_weapons || []) out.push({ cat: 'Weapons', title: w.name, meta: `${w.category} · ${money(w.cost)} points · crit ${w.crit}`, summary: w.effect, details: w.description, source: w.source });
  for (const a of eq.ma_armor || []) out.push({ cat: 'Weapons', title: a.name, meta: `${a.category} · ${money(a.cost)} points`, summary: a.effect, details: a.description, source: a.source });
  for (const t of eq.trick_arrows || []) out.push({ cat: 'Weapons', title: t.name, meta: `Trick arrow · ${t.cost_text}`, summary: t.effect, details: t.description, source: t.source });
  for (const m of eq.mystic_items || []) out.push({ cat: 'Weapons', title: m.name, meta: `Mystic item · ${m.cost_text}`, details: m.description, source: m.source });
  return out;
}

function headquartersCards(R) {
  const hq = R.raw.headquarters || {};
  const out = [];
  if (hq.expanded_sizes?.length) out.push({ cat: 'Headquarters', title: 'Expanded headquarters sizes', meta: 'Table', summary: 'Sizes beyond Colossal, up to planetary systems.', table: [['Size', 'Cost', 'Spaces', 'Examples'], ...hq.expanded_sizes.map((x) => [x.name, x.cost, x.spaces, x.examples])], source: 'MA 275' });
  if (hq.revised_power_needs?.length) out.push({ cat: 'Headquarters', title: 'Revised power needs', meta: 'Table', summary: 'What a headquarters\' power needs cost at the larger sizes.', table: [['Size', 'Cost', 'Alternate cost', 'Spaces'], ...hq.revised_power_needs.map((x) => [x.name, x.cost, x.cost_alt ?? '', x.spaces])], source: 'MA 276' });
  for (const f of (hq.features || []).filter((x) => /^MA\b/.test(x.source || ''))) out.push({ cat: 'Headquarters', title: f.name, meta: `Feature · ${f.cost_text || `${f.cost} points`} · space ${f.space || ''}`, summary: f.text, details: f.prerequisites && f.prerequisites !== 'None' ? `Prerequisites: ${f.prerequisites}.` : '', source: f.source });
  return out;
}

function optionalCards(R) {
  const ref = R.raw.reference || {};
  const out = [];
  const asTable = (t) => (t?.rows ? [t.columns || [], ...t.rows] : null);
  for (const o of ref.optional_rules || []) {
    const [first, ...more] = (o.tables || []).filter((t) => t.rows);
    out.push({ cat: 'Optional rules', title: o.name, meta: 'Optional rule', summary: o.summary, details: o.text === o.summary ? '' : o.text, table: asTable(first), source: o.source });
    for (const t of more) out.push({ cat: 'Optional rules', title: `${o.name}: ${t.name}`, meta: 'Table', summary: t.note, table: asTable(t), source: o.source });
  }
  for (const a of ref.new_actions || []) out.push({ cat: 'Optional rules', title: a.name, meta: `New action · ${a.action}`, summary: a.summary, details: a.details === a.summary ? '' : a.details, source: a.source });
  const pm = ref.pursuit_maneuvers || {};
  for (const [who, list] of Object.entries(pm)) for (const p of list) out.push({ cat: 'Optional rules', title: p.name, meta: `Pursuit maneuver · ${who}${p.vehicle_types ? ` · ${p.vehicle_types}` : ''}`, summary: p.summary, details: [p.success ? `Success: ${p.success}` : null, p.failure ? `Failure: ${p.failure}` : null].filter(Boolean).join(' '), source: p.source });
  return out;
}

/** Every Martial Arts card for the Rules tab. */
export function martialCards(R) {
  return [...styleCards(R), ...stanceCards(R), ...maneuverCards(R), ...gearCards(R), ...headquartersCards(R), ...optionalCards(R)];
}

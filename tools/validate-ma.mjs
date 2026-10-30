// Validate the Martial Arts (3e) rules data in data/*.json.
//   node tools/validate-ma.mjs        prints the report, exits 1 on any error
// The checks are also run by tests/martial-arts-data.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// The book's own slips: a name written another way, or a printed subtotal that disagrees with its list.
export const STANCE_ALIASES = { power: 'Power', throw: 'Throwing', 'power stance': 'Power', neutral: 'Neutral' };
export const KNOWN_DISCREPANCIES = {
  Kajukenbo: ['Advanced Maneuvers'], 'Keysi Fighting Method': ['Advanced Maneuvers'], 'Kyuki Do': ['Style Flaws'],
  'Law Enforcement Training': ['Style Extras'], Taekwondo: ['Style Flaws'], 'Weise Von Gestalt': ['Advanced Maneuvers'],
};
// Named in a style but defined nowhere in the book (Jinzouningen-Dageki lists it among mecha options).
export const UNRESOLVED_ADVANTAGES = ['Critical Strike'];
// Maneuver prices a style prints that disagree with the maneuver's own cost (book slips; reported as warnings).
export const PRICE_QUIRKS = ["Hou Quan: Cobra's Dance", 'Kyuki Do: Shattering Kiai', 'Tessenjutsu: Nerve Strike', 'Ying Zhua Pai: Eagle Eye Aim', 'Zipota: Eagle Eye Aim', 'Du Zhua Quan: Cobra Strike'];
export const HEADER_TYPOS = ['Duan Quan', 'Fanzi Quan'];
export const OPEN_ENDED = ['Karate, General', 'Kung Fu, General'];
const SECTION_FIELDS = { 'Style Extras': 'style_extras', 'Style Flaws': 'style_flaws', 'Weapon Elements': 'weapon_elements', Skills: 'skill_list', Advantages: 'advantage_list', 'Basic Maneuvers': 'basic_maneuvers', 'Advanced Maneuvers': 'advanced_maneuvers' };

export function loadMa() {
  return {
    styles: readJson('styles.json'), stances: readJson('stances.json'), maneuvers: readJson('maneuvers.json'), advantages: readJson('advantages.json'), modifiers: readJson('modifiers.json'),
  };
}

/** Cost of a maneuver at a rank from its parsed cost formula; null when the book leaves it open. */
export function maneuverCost(man, rank) {
  const c = man.cost;
  if (!c || c.varies) return null;
  if (c.per_rank && rank == null) return null;
  return c.flat + (c.per_rank ? Math.ceil((rank * c.per_rank) / c.ranks_per) : 0);
}

function maneuverIndex(maneuvers) {
  const idx = new Map();
  for (const m of maneuvers) { idx.set(key(m.name), m); for (const a of m.aliases || []) idx.set(key(a), m); }
  return idx;
}

function findManeuver(idx, it) {
  const tries = [it.name, it.detail ? `${it.name}, ${it.detail}` : null, it.detail ? `${it.name}, ${it.detail.replace(/s$/, '')}` : null, it.name.replace(/^Ranged /, ''), it.name.replace(/^Grab-Based /, ''), it.name.replace(/ Attacks?$/, '')];
  for (const t of tries) if (t && idx.has(key(t))) return idx.get(key(t));
  return null;
}

// A parameter that adds or removes a flaw or extra changes the style's price for the maneuver.
const PRICE_ADJUSTED = /Check Required|Limited|Pinball|Full Damage|System|Instead|Only/i;
const GENERIC_BASIC = /^Basic .*(Attacks?|Strikes|Slam)$|^Basic Unarmed$/;

function checkStances(d, out) {
  const names = new Set(d.stances.map((s) => key(s.name.replace(/ \(Vehicle\)$/, ''))));
  for (const s of d.styles) {
    for (const n of s.stances || []) {
      const alias = STANCE_ALIASES[key(n)] || n;
      if (!names.has(key(alias))) out.errors.push(`${s.name}: unknown stance "${n}"`);
    }
  }
}

function checkManeuvers(d, out) {
  const idx = maneuverIndex(d.maneuvers);
  for (const s of d.styles) {
    for (const tier of ['basic_maneuvers', 'advanced_maneuvers']) {
      for (const it of s[tier]) {
        if (GENERIC_BASIC.test(it.name)) continue;
        const m = findManeuver(idx, it);
        if (!m) { out.errors.push(`${s.name}: unknown maneuver "${it.name}"${it.detail ? ` (${it.detail})` : ''}`); continue; }
        if (tier === 'advanced_maneuvers' && it.cost != null && !it.varies && !it.plus && !it.alternative && !/^Grab-Based/.test(it.name) && !PRICE_ADJUSTED.test(it.detail || '')) {
          const expect = maneuverCost(m, it.rank);
          if (expect !== null && expect !== it.cost) out[PRICE_QUIRKS.includes(`${s.name}: ${it.name}`) ? 'warnings' : 'errors'].push(`${s.name}: ${it.name} ${it.rank ?? ''} priced ${it.cost} in the style, ${expect} by the maneuver's own formula (${m.cost.text})`);
        }
      }
    }
  }
}

function checkAdvantages(d, out) {
  const names = new Set(d.advantages.map((a) => key(a.name)));
  const extra = new Set(['stances', 'initiate', 'student', 'master', ...UNRESOLVED_ADVANTAGES.map(key)]);
  for (const s of d.styles) {
    for (const a of s.advantage_list) {
      if (a.external) continue;
      const base = key(a.name.replace(/ Stances$/, ''));
      if (/ Stances$/.test(a.name) || names.has(key(a.name)) || extra.has(base)) continue;
      out.errors.push(`${s.name}: advantage "${a.name}" is not in advantages.json`);
    }
  }
}

function sectionSum(s, label) {
  const items = s[SECTION_FIELDS[label]];
  const add = s.cost_check.free_spend?.[label]?.points || 0;
  if (label === 'Weapon Elements') return items.length + add;
  if (label === 'Skills') return Math.ceil(items.reduce((a, i) => a + i.ranks, 0) / 2) + add;
  if (label === 'Advantages') return items.reduce((a, i) => a + (i.rank ?? 1), 0) + add;
  return items.reduce((a, i) => a + (i.cost || 0), 0) + add;
}

function checkCosts(d, out) {
  for (const s of d.styles) {
    const cc = s.cost_check;
    if (OPEN_ENDED.includes(s.name)) { out.notes.push(`${s.name}: open-ended template (${cc.header})`); continue; }
    const known = KNOWN_DISCREPANCIES[s.name] || [];
    let printedTotal = 0;
    for (const label of Object.keys(SECTION_FIELDS)) {
      const printed = Number(/-?\d+/.exec(cc.printed_subtotals[label])[0]);
      printedTotal += printed;
      const sum = sectionSum(s, label);
      if (sum !== printed && !known.includes(label)) out.errors.push(`${s.name}: ${label} items add to ${sum} but the book prints ${printed}`);
      if (sum === printed && known.includes(label)) out.errors.push(`${s.name}: ${label} is listed as a known discrepancy but now adds up`);
    }
    const header = Number(/\d+/.exec(s.points)[0]);
    const computed = Object.keys(SECTION_FIELDS).reduce((a, l) => a + sectionSum(s, l), 0);
    const ok = computed === header || (known.length > 0 && printedTotal === header) || (HEADER_TYPOS.includes(s.name) && printedTotal !== header);
    if (!ok) out.errors.push(`${s.name}: components add to ${computed} (printed subtotals ${printedTotal}) but the style says ${s.points}`);
  }
}

function checkStyleMods(d, out) {
  const extras = new Set(d.modifiers.style_extras.map((m) => m.name));
  const flaws = new Set(d.modifiers.style_flaws.map((m) => m.name));
  for (const s of d.styles) {
    for (const e of s.style_extras) if (!extras.has(e.name)) out.errors.push(`${s.name}: unknown style extra "${e.name}"`);
    for (const f of s.style_flaws) if (!flaws.has(f.name)) out.errors.push(`${s.name}: unknown style flaw "${f.name}"`);
  }
}

function checkShape(d, out) {
  for (const [file, list] of Object.entries({ styles: d.styles, stances: d.stances, maneuvers: d.maneuvers })) {
    const seen = new Set();
    for (const e of list) {
      if (!/^MA \d+$/.test(e.source || '')) out.errors.push(`${file}: "${e.name}" has no "MA <page>" source`);
      if (seen.has(e.name)) out.errors.push(`${file}: duplicate name "${e.name}"`);
      seen.add(e.name);
    }
  }
  for (const s of d.stances) for (const f of ['dc', 'benefits', 'detriments', 'mods']) if (s[f] === undefined) out.errors.push(`stance ${s.name}: missing ${f}`);
  for (const m of d.maneuvers) for (const f of ['tier', 'cost', 'build']) if (m[f] === undefined) out.errors.push(`maneuver ${m.name}: missing ${f}`);
}

export function validateMa(d = loadMa()) {
  const out = { errors: [], warnings: [], notes: [] };
  checkShape(d, out);
  checkStances(d, out);
  checkManeuvers(d, out);
  checkAdvantages(d, out);
  checkStyleMods(d, out);
  checkCosts(d, out);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = validateMa();
  for (const k of ['errors', 'warnings', 'notes']) { console.log(`\n${k} (${r[k].length})`); r[k].forEach((l) => console.log(`  ${l}`)); }
  process.exit(r.errors.length ? 1 : 0);
}

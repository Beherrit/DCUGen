// Homebrew packs: your own power themes, archetypes and creatures, made from the built-in ones and shared as
// one file. A pack loads into the rules (R.raw) next to the book's, tagged with its pack, and comes out again
// when it's switched off.
//
// pack = { kind: 'dcugen-pack', v: 1, id, name, author, notes, themes: [theme], archetypes: [archetype],
//          creatures: [catalog entry] }   (theme and archetype shapes: data/SCHEMA.md)
//
// Random rolls never pick a homebrew theme or archetype unless it's chosen, so seeds and character keys
// made without packs still give the same character on a device that has them; and a character that uses
// one shares as a full code, never a seed key (see usesHomebrew()).

const clone = (x) => JSON.parse(JSON.stringify(x));
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const list = (text) => (Array.isArray(text) ? text : String(text || '').split(',')).map((x) => String(x).trim()).filter(Boolean);

export const PACK_KIND = 'dcugen-pack';

export function emptyPack(name = 'My homebrew') {
  return { kind: PACK_KIND, v: 1, id: `hb-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name, author: '', notes: '', themes: [], archetypes: [], creatures: [] };
}

/** An id no built-in or other homebrew item uses: "hb-<pack>-<name>". */
function idFor(pack, name, taken) {
  let id = `hb-${slugify(pack.name).slice(0, 16)}-${slugify(name)}`;
  let n = 2;
  while (taken.has(id)) id = `hb-${slugify(pack.name).slice(0, 16)}-${slugify(name)}-${n++}`;
  return id;
}

/**
 * A power theme from a built-in one: its powers, with your name, color, descriptors, codename words, costume
 * colours and weakness. powers: optional { index: { names: 'A, B', off: true } } to rename or drop powers.
 */
export function makeTheme(R, pack, { base, name, color, descriptors, words, adjectives, costume, weakness, origin, environment, powers = {} }) {
  const b = R.raw.themes.find((t) => t.id === base && !t.homebrew) || R.raw.themes.find((t) => t.id === base);
  if (!b) throw new Error(`No theme "${base}" to start from`);
  if (!String(name || '').trim()) throw new Error('Give the theme a name');
  const taken = new Set([...R.raw.themes.map((t) => t.id), ...pack.themes.map((t) => t.id)]);
  const t = clone(b);
  delete t.homebrew;
  t.id = idFor(pack, name, taken);
  t.name = String(name).trim();
  t.base = b.id;
  if (color) t.color = color;
  if (list(descriptors).length) t.descriptors = list(descriptors);
  if (list(words).length || list(adjectives).length) t.codename = { words: list(words).length ? list(words) : t.codename?.words || [], adjectives: list(adjectives).length ? list(adjectives) : t.codename?.adjectives || [] };
  if (list(costume).length) t.costume = list(costume);
  if (list(weakness).length) t.weakness = list(weakness);
  if (origin) t.origin_hint = String(origin);
  if (environment) t.environment = String(environment);
  t.powers = (t.powers || []).map((p, i) => {
    const edit = powers[i];
    if (edit?.off) return null;
    return list(edit?.names).length ? { ...p, names: list(edit.names) } : p;
  }).filter(Boolean);
  if (!t.powers.some((p) => p.role === 'attack')) throw new Error('Keep at least one attack power');
  return t;
}

/**
 * An archetype from a built-in one: your name and blurb, ability ranges ("pl+2..pl+5", "1..3"), and which
 * themes it rolls with ({ themeId: weight }, homebrew themes too).
 */
export function makeArchetype(R, pack, { base, name, blurb, abilities = {}, themes = null }) {
  const b = R.raw.archetypes.find((a) => a.id === base && !a.homebrew) || R.raw.archetypes.find((a) => a.id === base);
  if (!b) throw new Error(`No archetype "${base}" to start from`);
  if (!String(name || '').trim()) throw new Error('Give the archetype a name');
  const taken = new Set([...R.raw.archetypes.map((a) => a.id), ...pack.archetypes.map((a) => a.id)]);
  const a = clone(b);
  delete a.homebrew; delete a.hidden;
  a.id = idFor(pack, name, taken);
  a.name = String(name).trim();
  a.base = b.id;
  if (blurb) a.blurb = String(blurb);
  for (const [k, v] of Object.entries(abilities)) if (String(v || '').trim()) a.abilities[k] = String(v).trim();
  if (themes && Object.keys(themes).length) a.themes = Object.fromEntries(Object.entries(themes).filter(([, w]) => Number(w) > 0).map(([k, w]) => [k, Number(w)]));
  return a;
}

/** A Bestiary creature from a character sheet (built on the Forge): stats plus what the GM needs. */
export function creatureFromCharacter(pack, ch, { name, category = 'Homebrew', summary = '', tactics = '', habitat = '', weakness = '', minion = false } = {}) {
  const n = String(name || ch.identity?.codename || 'Creature').trim();
  const taken = new Set(pack.creatures.map((c) => c.id));
  return {
    id: idFor(pack, n, taken), name: n, kind: ch.construct ? 'construct' : 'creature', realm: 'Homebrew', category: String(category || 'Homebrew'),
    pl: ch.pl, size: ch.size || 'Medium', summary: summary || ch.summary || '', tactics, habitat, weakness, tags: ['homebrew'], minion: !!(minion || ch.minion),
    abilities: clone(ch.abilities || {}), defenses: clone(ch.defenses || {}), skills: clone(ch.skills || []), advantages: clone(ch.advantages || []),
    powers: clone(ch.powers || []), equipment: clone(ch.equipment || []), devices: clone(ch.devices || []), source: pack.name,
  };
}

/** Check a pack (one made here, or a file someone sent). Returns { ok, errors, pack } with a cleaned copy. */
export function validatePack(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['That isn\'t a homebrew pack.'], pack: null };
  if (raw.kind !== PACK_KIND) errors.push('That isn\'t a DCUGen homebrew pack (it has no "kind": "dcugen-pack").');
  const pack = { ...emptyPack(raw.name || 'Homebrew'), ...clone(raw) };
  for (const k of ['themes', 'archetypes', 'creatures']) if (!Array.isArray(pack[k])) pack[k] = [];
  pack.themes = pack.themes.filter((t, i) => { const ok = t?.id && t.name && Array.isArray(t.powers) && t.powers.length; if (!ok) errors.push(`Theme ${i + 1} is incomplete.`); return ok; });
  pack.archetypes = pack.archetypes.filter((a, i) => { const ok = a?.id && a.name && a.abilities && a.themes; if (!ok) errors.push(`Archetype ${i + 1} is incomplete.`); return ok; });
  pack.creatures = pack.creatures.filter((c, i) => { const ok = c?.id && c.name && c.pl != null && c.abilities; if (!ok) errors.push(`Creature ${i + 1} is incomplete.`); return ok; });
  for (const k of ['themes', 'archetypes', 'creatures']) for (const x of pack[k]) if (!String(x.id).startsWith('hb-')) x.id = `hb-${x.id}`;
  return { ok: raw.kind === PACK_KIND, errors, pack };
}

/** Take every homebrew item out of the rules. */
export function clearPacks(R) {
  R.raw.themes = R.raw.themes.filter((t) => !t.homebrew);
  R.raw.archetypes = R.raw.archetypes.filter((a) => !a.homebrew);
  if (R.raw.catalog) delete R.raw.catalog.homebrew;
}

/**
 * Load the switched-on packs into the rules (replacing whatever homebrew was there). Archetypes are hidden
 * from random rolls (hidden + homebrew: the Forge still lists them); themes carry homebrew, which random
 * picks skip. Returns how many of each loaded.
 */
export function applyPacks(R, packs) {
  clearPacks(R);
  const n = { themes: 0, archetypes: 0, creatures: 0 };
  const creatures = [];
  for (const p of packs || []) {
    if (p.enabled === false) continue;
    for (const t of p.themes || []) { if (R.raw.themes.some((x) => x.id === t.id)) continue; R.raw.themes.push({ ...clone(t), homebrew: p.id }); n.themes++; }
    for (const a of p.archetypes || []) { if (R.raw.archetypes.some((x) => x.id === a.id)) continue; R.raw.archetypes.push({ ...clone(a), homebrew: p.id, hidden: true }); n.archetypes++; }
    for (const c of p.creatures || []) { creatures.push({ ...clone(c), homebrew: p.id }); n.creatures++; }
  }
  if (creatures.length) R.raw.catalog = { ...(R.raw.catalog || {}), homebrew: creatures };
  return n;
}

/** The themes a random roll may pick from: the book's, never homebrew. */
export const randomThemes = (R) => R.raw.themes.filter((t) => !t.homebrew);

/** Does this character use a homebrew theme or archetype? (Then it shares as a full code, not a seed key.) */
export function usesHomebrew(R, ch) {
  const ids = [ch?.options?.archetype, ch?.options?.theme, ch?.archetype?.id, ...(ch?.themes || []).map((t) => t?.id || t), ch?.theme?.id].filter(Boolean);
  return ids.some((id) => String(id).startsWith('hb-') || R.raw.themes.some((t) => t.id === id && t.homebrew) || R.raw.archetypes.some((a) => a.id === id && a.homebrew));
}

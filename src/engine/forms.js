// Alternate forms: one character, up to 8 builds (a human identity and a powered one, armor on and off,
// a werewolf's three shapes...). Each form is a whole build with its own power level, traits, powers,
// gear, codename and picture, checked on its own. Everything about the person (name, bio, journal,
// factions, world, roster entry) is shared.
//
// The active form lives at the top level of the character, so every part of the app (sheet, limits,
// Battle Room, exports) works on it unchanged; the others wait in ch.forms[i]. Switching swaps them.

export const MAX_FORMS = 8;
export const FORM_FIELDS = ['pl', 'abilities', 'defenses', 'skills', 'advantages', 'powers', 'devices', 'equipment', 'portrait', 'theme'];

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export const hasForms = (ch) => Array.isArray(ch?.forms) && ch.forms.length > 1;
export const activeForm = (ch) => (hasForms(ch) ? Math.max(0, Math.min(ch.activeForm || 0, ch.forms.length - 1)) : 0);

/** A form's build, stored or live. */
export function formBuild(ch, i) {
  if (i === activeForm(ch) || !hasForms(ch)) {
    const out = {};
    for (const k of FORM_FIELDS) if (ch[k] !== undefined) out[k] = ch[k];
    return out;
  }
  return ch.forms[i];
}

function snapshot(ch) {
  const out = {};
  for (const k of FORM_FIELDS) if (ch[k] !== undefined) out[k] = clone(ch[k]);
  return out;
}

function blankBuild(pl) {
  return {
    pl,
    abilities: { Strength: 0, Stamina: 0, Agility: 0, Dexterity: 0, Fighting: 0, Intellect: 0, Awareness: 0, Presence: 0 },
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
    skills: [], advantages: [], powers: [], devices: [], equipment: [],
  };
}

/** Add a form (a copy of the active one, or a blank build) and return the new character. */
export function addForm(ch, { copy = true, name } = {}) {
  const c = clone(ch);
  if (!hasForms(c)) { c.forms = [{ name: 'Form 1', codename: c.identity?.codename || '' }]; c.activeForm = 0; }
  if (c.forms.length >= MAX_FORMS) throw new Error(`A character can have ${MAX_FORMS} forms at most.`);
  const n = c.forms.length + 1;
  const build = copy ? snapshot(c) : blankBuild(c.pl);
  if (!copy) build.theme = clone(c.theme);
  c.forms.push({ name: name || `Form ${n}`, codename: c.identity?.codename || '', ...build });
  return c;
}

/** Make form i the active one. Returns the new character. */
export function switchForm(ch, i) {
  if (!hasForms(ch)) return ch;
  const cur = activeForm(ch);
  if (i === cur || i < 0 || i >= ch.forms.length) return ch;
  const c = clone(ch);
  // put the live build away
  c.forms[cur] = { name: c.forms[cur].name, codename: c.identity?.codename || c.forms[cur].codename || '', ...snapshot(c) };
  // bring the other one out
  const next = c.forms[i];
  for (const k of FORM_FIELDS) { if (next[k] !== undefined) c[k] = next[k]; else delete c[k]; }
  if (next.codename) c.identity = { ...c.identity, codename: next.codename };
  c.forms[i] = { name: next.name, codename: next.codename || '' };
  c.activeForm = i;
  return c;
}

export function renameForm(ch, i, name) {
  const c = clone(ch);
  if (hasForms(c) && c.forms[i]) c.forms[i].name = String(name || '').trim() || `Form ${i + 1}`;
  return c;
}

/** Remove a form that isn't the active one. With one form left, the character has no forms any more. */
export function removeForm(ch, i) {
  if (!hasForms(ch) || i === activeForm(ch)) return ch;
  const c = clone(ch);
  c.forms.splice(i, 1);
  if (i < c.activeForm) c.activeForm -= 1;
  if (c.forms.length < 2) { delete c.forms; delete c.activeForm; }
  return c;
}

/** Every form as a full character of its own (for exports, stat blocks and checking each build). */
export function formCharacters(ch) {
  if (!hasForms(ch)) return [ch];
  return ch.forms.map((f, i) => {
    if (i === activeForm(ch)) return ch;
    const c = clone(ch);
    for (const k of FORM_FIELDS) { if (f[k] !== undefined) c[k] = clone(f[k]); else delete c[k]; }
    if (f.codename) c.identity = { ...c.identity, codename: f.codename };
    c.activeForm = i;
    return c;
  });
}

// Writing a life story by hand: every part of the Bio page as a form. Works on a rolled bio (change
// what the dice gave you) or from a blank page ("Write your own"). Saves as one edit; the keys know
// the bio was edited, so a share key will not rebuild it from dice.

import { h, toast } from './dom.js';

export const TRAIT_SIDES = { light: 'Lightside', dark: 'Darkside', neutral: 'Neutral', exotic: 'Exotic' };
const STRENGTHS = ['mild', 'strong', 'obsessive'];
const SECTION_IDS = ['origins', 'youth', 'career', 'life', 'people', 'drives', 'game'];
const SECTION_TITLES = { origins: 'Origins & Family', youth: 'Youth', career: 'Education & Career', life: 'Adult Life', people: 'People in Their Life', drives: 'What Drives Them', game: 'For the GM' };
const STAGES = ['Childhood', 'Youth', 'Teens', 'Early adulthood', 'Adulthood', 'The turning point', 'Recently'];
const PARENT_ROLES = ['Mother', 'Father', 'Parent', 'Stepmother', 'Stepfather', 'Guardian', 'Grandmother', 'Grandfather', 'Adoptive mother', 'Adoptive father', 'Creator', 'Maker'];
const SIBLING_RELS = ['Sister', 'Brother', 'Sibling', 'Twin sister', 'Twin brother', 'Half-sister', 'Half-brother', 'Stepsister', 'Stepbrother'];
export const PEOPLE_RELS = ['Mentor', 'Friend', 'Ally', 'Rival', 'Enemy', 'Nemesis', 'Love', 'Ex', 'Contact', 'Employer', 'Teammate', 'Dependent', 'Guardian', 'Student', 'Family', 'Partner', 'Informant'];
const COMP_TYPES = ['Motivation', 'Relationship', 'Responsibility', 'Secret', 'Enemy', 'Fame', 'Identity', 'Obsession', 'Prejudice', 'Quirk', 'Reputation', 'Rivalry', 'Temper', 'Weakness', 'Addiction', 'Honor', 'Hatred', 'Phobia', 'Power Loss', 'Disability', 'Accident'];

/** A blank life story to write into. */
export function blankBio(ch) {
  return {
    version: 'manual', manual: true, edited: true, name: ch.identity?.realName || '', summary: '', sections: [],
    timeline: [], family: { parents: [], siblings: [], structure: '' }, people: [],
    personality: { traits: [], values: [], fears: [], habits: [], likes: [], dislikes: [], voice: '' },
    motivations: [], secrets: [], regrets: [], hopes: [], hooks: [], complications: [], benefits: { skills: [], advantages: [] },
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const lines = (arr) => (arr || []).join('\n');
const unlines = (text) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
const commas = (arr) => (arr || []).join(', ');
const uncommas = (text) => String(text || '').split(',').map((x) => x.trim()).filter(Boolean);

function field(label, el, { grow = 1 } = {}) { return h('label', { class: 'field', style: { flex: grow } }, h('span', null, label), el); }
function text(value, attrs = {}) { return h('input', { type: 'text', value: value ?? '', ...attrs }); }
function area(value, attrs = {}) { return h('textarea', { style: { minHeight: '64px' }, ...attrs }, value ?? ''); }
function pick(value, options, attrs = {}) { return h('select', attrs, options.map((o) => h('option', { value: o, selected: o === value }, o))); }
function pickFree(value, options, attrs = {}) { const id = `be-${Math.random().toString(36).slice(2, 8)}`; return [h('input', { type: 'text', value: value ?? '', list: id, ...attrs }), h('datalist', { id }, options.map((o) => h('option', { value: o })))]; }

/** A list of rows with add/remove, rendered from draft.items via row(item, i). */
function rowList(items, row, { add, addLabel = '+ Add', empty = 'Nothing yet.' } = {}) {
  const host = h('div', { class: 'be-rows' });
  const draw = () => {
    host.replaceChildren();
    if (!items.length) host.append(h('p', { class: 'hint', style: { margin: 0 } }, empty));
    items.forEach((it, i) => host.append(h('div', { class: 'be-row' }, row(it, i), h('button', { class: 'x', type: 'button', 'aria-label': 'Remove', onClick: () => { items.splice(i, 1); draw(); } }, '✕'))));
    host.append(h('button', { class: 'btn sm', type: 'button', onClick: () => { items.push(add()); draw(); } }, addLabel));
  };
  draw();
  return host;
}

/**
 * The editor. onSave(bio) stores the story and leaves edit mode; onCancel() just leaves. Returns an element.
 */
export function bioEditor(ch, { onSave, onCancel }) {
  const d = clone(ch.bio || blankBio(ch));
  d.family = d.family || { parents: [], siblings: [], structure: '' };
  d.family.parents = d.family.parents || []; d.family.siblings = d.family.siblings || [];
  d.people = d.people || []; d.sections = d.sections || []; d.timeline = d.timeline || [];
  d.personality = d.personality || {}; d.personality.traits = d.personality.traits || [];
  d.complications = d.complications || []; d.hooks = d.hooks || [];
  d.benefits = d.benefits || {};

  const summary = area(d.summary, { style: { minHeight: '120px' }, placeholder: 'Their story in a few paragraphs: where they came from, what made them, who they are now.' });
  const structure = text(d.family.structure, { placeholder: 'Family in one line (e.g. "Raised by a single mother in Ravensport")' });
  const parents = rowList(d.family.parents, (p) => h('div', { class: 'be-grid p' },
    text(p.name, { placeholder: 'Name', onInput: (e) => { p.name = e.target.value; } }),
    pickFree(p.role, PARENT_ROLES, { placeholder: 'Role', onInput: (e) => { p.role = e.target.value; } }),
    text(p.occupation, { placeholder: 'Occupation', onInput: (e) => { p.occupation = e.target.value; } }),
    text(p.trait, { placeholder: 'Trait (one line)', onInput: (e) => { p.trait = e.target.value; } }),
    text(p.status, { placeholder: 'Status (alive, estranged, deceased…)', onInput: (e) => { p.status = e.target.value; } })),
  { add: () => ({ name: '', role: 'Mother', occupation: '', trait: '', status: 'Alive.' }), addLabel: '+ Parent', empty: 'No parents written.' });
  const siblings = rowList(d.family.siblings, (p) => h('div', { class: 'be-grid s' },
    text(p.name, { placeholder: 'Name', onInput: (e) => { p.name = e.target.value; } }),
    pickFree(p.relation, SIBLING_RELS, { placeholder: 'Relation', onInput: (e) => { p.relation = e.target.value; } }),
    h('input', { type: 'number', min: 0, value: p.age ?? '', placeholder: 'Age', style: { maxWidth: '70px' }, onInput: (e) => { p.age = e.target.value === '' ? undefined : Number(e.target.value); } }),
    text(p.note, { placeholder: 'A line about them', onInput: (e) => { p.note = e.target.value; } }),
    text(p.status, { placeholder: 'Status', onInput: (e) => { p.status = e.target.value; } })),
  { add: () => ({ name: '', relation: 'Sister', note: '', status: 'Alive' }), addLabel: '+ Sibling', empty: 'No siblings written.' });
  const people = rowList(d.people, (p) => h('div', { class: 'be-grid pe' },
    text(p.name, { placeholder: 'Name', onInput: (e) => { p.name = e.target.value; } }),
    pickFree(p.relation, PEOPLE_RELS, { placeholder: 'Relationship', onInput: (e) => { p.relation = e.target.value; } }),
    text(p.who, { placeholder: 'Who they are and what they mean', onInput: (e) => { p.who = e.target.value; } }),
    text(p.status, { placeholder: 'Status now', onInput: (e) => { p.status = e.target.value; } })),
  { add: () => ({ name: '', relation: 'Friend', who: '', status: '' }), addLabel: '+ Person', empty: 'No one written yet: mentors, friends, rivals, enemies, loves.' });
  const life = d.timeline.filter((t) => !t.journalId);
  const timeline = rowList(life, (t) => h('div', { class: 'be-grid t' },
    h('input', { type: 'number', min: 0, value: t.age ?? '', placeholder: 'Age', style: { maxWidth: '70px' }, onInput: (e) => { t.age = e.target.value === '' ? undefined : Number(e.target.value); } }),
    pickFree(t.stage, STAGES, { placeholder: 'Stage', onInput: (e) => { t.stage = e.target.value; } }),
    text(t.text, { placeholder: 'What happened', onInput: (e) => { t.text = e.target.value; } })),
  { add: () => ({ age: undefined, stage: 'Adulthood', text: '', tags: [] }), addLabel: '+ Event', empty: 'No life events yet.' });
  const sections = rowList(d.sections, (s) => h('div', { class: 'be-section' },
    h('div', { class: 'be-grid sec' }, pickFree(s.title, Object.values(SECTION_TITLES), { placeholder: 'Section title', onInput: (e) => { s.title = e.target.value; s.id = SECTION_IDS.find((id) => SECTION_TITLES[id] === e.target.value) || s.id || 'custom'; } })),
    rowList(s.items = s.items || [], (it) => h('div', { class: 'be-grid it' }, text(it.label, { placeholder: 'Label (e.g. "Childhood home")', onInput: (e) => { it.label = e.target.value; } }), area(it.text, { style: { minHeight: '44px' }, placeholder: 'Text', onInput: (e) => { it.text = e.target.value; } })), { add: () => ({ label: '', text: '' }), addLabel: '+ Line', empty: 'Empty section.' })),
  { add: () => ({ id: 'custom', title: '', items: [{ label: '', text: '' }] }), addLabel: '+ Section', empty: 'No sections. Add one for origins, youth, career, adult life, or anything else.' });
  const traits = rowList(d.personality.traits, (t) => h('div', { class: 'be-grid tr' },
    text(t.name, { placeholder: 'Trait', onInput: (e) => { t.name = e.target.value; } }),
    pick(t.side || 'neutral', Object.keys(TRAIT_SIDES), { onChange: (e) => { t.side = e.target.value; } }),
    pick(t.strength || 'mild', STRENGTHS, { onChange: (e) => { t.strength = e.target.value; } })),
  { add: () => ({ name: '', side: 'neutral', strength: 'mild' }), addLabel: '+ Trait', empty: 'No traits.' });
  const values = text(commas(d.personality.values), { placeholder: 'comma separated' });
  const fears = text(commas(d.personality.fears), { placeholder: 'comma separated' });
  const habits = text(commas(d.personality.habits), { placeholder: 'comma separated' });
  const likes = text(commas(d.personality.likes), { placeholder: 'comma separated' });
  const dislikes = text(commas(d.personality.dislikes), { placeholder: 'comma separated' });
  const voice = text(d.personality.voice, { placeholder: 'How to roleplay them: voice, manner, a catchphrase' });
  const motivations = area(lines(d.motivations), { placeholder: 'One per line' });
  const secrets = area(lines(d.secrets), { placeholder: 'One per line' });
  const regrets = area(lines(d.regrets), { placeholder: 'One per line' });
  const hopes = area(lines(d.hopes), { placeholder: 'One per line' });
  const hooks = area(lines(d.hooks), { placeholder: 'Story hooks for the GM, one per line' });
  const comps = rowList(d.complications, (c) => h('div', { class: 'be-grid c' }, pickFree(c.type, COMP_TYPES, { placeholder: 'Type', onInput: (e) => { c.type = e.target.value; } }), text(c.text, { placeholder: 'The complication', onInput: (e) => { c.text = e.target.value; } })), { add: () => ({ type: 'Motivation', text: '' }), addLabel: '+ Complication', empty: 'None suggested.' });

  const saveIt = () => {
    const journal = (ch.bio?.timeline || []).filter((t) => t.journalId);
    const out = {
      ...d,
      summary: summary.value.trim(),
      family: { ...d.family, structure: structure.value.trim(), parents: d.family.parents.filter((p) => p.name?.trim()), siblings: d.family.siblings.filter((p) => p.name?.trim()) },
      people: d.people.filter((p) => p.name?.trim()),
      sections: d.sections.map((s) => ({ ...s, title: s.title?.trim() || 'Notes', items: (s.items || []).filter((it) => it.text?.trim()) })).filter((s) => s.items.length),
      timeline: [...life.filter((t) => t.text?.trim()).sort((a, b) => (a.age ?? 999) - (b.age ?? 999)), ...journal],
      personality: { ...d.personality, traits: d.personality.traits.filter((t) => t.name?.trim()), values: uncommas(values.value), fears: uncommas(fears.value), habits: uncommas(habits.value), likes: uncommas(likes.value), dislikes: uncommas(dislikes.value), voice: voice.value.trim() },
      motivations: unlines(motivations.value), secrets: unlines(secrets.value), regrets: unlines(regrets.value), hopes: unlines(hopes.value), hooks: unlines(hooks.value),
      complications: d.complications.filter((c) => c.text?.trim()),
      edited: true,
    };
    onSave(out);
    toast('Life story saved');
  };

  const sec = (title, ...body) => h('section', { class: 'sec be-sec' }, h('h3', null, title), ...body);
  return h('div', { class: 'be' },
    h('div', { class: 'be-bar no-print' },
      h('b', null, d.manual ? 'Writing their life story' : 'Editing the rolled life story'),
      h('span', { class: 'hint' }, 'Everything below is yours to change. Journal sessions stay as they are.'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => onCancel?.() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, 'Save life story')),
    sec('Their story', summary),
    sec('Family', field('In one line', structure), h('div', { class: 'label' }, 'Parents and guardians'), parents, h('div', { class: 'label' }, 'Siblings'), siblings),
    sec('People in their life', people),
    sec('Life timeline', h('p', { class: 'hint', style: { margin: 0 } }, 'Sorted by age when saved.'), timeline),
    sec('The story in sections', sections),
    sec('Personality', traits, h('div', { class: 'jr-row' }, field('Values', values), field('Fears', fears)), h('div', { class: 'jr-row' }, field('Habits', habits), field('Likes', likes), field('Dislikes', dislikes)), field('Roleplay it', voice)),
    sec('Inner life', h('div', { class: 'jr-row' }, field('Motivations', motivations), field('Secrets', secrets)), h('div', { class: 'jr-row' }, field('Regrets', regrets), field('Hopes', hopes))),
    sec('For the GM', field('Story hooks', hooks), h('div', { class: 'label' }, 'Complications from their past'), comps),
    h('div', { class: 'btn-row no-print', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', type: 'button', onClick: () => onCancel?.() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, 'Save life story')));
}

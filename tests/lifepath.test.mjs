import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { generateBio, rerollSection, bioText, DCA_COMPLICATIONS, BIO_RELATIONS } from '../src/engine/lifepath.js';
import { rollPerson } from '../src/engine/lifepath.js';

const LEAK = /\{[^{}]*\}|\[\[|undefined|null|NaN|\[object Object\]/;
const constructs = R.raw.archetypes.filter((a) => a.construct).map((a) => a.id);
const minions = R.raw.archetypes.filter((a) => a.minion).map((a) => a.id);

function sampleCharacters(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const archetype = i % 10 === 0 ? constructs[i % constructs.length] : i % 10 === 5 ? minions[i % minions.length] : undefined;
    out.push(generateCharacter(R, { seed: `life-${i}`, archetype }));
  }
  return out;
}
const CHARS = sampleCharacters(300);

function strings(x, out = []) {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}

test('lifepath tables are loaded and well stocked', () => {
  const L = R.raw.lifepath;
  assert.ok(L, 'R.raw.lifepath exists');
  assert.ok(L.childhood.events.length >= 50);
  assert.ok(L.adolescence.events.length >= 50);
  assert.ok(L.adult.events.length >= 90);
  assert.ok(L.firstbrush.events.length >= 40);
  for (const side of ['light', 'dark', 'neutral', 'exotic']) assert.ok(L.personality[side].length >= 25, side);
});

test('generation is deterministic for a seed', () => {
  for (const ch of CHARS.slice(0, 40)) {
    const a = generateBio(R, ch, { seed: ch.seed });
    const b = generateBio(R, ch, { seed: ch.seed });
    assert.deepEqual(a, b, ch.seed);
  }
});

test('300 random characters, constructs and minions all get a valid bio', () => {
  const skills = new Set(R.raw.skills.map((s) => s.name));
  const advantages = new Set(R.raw.advantages.map((a) => a.name));
  for (const ch of CHARS) {
    const bio = generateBio(R, ch, { seed: `${ch.seed}-bio` });
    const tag = `${ch.seed} (${ch.archetype.id})`;
    assert.equal(bio.version, 1);
    assert.ok(bio.summary.length > 40, tag);
    assert.ok(Array.isArray(bio.sections) && bio.sections.length > 0, tag);

    // Timeline: sorted and never past the character's age
    const age = ch.identity.age ?? Infinity;
    let prev = -1;
    for (const t of bio.timeline) {
      assert.ok(Number.isInteger(t.age), `${tag} age ${t.age}`);
      assert.ok(t.age <= age, `${tag}: event at ${t.age} but character is ${age}`);
      assert.ok(t.age >= prev, `${tag}: timeline not sorted`);
      prev = t.age;
    }

    // Suggested benefits use real names
    for (const s of bio.benefits.skills) assert.ok(skills.has(s.name), `${tag}: unknown skill ${s.name}`);
    for (const a of bio.benefits.advantages) assert.ok(advantages.has(a.name), `${tag}: unknown advantage ${a.name}`);

    // Complications use DC Adventures types
    for (const c of bio.complications) assert.ok(DCA_COMPLICATIONS.includes(c.type), `${tag}: bad complication type ${c.type}`);
    for (const p of bio.people) assert.ok(BIO_RELATIONS.includes(p.relation), `${tag}: bad relation ${p.relation}`);
    for (const t of bio.personality.traits) assert.ok(['light', 'dark', 'neutral', 'exotic'].includes(t.side) && ['mild', 'strong', 'obsessive'].includes(t.strength), tag);

    // No placeholders or junk leak into any text
    for (const s of strings(bio)) assert.ok(!LEAK.test(s), `${tag}: leaked text "${s}"`);
    assert.ok(!LEAK.test(bioText(bio)), tag);
  }
});

test('a 19-year-old has no adult decades and young characters stay young', () => {
  let checked = 0;
  for (let i = 0; i < 400 && checked < 20; i++) {
    const ch = generateCharacter(R, { seed: `young-${i}` });
    if (ch.identity.age == null || ch.identity.age > 19 || ch.construct) continue;
    const bio = generateBio(R, ch, { seed: `young-${i}` });
    assert.ok(bio.timeline.every((t) => t.age <= ch.identity.age));
    assert.ok(!bio.timeline.some((t) => t.stage === 'Adulthood'), ch.seed);
    checked++;
  }
  assert.ok(checked > 0);
});

test('constructs get an activation history instead of a childhood', () => {
  for (const id of constructs) {
    const ch = generateCharacter(R, { seed: `bot-${id}`, archetype: id });
    const bio = generateBio(R, ch, { seed: 'bot' });
    assert.ok(!bio.timeline.some((t) => t.stage === 'Childhood' || t.stage === 'Adolescence'), id);
    assert.equal(bio.family.siblings.filter((s) => / (brother|sister)$/i.test(s.relation)).length, 0);
  }
});

test('different seeds give varied summaries', () => {
  const ch = CHARS[1];
  const summaries = new Set();
  for (let i = 0; i < 30; i++) summaries.add(generateBio(R, ch, { seed: `vary-${i}` }).summary);
  assert.ok(summaries.size >= 28, `only ${summaries.size} distinct summaries`);
  const across = new Set(CHARS.slice(0, 60).map((c) => generateBio(R, c, { seed: c.seed }).summary));
  assert.equal(across.size, 60);
});

test('rerollSection changes one part and keeps the rest', () => {
  const ch = CHARS[3];
  const bio = generateBio(R, ch, { seed: 'keep' });
  const re = rerollSection(R, ch, bio, 'personality', { seed: 'new-traits' });
  assert.deepEqual(re.family, bio.family);
  assert.deepEqual(re.timeline, bio.timeline);
  assert.notDeepEqual(re.personality, bio.personality);
  const again = rerollSection(R, ch, bio, 'personality', { seed: 'new-traits' });
  assert.deepEqual(again, re, 'rerolls are deterministic for a seed');
  const people = rerollSection(R, ch, bio, 'people', { seed: 'new-people' });
  assert.deepEqual(people.family, bio.family);
  assert.equal(people.summary.split('.')[0], bio.summary.split('.')[0]);
  assert.throws(() => rerollSection(R, ch, bio, 'nope', { seed: 'x' }));
});

test('bioText renders a readable plain-text export', () => {
  const bio = generateBio(R, CHARS[7], { seed: 'text' });
  const txt = bioText(bio);
  assert.ok(txt.includes(bio.summary));
  assert.ok(txt.includes('== Timeline =='));
  for (const s of bio.sections) assert.ok(txt.includes(`== ${s.title} ==`));
});

test('works with sparse or hand-made characters', () => {
  assert.doesNotThrow(() => generateBio(R, {}, { seed: 'empty' }));
  assert.doesNotThrow(() => generateBio(R, { identity: { realName: 'Pat Doe', age: 40 } }, { seed: 'npc' }));
  const old = generateBio(R, { identity: { realName: 'Old One', age: 900, gender: 'Male' }, alignment: 'villain' }, { seed: 'old' });
  assert.ok(old.timeline.every((t) => t.age <= 900));
  const beast = generateBio(R, { kind: 'creature', identity: { codename: 'Grax' } }, { seed: 'beast' });
  assert.ok(beast.summary.includes('Grax'));
});

test('rollPerson fills in a hand-typed person, parent or sibling and keeps what was typed', () => {
  const ch = generateCharacter(R, { seed: 'roll-person', pl: 10 });
  const rival = rollPerson(R, ch, { kind: 'person', name: 'Marisol Vega', relation: 'Rival' }, { seed: 'a' });
  assert.equal(rival.name, 'Marisol Vega'); assert.equal(rival.relation, 'Rival');
  assert.ok(rival.who.length > 10 && rival.status.length > 3);
  assert.ok(!/\{/.test(rival.who + rival.status), 'no stray placeholders');
  assert.deepEqual(rollPerson(R, ch, { kind: 'person', name: 'Marisol Vega', relation: 'Rival' }, { seed: 'a' }), rival, 'deterministic');
  const mum = rollPerson(R, ch, { kind: 'parent', name: 'Dolores Quinn', role: 'Mother' }, { seed: 'c' });
  assert.equal(mum.role, 'Mother'); assert.ok(mum.occupation && mum.trait && mum.status);
  assert.ok(!/Deceased; Deceased/.test(mum.status));
  const sib = rollPerson(R, ch, { kind: 'sibling', relation: 'Younger brother' }, { seed: 'e' });
  assert.equal(sib.relation, 'Younger brother'); assert.ok(sib.name && sib.note && sib.age < (ch.identity.age || 30));
  const anyone = rollPerson(R, ch, { kind: 'person' }, { seed: 'z' });
  assert.ok(anyone.name && anyone.relation && anyone.who);
});

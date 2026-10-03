import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { addJournalEntry, updateJournalEntry, removeJournalEntry, journalPoints, journalText, unlinkedSpends, linkPoints } from '../src/engine/journal.js';
import { rollDowntimeEvent, bioText } from '../src/engine/lifepath.js';
import { recordChanges } from '../src/engine/advancement.js';
import { characterKey } from '../src/engine/keys.js';
import { statBlockRows } from '../src/engine/xlsx.js';

test('a session joins the timeline, adds people, updates statuses and awards points', () => {
  const ch = generateCharacter(R, { seed: 'journal-1', pl: 10 });
  const people = ch.bio.people.length;
  const known = ch.bio.people[0];
  const e = addJournalEntry(ch, R, { session: 3, title: 'Casino night', text: 'Stopped a heist.', people: [{ name: 'Alleycat', relation: 'Mentor', who: 'Old boxer', status: 'Impressed' }, { name: known.name, status: 'Now an enemy.' }], pointsEarned: 2, downtime: 'Trained for a month.' });
  const inPlay = ch.bio.timeline.filter((t) => t.journalId === e.id);
  assert.equal(inPlay.length, 2);
  assert.equal(inPlay[0].stage, 'In play');
  assert.ok(inPlay[0].text.startsWith('Casino night'));
  assert.equal(ch.bio.people.length, people + 1);
  assert.equal(ch.bio.people.find((p) => p.name === 'Alleycat').relation, 'Mentor');
  assert.equal(known.status, 'Now an enemy.');
  assert.equal(known.relation, ch.bio.people[0].relation, 'relation kept when the entry does not set one');
  assert.equal(journalPoints(ch, e.id).length, 1);
  assert.equal(journalPoints(ch, e.id)[0].points, 2);
  assert.ok(journalText(ch).includes('Session 3'));
  assert.ok(bioText(ch.bio).includes('session 3'));
  assert.ok(statBlockRows(ch, R).rows.some((r) => r[0] === 'CAMPAIGN JOURNAL'));
});

test('spending can be tied to a session, and edits and removal keep the bio consistent', () => {
  const ch = generateCharacter(R, { seed: 'journal-2', pl: 10 });
  const e = addJournalEntry(ch, R, { title: 'First night', pointsEarned: 3 });
  ch.abilities.Fighting += 1;
  recordChanges(ch, R, 'Training', { journalId: e.id });
  assert.equal(journalPoints(ch, e.id).length, 2);
  ch.defenses.Will = (ch.defenses.Will || 0) + 1;
  recordChanges(ch, R, 'More training');
  assert.equal(unlinkedSpends(ch).length, 1);
  linkPoints(ch, unlinkedSpends(ch)[0].id, e.id);
  assert.equal(unlinkedSpends(ch).length, 0);
  updateJournalEntry(ch, R, e.id, { title: 'First night out', people: [{ name: 'Nobody Special', relation: 'Contact' }] });
  assert.ok(ch.bio.timeline.find((t) => t.journalId === e.id).text.startsWith('First night out'));
  assert.ok(ch.bio.people.some((p) => p.name === 'Nobody Special'));
  const before = ch.bio.timeline.length;
  removeJournalEntry(ch, e.id);
  assert.equal(ch.bio.timeline.length, before - 1);
  assert.ok(!ch.bio.people.some((p) => p.name === 'Nobody Special'));
  assert.ok(ch.advancement.log.every((x) => !x.journalId));
});

test('journal entries count as edits, so keys no longer rebuild the character', () => {
  const ch = generateCharacter(R, { seed: 'journal-3', pl: 10 });
  assert.ok(characterKey(R, ch));
  addJournalEntry(ch, R, { title: 'Played' });
  assert.equal(characterKey(R, ch), null);
});

test('characters without a bio get a shell and a journal; downtime rolls are clean', () => {
  const ch = { pl: 10, abilities: { Strength: 0 }, identity: { codename: 'Hand Built', age: 30 } };
  addJournalEntry(ch, R, { title: 'Debut' });
  assert.equal(ch.bio.timeline[0].age, 30);
  const full = generateCharacter(R, { seed: 'journal-4', pl: 10 });
  for (let i = 0; i < 20; i++) {
    const d = rollDowntimeEvent(R, full, { seed: `dt-${i}` });
    assert.ok(d.text.length > 10 && !/\{|undefined|NaN/.test(d.text), d.text);
  }
  assert.equal(rollDowntimeEvent(R, full, { seed: 'same' }).text, rollDowntimeEvent(R, full, { seed: 'same' }).text);
});

test('an enemy is a full villain at a fitting power level, in the people list with a working key', async () => {
  const { addEnemy, ENEMY_LEVELS } = await import('../src/engine/journal.js');
  const { fromKeySync } = await import('../src/engine/keys.js');
  const ch = generateCharacter(R, { seed: 'enemy-1', pl: 10 });
  for (const level of Object.keys(ENEMY_LEVELS)) {
    const { person, villain } = addEnemy(ch, R, { level, seed: `e-${level}` });
    assert.equal(villain.alignment, 'villain');
    assert.ok(villain.pl >= 10 + ENEMY_LEVELS[level].plShift[0] && villain.pl <= 10 + ENEMY_LEVELS[level].plShift[1]);
    assert.ok(ch.bio.people.includes(person));
    assert.ok(person.key, 'has a key');
    const back = fromKeySync(R, person.key).character;
    assert.equal(back.identity.codename, person.name);
    assert.ok(/who .+\.$/.test(person.who));
    assert.ok(ch.bio.timeline.some((t) => t.enemyOf === person.name));
  }
  assert.equal(ch.complications.filter((c) => c.type === 'Enemy').length, 3);
  const named = addEnemy(ch, R, { level: 'nemesis', seed: 'e-named', name: 'Doctor Dread', complication: false });
  assert.equal(named.person.name, 'Doctor Dread');
  assert.equal(named.person.relation, 'Nemesis');
});

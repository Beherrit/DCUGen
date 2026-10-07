import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { emptyWorld, buildWorld, recordMoment, createEntity, campaignTimeline, vaultMarkdown, handoutMarkdown } from '../src/engine/world.js';
import { draftWanted, draftCasefile, draftLetter, draftTexts, draftReport, draftHandout, newHandout, redactParts, ransomLetters, handoutSummary, handoutTitle, HANDOUT_KINDS } from '../src/engine/handouts.js';
import { encodeHandout, decodeHandout, isHandoutKey } from '../src/app/share.js';

function world() {
  const hero = generateCharacter(R, { seed: 'ho-hero', pl: 10 }); hero.rosterId = 'r-h';
  const villain = generateCharacter(R, { seed: 'ho-villain', pl: 12, alignment: 'villain' }); villain.rosterId = 'r-v';
  const saved = emptyWorld();
  let w = buildWorld(saved, [hero, villain], R);
  recordMoment(saved, w, { kind: 'betrayed', a: 'char:r-v', b: 'char:r-h', session: 2, note: 'On the bridge.' });
  w = buildWorld(saved, [hero, villain], R);
  return { saved, w, V: w.entities.get('char:r-v'), H: w.entities.get('char:r-h'), roster: [hero, villain] };
}

test('a wanted poster and a case file draft themselves from a villain\'s page', () => {
  const { w, V } = world();
  const wd = draftWanted(w, V, { seed: 's' });
  assert.equal(wd.kind, 'wanted');
  assert.equal(wd.title, V.name);
  assert.equal(wd.fields.banner, 'WANTED');
  assert.match(wd.fields.reward, /^\$144,000$/, 'reward from PL');
  assert.ok(wd.fields.crimes.includes('betrayed'), 'the recorded moment is a crime');
  assert.ok(wd.people.includes(V.id));
  assert.equal(JSON.stringify(draftWanted(w, V, { seed: 's' })), JSON.stringify(wd), 'same seed, same poster');
  const cf = draftCasefile(w, V, { seed: 's' });
  assert.match(cf.fields.fileNo, /^[A-Z]+-\d{4}-[A-Z]$/);
  assert.ok(/SEVERE/.test(cf.fields.threat));
  assert.ok(cf.body.includes('Recorded history'));
  assert.ok(redactParts(cf.body).some((p) => p.redacted), 'the assessment is redacted');
  assert.ok(handoutSummary(wd).startsWith('WANTED:'));
  assert.equal(handoutTitle(wd), `Wanted poster: ${V.name}`);
});

test('letters, texts and reports know what last happened between two people', () => {
  const { w, V, H } = world();
  const l = draftLetter(w, V, H, { seed: 's', look: 'handwritten' });
  assert.equal(l.look, 'handwritten');
  assert.ok(l.body.includes('betrayed'), 'the letter mentions the betrayal');
  assert.ok(l.people.includes(V.id) && l.people.includes(H.id));
  const tg = draftLetter(w, V, H, { seed: 's', look: 'telegram' });
  assert.ok(/STOP/.test(tg.body) && tg.body === tg.body.toUpperCase());
  const t = draftTexts(w, H, V, { seed: 's' });
  assert.ok(t.lines.length >= 5 && t.lines.every((x) => /^\d\d:\d\d$/.test(x.time)));
  assert.equal(t.fields.them, V.name);
  const r = draftReport(w, V, { seed: 's', look: 'police' });
  assert.equal(r.look, 'police');
  assert.ok(redactParts(r.body).filter((p) => p.redacted).length >= 3);
  assert.equal(draftHandout(w, 'casefile', { a: V, seed: 's' }).kind, 'casefile');
  assert.equal(newHandout('nope').kind, 'wanted');
  for (const k of Object.keys(HANDOUT_KINDS)) assert.ok(Object.keys(HANDOUT_KINDS[k].looks).length >= 3, k);
});

test('redaction and ransom helpers', () => {
  assert.deepEqual(redactParts('a [[b]] c'), [{ text: 'a ', redacted: false }, { text: 'b', redacted: true }, { text: ' c', redacted: false }]);
  assert.deepEqual(redactParts('plain'), [{ text: 'plain', redacted: false }]);
  const a = ransomLetters('HI THERE', 7); const b = ransomLetters('HI THERE', 7);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a[2].space && a.some((x) => x.rot !== 0));
});

test('a saved handout is a World page on the timeline, in the vault export, and travels as a key', async () => {
  const { saved, w, V, roster } = world();
  const wd = draftWanted(w, V, { seed: 's' });
  const e = createEntity(saved, { type: 'handout', name: handoutTitle(wd), summary: handoutSummary(wd), tags: ['handout'] });
  e.handout = wd; e.session = 3;
  const w2 = buildWorld(saved, roster, R);
  assert.ok(campaignTimeline(w2).some((it) => it.kind === 'handout' && it.id === e.id && it.session === 3));
  const files = vaultMarkdown(w2);
  const key = Object.keys(files).find((k) => k.startsWith('Handouts/'));
  assert.ok(key && files[key].includes('$144,000'));
  assert.ok(handoutMarkdown(draftReport(w, V, { seed: 's' })).includes('~~'), 'redactions stay marked in Markdown');
  const k = await encodeHandout(wd);
  assert.ok(k.startsWith('DCUH1.') && isHandoutKey(`see ${k}`));
  const back = await decodeHandout(k);
  assert.equal(back.fields.reward, '$144,000');
  await assert.rejects(decodeHandout('DCUN1.nothandout'), /handout key/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { emptyWorld, buildWorld, createEntity, recordMoment, campaignTimeline, vaultMarkdown, ENTITY_TYPES } from '../src/engine/world.js';
import { newPaper, draftPaper, storyFromTimeline, fillerStory, rollAds, paperSummary, paperName, paperMarkdown, PAPER_LAYOUTS } from '../src/engine/newspaper.js';
import { encodePaper, decodePaper, isPaperKey } from '../src/app/share.js';

function world() {
  const a = generateCharacter(R, { seed: 'np-a', pl: 10 }); a.rosterId = 'r-a';
  const b = generateCharacter(R, { seed: 'np-b', pl: 10, alignment: 'villain' }); b.rosterId = 'r-b';
  a.journal = { entries: [{ id: 1, session: 1, title: 'The Harbour Job', text: 'The crew hit the docks and a warehouse burned.', people: [] }] };
  const saved = emptyWorld(); saved.name = 'Ravensport';
  const court = createEntity(saved, { type: 'faction', name: 'The Iron Court' });
  let w = buildWorld(saved, [a, b], R);
  recordMoment(saved, w, { kind: 'becameEnemies', a: 'char:r-a', b: 'char:r-b', session: 2, note: 'It started over a rooftop.' });
  w = buildWorld(saved, [a, b], R);
  return { saved, w, a, b, court };
}

test('a front page drafts itself from the campaign timeline, newest first, topped up with filler', () => {
  const { w } = world();
  const p = draftPaper(w, { seed: 'draft-1' });
  assert.ok(p.masthead && p.stories.length >= 4, `${p.masthead}: ${p.stories.length} stories`);
  assert.equal(p.stories[0].slot, 'lead');
  assert.match(p.stories[0].headline, /ENEMIES/, 'the latest moment leads');
  assert.ok(p.stories[0].about.includes('char:r-a') && p.stories[0].about.includes('char:r-b'), 'the people in the moment are tied to the story');
  assert.ok(p.stories.some((s) => /HARBOUR JOB/.test(s.headline)), 'the journal session is a story');
  assert.ok(p.ads.length >= 1 && p.ads.every((ad) => ad.title && ad.text));
  assert.equal(JSON.stringify(draftPaper(w, { seed: 'draft-1' }).stories.map((s) => s.headline)), JSON.stringify(p.stories.map((s) => s.headline)), 'same seed, same paper');
  const one = draftPaper(w, { seed: 'draft-2', session: 1 });
  assert.equal(one.edition, 'Session 1 edition');
  assert.match(one.stories[0].headline, /HARBOUR JOB/);
  assert.ok(paperSummary(p).startsWith(p.stories[0].headline));
  assert.ok(Object.keys(PAPER_LAYOUTS).includes(newPaper(w).layout));
});

test('stories from the timeline and filler use the world\'s own names', () => {
  const { w } = world();
  const it = campaignTimeline(w).find((x) => x.kind === 'change');
  const s = storyFromTimeline(it, w, { city: 'Ravensport' });
  assert.ok(/RAVENSPORT —/.test(s.body));
  assert.ok(s.body.includes('It started over a rooftop.') || s.deck === 'It started over a rooftop.', 'the note becomes the deck or copy');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(fillerStory(w, undefined).headline);
  assert.ok(seen.size > 5);
  const ads = rollAds(w, undefined, 3);
  assert.equal(ads.length, 3);
});

test('a saved front page is a World page: on the timeline and in the vault export', () => {
  const { saved, w } = world();
  const p = draftPaper(w, { seed: 'draft-3' });
  const e = createEntity(saved, { type: 'paper', name: paperName(p), summary: paperSummary(p), tags: ['newspaper'] });
  e.paper = p; e.session = 2;
  const w2 = buildWorld(saved, w.roster, R);
  assert.equal(w2.entities.get(e.id).paper.stories.length, p.stories.length);
  assert.ok(campaignTimeline(w2).some((it) => it.kind === 'paper' && it.id === e.id && it.session === 2));
  const files = vaultMarkdown(w2);
  const key = Object.keys(files).find((k) => k.startsWith('Newspapers/'));
  assert.ok(key, Object.keys(files).join(','));
  assert.ok(files[key].includes(p.stories[0].headline));
  assert.equal(ENTITY_TYPES.paper.one, 'Newspaper');
  assert.ok(paperMarkdown(p).includes('## '));
});

test('a front page travels as a key, pictures included', async () => {
  const { w } = world();
  const p = draftPaper(w, { seed: 'draft-4' });
  p.stories[0].image = { src: 'data:image/jpeg;base64,AAAA', caption: 'The docks, last night', credit: 'Staff photo' };
  const key = await encodePaper(p);
  assert.ok(key.startsWith('DCUN1.') && isPaperKey(`open ${key} please`));
  const back = await decodePaper(`open ${key} please`);
  assert.equal(back.masthead, p.masthead);
  assert.equal(back.stories[0].image.src, 'data:image/jpeg;base64,AAAA');
  const light = await decodePaper(await encodePaper(p, { pictures: false }));
  assert.equal(light.stories[0].image.src, null);
  assert.equal(light.stories[0].image.caption, 'The docks, last night');
  await assert.rejects(decodePaper('DCUW1.notapaper'), /front-page key/);
});

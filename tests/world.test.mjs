import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { addJournalEntry } from '../src/engine/journal.js';
import { buildWorld, emptyWorld, createEntity, addLink, updateEntity, deleteEntity, groupedConnections, entityTimeline, campaignTimeline, searchWorld, vaultMarkdown, layoutGraph, RELATIONS, recordBattle } from '../src/engine/world.js';
import { createBattle, addCombatant, makeCombatant, runToEnd } from '../src/engine/battle.js';

function roster() {
  const a = generateCharacter(R, { seed: 'world-a', pl: 10 }); a.rosterId = 'r-a'; a.team = 'The Night Watch';
  const b = generateCharacter(R, { seed: 'world-b', pl: 10 }); b.rosterId = 'r-b'; b.team = 'The Night Watch';
  addJournalEntry(a, R, { session: 1, title: 'Opening night', text: 'The team meets.', people: [{ name: b.identity.codename, relation: 'Teammate' }, { name: 'Alleycat', relation: 'Mentor' }], pointsEarned: 1 });
  return [a, b];
}

test('roster characters, their people, places and teams become linked pages, both ways', () => {
  const [a, b] = roster();
  const w = buildWorld(emptyWorld(), [a, b], R);
  const pa = w.entities.get('char:r-a');
  const pb = w.entities.get('char:r-b');
  assert.ok(pa && pb);
  assert.ok(pa.connections.length >= 4);
  // bio people exist as pages with inverse links
  const parent = a.bio.family.parents[0];
  const pe = [...w.entities.values()].find((e) => e.name === parent.name);
  assert.ok(pe, 'parent page');
  assert.ok(pa.connections.some((c) => c.other === pe && c.rel === 'parent'));
  assert.ok(pe.connections.some((c) => c.other === pa && c.rel === 'child'));
  assert.ok(pe.keys['char:r-a'], 'parent can be opened as a character');
  // journal: teammate link points at the roster page, not a duplicate; Alleycat is a new page; the session is an event
  assert.ok(pa.connections.some((c) => c.other === pb && c.rel === 'teammate'));
  assert.equal([...w.entities.values()].filter((e) => e.name === b.identity.codename).length, 1);
  assert.ok(w.entities.has('npc:alleycat'));
  const ev = [...w.entities.values()].find((e) => e.type === 'event');
  assert.ok(ev && ev.session === 1 && /Points/.test(Object.keys(ev.fields).join(',')));
  assert.ok(ev.connections.some((c) => c.other === pb));
  // team and places
  assert.ok(w.entities.has('faction:the-night-watch'));
  assert.ok(pa.connections.some((c) => c.rel === 'member'));
  assert.ok(pa.connections.some((c) => c.rel === 'basedIn' || c.rel === 'from'));
  assert.ok(groupedConnections(pa).some((g) => g.group === 'Family & loves'));
  const tl = entityTimeline(w, pa);
  assert.ok(tl.some((t) => t.kind === 'life') && tl.some((t) => t.kind === 'play' && t.points.length === 1));
  assert.equal(campaignTimeline(w).length, 1);
});

test('hand-made pages, links, edits and removals live in the vault and survive a rebuild', () => {
  const [a, b] = roster();
  const saved = emptyWorld();
  const f = createEntity(saved, { type: 'faction', name: 'The Court of Crows', summary: 'Old money, older grudges.', fields: { Motto: 'Beware' } });
  const loc = createEntity(saved, { type: 'location', name: 'Ironwall', fields: { Kind: 'Prison' } });
  addLink(saved, { from: 'char:r-a', to: f.id, rel: 'enemy', note: 'Since issue 4' });
  addLink(saved, { from: f.id, to: loc.id, rel: 'basedIn' });
  let w = buildWorld(saved, [a, b], R);
  updateEntity(saved, w, 'char:r-a', { summary: 'Rewritten by hand.', tags: ['founder'] });
  w = buildWorld(saved, [a, b], R);
  const pa = w.entities.get('char:r-a');
  assert.equal(pa.summary, 'Rewritten by hand.');
  assert.ok(pa.tags.includes('founder'));
  const court = w.entities.get(f.id);
  assert.ok(pa.connections.some((c) => c.other === court && c.rel === 'enemy' && c.note === 'Since issue 4'));
  assert.ok(court.connections.some((c) => c.other === pa && c.rel === 'enemy'));
  assert.ok(court.connections.some((c) => c.rel === 'basedIn'));
  assert.ok(w.entities.get(loc.id).connections.some((c) => c.rel === 'baseOf'));
  assert.ok(searchWorld(w, 'crows')[0] === court);
  assert.ok(searchWorld(w, 'prison').includes(w.entities.get(loc.id)));
  deleteEntity(saved, f.id);
  w = buildWorld(saved, [a, b], R);
  assert.ok(!w.entities.has(f.id));
  deleteEntity(saved, 'npc:alleycat');
  w = buildWorld(saved, [a, b], R);
  assert.ok(!w.entities.has('npc:alleycat'), 'automatic pages can be hidden');
  for (const [k, r] of Object.entries(RELATIONS)) assert.equal(RELATIONS[r.inverse].inverse, k, `${k} inverse is symmetric`);
});

test('the Markdown vault has a page per entity with wikilinks, and the graph layout stays in bounds', () => {
  const [a, b] = roster();
  const w = buildWorld(emptyWorld(), [a, b], R);
  const files = vaultMarkdown(w);
  assert.equal(Object.keys(files).length, w.entities.size + 1);
  const page = files[Object.keys(files).find((k) => k.startsWith('People/') && k.includes(a.identity.codename.replace(/[\\/:*?"<>|#^[\]]/g, '')))];
  assert.ok(page.startsWith('---\ntype: person'));
  assert.ok(/\[\[[^\]]+\]\]/.test(page));
  assert.ok(page.includes('## Timeline') && page.includes('Session 1'));
  const pos = layoutGraph([...w.entities.values()].map((e) => ({ id: e.id })), w.links, { width: 800, height: 600, iterations: 50 });
  for (const p of pos.values()) assert.ok(p.x >= 24 && p.x <= 776 && p.y >= 24 && p.y <= 576);
});

test('a Battle Room fight can be recorded as an event that links the fighters', () => {
  const [a, b] = roster();
  const saved = emptyWorld();
  const bt = createBattle({ seed: 'record' });
  addCombatant(bt, makeCombatant(R, a, { team: 'A' }));
  addCombatant(bt, makeCombatant(R, b, { team: 'B' }));
  runToEnd(bt, R);
  const w0 = buildWorld(saved, [a, b], R);
  const ev = recordBattle(saved, bt, w0);
  const w = buildWorld(saved, [a, b], R);
  const page = w.entities.get(ev.id);
  assert.equal(page.type, 'event');
  assert.ok(page.connections.filter((c) => c.rel === 'involves').length === 2);
  assert.ok(w.entities.get('char:r-a').connections.some((c) => c.rel === 'fought' && c.other.id === 'char:r-b'));
});

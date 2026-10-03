import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { addJournalEntry } from '../src/engine/journal.js';
import { buildWorld, emptyWorld, createEntity, addLink, updateEntity, deleteEntity, groupedConnections, entityTimeline, campaignTimeline, searchWorld, vaultMarkdown, layoutGraph, RELATIONS, recordBattle, recordMoment, removeMoment, momentKindsFor, linksAsOf, lastSession } from '../src/engine/world.js';
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

test('factions on a character become faction pages with the right ties', () => {
  const [a] = roster();
  a.factions = [{ name: 'The Iron Court', role: 'Leader', since: 'session 2' }, { name: 'Dockside Union', role: 'Former member' }];
  const w = buildWorld(emptyWorld(), [a], R);
  const pa = w.entities.get('char:r-a');
  const court = w.entities.get('faction:the-iron-court');
  assert.ok(court, 'faction page');
  assert.ok(pa.connections.some((c) => c.other === court && c.rel === 'leader'));
  assert.ok(pa.connections.some((c) => c.other === court && c.rel === 'member'), 'a leader is also a member');
  assert.ok(court.connections.some((c) => c.other === pa && c.rel === 'ledBy'));
  assert.ok(pa.connections.some((c) => c.rel === 'formerMember'));
  assert.match(pa.fields.Factions, /Iron Court \(leader\)/);
});

test('moments change the world and show when: new ties start, old ties end, status changes, and all of it undoes', () => {
  const [a, b] = roster();
  const saved = emptyWorld();
  let w = buildWorld(saved, [a, b], R);
  const pa = w.entities.get('char:r-a'); const pb = w.entities.get('char:r-b');
  assert.ok(pa.connections.some((c) => c.other === pb && c.rel === 'teammate'), 'they start as teammates (journal)');
  const m = recordMoment(saved, w, { kind: 'becameEnemies', a: pa.id, b: pb.id, session: 3, note: 'Over the vault job.' });
  assert.ok(m && /became enemies/.test(m.text));
  w = buildWorld(saved, [a, b], R);
  const pa2 = w.entities.get('char:r-a');
  assert.ok(pa2.connections.some((c) => c.other.id === pb.id && c.rel === 'enemy' && c.since.session === 3), 'enemy tie since session 3');
  assert.ok(!pa2.connections.some((c) => c.other.id === pb.id && c.rel === 'teammate'), 'the automatic teammate tie ended');
  assert.ok(pa2.past.some((c) => c.other.id === pb.id && c.rel === 'teammate' && c.until.session === 3), 'and shows as formerly');
  assert.ok(entityTimeline(w, pa2).some((t) => t.kind === 'change' && /became enemies/.test(t.text)));
  assert.ok(campaignTimeline(w).some((x) => x.kind === 'change' && x.session === 3));
  // as of session 2 they were still teammates; as of session 3 enemies
  assert.ok(linksAsOf(w, 2).some((l) => l.rel === 'teammate'));
  assert.ok(!linksAsOf(w, 3).some((l) => l.rel === 'teammate'));
  assert.ok(linksAsOf(w, 3).some((l) => l.rel === 'enemy' && l.to === pb.id));
  assert.ok(!linksAsOf(w, 2).some((l) => l.rel === 'enemy' && l.to === pb.id));
  // faction moments and a fate
  const court = createEntity(saved, { type: 'faction', name: 'The Iron Court' });
  w = buildWorld(saved, [a, b], R);
  recordMoment(saved, w, { kind: 'founded', a: pa.id, b: court.id, session: 4 });
  w = buildWorld(saved, [a, b], R);
  assert.ok(w.entities.get(pa.id).connections.some((c) => c.other.id === court.id && c.rel === 'leader'));
  recordMoment(saved, w, { kind: 'left', a: pa.id, b: court.id, session: 6 });
  w = buildWorld(saved, [a, b], R);
  assert.ok(w.entities.get(pa.id).connections.some((c) => c.other.id === court.id && c.rel === 'formerMember'));
  assert.ok(!w.entities.get(pa.id).connections.some((c) => c.other.id === court.id && c.rel === 'leader'));
  const died = recordMoment(saved, w, { kind: 'died', a: pb.id, session: 7 });
  w = buildWorld(saved, [a, b], R);
  assert.equal(w.entities.get(pb.id).status, 'Dead');
  assert.ok(momentKindsFor('person', 'faction').includes('joined') && !momentKindsFor('faction').includes('died'));
  assert.equal(lastSession(w), 7);
  // undo
  removeMoment(saved, died.id);
  removeMoment(saved, m.id);
  w = buildWorld(saved, [a, b], R);
  assert.notEqual(w.entities.get(pb.id).status, 'Dead');
  assert.ok(w.entities.get(pa.id).connections.some((c) => c.other.id === pb.id && c.rel === 'teammate'), 'the teammate tie is back');
  assert.ok(!w.entities.get(pa.id).connections.some((c) => c.other.id === pb.id && c.rel === 'enemy'));
  assert.ok(vaultMarkdown(w)[Object.keys(vaultMarkdown(w)).find((k) => /People\//.test(k) && k.includes(a.identity.codename))].includes('Formerly'));
});

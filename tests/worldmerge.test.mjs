// Merging two copies of the World (sync, backups, a table) keeps deletions deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorld, createEntity, deleteEntity, addLink, removeLink, restoreHidden, mergeWorldSaved } from '../src/engine/world.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const wait = () => new Promise((r) => setTimeout(r, 3));

test('a page or tie deleted on one device does not come back from the other', async () => {
  const a = emptyWorld();
  const city = createEntity(a, { type: 'location', name: 'Gotham' });
  const gang = createEntity(a, { type: 'faction', name: 'Falcones' });
  const tie = addLink(a, { from: gang.id, to: city.id, rel: 'basedIn' }) || addLink(a, { from: gang.id, to: city.id, rel: 'ally' });
  const b = clone(a); // the other device had everything
  await wait();
  deleteEntity(a, city.id);
  const merged = mergeWorldSaved(b, a);
  assert.equal(merged.entities[city.id], undefined);
  assert.ok(merged.entities[gang.id]);
  assert.ok(!merged.links.some((l) => l.id === tie.id));
  // either direction
  assert.equal(mergeWorldSaved(a, b).entities[city.id], undefined);
});

test('pages added on both sides are kept, and the newer edit of a page wins', async () => {
  const a = emptyWorld();
  const p = createEntity(a, { type: 'person', name: 'Ann' });
  const b = clone(a);
  createEntity(a, { type: 'item', name: 'Lamp' });
  createEntity(b, { type: 'location', name: 'Docks' });
  await wait();
  b.entities[p.id] = { ...b.entities[p.id], name: 'Ann Smith', updated: new Date().toISOString() };
  const m = mergeWorldSaved(a, b);
  assert.equal(Object.keys(m.entities).length, 3);
  assert.equal(m.entities[p.id].name, 'Ann Smith');
});

test('a removed tie stays removed, and showing a hidden page again travels too', async () => {
  const a = emptyWorld();
  const x = createEntity(a, { type: 'person', name: 'X' });
  const y = createEntity(a, { type: 'person', name: 'Y' });
  const l = addLink(a, { from: x.id, to: y.id, rel: 'friend' });
  const b = clone(a);
  await wait();
  removeLink(a, { links: [] }, l.id);
  assert.ok(!mergeWorldSaved(b, a).links.some((k) => k.id === l.id));
  // an automatic page hidden on b, then shown again on a later
  deleteEntity(b, 'char:auto');
  const a2 = clone(b);
  await wait();
  restoreHidden(a2, 'char:auto');
  assert.ok(!mergeWorldSaved(b, a2).hidden.includes('char:auto'));
});

test('the whole-world layout keeps separate groups apart and inside the picture', async () => {
  const { layoutComponents } = await import('../src/engine/world.js');
  const nodes = []; const edges = [];
  for (let g = 0; g < 6; g++) { nodes.push({ id: `hub${g}` }); for (let i = 0; i < 8; i++) { nodes.push({ id: `n${g}-${i}` }); edges.push({ from: `hub${g}`, to: `n${g}-${i}` }); } }
  nodes.push({ id: 'alone1' }, { id: 'alone2' });
  const { pos, width, height } = layoutComponents(nodes, edges, { width: 1100 });
  for (const n of nodes) { const p = pos.get(n.id); assert.ok(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height, n.id); }
  // each group's box is apart from the others
  const box = (g) => { const ps = nodes.filter((n) => n.id === `hub${g}` || n.id.startsWith(`n${g}-`)).map((n) => pos.get(n.id)); return { x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)) }; };
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) { const A = box(a); const B = box(b); assert.ok(A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0, `groups ${a} and ${b} overlap`); }
});

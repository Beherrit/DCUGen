import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insideTemplate, sightLine, migrateMaps, newMap, paintBox, resizeMap, newProp, feetBetween, templateGeom, assetId } from '../src/engine/mapgeo.js';

const tokens = { a: { x: 10, y: 10 }, b: { x: 12, y: 10 }, c: { x: 20, y: 10 }, d: { x: 13, y: 14 } };

test('a burst catches everyone within its radius', () => {
  assert.deepEqual(insideTemplate({ shape: 'Burst', ft: 30, x: 11, y: 10.5 }, tokens, 10).sort(), ['a', 'b']);
});

test('a cone spreads out from its origin; a line stays narrow', () => {
  const cone = insideTemplate({ shape: 'Cone', ft: 60, ox: 9, oy: 10.5, ang: 0 }, tokens, 10).sort();
  assert.deepEqual(cone, ['a', 'b']);
  const line = insideTemplate({ shape: 'Line', ft: 120, ox: 9, oy: 10.5, ang: 0 }, tokens, 10).sort();
  assert.deepEqual(line, ['a', 'b', 'c']);
  assert.ok(!line.includes('d'));
});

test('a cone that follows a token moves with it and leaves its maker out', () => {
  const t = { shape: 'Cone', ft: 60, from: 'a', ox: 0, oy: 0, ang: 0 };
  assert.deepEqual(templateGeom(t, tokens).ox, 10.5);
  assert.deepEqual(insideTemplate(t, tokens, 10), ['b']);
});

test('a big creature is caught when part of it is inside', () => {
  const big = { g: { x: 14, y: 9, size: 3 } };
  assert.deepEqual(insideTemplate({ shape: 'Burst', ft: 30, x: 11, y: 10.5 }, big, 10), ['g']);
  assert.deepEqual(insideTemplate({ shape: 'Burst', ft: 20, x: 11, y: 10.5 }, big, 10), []);
  assert.equal(feetBetween({ x: 10, y: 10 }, { x: 12, y: 10, size: 2 }, 10), 20);
});

test('walls block the line, cover gives -2 or -5, and buildings block like walls', () => {
  const map = newMap();
  const a = { x: 2, y: 5 }; const b = { x: 10, y: 5 };
  assert.deepEqual(sightLine(map, a, b), { blocked: false, cover: 0, through: [] });
  paintBox(map, 5, 5, 5, 5, 'partial');
  assert.equal(sightLine(map, a, b).cover, 2);
  paintBox(map, 6, 5, 6, 5, 'total');
  assert.equal(sightLine(map, a, b).cover, 5);
  paintBox(map, 7, 4, 7, 6, 'wall');
  assert.equal(sightLine(map, a, b).blocked, true);
  paintBox(map, 5, 4, 7, 6, null);
  assert.equal(sightLine(map, a, b).cover, 0);
  map.props.push(newProp('tower', 6, 4));
  assert.equal(sightLine(map, a, b).blocked, true);
  map.props = [newProp('car', 6, 5)];
  assert.equal(sightLine(map, a, b).cover, 5);
});

test('an old single map becomes the first of a list, template and all', () => {
  const gs = { map: { w: 30, h: 20, scale: 5, tokens: { a: { x: 1, y: 1 } }, template: { shape: 'Burst', ft: 30, x: 4, y: 4 }, tool: { effect: 'Damage 8' } } };
  const m = migrateMaps(gs);
  assert.equal(gs.maps.length, 1);
  assert.equal(gs.mapId, m.id);
  assert.equal(m.scale, 5);
  assert.equal(m.templates[0].effect, 'Damage 8');
  assert.equal(gs.map, undefined);
  assert.deepEqual(m.props, []);
});

test('shrinking a map drops what falls off and pulls tokens back in', () => {
  const map = newMap();
  paintBox(map, 30, 18, 35, 21, 'wall');
  map.tokens.a = { x: 34, y: 20 };
  map.props.push(newProp('house', 33, 2));
  resizeMap(map, 20, 15);
  assert.equal(Object.keys(map.terrain).length, 0);
  assert.deepEqual(map.tokens.a, { x: 19, y: 14 });
  assert.equal(map.props.length, 0);
});

test('picture ids are stable and differ between pictures', () => {
  assert.equal(assetId('data:image/png;base64,AAAA'), assetId('data:image/png;base64,AAAA'));
  assert.notEqual(assetId('data:image/png;base64,AAAA'), assetId('data:image/png;base64,AAAB'));
});

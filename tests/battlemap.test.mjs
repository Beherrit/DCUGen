import { test } from 'node:test';
import assert from 'node:assert/strict';

// insideTemplate is pure; load it without the DOM helpers the rest of the module needs.
const src = (await import('node:fs')).readFileSync(new URL('../src/app/battlemap.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('/** Who is inside a template'), src.indexOf('/** The map as an SVG element'));
const insideTemplate = new Function(`${body.replace('export function', 'function')}; return insideTemplate;`)();

const tokens = { a: { x: 10, y: 10 }, b: { x: 12, y: 10 }, c: { x: 20, y: 10 }, d: { x: 13, y: 14 } };

test('a burst catches everyone within its radius', () => {
  assert.deepEqual(insideTemplate({ shape: 'Burst', ft: 30, x: 11, y: 10.5 }, tokens, 10).sort(), ['a', 'b']);
});

test('a cone spreads out from its origin; a line stays narrow', () => {
  const cone = insideTemplate({ shape: 'Cone', ft: 60, ox: 9, oy: 10.5, x: 15, y: 10.5 }, tokens, 10).sort();
  assert.deepEqual(cone, ['a', 'b']);
  const line = insideTemplate({ shape: 'Line', ft: 120, ox: 9, oy: 10.5, x: 21, y: 10.5 }, tokens, 10).sort();
  assert.deepEqual(line, ['a', 'b', 'c']);
  assert.ok(!line.includes('d'));
});

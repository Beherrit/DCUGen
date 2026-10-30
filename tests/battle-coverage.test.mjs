import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAW } from '../src/generated/rulesdata.js';
import { loadCoverage, KINDS, STATUSES, FREE_KINDS, summarize, markdown } from '../tools/battle-coverage/lib.mjs';

const entries = loadCoverage();
const names = (kind) => new Set(entries.filter((e) => e.kind === kind).map((e) => e.name));

// What the rules data holds for each kind that must be listed in full.
const required = {
  effect: RAW.effects.map((e) => e.name),
  extra: RAW.modifiers.extras.map((e) => e.name),
  flaw: RAW.modifiers.flaws.map((e) => e.name),
  advantage: RAW.advantages.filter((a) => String(a.source).startsWith('DCA')).map((a) => a.name),
};

for (const [kind, list] of Object.entries(required)) {
  test(`every ${kind} in the rules data is in the coverage list`, () => {
    const have = names(kind);
    assert.deepEqual(list.filter((n) => !have.has(n)), []);
  });
}

test('every entry has a known kind, a known status and a note', () => {
  for (const e of entries) {
    assert.ok(KINDS.includes(e.kind), `${e.kind} / ${e.name}: unknown kind`);
    assert.ok(STATUSES.includes(e.status), `${e.kind} / ${e.name}: unknown status "${e.status}"`);
    assert.ok(typeof e.note === 'string' && e.note.length > 0, `${e.kind} / ${e.name}: missing note`);
  }
});

test('no entry is listed twice', () => {
  const seen = new Set();
  for (const e of entries) {
    const key = `${e.kind}:${e.name}`;
    assert.ok(!seen.has(key), `${key} appears twice`);
    seen.add(key);
  }
});

test('entries name rules that exist in the data (except actions, maneuvers, conditions and rules)', () => {
  for (const e of entries) {
    if (FREE_KINDS.includes(e.kind)) continue;
    const known = required[e.kind];
    assert.ok(known.includes(e.name), `${e.kind} "${e.name}" is not in the rules data`);
  }
});

test('the summary counts every entry once and the markdown lists every kind', () => {
  const all = summarize(entries).at(-1);
  assert.equal(all.total, entries.length);
  assert.equal(all.full + all.partial + all.none + all.na, entries.length);
  const md = markdown(entries);
  for (const e of entries) assert.ok(md.includes(`| ${e.name.replace(/\|/g, '/')} |`), `${e.name} missing from the markdown`);
});

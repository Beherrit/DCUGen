import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scenarios, play } from '../tools/battle-golden.mjs';

// Seeded fights recorded with tools/battle-golden.mjs. A refactor must replay them line for line.
// When a change alters fights on purpose, re-record and say so in the commit.
const golden = JSON.parse(readFileSync(new URL('./fixtures/battle-golden.json', import.meta.url), 'utf8'));

test('seeded golden fights replay exactly', () => {
  const now = scenarios().map(play);
  assert.equal(now.length, golden.length);
  for (let i = 0; i < now.length; i++) {
    const g = golden[i]; const n = now[i];
    const at = n.log.findIndex((line, k) => line !== g.log[k]);
    assert.ok(at < 0 && n.log.length === g.log.length && n.winner === g.winner,
      `${g.name}: first difference at line ${at < 0 ? Math.min(n.log.length, g.log.length) : at}\n  was: ${g.log[at]}\n  now: ${n.log[at]}`);
  }
});

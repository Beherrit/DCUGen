// Every source file must at least parse: the app's screen code isn't imported by the other tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = ['app', 'engine'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(root, d, f)));

test('every app and engine file parses', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    try { execFileSync(process.execPath, ['--check', '--input-type=module'], { input: src, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { bad.push(`${path.relative(root, f)}: ${String(e.stderr).split('\n').find((l) => /Error/.test(l))}`); }
  }
  assert.deepEqual(bad, []);
});

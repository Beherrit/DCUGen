// Validate stat blocks in data/catalog/*.json against the rules engine.
//   node tools/validate-catalog.mjs [file ...]
// Prints each entry's computed point total, its PL limit issues and, for book entries, whether the
// computed total matches "printed_total". Exits 1 if any entry breaks a PL limit or fails to load.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES as R } from '../src/engine/index.js';
import { costBreakdown } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { catalogToCharacter } from '../src/engine/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'data/catalog')).filter((f) => f.endsWith('.json')).map((f) => path.join(ROOT, 'data/catalog', f));
let bad = 0;
for (const f of files) {
  const list = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\n== ${path.basename(f)} (${list.length})`);
  for (const entry of list) {
    try {
      const ch = catalogToCharacter(entry);
      const cost = costBreakdown(ch, R);
      const issues = checkLimits(ch, R);
      const errs = issues.filter((i) => i.severity === 'error' && i.rule !== 'budget');
      const warns = issues.filter((i) => i.severity === 'warning');
      const printed = entry.printed_total != null ? ` printed ${entry.printed_total}${entry.printed_total === cost.total ? ' ✓' : ' ✗'}` : '';
      console.log(`${errs.length ? 'FAIL' : 'ok  '} ${entry.id.padEnd(22)} PL${String(entry.pl).padEnd(3)} ${String(cost.total).padStart(4)} pp${printed}${errs.length ? `  <- ${errs.map((e) => e.message).join(' | ')}` : ''}${warns.length ? `  (warn: ${warns.map((w) => w.message).join(' | ')})` : ''}`);
      if (errs.length) bad++;
    } catch (e) {
      console.log(`ERR  ${entry.id}: ${e.message}`);
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);

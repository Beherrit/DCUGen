// Prints the battle coverage summary and rewrites docs/battle-coverage.md. Run: node tools/battle-coverage/report.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCoverage, summaryText, markdown } from './lib.mjs';

const entries = loadCoverage();
const docUrl = new URL('../../docs/battle-coverage.md', import.meta.url);
mkdirSync(new URL('../../docs/', import.meta.url), { recursive: true });
writeFileSync(docUrl, markdown(entries));
console.log(summaryText(entries));
console.log(`\nWrote ${fileURLToPath(docUrl)}`);

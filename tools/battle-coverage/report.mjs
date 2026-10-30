// Prints the battle coverage summary, rewrites docs/battle-coverage.md and the shipped src/generated/battle-coverage.js. Run: node tools/battle-coverage/report.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCoverage, summaryText, markdown, writeGenerated } from './lib.mjs';

const entries = loadCoverage();
const docUrl = new URL('../../docs/battle-coverage.md', import.meta.url);
mkdirSync(new URL('../../docs/', import.meta.url), { recursive: true });
writeFileSync(docUrl, markdown(entries));
console.log(summaryText(entries));
console.log(`\nWrote ${fileURLToPath(docUrl)}`);
console.log(`Wrote ${writeGenerated(entries)}`);

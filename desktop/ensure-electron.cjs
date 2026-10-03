// `npm install` sometimes finishes without Electron's runtime (an interrupted or blocked download leaves
// the package but not the binary, and `electron .` then fails with "Electron failed to install correctly").
// This fetches the runtime if it is missing, so `npm start` repairs itself.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'node_modules', 'electron');
if (!fs.existsSync(dir)) { console.error('Electron is not installed. Run: npm install'); process.exit(1); }
let ok = false;
try {
  const rel = fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim();
  ok = !!rel && fs.existsSync(path.join(dir, 'dist', rel));
} catch { ok = false; }
if (ok) process.exit(0);
console.log('Electron\'s runtime is missing (the download did not finish). Fetching it now, about 100 MB…');
try { fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true }); } catch { /* ignore */ }
process.chdir(dir);
require(path.join(dir, 'install.js'));
process.on('exit', (code) => {
  if (code === 0 && !fs.existsSync(path.join(dir, 'path.txt'))) {
    console.error('\nThe download still failed. Things that usually fix it:\n  1. Run it again (flaky network).\n  2. If a proxy or firewall blocks github.com downloads, set ELECTRON_MIRROR to a mirror, e.g.\n     PowerShell:  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"\n  3. Delete node_modules\\electron and run npm install again.');
    process.exitCode = 1;
  }
});

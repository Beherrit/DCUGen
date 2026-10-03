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
if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  console.log('Note: ELECTRON_SKIP_BINARY_DOWNLOAD is set on this computer, which is why npm install skipped the runtime. Ignoring it for this download.');
  delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;
}
process.env.force_no_cache = 'true'; // a half-finished earlier download may sit in the cache
try { fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true }); } catch { /* ignore */ }
process.chdir(dir);
require(path.join(dir, 'install.js'));
process.on('exit', (code) => {
  if (code === 0 && !fs.existsSync(path.join(dir, 'path.txt'))) {
    console.error('\nThe download still failed. Things that usually fix it:\n  1. Run it again (flaky network).\n  2. If a proxy or firewall blocks github.com downloads, set ELECTRON_MIRROR to a mirror, e.g.\n     PowerShell:  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"\n  3. Delete node_modules\\electron and run npm install again.\n  4. Check for ELECTRON_SKIP_BINARY_DOWNLOAD in your system environment variables and remove it.');
    process.exitCode = 1;
  }
});

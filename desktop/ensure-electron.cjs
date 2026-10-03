// `npm install` sometimes finishes without Electron's runtime: an interrupted or blocked download, an
// installer that quits silently on a brand-new Node, or ELECTRON_SKIP_BINARY_DOWNLOAD set somewhere.
// `electron .` then fails with "Electron failed to install correctly". This makes `npm start` repair
// itself: it tries Electron's own installer first, and if the runtime is still missing it downloads
// the zip with plain Node and unzips it with the tools the OS already has.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const dir = path.join(__dirname, 'node_modules', 'electron');
if (!fs.existsSync(dir)) { console.error('Electron is not installed. Run: npm install'); process.exit(1); }
const dist = path.join(dir, 'dist');
const pathFile = path.join(dir, 'path.txt');
const platform = process.env.npm_config_platform || os.platform();
const arch = process.env.npm_config_arch || process.arch;
const exe = { win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron', mas: 'Electron.app/Contents/MacOS/Electron', linux: 'electron', freebsd: 'electron', openbsd: 'electron' }[platform];
const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

function installed() {
  try { return fs.existsSync(path.join(dist, exe)) && fs.readFileSync(pathFile, 'utf8').trim() === exe; } catch { return false; }
}
if (installed()) process.exit(0);

console.log(`Electron ${version}'s runtime is missing (the download did not finish). Fetching it now, about 100 MB…`);
if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) { console.log('Note: ELECTRON_SKIP_BINARY_DOWNLOAD is set on this computer, which is why npm install skipped it. Ignoring it.'); }

// 1. Electron's own installer, in a child process so a silent exit can't take us down with it.
try {
  const env = { ...process.env, force_no_cache: 'true' };
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  const r = spawnSync(process.execPath, [path.join(dir, 'install.js')], { cwd: dir, env, stdio: 'inherit', timeout: 15 * 60 * 1000 });
  if (r.status === 0 && installed()) process.exit(0);
  console.log(`Electron's installer ${r.status === 0 ? 'returned without downloading anything' : `failed (exit ${r.status})`}. Downloading the runtime directly…`);
} catch (e) { console.log(`Electron's installer could not run (${e.message}). Downloading the runtime directly…`); }

// 2. Plain download + unzip.
const file = `electron-v${version}-${platform}-${arch}.zip`;
const urls = [];
if (process.env.ELECTRON_MIRROR) {
  const m = process.env.ELECTRON_MIRROR.replace(/\/?$/, '/');
  urls.push(`${m}${version}/${file}`, `${m}v${version}/${file}`);
}
urls.push(`https://github.com/electron/electron/releases/download/v${version}/${file}`, `https://npmmirror.com/mirrors/electron/${version}/${file}`);

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) { reject(new Error('too many redirects')); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'DCUGen-desktop' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); download(new URL(res.headers.location, url).href, dest, redirects + 1).then(resolve, reject); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0; let lastPct = -1;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => { got += chunk.length; if (total) { const pct = Math.floor((got / total) * 100); if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stdout.write(`  ${pct}%${pct === 100 ? '\n' : ' '}`); } } });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(got)));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timed out')));
  });
}

function unzip(zip, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  let r;
  if (platform === 'win32') r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${to.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });
  else if (platform === 'darwin') r = spawnSync('ditto', ['-x', '-k', zip, to], { stdio: 'inherit' });
  else r = spawnSync('unzip', ['-o', '-q', zip, '-d', to], { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error(`could not unzip (${r.error ? r.error.message : `exit ${r.status}`})`);
  if (platform !== 'win32') { try { fs.chmodSync(path.join(to, exe), 0o755); } catch { /* ignore */ } }
}

(async () => {
  const zip = path.join(dir, file);
  for (const url of urls) {
    try {
      console.log(`Downloading ${url}`);
      const bytes = await download(url, zip);
      if (bytes < 10_000_000) throw new Error(`the file is too small (${bytes} bytes)`);
      unzip(zip, dist);
      fs.writeFileSync(pathFile, exe);
      try { fs.unlinkSync(zip); } catch { /* ignore */ }
      if (installed()) { console.log('Electron is ready.'); process.exit(0); }
      throw new Error(`${exe} is not in the archive`);
    } catch (e) {
      console.log(`  …failed: ${e.message}`);
      try { fs.unlinkSync(zip); } catch { /* ignore */ }
    }
  }
  console.error(`\nCould not fetch Electron ${version}. Last resort, by hand:\n  1. Download ${file} from https://github.com/electron/electron/releases/tag/v${version}\n  2. Unzip it into ${dist}\n  3. Create ${pathFile} containing exactly: ${exe}\nThen run npm start again.`);
  process.exit(1);
})();

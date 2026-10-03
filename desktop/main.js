// DCUGen desktop: the same single-file app in its own window, with the data mirrored to a vault
// folder on disk (so it survives updates and reinstalls) and a lobby server for hosting a table.

import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startLobbyServer } from './lobby-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_HTML = fs.existsSync(path.join(__dirname, 'DCUGen.html')) ? path.join(__dirname, 'DCUGen.html') : path.join(__dirname, '..', 'DCUGen.html');

// ---- the vault: everything the app keeps, as files under userData/vault --------------------------------
const vaultDir = () => path.join(app.getPath('userData'), 'vault');
const safe = (key) => String(key).replace(/[^a-zA-Z0-9._-]/g, '_');

function vaultRead() {
  const dir = vaultDir();
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { const { key, value } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (key) out[key] = value; } catch { /* skip */ }
  }
  return out;
}

function vaultWrite(data) {
  const dir = vaultDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, value] of Object.entries(data)) {
    const file = path.join(dir, `${safe(key)}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ key, value, savedAt: new Date().toISOString() }));
    fs.renameSync(tmp, file);
  }
  // keep a rolling daily backup of the whole vault
  const bak = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(bak, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(bak, `dcugen-${stamp}.json`);
  fs.writeFileSync(target, JSON.stringify({ app: 'DCUGen', kind: 'backup', version: 1, savedAt: new Date().toISOString(), data: vaultRead() }));
  const old = fs.readdirSync(bak).filter((f) => /^dcugen-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 14))) fs.unlinkSync(path.join(bak, f));
}

let lobbyServer = null;

ipcMain.handle('vault:load', () => vaultRead());
ipcMain.handle('vault:save', (_e, data) => { vaultWrite(data || {}); return true; });
ipcMain.handle('vault:path', () => vaultDir());
ipcMain.handle('vault:open', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('lobby:start', async (_e, opts) => {
  if (lobbyServer) await lobbyServer.close();
  lobbyServer = await startLobbyServer({ port: Number(process.env.DCUGEN_LOBBY_PORT) || 7777, name: opts?.name || 'DCUGen table' }).catch(() => startLobbyServer({ port: 0, name: opts?.name || 'DCUGen table' }));
  const { port, token, addresses, name } = lobbyServer;
  return { port, token, addresses, name };
});
ipcMain.handle('lobby:stop', async () => { if (lobbyServer) { await lobbyServer.close(); lobbyServer = null; } return true; });
ipcMain.handle('lobby:info', () => (lobbyServer ? { port: lobbyServer.port, members: lobbyServer.members() } : null));
ipcMain.handle('app:version', () => app.getVersion());

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: 'DCUGen Hero Forge',
    backgroundColor: '#0c0f14',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(APP_HTML);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return win;
}

app.whenReady().then(() => {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Open the data folder', click: () => shell.openPath(app.getPath('userData')) }, { type: 'separator' }, { role: isMac ? 'close' : 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'DCUGen on GitHub', click: () => shell.openExternal('https://github.com/Beherrit/DCUGen') }] },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', async () => { if (lobbyServer) await lobbyServer.close(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', async () => { if (lobbyServer) await lobbyServer.close(); });
void dialog;

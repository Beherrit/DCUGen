// The bridge between the page and the desktop app: a small, explicit API on window.dcugenDesktop.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dcugenDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  vaultLoad: () => ipcRenderer.invoke('vault:load'),
  vaultSave: (data) => ipcRenderer.invoke('vault:save', data),
  vaultPath: () => ipcRenderer.invoke('vault:path'),
  openDataFolder: () => ipcRenderer.invoke('vault:open'),
  lobbyStart: (opts) => ipcRenderer.invoke('lobby:start', opts),
  lobbyStop: () => ipcRenderer.invoke('lobby:stop'),
  lobbyInfo: () => ipcRenderer.invoke('lobby:info'),
});

// "Get the app": links to the desktop installers that GitHub builds from every release of the site.

import { h, openDialog } from './dom.js';

export const RELEASES = 'https://github.com/Beherrit/DCUGen/releases/latest';
const DL = `${RELEASES}/download`;
export const DOWNLOADS = {
  windows: { label: 'Windows installer', file: 'DCUGen-Setup.exe', hint: 'Installs like any program and updates itself' },
  portable: { label: 'Windows portable', file: 'DCUGen-Portable.exe', hint: 'No install: one file you can run from anywhere' },
  mac: { label: 'macOS', file: 'DCUGen.dmg', hint: 'Open the .dmg and drag the app to Applications (right-click > Open the first time)' },
  linux: { label: 'Linux', file: 'DCUGen.AppImage', hint: 'Make it executable and run it' },
};

function guess() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return 'windows';
}

/** One click downloads the installer for this computer; the small arrow opens the other builds. */
export function getAppButton() {
  if (window.dcugenDesktop) return null;
  const mine = guess();
  const d = DOWNLOADS[mine];
  return h('span', { class: 'getapp-wrap' },
    h('a', { class: 'btn sm getapp', href: `${DL}/${d.file}`, download: d.file, title: `Download the desktop app for ${d.label.replace(' installer', '')} (${d.file}). ${d.hint}. Your data on your own disk, host a table for your players, updates itself.` }, mine === 'windows' ? '⬇ Download app (.exe)' : `⬇ Download app (${d.file.replace(/^DCUGen\.?/, '')})`),
    h('button', { class: 'btn sm getapp-more', type: 'button', title: 'Other downloads and what the app does', 'aria-label': 'Other downloads', onClick: getAppDialog }, '▾'));
}

export async function getAppDialog() {
  const mine = guess();
  const row = (key) => {
    const d = DOWNLOADS[key];
    return h('a', { class: `getapp-row ${key === mine ? 'mine' : ''}`, href: `${DL}/${d.file}` }, h('b', null, d.label), h('span', null, d.hint), h('small', null, d.file));
  };
  await openDialog({
    title: 'DCUGen for your desktop',
    body: [
      h('p', { style: { margin: 0 } }, 'The same DCUGen, as an app: your characters and world live in a folder on your own computer, it works offline, and you can host a table for your players (they join with a key and roll their own dice). It updates itself whenever the site updates.'),
      h('div', { class: 'getapp-list' }, row('windows'), row('portable'), row('mac'), row('linux')),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Players: the Windows installer is one click. Run it, and DCUGen opens; it keeps itself up to date with the site from then on.'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Windows may warn that the publisher is unknown the first time: choose "More info" and "Run anyway". The builds are made by GitHub from the public source. ', h('a', { href: RELEASES, target: '_blank', rel: 'noopener' }, 'All releases')),
    ],
  });
}

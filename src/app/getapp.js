// "Get the app": the desktop installers GitHub builds from every release of the site, and the phone app
// (the site itself, installed to the home screen). QR codes carry either to another device.

import { h, openDialog, toast } from './dom.js';
import { qrSvg } from './lobby.js';

export const SITE = 'https://forgedcugen.vercel.app/';
const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// Android/Chrome offer a one-tap install; keep the offer for our own button.
let installOffer = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installOffer = e; });
/** The phone app works offline once installed. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' || window.dcugenDesktop) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* not on this host */ });
}

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
  if (isPhone()) return installed() ? null : h('button', { class: 'btn sm getapp-phone', type: 'button', id: 'getapp-phone', title: 'Put DCUGen on your home screen as an app', onClick: () => getAppDialog('phone') }, 'App');
  const mine = guess();
  const d = DOWNLOADS[mine];
  return h('span', { class: 'getapp-wrap' },
    h('a', { class: 'btn sm getapp', href: `${DL}/${d.file}`, download: d.file, title: `Download the desktop app for ${d.label.replace(' installer', '')} (${d.file}). ${d.hint}. Your data on your own disk, host a table for your players, updates itself.` }, mine === 'windows' ? 'Download app (.exe)' : `Download app (${d.file.replace(/^DCUGen\.?/, '')})`),
    h('button', { class: 'btn sm getapp-more', type: 'button', title: 'Other downloads and what the app does', 'aria-label': 'Other downloads', onClick: getAppDialog }, 'More'));
}

const qr = (text, label) => { const svg = qrSvg(text, 4); return svg ? h('figure', { class: 'getapp-qr' }, h('div', { class: 'qr', html: svg }), h('figcaption', null, label)) : null; };

function phoneSection(focus) {
  const steps = isIos()
    ? ['Open this page in Safari.', 'Tap the Share button (the square with the arrow).', 'Tap "Add to Home Screen", then "Add".']
    : ['Open this page in Chrome.', 'Tap the ⋮ menu.', 'Tap "Install app" (or "Add to Home screen").'];
  return h('section', { class: `getapp-phone-box ${focus ? 'focus' : ''}` },
    h('h3', null, 'On your phone or tablet'),
    h('p', { style: { margin: 0 } }, 'DCUGen runs right in your phone\'s browser, and you can install it like an app: its own icon on the home screen, full screen, and it opens even without signal. Phones and tablets use this; the downloads are for computers.'),
    h('div', { class: 'getapp-phone-row' },
      isPhone() ? null : qr(SITE, 'Scan with your phone\'s camera to open DCUGen'),
      h('div', null,
        installOffer ? h('button', { class: 'btn primary', type: 'button', id: 'getapp-install', onClick: async () => { installOffer.prompt(); const r = await installOffer.userChoice.catch(() => null); if (r?.outcome === 'accepted') toast('Installed: DCUGen is on your home screen'); installOffer = null; } }, 'Install DCUGen') : null,
        installed() ? h('p', { class: 'hint' }, 'You are using the installed app.') : h('ol', { class: 'getapp-steps' }, (isPhone() ? steps : ['Scan the code (or open ' + SITE.replace('https://', '') + ').', ...steps.slice(1)]).map((t) => h('li', null, t))),
        h('p', { class: 'hint', style: { margin: 0 } }, 'Your characters live on each device; use Roster > Share as a link, or Backup > Sync with a cloud folder, to carry them across.'))));
}

export async function getAppDialog(focus) {
  const mine = guess();
  const row = (key) => {
    const d = DOWNLOADS[key];
    return h('a', { class: `getapp-row ${key === mine ? 'mine' : ''}`, href: `${DL}/${d.file}` }, h('b', null, d.label), h('span', null, d.hint), h('small', null, d.file));
  };
  const which = h('select', { 'aria-label': 'Which download the code is for', id: 'getapp-qr-for' }, Object.entries(DOWNLOADS).map(([k, d]) => h('option', { value: k, selected: k === mine }, d.label)));
  const qrHost = h('div');
  const drawQr = () => { qrHost.replaceChildren(qr(`${DL}/${DOWNLOADS[which.value].file}`, 'Scan to download it on another computer (or send it to yourself)') || ''); };
  which.addEventListener('change', drawQr); drawQr();
  const phone = phoneSection(focus === 'phone' || isPhone());
  const desktop = h('section', null,
    h('h3', null, 'On your computer'),
    h('p', { style: { margin: 0 } }, 'The same DCUGen, as a desktop app: your characters and world live in a folder on your own computer, it works offline, and you can host a table for your players. It updates itself whenever the site updates.'),
    h('div', { class: 'getapp-list' }, row('windows'), row('portable'), row('mac'), row('linux')),
    h('details', { class: 'getapp-qr-box' }, h('summary', null, 'QR code for a download'), h('label', { class: 'field' }, h('span', null, 'For'), which), qrHost),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Windows may warn that the publisher is unknown the first time: choose "More info" and "Run anyway". The builds are made by GitHub from the public source. ', h('a', { href: RELEASES, target: '_blank', rel: 'noopener' }, 'All releases')));
  await openDialog({
    title: 'Get DCUGen',
    body: isPhone() ? [phone, desktop] : [desktop, phone],
  });
}

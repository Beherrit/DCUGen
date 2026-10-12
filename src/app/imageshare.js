// Turn a generated SVG (a recap cover, a comic page) into a PNG, and hand it to the share sheet or a
// download. Shared by the GM screen and the Battle Room.

import { h, toast, download, copyText, openDialog } from './dom.js';

export const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Rasterize an SVG string to a PNG blob (null if the browser can't). */
export function svgToPng(svg, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        c.toBlob((b) => resolve(b), 'image/png');
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = svgUrl(svg);
  });
}

const size = (svg) => { const m = /width="(\d+)" height="(\d+)"/.exec(svg); return m ? [Number(m[1]), Number(m[2])] : [800, 1200]; };

/** A dialog showing the picture, with Copy text / Download / Share. */
export function imageDialog({ title, svg, text, file, note, alt }) {
  const [w, hgt] = size(svg);
  const png = () => svgToPng(svg, w, hgt);
  return openDialog({
    title,
    body: [
      h('img', { src: svgUrl(svg), alt: alt || title, class: 'share-image' }),
      text ? h('pre', { class: 'recap-text' }, text) : null,
      h('div', { class: 'btn-row' },
        text ? h('button', { class: 'btn primary', type: 'button', onClick: async () => toast((await copyText(text)) ? 'Copied: paste it in your group chat' : 'Select the text and copy it') }, 'Copy for the group chat') : null,
        h('button', { class: `btn ${text ? '' : 'primary'}`, type: 'button', onClick: async () => { const b = await png(); if (b) download(`${file}.png`, b); else download(`${file}.svg`, svg, 'image/svg+xml'); } }, 'Download the picture'),
        h('button', { class: 'btn', type: 'button', onClick: async () => {
          const b = await png();
          const f = b ? new File([b], `${file}.png`, { type: 'image/png' }) : null;
          if (f && navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], text: text || title }); } catch { /* cancelled */ } } else toast('Sharing isn\'t available here: download the picture instead.');
        } }, 'Share…')),
      note ? h('p', { class: 'hint' }, note) : null,
    ],
  });
}

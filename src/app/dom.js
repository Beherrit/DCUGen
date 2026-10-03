// Small DOM helpers.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slug(s) {
  return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
}

/** A modal built from parts. Returns a promise that resolves with the clicked button's value. */
export function openDialog({ title, body, buttons = [{ label: 'Close', value: null }] }) {
  const dlg = document.getElementById('dialog');
  clear(dlg);
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.append(
      h('div', { class: 'dlg-head' }, h('h2', null, title), h('span', { style: { flex: 1 } }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: () => done(null) }, '✕')),
      h('div', { class: 'dlg-body' }, body),
      h('div', { class: 'dlg-foot' }, buttons.map((b) => h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, type: 'button', onClick: () => done(typeof b.value === 'function' ? b.value() : b.value) }, b.label))),
    );
    // Escape closes with no value. Only listen for this dialog's own cancel: a 'close' event
    // from a previous dialog can still be queued when the next one opens.
    dlg.addEventListener('cancel', () => resolve(null), { once: true });
    dlg.showModal();
  });
}

/** Readable text color on a background color. */
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.42 ? '#10141a' : '#ffffff';
}


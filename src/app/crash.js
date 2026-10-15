// When something breaks: a bar that says so, says your data is safe, and offers the details for a bug report
// (copy them, or open a GitHub issue with them filled in). The app keeps running; Reload starts it fresh.

import { APP_VERSION } from '../generated/rulesdata.js';

const ISSUES = 'https://github.com/Beherrit/DCUGen/issues/new';
const seen = new Set();
let bar = null;

/** Errors that aren't ours to report: browser noise and extensions. */
export function ignorable(message, source = '') {
  const m = String(message || '');
  if (/ResizeObserver loop|Script error\.?$|^null$|AbortError|The play\(\) request was interrupted/i.test(m)) return true;
  if (/^(chrome|moz|safari)-extension:/.test(String(source))) return true;
  return false;
}

/** What goes in a bug report: no character or world data, just where it broke. */
export function crashDetails(err, { version = APP_VERSION, tab = '', agent = '' } = {}) {
  const e = err instanceof Error ? err : { message: String(err?.message || err), stack: '' };
  // The stack's first line repeats the message.
  const stack = String(e.stack || '').split('\n').filter((l) => !(e.message && l.includes(e.message))).slice(0, 8).map((l) => l.replace(/\(?(https?|file):\/\/[^)\s]*?([^/)\s]+):(\d+):(\d+)\)?/g, '($2:$3:$4)').trim()).join('\n');
  return [`DCUGen ${version}`, tab ? `Tab: ${tab}` : null, agent ? `Browser: ${agent}` : null, `Error: ${e.message || e}`, stack ? `\n${stack}` : null].filter(Boolean).join('\n');
}

export function issueUrl(details) {
  const first = details.split('\n').find((l) => l.startsWith('Error: ')) || 'Something broke';
  const body = `**What were you doing when it happened?**\n\n\n**Details (from the app):**\n\`\`\`\n${details}\n\`\`\``;
  return `${ISSUES}?title=${encodeURIComponent(first.slice(0, 100))}&body=${encodeURIComponent(body).slice(0, 6000)}`;
}

function show(err) {
  const msg = String(err?.message || err || '');
  if (ignorable(msg)) return;
  if (seen.has(msg)) return;
  seen.add(msg);
  const tab = document.querySelector('.tab[aria-selected="true"]')?.textContent?.trim() || '';
  const details = crashDetails(err, { tab, agent: navigator.userAgent });
  try { console.error('[DCUGen]', err); } catch { /* no console */ }
  if (!document.body) return;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'crash-bar';
    bar.id = 'crash-bar';
    bar.setAttribute('role', 'alert');
    document.body.append(bar);
  }
  bar.hidden = false;
  bar.replaceChildren();
  const p = document.createElement('p');
  p.innerHTML = '<b>Something went wrong.</b> Your characters and world are saved in this browser and are safe. If it keeps happening, send us the details.';
  const btn = (label, fn, cls = 'btn sm') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; };
  const row = document.createElement('div');
  row.className = 'btn-row';
  row.append(
    btn('Copy details', async () => { try { await navigator.clipboard.writeText(details); row.firstChild.textContent = 'Copied'; } catch { prompt('Copy the details:', details); } }),
    btn('Report it on GitHub', () => window.open(issueUrl(details), '_blank', 'noopener')),
    btn('Reload', () => location.reload()),
    btn('Dismiss', () => { bar.hidden = true; }, 'btn sm ghost'),
  );
  const pre = document.createElement('details');
  pre.innerHTML = '<summary>Details</summary>';
  const code = document.createElement('pre');
  code.textContent = details;
  pre.append(code);
  bar.append(p, row, pre);
}

/** Show the bar for an error caught somewhere else. */
export function reportCrash(err) { show(err); }

// Installed as soon as this module runs: app.js imports it first, so even a failure while starting shows up.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => { if (!ignorable(e.message, e.filename)) show(e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => show(e.reason));
}

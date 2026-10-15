// Easier reading, for everyone: bigger text, colour-coded powers and advantages (the name, how it works, what
// it does each in its own colour and type), the Atkinson Hyperlegible font made for low vision, and stronger
// contrast. The styles live in app.css under html.read-*.

const ZOOM = 1.15;

export function initReading() {
  const root = document.documentElement;
  root.style.setProperty('--read-zoom', String(ZOOM));
  root.classList.add('read-zoom', 'read-color', 'read-font', 'read-contrast');
}

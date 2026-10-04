// Small helpers for building the interface with plain DOM calls. Everything
// from the graph is written with textContent, never as markup, so a source
// record can never inject anything into the page.

const SVG = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, String(value));
  }
  return append(element, children);
}

export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    parent.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return parent;
}

const PATHS = {
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM16 16l4.5 4.5',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  up: 'M6 14.5l6-6l6 6',
  down: 'M6 9.5l6 6l6-6',
  out: 'M13.5 5.5h5v5M18.5 5.5L11 13M10.5 7H6v11h11v-4.5',
  copy: 'M9 9h10v11H9zM6 15H5V4h10v2',
  print: 'M7.5 8.5v-4h9v4M7.5 16.5H5v-8h14v8h-2.5M7.5 13.5h9v6h-9z',
  share: 'M12 15V4M8 7.5l4-4l4 4M6 11.5v8h12v-8',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.6v.4',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name}`);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[name] || '');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

// Only web addresses become links. Anything else a record carries in its
// url field is shown as text or left out.
export function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

// "MONDO_0012812" is how the id is stored; "MONDO:0012812" is how people cite it.
export const prettyId = id => String(id || '').replace(/^([A-Za-z]+)_(\d+)$/, '$1:$2');

export const wideScreen = () => window.matchMedia('(min-width: 900px)');

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// After a part of the page is rebuilt, put the keyboard back where it was.
export function keepFocus(container, rebuild) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.key : null;
  rebuild();
  if (!key) return;
  const again = [...container.querySelectorAll('[data-key]')].find(element => element.dataset.key === key);
  again?.focus({ preventScroll: true });
}

// A panel that slides over the desk: from the bottom on a phone, at the side
// on a wide screen. The evidence sheet and the "about the data" sheet are both
// one of these.

import { h, icon } from './dom.js';
import { t } from './strings.js';

let serial = 0;

export function createSheet({ name, label, onChange = () => {}, onBack = null }) {
  const labelId = `sheet-label-${++serial}`;
  const backButton = h('button', { class: 'icon-btn sheet-back', type: 'button', 'aria-label': t('back'), hidden: true, onClick: () => onBack?.() }, icon('back'));
  const closeButton = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': t('close'), onClick: () => close() }, icon('close'));
  const body = h('div', { class: 'sheet-body' });
  const element = h('section', { class: `sheet sheet-${name}`, role: 'dialog', 'aria-labelledby': labelId, hidden: true },
    h('header', { class: 'sheet-bar' }, backButton, h('p', { class: 'sheet-label', id: labelId }, label), closeButton),
    body);
  // On a phone the sheet covers everything, and a tap on what is left of the
  // page behind it closes it.
  const scrim = h('div', { class: `scrim scrim-${name}`, hidden: true, onClick: () => close() });

  let opener = null;
  let open = false;

  function show(content, { from, canGoBack = false } = {}) {
    if (!open) opener = from || document.activeElement;
    body.replaceChildren(...[content].flat().filter(Boolean));
    backButton.hidden = !canGoBack;
    element.hidden = false;
    scrim.hidden = false;
    body.scrollTop = 0;
    const wasOpen = open;
    open = true;
    if (!wasOpen) onChange(true);
    // Start reading from the top of the sheet.
    const heading = body.querySelector('[data-sheet-title]');
    (heading || closeButton).focus({ preventScroll: true });
  }

  function close() {
    if (!open) return;
    open = false;
    element.hidden = true;
    scrim.hidden = true;
    body.replaceChildren();
    onChange(false);
    // The desk may have been redrawn while the sheet was open, so the card
    // that opened it is found again by its key.
    const back = opener;
    opener = null;
    const key = back?.dataset?.key;
    const again = back?.isConnected ? back : key && [...document.querySelectorAll('[data-key]')].find(item => item.dataset.key === key);
    again?.focus({ preventScroll: true });
  }

  return { element, scrim, show, close, isOpen: () => open };
}

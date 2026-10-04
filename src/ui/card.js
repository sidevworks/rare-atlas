// The two things that can land on the desk: a source card, for a link the
// atlas can back, and a gap card, for a question it cannot.

import { BASIS, NODE } from '../../shared/schema.js';
import { h } from './dom.js';
import { t, tn } from './strings.js';
import { isDisputed } from './state.js';

const LEVELS = ['high', 'medium', 'low'];

export const isInferred = edge => edge.basis === BASIS.INFERRED;

export function basisMark(edge) {
  const inferred = isInferred(edge);
  return h('span', { class: `mark ${inferred ? 'mark-inferred' : 'mark-observed'}` },
    h('i', { class: 'mark-sign', 'aria-hidden': 'true' }),
    t(inferred ? 'inferred' : 'observed'));
}

export function confidenceMark(edge) {
  const level = LEVELS.includes(edge.confidence) ? edge.confidence : 'unknown';
  return h('span', { class: 'conf', dataset: { level } },
    h('span', { class: 'conf-bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    t(`conf_${level}`));
}

export const disputedMark = () => h('span', { class: 'disputed' }, t('disputed'));

export function sourceNames(edge) {
  const names = [...new Set((edge.sources || []).map(source => source?.name).filter(Boolean))];
  const rest = names.length - 2;
  const shown = names.slice(0, 2).join(', ');
  return rest > 0 ? `${shown} ${tn('sourcesMore', rest)}` : shown;
}

// A card that is about some other disease than the one being read says so,
// because several diseases' links can lie on the desk together.
function otherDisease(edge, focusId, nameOf) {
  if (!focusId || !nameOf) return '';
  const ends = [edge.from, edge.to].filter(node => node?.kind === NODE.DISEASE).map(node => node.id);
  if (ends.includes(focusId)) return '';
  const other = ends[0] || (typeof edge.detail?.disease === 'string' ? edge.detail.disease : '');
  return other && other !== focusId ? nameOf(other) : '';
}

export function sourceCard(edge, { focusId, nameOf, onOpen, land = -1 } = {}) {
  const about = otherDisease(edge, focusId, nameOf);
  const card = h('button', {
    class: 'card',
    type: 'button',
    'aria-haspopup': 'dialog',
    dataset: { key: `card:${edge.id}`, basis: isInferred(edge) ? 'inferred' : 'observed' },
    onClick: event => onOpen?.(edge, event.currentTarget),
  },
    about && h('span', { class: 'card-about' }, t('aboutDisease', { name: about })),
    h('span', { class: 'card-statement' }, edge.statement),
    h('span', { class: 'card-meta' }, basisMark(edge), confidenceMark(edge)),
    isDisputed(edge) && disputedMark(),
    h('span', { class: 'card-source' }, sourceNames(edge)),
  );
  // Only a card that has just arrived settles onto the desk.
  if (land >= 0) {
    card.dataset.fresh = '';
    card.style.setProperty('--i', String(Math.min(land, 8)));
  }
  return card;
}

const plainList = (items, className) => (items?.length
  ? h('ul', { class: className }, items.map(item => h('li', { dir: 'auto' }, item)))
  : h('p', { class: 'gap-none' }, t('gapNoneRecorded')));

// Where the atlas looked, set as a ledger: each source, then what it gave.
function ledger(searched) {
  if (!searched?.length) return h('p', { class: 'gap-none' }, t('gapSearchedNone'));
  return h('ul', { class: 'ledger' }, searched.map(name => h('li', {},
    h('span', { class: 'ledger-name' }, name),
    h('span', { class: 'ledger-rule', 'aria-hidden': 'true' }),
    h('span', { class: 'ledger-result' }, t('gapNothing')))));
}

// `folded` shows only a one-line summary until it is opened: used for older
// gaps, so the newest stays in view, and in the list of unsupported links.
export function gapCard(gap, { folded = false, summary = '' } = {}) {
  const parts = h('div', { class: 'gap-parts' },
    h('section', {}, h('h4', {}, t('gapSearched')), ledger(gap.searched)),
    h('section', {}, h('h4', {}, t('gapMissing')), plainList(gap.missing, 'gap-list')),
    h('section', {}, h('h4', {}, t('gapNext')), plainList(gap.nextSteps, 'gap-list')));

  if (folded) {
    return h('details', { class: 'gap gap-folded' },
      h('summary', { dataset: { key: `gap:${gap.question}` }, dir: 'auto' }, summary || gap.question || t('gapTitle')),
      parts);
  }
  return h('article', { class: 'gap' },
    h('h3', { class: 'gap-title' }, t('gapTitle')),
    gap.question && h('p', { class: 'gap-asked' },
      h('span', { class: 'gap-label' }, t('gapAsked')),
      h('span', { class: 'gap-question', dir: 'auto' }, gap.question)),
    parts);
}

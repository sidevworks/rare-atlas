// The evidence sheet: everything the atlas holds behind one link. Every
// source with its record id, a way to open it and the day it was read; why
// the confidence is what it is; and any source that disagrees, shown next to
// the link it disputes rather than further down.

import { EDGE } from '../../shared/schema.js';
import { h, icon, safeUrl } from './dom.js';
import { t, tOr, formatDate, formatNumber } from './strings.js';
import { createSheet } from './sheet.js';
import { sourceCard, basisMark, confidenceMark, isInferred } from './card.js';
import { isDisputed } from './state.js';

// Record fields that are shown elsewhere on the sheet, or are ids only the
// atlas uses.
const DETAIL_ELSEWHERE = new Set(['score', 'because', 'disease']);

const humanise = key => {
  const spaced = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const fact = (label, ...value) => h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));

export function sourceItem(source) {
  const url = safeUrl(source.url);
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch { /* shown without the host */ }
  return h('li', { class: 'source' },
    h('p', { class: 'source-name' }, source.name),
    h('p', { class: 'source-meta' },
      source.recordId && h('span', {}, t('evRecord', { id: source.recordId })),
      source.version && h('span', {}, t('evVersion', { version: source.version })),
      h('span', {}, source.retrieved ? t('evRead', { date: formatDate(source.retrieved) }) : t('evReadUnknown'))),
    url
      ? h('a', { class: 'source-link', href: url, target: '_blank', rel: 'noopener noreferrer' },
        host ? t('evOpenAt', { host }) : t('evOpen'), icon('out', 18))
      : h('p', { class: 'source-nolink' }, t('evNoLink')));
}

export const sourceList = sources => h('ul', { class: 'sources' }, (sources || []).filter(Boolean).map(sourceItem));

export function createEvidence({ state, onChange, onLookUp }) {
  // Opening a supporting link from inside a connection keeps the way back.
  let trail = [];

  const sheet = createSheet({
    name: 'evidence',
    label: t('evidenceLabel'),
    onBack: () => {
      trail.pop();
      if (trail.length) draw();
      else sheet.close();
    },
    onChange: open => {
      if (!open) trail = [];
      onChange?.(open);
    },
  });

  function draw(from) {
    const entry = trail[trail.length - 1];
    sheet.show(entry.star ? starView(entry.star) : edgeView(entry), { from, canGoBack: trail.length > 1 });
  }

  function node(ref) {
    if (!ref) return null;
    const own = ref.id && ref.id === state.homeId;
    return h('span', { class: 'ev-node' },
      h('span', { class: own ? 'ev-node-label is-home' : 'ev-node-label' }, ref.label || ref.id),
      h('span', { class: 'ev-node-kind' }, tOr(`kind_${ref.kind}`, null) || ref.kind || ''));
  }

  function detailFacts(detail) {
    const rows = [];
    for (const [key, value] of Object.entries(detail || {})) {
      if (DETAIL_ELSEWHERE.has(key)) continue;
      if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) continue;
      rows.push(fact(tOr(`detail_${key}`, null) || humanise(key), String(value)));
    }
    return rows;
  }

  function supportCards(edges) {
    return h('div', { class: 'cards cards-stack' }, edges.map(edge => sourceCard(edge, {
      focusId: state.focusId,
      nameOf: state.nameOf,
      onOpen: opened => {
        trail.push({ edge: opened, connection: state.connectionFor(opened.id) });
        draw();
      },
    })));
  }

  function edgeView({ edge, connection }) {
    const inferred = isInferred(edge);
    const because = edge.detail?.because;
    // A connection carries its supporting links. A similar-disease card laid
    // on its own names them by id, and they are looked up on the desk.
    const support = connection?.support
      || (Array.isArray(because) ? because.map(id => state.findEdge(id)).filter(Boolean) : []);
    const score = Number.isFinite(connection?.score) ? connection.score : edge.detail?.score;
    const similar = edge.type === EDGE.DISEASE_SIMILAR;
    const details = detailFacts(edge.detail);

    return [
      h('h2', { class: 'ev-statement', tabindex: '-1', 'data-sheet-title': true, dir: 'auto' }, edge.statement),

      isDisputed(edge) && h('section', { class: 'ev-disputed' },
        h('h3', {}, t('evDisputedTitle')),
        h('p', {}, t('evDisputedBody')),
        sourceList(edge.contradictedBy)),

      h('dl', { class: 'facts' },
        fact(t('evKind'), tOr(`relation_${edge.type}`, 'relation_other')),
        fact(t('evBetween'), node(edge.from), node(edge.to)),
        fact(t('evBasis'), basisMark(edge), h('span', { class: 'ev-note' }, t(inferred ? 'evInferred' : 'evObserved'))),
        fact(t('evWhy'), confidenceMark(edge),
          h('span', { class: 'ev-note' }, edge.confidenceWhy || t('evWhyMissing')),
          Number.isFinite(score) && h('span', { class: 'ev-note' }, t('evScore', { score: formatNumber(Math.round(score * 100) / 100) })),
          typeof because === 'string' && because && h('span', { class: 'ev-note' }, because))),

      connection && h('section', { class: 'ev-block' },
        h('h3', {}, t('evDiffers')),
        connection.differs.length
          ? h('ul', { class: 'check-list' }, connection.differs.map(item => h('li', {}, item)))
          : h('p', { class: 'ev-note' }, t('evDiffersNone'))),

      (similar || support.length > 0) && h('section', { class: 'ev-block' },
        h('h3', {}, t('evShared')),
        support.length ? supportCards(support) : h('p', { class: 'ev-note' }, t('evSharedNone'))),

      h('section', { class: 'ev-block' },
        h('h3', {}, t('evSources')),
        edge.sources?.length ? sourceList(edge.sources) : h('p', { class: 'ev-note' }, t('evNoSources'))),

      details.length > 0 && h('section', { class: 'ev-block' },
        h('h3', {}, t('evDetail')),
        h('dl', { class: 'facts' }, details)),
    ];
  }

  // A star with nothing on the desk yet: say so, and offer the lookup.
  function starView(id) {
    const name = state.nameOf(id);
    const star = state.stars.get(id);
    return [
      h('h2', { class: 'ev-statement', tabindex: '-1', 'data-sheet-title': true }, name),
      star && h('p', { class: 'ev-note' }, t(star.deep ? 'layerDeep' : 'layerWide')),
      h('p', {}, t('starNothing')),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          sheet.close();
          onLookUp?.(id);
        },
      }, t('starLook', { name })),
    ];
  }

  return {
    element: sheet.element,
    scrim: sheet.scrim,
    isOpen: sheet.isOpen,
    close: sheet.close,
    openEdge(edge, from) {
      trail = [{ edge, connection: state.connectionFor(edge.id) }];
      draw(from);
    },
    openStar(id, from) {
      trail = [{ star: id }];
      draw(from);
    },
  };
}

// Where the whole atlas came from: when it was built, what it holds and
// every file it was read from. Reached from the top bar.

import { h } from './dom.js';
import { t, formatDate, formatNumber } from './strings.js';
import { createSheet } from './sheet.js';
import { sourceList } from './evidence.js';

const humanise = key => {
  const spaced = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export function createAbout({ build, onChange }) {
  const sheet = createSheet({ name: 'about', label: t('aboutData'), onChange });

  function open(from) {
    const counts = Object.entries(build?.counts || {}).filter(([, value]) => Number.isFinite(value));
    sheet.show([
      h('h2', { class: 'ev-statement', tabindex: '-1', 'data-sheet-title': true },
        build?.builtAt ? t('aboutBuilt', { date: formatDate(build.builtAt) }) : t('aboutData')),
      build?.synthetic && h('p', { class: 'about-sample' }, h('span', { class: 'badge' }, t('sampleData')), t('sampleDataWhy')),
      counts.length > 0 && h('section', { class: 'ev-block' },
        h('h3', {}, t('aboutHolds')),
        h('dl', { class: 'facts facts-counts' }, counts.map(([key, value]) => h('div', { class: 'fact' },
          h('dt', {}, humanise(key)),
          h('dd', {}, formatNumber(value)))))),
      h('section', { class: 'ev-block' },
        h('h3', {}, t('aboutSources')),
        build?.sources?.length ? sourceList(build.sources) : h('p', { class: 'ev-note' }, t('aboutNoSources'))),
      h('p', { class: 'ev-note' }, t('notAdvice')),
    ], { from });
  }

  return { element: sheet.element, scrim: sheet.scrim, open, close: sheet.close, isOpen: sheet.isOpen };
}

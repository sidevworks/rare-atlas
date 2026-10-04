// The desk: the lower part of the screen, where what the atlas found is laid
// out to read. Three ways to read it:
//   Sources      every card, grouped by kind of link, a few at first
//   Connections  each related disease: what is shared, what differs
//   Next steps   for the visitor's own disease, the leads the sources
//                support, kept apart from what the atlas could not support

import { EDGE, NODE } from '../../shared/schema.js';
import { h, icon, keepFocus, prettyId, wideScreen } from './dom.js';
import { t, tn, tOr, formatNumber } from './strings.js';
import { sourceCard, gapCard, basisMark, confidenceMark, disputedMark, isInferred } from './card.js';
import { isDisputed } from './state.js';

// The order a family reads in: what causes it, what it is close to, who is
// working on it. Symptoms come last because there are many and the family
// already knows them.
const ORDER = [
  EDGE.DISEASE_GENE,
  EDGE.GENE_MECHANISM,
  EDGE.GENE_PATHWAY,
  EDGE.DISEASE_SIMILAR,
  EDGE.GROUP_DISEASE,
  EDGE.GROUP_ASSET,
  EDGE.STUDY_DISEASE,
  EDGE.PUBLICATION_CLAIM,
  EDGE.PERSON_WORKS_ON,
  EDGE.DISEASE_PHENOTYPE,
];
const RANK = { high: 0, medium: 1, low: 2 };
const VIEWS = [['sources', 'tabSources'], ['connections', 'tabConnections'], ['steps', 'tabSteps']];
const JUST_LANDED_MS = 1500;
const LONG_DEFINITION = 180;

export function createDesk({ state, actions, onOpenEdge, onVisibility }) {
  const wide = wideScreen();
  const expanded = new Set();     // groups showing every card
  const unfolded = new Set();     // folded gaps the visitor opened
  const drawn = new Set();        // cards already shown once, so they do not land twice
  const seen = new Map();         // per desk, how much of Sources has been looked at
  let view = 'sources';
  let size = 'peek';
  let definitionOpen = false;
  let lastFocus = null;
  let lastSaid = '';
  let landing = 0;

  const context = h('div', { class: 'desk-context' });
  const title = h('h2', { class: 'desk-name', tabindex: '-1' });
  const sub = h('p', { class: 'desk-sub' });
  const sizeButton = h('button', { class: 'icon-btn desk-size', type: 'button', dataset: { key: 'desk-size' }, onClick: () => setSize(size === 'open' ? 'peek' : 'open') });
  const tabs = VIEWS.map(([id]) => h('button', {
    class: 'tab',
    type: 'button',
    role: 'tab',
    id: `desk-tab-${id}`,
    'aria-controls': 'desk-panel',
    dataset: { key: `tab:${id}`, view: id },
    onClick: () => setView(id),
  }));
  const tabList = h('div', { class: 'desk-tabs', role: 'tablist', 'aria-label': t('deskViews') }, tabs);
  const panel = h('div', { class: 'desk-body', id: 'desk-panel', role: 'tabpanel', tabindex: '0' });
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  const element = h('section', { class: 'desk', 'aria-label': t('deskLabel'), hidden: true, dataset: { size } },
    h('header', { class: 'desk-head' }, h('div', { class: 'desk-title' }, context, title, sub), sizeButton),
    tabList,
    panel,
    status);

  // Arrow keys move between the three views, the way tabs are expected to.
  tabList.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const forward = (event.key === 'ArrowRight') !== (getComputedStyle(tabList).direction === 'rtl');
    const index = VIEWS.findIndex(([id]) => id === view);
    const next = VIEWS[(index + (forward ? 1 : -1) + VIEWS.length) % VIEWS.length][0];
    event.preventDefault();
    setView(next);
    tabs.find(tab => tab.dataset.view === next)?.focus();
  });

  // <details> does not bubble its toggle, so it is caught on the way down.
  panel.addEventListener('toggle', event => {
    const key = event.target.querySelector?.('summary')?.dataset.key;
    if (!key) return;
    if (event.target.open) unfolded.add(key);
    else unfolded.delete(key);
  }, true);

  function setView(next) {
    if (view === next) return;
    view = next;
    panel.scrollTop = 0;
    render();
  }

  function setSize(next) {
    size = next;
    element.dataset.size = size;
    const open = size === 'open';
    sizeButton.replaceChildren(icon(open ? 'down' : 'up'));
    sizeButton.setAttribute('aria-label', t(open ? 'deskShrink' : 'deskGrow'));
    sizeButton.setAttribute('aria-expanded', String(open));
  }

  // "Back to {name}" with the name set apart, so it can carry the gold.
  function withName(key, name, className) {
    const [before, after = ''] = t(key, { name: '\u0000' }).split('\u0000');
    return [before, h('span', { class: className }, name), after];
  }

  function say(message) {
    if (!message || message === lastSaid) return;
    lastSaid = message;
    status.textContent = message;
  }

  // ---- Cards --------------------------------------------------------------

  function card(desk, edge) {
    const arrived = desk?.arrived.get(edge.id);
    const fresh = arrived != null && !drawn.has(edge.id) && performance.now() - arrived < JUST_LANDED_MS;
    drawn.add(edge.id);
    return sourceCard(edge, {
      focusId: state.focusId,
      nameOf: state.nameOf,
      onOpen: onOpenEdge,
      land: fresh ? landing++ : -1,
    });
  }

  const cards = (desk, edges, className = 'cards') => h('div', { class: className }, edges.map(edge => card(desk, edge)));

  const isOwn = edge => edge.from?.id === state.focusId || edge.to?.id === state.focusId || edge.detail?.disease === state.focusId;

  function grouped(desk) {
    const groups = new Map();
    for (const edge of desk.edges.values()) {
      const type = ORDER.includes(edge.type) ? edge.type : 'other';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(edge);
    }
    for (const edges of groups.values()) {
      edges.sort((one, other) => (isOwn(other) - isOwn(one)) || ((RANK[one.confidence] ?? 3) - (RANK[other.confidence] ?? 3)));
    }
    return [...ORDER, 'other'].filter(type => groups.has(type)).map(type => [type, groups.get(type)]);
  }

  function group(desk, type, edges) {
    const key = `${desk.id}:${type}`;
    const few = wide.matches ? 4 : 2;
    const open = expanded.has(key);
    const shown = open ? edges : edges.slice(0, few);
    const hiddenDisputed = open ? 0 : edges.slice(few).filter(isDisputed).length;
    return h('section', { class: 'group' },
      h('h3', { class: 'group-title' }, tOr(`group_${type}`, 'group_other'), h('span', { class: 'count' }, formatNumber(edges.length))),
      cards(desk, shown),
      edges.length > few && h('button', {
        class: 'link-btn',
        type: 'button',
        'aria-expanded': String(open),
        dataset: { key: `more:${key}` },
        onClick: () => {
          if (open) expanded.delete(key);
          else expanded.add(key);
          render();
        },
      }, open ? t('showFewer')
        : hiddenDisputed ? t('showAllDisputed', { n: formatNumber(edges.length), d: formatNumber(hiddenDisputed) })
          : t('showAll', { n: formatNumber(edges.length) })));
  }

  function summary(disease) {
    const text = disease.definition || '';
    const long = text.length > LONG_DEFINITION;
    const names = (disease.synonyms || []).filter(Boolean);
    if (!text && !names.length) return null;
    return h('div', { class: 'definition' },
      text && h('p', { class: long && !definitionOpen ? 'definition-text is-clamped' : 'definition-text' }, text),
      names.length > 0 && (!long || definitionOpen) && h('p', { class: 'definition-from' }, t('alsoCalled', { names: names.join(', ') })),
      text && h('p', { class: 'definition-from' }, t('definitionFrom', { id: prettyId(disease.id) })),
      long && h('button', {
        class: 'link-btn',
        type: 'button',
        'aria-expanded': String(definitionOpen),
        dataset: { key: 'definition' },
        onClick: () => {
          definitionOpen = !definitionOpen;
          render();
        },
      }, t(definitionOpen ? 'readLess' : 'readMore')));
  }

  function gaps(list) {
    return list.map((gap, index) => {
      const folded = index > 0;
      const item = gapCard(gap, { folded, summary: folded ? t('gapEarlier', { question: gap.question || t('gapTitle') }) : '' });
      if (folded && unfolded.has(`gap:${gap.question}`)) item.open = true;
      return item;
    });
  }

  // ---- Sources ------------------------------------------------------------

  function sourcesView(desk) {
    const groups = grouped(desk);
    return [
      state.withheld > 0 && h('p', { class: 'note' }, tn('withheld', state.withheld)),
      gaps(desk.gaps),
      desk.disease && summary(desk.disease),
      groups.map(([type, edges]) => group(desk, type, edges)),
      !groups.length && !desk.gaps.length && h('p', { class: 'empty' }, t('deskEmpty')),
    ];
  }

  // ---- Connections --------------------------------------------------------

  function pathHead(fromId, to) {
    return h('header', { class: 'connection-head' },
      h('p', { class: 'path' },
        h('span', { class: fromId === state.homeId ? 'path-from is-home' : 'path-from' }, state.nameOf(fromId)),
        h('span', { class: 'path-line', 'aria-hidden': 'true' })),
      h('h3', { class: to.id === state.homeId ? 'connection-name is-home' : 'connection-name' }, to.label || state.nameOf(to.id)));
  }

  const differsList = connection => (connection.differs.length
    ? h('ul', { class: 'check-list' }, connection.differs.map(item => h('li', {}, item)))
    : h('p', { class: 'part-note' }, t('evDiffersNone')));

  function connectionBlock(desk, connection) {
    const { edge, to } = connection;
    const name = to.label || state.nameOf(to.id);
    return h('article', { class: 'connection', dataset: { basis: isInferred(edge) ? 'inferred' : 'observed' } },
      pathHead(desk.id, to),
      h('p', { class: 'connection-says' }, edge.statement),
      h('p', { class: 'card-meta' }, basisMark(edge), confidenceMark(edge), isDisputed(edge) && disputedMark()),
      h('div', { class: 'connection-cols' },
        h('section', {}, h('h4', {}, t('evDiffers')), differsList(connection)),
        h('section', {},
          h('h4', {}, t('evShared')),
          connection.support.length ? cards(desk, connection.support, 'cards cards-stack') : h('p', { class: 'part-note' }, t('evSharedNone')))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-quiet', type: 'button', 'aria-haspopup': 'dialog', dataset: { key: `why:${edge.id}` }, onClick: event => onOpenEdge(edge, event.currentTarget) }, t('connOpen')),
        to.kind === NODE.DISEASE && to.id !== state.focusId
          && h('button', { class: 'btn btn-quiet', type: 'button', dataset: { key: `look:${to.id}` }, onClick: () => actions.lookUp(to.id) }, t('connLookUp', { name }))));
  }

  function connectionsView(desk) {
    if (!state.focusId) return [h('p', { class: 'empty' }, t('stepsNoHome'))];
    if (desk.connections === null) {
      return [
        h('p', { class: 'empty' }, t('connNotLooked')),
        h('button', { class: 'btn', type: 'button', dataset: { key: 'conn-look' }, onClick: () => actions.findConnections(state.focusId) }, t('connLook')),
      ];
    }
    if (!desk.connections.length) {
      return [
        h('p', { class: 'empty' }, t('connNone', { name: state.nameOf(state.focusId) })),
        desk.connectionsGap && gapCard(desk.connectionsGap),
      ];
    }
    return desk.connections.map(connection => connectionBlock(desk, connection));
  }

  // ---- Next steps ---------------------------------------------------------

  const heldEdges = held => (held ? [...held.groups, ...held.assets, ...held.studies] : []);

  function lead(desk, connection) {
    const { edge, to } = connection;
    const name = to.label || state.nameOf(to.id);
    const held = state.assets.get(to.id);
    const edges = heldEdges(held);
    return h('article', { class: 'connection', dataset: { basis: isInferred(edge) ? 'inferred' : 'observed' } },
      pathHead(desk.id, to),
      h('p', { class: 'connection-says' }, edge.statement),
      h('p', { class: 'card-meta' }, basisMark(edge), confidenceMark(edge), isDisputed(edge) && disputedMark()),
      h('div', { class: 'connection-cols' },
        h('section', {}, h('h4', {}, t('stepsCheckFirst')), differsList(connection)),
        held && h('section', {},
          h('h4', {}, t('connAssets', { name })),
          edges.length ? cards(desk, edges, 'cards cards-stack') : h('p', { class: 'part-note' }, t('connAssetsNone', { name })))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', dataset: { key: `draft:${to.id}` }, onClick: () => actions.draft(to.id) }, t('connDraft')),
        !held && h('button', { class: 'btn btn-quiet', type: 'button', dataset: { key: `assets:${to.id}` }, onClick: () => actions.findAssets(to.id) }, t('connFindAssets')),
        h('button', { class: 'btn btn-quiet', type: 'button', 'aria-haspopup': 'dialog', dataset: { key: `why:${edge.id}` }, onClick: event => onOpenEdge(edge, event.currentTarget) }, t('connOpen'))));
  }

  // A connection the atlas worked out is a lead only if it rests on links a
  // source states. One a source states outright stands on that source.
  const isSupported = connection => connection.support.length > 0 || !isInferred(connection.edge);

  function stepsView() {
    const home = state.homeDesk();
    if (!home) return [h('p', { class: 'empty' }, t('stepsNoHome'))];
    const name = state.nameOf(state.homeId);
    const connections = home.connections || [];
    const supported = connections.filter(isSupported);
    const unsupported = connections.filter(connection => !isSupported(connection));
    const own = heldEdges(state.assets.get(state.homeId));
    const nothingSupported = !supported.length && !own.length && home.connections !== null;
    return [
      h('p', { class: 'steps-for' }, withName('stepsFor', name, 'is-home')),
      h('section', { class: 'steps-part' },
        h('h3', { class: 'part-title' }, t('stepsViable')),
        h('p', { class: 'part-note' }, t('stepsViableWhy')),
        own.length > 0 && h('div', { class: 'steps-own' }, h('h4', {}, t('connAssets', { name })), cards(home, own)),
        supported.map(connection => lead(home, connection)),
        home.connections === null && h('button', { class: 'btn', type: 'button', dataset: { key: 'conn-look' }, onClick: () => actions.findConnections(state.homeId) }, t('connLook')),
        nothingSupported && h('p', { class: 'empty' }, t('stepsViableNone'))),
      h('section', { class: 'steps-part steps-unsupported' },
        h('h3', { class: 'part-title' }, t('stepsUnsupported')),
        h('p', { class: 'part-note' }, t('stepsUnsupportedWhy')),
        unsupported.map(connection => h('div', { class: 'unsupported' },
          h('p', { class: 'unsupported-name' }, connection.to.label || state.nameOf(connection.to.id)),
          h('p', { class: 'part-note' }, t('stepsNoSupport')))),
        home.gaps.map(gap => {
          const item = gapCard(gap, { folded: true });
          if (unfolded.has(`gap:${gap.question}`)) item.open = true;
          return item;
        }),
        !unsupported.length && !home.gaps.length && h('p', { class: 'empty' }, t('stepsUnsupportedNone'))),
    ];
  }

  // ---- The whole desk -----------------------------------------------------

  function head(desk) {
    const away = state.homeId && state.focusId && state.homeId !== state.focusId;
    context.replaceChildren(...(away ? [h('button', {
      class: 'link-btn desk-home',
      type: 'button',
      dataset: { key: 'desk-home' },
      onClick: () => actions.backHome(),
    }, withName('deskBackHome', state.nameOf(state.homeId), 'is-home'))] : []));

    title.textContent = state.focusId ? state.nameOf(state.focusId) : t('deskLoose');
    title.classList.toggle('is-home', Boolean(state.focusId) && state.focusId === state.homeId);

    const layer = desk.disease?.layer || (state.stars.has(state.focusId) ? (state.stars.get(state.focusId).deep ? 'deep' : 'wide') : '');
    sub.replaceChildren(...(state.focusId ? [
      layer && h('span', {}, t(layer === 'deep' ? 'layerDeep' : 'layerWide')),
      h('span', { class: 'desk-id' }, prettyId(state.focusId)),
    ].filter(Boolean) : []));
  }

  function tabRow(desk) {
    tabList.hidden = !state.focusId;
    const counts = { sources: desk.edges.size, connections: desk.connections?.length ?? null, steps: null };
    const unseen = view !== 'sources' && desk.version > (seen.get(desk.id) ?? 0);
    for (const tab of tabs) {
      const id = tab.dataset.view;
      const selected = id === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.replaceChildren(
        t(VIEWS.find(([name]) => name === id)[1]),
        counts[id] != null && h('span', { class: 'count' }, formatNumber(counts[id])),
        id === 'sources' && unseen && h('span', { class: 'tab-new' }, t('tabNew')));
    }
    panel.setAttribute('aria-labelledby', `desk-tab-${view}`);
  }

  function render() {
    const empty = state.isEmpty();
    element.hidden = empty;
    onVisibility?.(!empty);
    if (empty) {
      panel.replaceChildren();
      lastFocus = null;
      lastSaid = '';
      return;
    }

    const desk = state.desk();
    if (state.focusId !== lastFocus) {
      // A different disease is on the desk: start again from the top.
      lastFocus = state.focusId;
      view = 'sources';
      definitionOpen = false;
      panel.scrollTop = 0;
    }
    if (!state.focusId) view = 'sources';
    if (view === 'sources') seen.set(desk.id, desk.version);

    landing = 0;
    keepFocus(element, () => {
      head(desk);
      tabRow(desk);
      const content = view === 'connections' ? connectionsView(desk) : view === 'steps' ? stepsView() : sourcesView(desk);
      panel.replaceChildren(...[content].flat(Infinity).filter(Boolean));
    });

    if (desk.gaps.length && !desk.edges.size) say(t('deskAnnounceGap'));
    else if (desk.edges.size) say(tn('deskAnnounce', desk.edges.size, { name: state.nameOf(state.focusId) }));
  }

  setSize(size);
  const stopWatching = state.subscribe(render);
  // The number of cards shown "at first" depends on the width.
  const onWidth = () => render();
  wide.addEventListener?.('change', onWidth);

  return {
    element,
    render,
    // Bring the desk and its heading into reach, for when a star that is
    // already on the desk is chosen in the sky.
    reveal() {
      if (element.hidden) return;
      title.focus({ preventScroll: true });
    },
    dispose() {
      stopWatching();
      wide.removeEventListener?.('change', onWidth);
    },
  };
}

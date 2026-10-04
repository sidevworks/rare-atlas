// What the readable layer remembers about one visit: which disease is the
// visitor's own, which one is being read now, and what has been laid on the
// desk for each. It only ever holds what a lookup returned.

import { on, EVENT } from '../bus.js';
import { NODE } from '../../shared/schema.js';
import { prettyId } from './dom.js';
import { getLanguage } from '../language.js';

// The desk before any disease is on it, for example after a search that
// found nothing.
const LOOSE = '';

// The schema's rule, enforced once more at the last step before the screen:
// a link with no source is never shown.
export const hasSource = edge => Boolean(edge && edge.id && Array.isArray(edge.sources) && edge.sources.some(source => source && source.name));

export const isDisputed = edge => Boolean(edge?.contradictedBy?.length);

export function createState(map) {
  const stars = new Map();
  for (const point of map?.points || []) stars.set(point[0], { name: point[1], deep: point[6] === 1 });

  const labels = new Map();
  const listeners = new Set();
  let queued = false;

  const state = {
    map,
    stars,
    homeId: null,   // the visitor's own disease: the first one looked up, or the one chosen in the search box
    focusId: null,  // the disease being read now
    desks: new Map(),
    assets: new Map(),
    withheld: 0,
    language: getLanguage().code,   // what a brief asked for from the desk is written in

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    desk(id = state.focusId || LOOSE) {
      let desk = state.desks.get(id);
      if (!desk) {
        desk = { id, disease: null, edges: new Map(), arrived: new Map(), connections: null, connectionsGap: null, gaps: [], version: 0 };
        state.desks.set(id, desk);
      }
      return desk;
    },

    homeDesk: () => (state.homeId ? state.desk(state.homeId) : null),

    nameOf(id) {
      return state.desks.get(id)?.disease?.name || stars.get(id)?.name || labels.get(id) || prettyId(id);
    },

    isEmpty() {
      const desk = state.desks.get(state.focusId || LOOSE);
      return !desk || (!desk.disease && !desk.edges.size && !desk.gaps.length && desk.connections === null);
    },

    chooseHome(id) {
      state.homeId = id;
      changed();
    },

    focusOn(id) {
      if (!id || state.focusId === id) return;
      state.focusId = id;
      if (!state.homeId) state.homeId = id;
      state.desks.delete(LOOSE);
      changed();
    },

    // Any edge the visit has seen, wherever it was laid.
    findEdge(id) {
      for (const desk of state.desks.values()) {
        if (desk.edges.has(id)) return desk.edges.get(id);
        for (const connection of desk.connections || []) {
          if (connection.edge.id === id) return connection.edge;
          const support = connection.support.find(edge => edge.id === id);
          if (support) return support;
        }
      }
      for (const held of state.assets.values()) {
        const edge = [...held.groups, ...held.assets, ...held.studies].find(item => item.id === id);
        if (edge) return edge;
      }
      return null;
    },

    connectionFor(edgeId) {
      for (const desk of state.desks.values()) {
        const found = (desk.connections || []).find(connection => connection.edge.id === edgeId);
        if (found) return found;
      }
      return null;
    },

    // The connection that leads to a star, looking on the desk being read
    // first and the visitor's own desk second.
    connectionTo(nodeId) {
      for (const desk of [state.desks.get(state.focusId), state.desks.get(state.homeId)]) {
        const found = (desk?.connections || []).find(connection => connection.to?.id === nodeId);
        if (found) return found;
      }
      return null;
    },

    edgeTouching(nodeId) {
      const desk = state.desks.get(state.focusId || LOOSE);
      if (!desk) return null;
      return [...desk.edges.values()].find(edge => edge.to?.id === nodeId || edge.from?.id === nodeId) || null;
    },

    reset() {
      state.homeId = null;
      state.focusId = null;
      state.desks.clear();
      state.assets.clear();
      state.withheld = 0;
      changed();
    },
  };

  function changed() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      listeners.forEach(listener => listener(state));
    });
  }

  function remember(...nodes) {
    for (const node of nodes) if (node?.id && node.label) labels.set(node.id, node.label);
  }

  // The same edge object reaches this file twice (once as a card, once in the
  // full answer), so a held-back link is counted the first time only.
  const counted = new WeakSet();
  function holdBack(edge) {
    if (edge && typeof edge === 'object') {
      if (counted.has(edge)) return;
      counted.add(edge);
    }
    state.withheld += 1;
  }

  // Keeps the edges that carry a source and counts the ones that do not.
  function sourced(edges) {
    const kept = [];
    for (const edge of edges || []) {
      if (hasSource(edge)) {
        remember(edge.from, edge.to);
        kept.push(edge);
      } else {
        holdBack(edge);
      }
    }
    return kept;
  }

  function lay(desk, edges) {
    const now = performance.now();
    let added = 0;
    for (const edge of sourced(edges)) {
      if (!desk.edges.has(edge.id)) {
        desk.arrived.set(edge.id, now);
        added += 1;
      }
      desk.edges.set(edge.id, edge);
    }
    if (added) desk.version += 1;
    return added;
  }

  const sameGap = (one, other) => one.question === other.question && JSON.stringify(one.searched) === JSON.stringify(other.searched);

  const stops = [
    on(EVENT.RETRIEVAL_START, ({ tool, args }) => {
      if (tool === 'get_disease' && args?.id) state.focusOn(args.id);
    }),

    on(EVENT.DESK_CARDS, ({ edges }) => {
      lay(state.desk(), edges);
      changed();
    }),

    on(EVENT.DESK_GAP, ({ gap }) => {
      if (!gap) return;
      const desk = state.desk();
      desk.gaps = [gap, ...desk.gaps.filter(old => !sameGap(old, gap))];
      desk.version += 1;
      changed();
    }),

    on(EVENT.LANGUAGE_CHANGE, ({ language }) => {
      if (language?.code) state.language = language.code;
    }),

    on(EVENT.DESK_CLEAR, () => state.reset()),

    // The full answers, for the parts a flat pile of cards cannot carry:
    // the disease's own summary, each connection with what differs, and
    // which disease a group or study belongs to.
    on(EVENT.RETRIEVAL_RESULT, ({ tool, args, result }) => {
      if (!result) return;
      if (tool === 'get_disease' && result.disease?.id) {
        const desk = state.desk(result.disease.id);
        desk.disease = result.disease;
        lay(desk, result.disease.edges);
      } else if (tool === 'find_connections') {
        const id = args?.id || result.from?.id;
        if (!id) return;
        remember(result.from);
        const desk = state.desk(id);
        desk.connections = (result.connections || [])
          .filter(connection => {
            if (hasSource(connection?.edge)) return true;
            holdBack(connection?.edge);
            return false;
          })
          .map(connection => {
            remember(connection.to, connection.edge.from, connection.edge.to);
            return { ...connection, support: sourced(connection.support), differs: connection.differs || [] };
          });
        desk.connectionsGap = result.gap || null;
      } else if (tool === 'find_shared_assets') {
        const id = result.about?.id || args?.id;
        if (!id) return;
        remember(result.about);
        state.assets.set(id, {
          about: result.about || { kind: NODE.DISEASE, id, label: state.nameOf(id) },
          groups: sourced(result.groups),
          assets: sourced(result.assets),
          studies: sourced(result.studies),
          gap: result.gap || null,
        });
      } else {
        return;
      }
      changed();
    }),
  ];

  state.dispose = () => {
    stops.forEach(stop => stop());
    listeners.clear();
  };

  return state;
}

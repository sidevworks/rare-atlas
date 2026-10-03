// Runs a lookup and tells the world and the desk what to show. The voice
// agent and the typed search box both come through here, so a spoken question
// and a typed one animate the same way.
//
// runTool returns two things: `result`, the full server answer, and
// `forAgent`, a short version for the voice agent to speak from. forAgent
// carries edge ids and source names so the agent can say where a fact is from.

import { api } from './api.js';
import { emit, EVENT } from './bus.js';
import { BASIS, NODE } from '../shared/schema.js';

const sourceNames = edge => [...new Set((edge.sources || []).map(source => source.name))];

const brief = edge => ({
  edgeId: edge.id,
  says: edge.statement,
  basis: edge.basis,
  confidence: edge.confidence,
  sources: sourceNames(edge),
  contradicted: Boolean(edge.contradictedBy?.length),
});

const gapForAgent = gap => ({
  found: false,
  searched: gap.searched,
  missing: gap.missing,
  nextSteps: gap.nextSteps,
});

const RUN = {
  async find_disease({ query }) {
    const result = await api.search(query);
    if (result.gap) {
      emit(EVENT.DESK_GAP, { gap: result.gap });
      return { result, forAgent: gapForAgent(result.gap) };
    }
    const first = result.results.find(item => item.kind === NODE.DISEASE);
    if (first) emit(EVENT.ATLAS_FOCUS, { id: first.id });
    return {
      result,
      forAgent: { found: true, matches: result.results.slice(0, 5).map(({ id, kind, name, matched, layer }) => ({ id, kind, name, matched, layer })) },
    };
  },

  async get_disease({ id }) {
    const result = await api.disease(id);
    const { disease } = result;
    emit(EVENT.ATLAS_FOCUS, { id: disease.id });
    emit(EVENT.DESK_CARDS, { edges: disease.edges });
    if (result.gap) emit(EVENT.DESK_GAP, { gap: result.gap });
    return {
      result,
      forAgent: {
        found: true,
        id: disease.id,
        name: disease.name,
        definition: disease.definition || null,
        checkedByHand: disease.layer === 'deep',
        links: disease.edges.slice(0, 12).map(brief),
        moreLinks: Math.max(0, disease.edges.length - 12),
        gap: result.gap ? gapForAgent(result.gap) : null,
      },
    };
  },

  async find_connections({ id, limit = 5 }) {
    const result = await api.connections(id, limit);
    if (result.gap || !result.connections.length) {
      if (result.gap) emit(EVENT.DESK_GAP, { gap: result.gap });
      return { result, forAgent: result.gap ? gapForAgent(result.gap) : { found: false } };
    }
    for (const connection of result.connections) {
      emit(EVENT.ATLAS_PATH, { fromId: result.from.id, toId: connection.to.id, edge: connection.edge });
    }
    emit(EVENT.DESK_CARDS, { edges: result.connections.flatMap(connection => [connection.edge, ...connection.support]) });
    return {
      result,
      forAgent: {
        found: true,
        from: result.from,
        connections: result.connections.map(connection => ({
          to: connection.to,
          score: connection.score,
          link: brief(connection.edge),
          restsOn: connection.support.slice(0, 4).map(brief),
          differs: connection.differs,
          reminder: connection.edge.basis === BASIS.INFERRED ? 'This is a lead to check, not a finding.' : undefined,
        })),
      },
    };
  },

  async find_shared_assets({ id }) {
    const result = await api.assets(id);
    const edges = [...result.groups, ...result.assets, ...result.studies];
    if (edges.length) emit(EVENT.DESK_CARDS, { edges });
    if (result.gap) emit(EVENT.DESK_GAP, { gap: result.gap });
    return {
      result,
      forAgent: edges.length
        ? {
            found: true,
            about: result.about,
            groups: result.groups.map(brief),
            assets: result.assets.map(brief),
            studies: result.studies.map(brief),
            gap: result.gap ? gapForAgent(result.gap) : null,
          }
        : gapForAgent(result.gap || { searched: [], missing: [], nextSteps: [] }),
    };
  },

  async draft_brief({ fromId, toId, language }) {
    const result = await api.brief({ fromId, toId, language });
    emit(EVENT.DESK_BRIEF, { brief: result });
    return {
      result,
      forAgent: {
        drafted: true,
        title: result.title,
        toCheck: result.toCheck,
        citedLinks: result.checked.cited,
        removedForNoSource: result.checked.dropped,
        note: 'The brief is on the desk for the person to read. Summarise it in two sentences; do not read it out.',
      },
    };
  },
};

export async function runTool(name, args = {}) {
  const run = RUN[name];
  if (!run) throw new Error(`The atlas has no lookup called ${name}.`);
  emit(EVENT.RETRIEVAL_START, { tool: name, args });
  try {
    const { result, forAgent } = await run(args);
    emit(EVENT.RETRIEVAL_RESULT, { tool: name, args, result });
    return { result, forAgent };
  } catch (error) {
    emit(EVENT.RETRIEVAL_ERROR, { tool: name, args, message: error.message });
    throw error;
  }
}

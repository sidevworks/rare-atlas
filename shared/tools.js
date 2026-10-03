// The only ways the voice agent can learn anything. The server puts these in
// the voice session; the atlas runs them (src/retrieval.js). The agent has no
// other source of medical fact.

export const TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'find_disease',
    description:
      'Look up a disease, gene or symptom in the atlas by name. Call this first, before saying anything about a condition. Translate the name to English before calling.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The disease, gene or symptom name, in English.' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_disease',
    description:
      'Get what the atlas holds on one disease: its genes, its symptoms and where each of those links comes from.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The disease id returned by find_disease.' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'find_connections',
    description:
      'Find the diseases closest to this one by shared mechanism, genes and symptoms, with the evidence for each link and what differs. A connection is a lead to check, not a finding.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The disease id.' },
        limit: { type: 'integer', description: 'How many to return. Default 5.' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'find_shared_assets',
    description:
      'Find patient groups, registries, natural history studies, trials and research models linked to a disease, each with its source.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The disease id.' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'draft_brief',
    description:
      'Write a one-page, sourced proposal that the person can send to a group or researcher working on a connected disease. Call only after find_connections has shown a supported link between the two.',
    parameters: {
      type: 'object',
      properties: {
        fromId: { type: 'string', description: "The person's own disease id." },
        toId: { type: 'string', description: 'The connected disease id.' },
        language: { type: 'string', description: 'The language the person is speaking, as an ISO 639-1 code.' },
      },
      required: ['fromId', 'toId', 'language'],
    },
  },
]);

export const TOOL_NAMES = Object.freeze(TOOLS.map(tool => tool.name));

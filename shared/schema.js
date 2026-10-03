// The shape of the graph, shared by the loader, the server and the atlas.
// Nothing in the product may show or speak a link that is not an Edge with at
// least one Source.

export const NODE = Object.freeze({
  DISEASE: 'disease',
  GENE: 'gene',
  PHENOTYPE: 'phenotype',
  MECHANISM: 'mechanism',
  PATHWAY: 'pathway',
  GROUP: 'group',
  ASSET: 'asset',
  STUDY: 'study',
  PUBLICATION: 'publication',
  PERSON: 'person',
});

export const EDGE = Object.freeze({
  DISEASE_GENE: 'disease-gene',
  DISEASE_PHENOTYPE: 'disease-phenotype',
  GENE_MECHANISM: 'gene-mechanism',
  GENE_PATHWAY: 'gene-pathway',
  DISEASE_SIMILAR: 'disease-similar',
  GROUP_DISEASE: 'group-disease',
  GROUP_ASSET: 'group-asset',
  STUDY_DISEASE: 'study-disease',
  PUBLICATION_CLAIM: 'publication-claim',
  PERSON_WORKS_ON: 'person-works-on',
});

// Observed: a source states it. Inferred: the atlas worked it out from
// observed links, and it is a lead to check, never a finding.
export const BASIS = Object.freeze({ OBSERVED: 'observed', INFERRED: 'inferred' });

export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

// Wide: loaded in bulk from open files. Deep: checked by hand.
export const LAYER = Object.freeze({ WIDE: 'wide', DEEP: 'deep' });

/**
 * @typedef {Object} Source
 * @property {string} name       The database or publisher, e.g. "HPO annotations".
 * @property {string} [recordId] The record inside it, e.g. "PMID:12345678".
 * @property {string} url        Where a person can read it.
 * @property {string} retrieved  ISO date the loader read it.
 * @property {string} [version]  Release of the source, where it has one.
 */

/**
 * @typedef {Object} NodeRef
 * @property {string} kind  One of NODE.
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef {Object} Edge
 * @property {string} id
 * @property {string} type          One of EDGE.
 * @property {NodeRef} from
 * @property {NodeRef} to
 * @property {string} statement     One plain sentence a family can follow.
 * @property {string} basis         One of BASIS.
 * @property {string} confidence    One of CONFIDENCE.
 * @property {string} confidenceWhy Why that level, in a few words.
 * @property {Source[]} sources     Never empty.
 * @property {Source[]} [contradictedBy]
 * @property {Object} [detail]      Type-specific, e.g. { frequency } or { because }.
 */

/**
 * A disease record, as stored at diseases/{id}.
 * @typedef {Object} Disease
 * @property {string} id            Stable id, e.g. "MONDO_0011073".
 * @property {string} name
 * @property {string[]} synonyms
 * @property {string} [definition]
 * @property {Object<string, string[]>} xrefs  Ids in other vocabularies.
 * @property {string} layer         One of LAYER.
 * @property {string} [clusterId]
 * @property {number[]} position    [x, y, z] in the atlas.
 * @property {Edge[]} edges         Every link that starts at this disease.
 */

/**
 * What a lookup returns when it found nothing it can support.
 * @typedef {Object} Gap
 * @property {string} question      What was asked.
 * @property {string[]} searched    Which sources were looked in.
 * @property {string[]} missing     What evidence would change the answer.
 * @property {string[]} nextSteps   What could be tested or asked next.
 */

// ---------------------------------------------------------------------------
// Server responses. Every route answers with one of these, or { error }.
// ---------------------------------------------------------------------------

/**
 * GET /api/map
 * @typedef {Object} MapResponse
 * @property {{ id: string, label: string, centre: number[], size: number }[]} clusters
 * @property {Array<[string, string, number, number, number, number, number]>} points
 *   [id, name, x, y, z, clusterIndex, deep (1 or 0)]
 *   x, y and z are between -1 and 1; the world scales them to its own space.
 * @property {{ builtAt: string, synthetic: boolean, counts: Object<string, number>, sources: Source[] }} build
 */

/**
 * GET /api/search?q=
 * @typedef {Object} SearchResponse
 * @property {string} query
 * @property {{ id: string, kind: string, name: string, matched: string, layer: string }[]} results
 * @property {Gap} [gap]
 */

/**
 * GET /api/disease?id=
 * @typedef {Object} DiseaseResponse
 * @property {Disease} disease
 * @property {Gap} [gap]
 */

/**
 * GET /api/connections?id=&limit=
 * @typedef {Object} Connection
 * @property {NodeRef} to
 * @property {number} score         0 to 1.
 * @property {Edge} edge            The inferred disease-similar link.
 * @property {Edge[]} support       The observed links on both sides it rests on.
 * @property {string[]} differs     What is not shared and must be checked.
 *
 * @typedef {Object} ConnectionsResponse
 * @property {NodeRef} from
 * @property {Connection[]} connections
 * @property {Gap} [gap]
 */

/**
 * GET /api/assets?id=
 * @typedef {Object} AssetsResponse
 * @property {NodeRef} about
 * @property {Edge[]} groups
 * @property {Edge[]} assets
 * @property {Edge[]} studies
 * @property {Gap} [gap]
 */

/**
 * POST /api/brief  { fromId, toId, language }
 * @typedef {Object} BriefResponse
 * @property {string} language
 * @property {string} title
 * @property {{ text: string, cites: string[] }[]} paragraphs  cites are Edge ids.
 * @property {string[]} toCheck     Questions an expert must answer first.
 * @property {Edge[]} edges         Every edge cited, so the reader can open it.
 * @property {{ cited: number, dropped: number }} checked
 *   dropped counts sentences removed because their citation was not in the graph.
 */

/**
 * POST /api/realtime-session  { language? }
 * @typedef {Object} RealtimeSessionResponse
 * @property {string} clientSecret  Short-lived. Safe to hand to the browser.
 * @property {string} expiresAt
 * @property {string} model
 */

// Travelling the graph: from one disease to its closest neighbours, and to
// the groups, registries and studies around them. The connections route, the
// assets route and the brief all come through here, so they agree on what
// counts as a supported link.

import { BASIS, CONFIDENCE, EDGE, NODE } from '../../shared/schema.js';
import { gap, sourcesLine } from './gap.js';
import { normalise, list } from './text.js';

export const refOf = disease => ({ kind: NODE.DISEASE, id: disease.id, label: disease.name });

// The kinds of link an inferred connection may rest on.
const BIOLOGY = [EDGE.DISEASE_GENE, EDGE.GENE_MECHANISM, EDGE.GENE_PATHWAY, EDGE.DISEASE_PHENOTYPE];
const isBiology = edge => BIOLOGY.includes(edge.type);
const isObserved = edge => edge.basis === BASIS.OBSERVED;

// The end of an edge that says something about the disease: its gene, its
// symptom, its group. For a gene's own links (gene to mechanism, gene to
// pathway) that is where the link points.
function otherEnd(edge, diseaseId) {
  if (edge.from?.id === diseaseId) return edge.to;
  if (edge.to?.id === diseaseId) return edge.from;
  return edge.to;
}

const keyOf = node => (node?.id ? `id:${node.id}` : `label:${normalise(node?.label)}`);
const nodeKey = (edge, diseaseId) => `${edge.type}|${keyOf(otherEnd(edge, diseaseId))}`;

// How often a symptom is seen, as a number, so the commonest can be named
// first. Sources write this as an HPO frequency term, a word, a fraction or
// a percentage. A symptom a source marks as excluded counts as not present.
const FREQUENCY = [
  [/hp:0040285|excluded/i, 0],
  [/hp:0040280|obligate|always/i, 1],
  [/hp:0040281|very frequent/i, 0.9],
  [/hp:0040284|very rare/i, 0.02],
  [/hp:0040282|frequent/i, 0.55],
  [/hp:0040283|occasional/i, 0.17],
];

function frequencyOf(edge) {
  // The loader also stores the number itself; when it is there, use it.
  const value = edge.detail?.frequencyValue;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = edge.detail?.frequency;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return raw > 1 ? raw / 100 : raw;
  const text = String(raw);
  const fraction = /(\d+)\s*(?:\/|of)\s*(\d+)/.exec(text);
  if (fraction && Number(fraction[2]) > 0) return Number(fraction[1]) / Number(fraction[2]);
  const percent = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (percent) return Number(percent[1]) / 100;
  const known = FREQUENCY.find(([pattern]) => pattern.test(text));
  return known ? known[1] : null;
}

const isExcluded = edge => edge.type === EDGE.DISEASE_PHENOTYPE && frequencyOf(edge) === 0;

// How much a link tells you: a symptom seen often in this disease and in few
// others says the most. The loader marks each symptom with how informative it
// is (0 to 1); one marked 0 is too common to tell diseases apart.
const informativeOf = edge => {
  const value = edge.detail?.informative;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const salience = edge => (frequencyOf(edge) ?? 0.4) * (informativeOf(edge) ?? 0.5);

// Every id and label that detail.because mentions, whatever shape the loader
// gave it: edge ids, node ids, labels, node references, or lists of those.
function namesIn(because) {
  const names = new Set();
  const visit = value => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object') Object.values(value).forEach(visit);
    else {
      names.add(String(value));
      names.add(normalise(value));
    }
  };
  visit(because);
  names.delete('');
  return names;
}

const TYPE_ORDER = [EDGE.DISEASE_GENE, EDGE.GENE_MECHANISM, EDGE.GENE_PATHWAY, EDGE.DISEASE_PHENOTYPE];

// The observed links, on both sides, that a connection rests on.
function supportFor(edge, from, to) {
  const names = namesIn(edge.detail?.because);
  const sides = [from, to].map(disease => ({
    disease,
    edges: disease.edges.filter(item => isObserved(item) && !isExcluded(item)),
  }));

  const chosen = new Map();
  const add = (item, disease, side) => {
    if (!chosen.has(item.id)) chosen.set(item.id, { item, key: nodeKey(item, disease.id), side });
  };

  // First, what `because` names outright.
  const namedKeys = new Set();
  sides.forEach(({ disease, edges }, side) => {
    for (const item of edges) {
      const end = otherEnd(item, disease.id);
      const byEdgeId = names.has(item.id);
      const byNode = isBiology(item) && (names.has(end?.id) || (end?.label && names.has(normalise(end.label))));
      if (byEdgeId || byNode) {
        add(item, disease, side);
        if (isBiology(item)) namedKeys.add(nodeKey(item, disease.id));
      }
    }
  });

  // Then the matching link on the other side, in case `because` named only
  // one. If it named nothing we could find, fall back to what the two
  // diseases can be seen to share.
  let wanted = namedKeys;
  if (!chosen.size) {
    const [mine, theirs] = sides.map(({ disease, edges }) =>
      new Set(edges.filter(isBiology).map(item => nodeKey(item, disease.id))));
    wanted = new Set([...mine].filter(key => theirs.has(key)));
  }
  sides.forEach(({ disease, edges }, side) => {
    for (const item of edges) {
      if (isBiology(item) && wanted.has(nodeKey(item, disease.id))) add(item, disease, side);
    }
  });

  // Genes first, then mechanisms, then symptoms with the most telling first.
  // The two sides of one shared fact stay next to each other.
  const rank = type => {
    const position = TYPE_ORDER.indexOf(type);
    return position === -1 ? TYPE_ORDER.length : position;
  };
  const weight = new Map();
  for (const { item, key } of chosen.values()) {
    weight.set(key, Math.max(weight.get(key) ?? 0, salience(item)));
  }
  return [...chosen.values()]
    .sort((a, b) =>
      rank(a.item.type) - rank(b.item.type) ||
      weight.get(b.key) - weight.get(a.key) ||
      a.key.localeCompare(b.key) ||
      a.side - b.side)
    .map(({ item }) => item);
}

const KINDS = [
  [EDGE.DISEASE_GENE, 'Genes', 4],
  [EDGE.GENE_MECHANISM, 'Mechanisms', 3],
  [EDGE.DISEASE_PHENOTYPE, 'Symptoms', 3],
];

// What one disease has on record and the other does not. "Not recorded" is
// not "absent", so the wording says recorded.
function differsBetween(from, to) {
  const lines = [];
  const present = disease => disease.edges.filter(item => isObserved(item) && !isExcluded(item));
  const [mine, theirs] = [present(from), present(to)];
  for (const [type, word, max] of KINDS) {
    const only = (edges, disease, otherEdges, other) => {
      const otherKeys = new Set(otherEdges.filter(item => item.type === type).map(item => nodeKey(item, other.id)));
      const labels = edges
        .filter(item => item.type === type && !otherKeys.has(nodeKey(item, disease.id)) && informativeOf(item) !== 0)
        .sort((a, b) => salience(b) - salience(a))
        .map(item => otherEnd(item, disease.id)?.label)
        .filter(Boolean);
      const unique = [...new Set(labels)];
      if (unique.length) lines.push(`${word} recorded for ${disease.name} but not for ${other.name}: ${list(unique, max)}.`);
    };
    only(mine, from, theirs, to);
    only(theirs, to, mine, from);
  }
  return lines;
}

const CONFIDENCE_SCORE = { [CONFIDENCE.HIGH]: 0.85, [CONFIDENCE.MEDIUM]: 0.6, [CONFIDENCE.LOW]: 0.35 };

function scoreOf(edge) {
  const given = Number(edge.detail?.score ?? edge.detail?.similarity);
  if (Number.isFinite(given) && given >= 0 && given <= 1) return given;
  return CONFIDENCE_SCORE[edge.confidence] ?? 0.5;
}

const similarEdges = disease => disease.edges
  .filter(edge => edge.type === EDGE.DISEASE_SIMILAR)
  .map(edge => ({ edge, target: otherEnd(edge, disease.id) }))
  .filter(({ target }) => target?.id && target.id !== disease.id);

/**
 * One connection, or null when it cannot be shown: the other disease is not
 * in the atlas, or the link is inferred and nothing observed stands under it.
 */
function connectionBetween(edge, from, to) {
  if (!to) return null;
  const support = supportFor(edge, from, to);
  if (edge.basis !== BASIS.OBSERVED && !support.length) return null;
  return {
    to: refOf(to),
    score: Math.round(scoreOf(edge) * 1000) / 1000,
    edge,
    support,
    differs: differsBetween(from, to),
  };
}

/**
 * The closest diseases with links that hold up.
 * @param {import('../../shared/schema.js').Disease} disease
 * @param {(id: string) => Promise<import('../../shared/schema.js').Disease | null>} load
 */
export async function connectionsFor(disease, load, max = 5) {
  const candidates = similarEdges(disease).sort((a, b) => scoreOf(b.edge) - scoreOf(a.edge));
  const connections = [];
  let setAside = 0;
  // Load a few at a time, and only as many as are needed.
  for (let start = 0; start < candidates.length && connections.length < max; start += max) {
    const batch = candidates.slice(start, start + max);
    const targets = await Promise.all(batch.map(({ target }) => load(target.id).catch(() => null)));
    batch.forEach(({ edge }, index) => {
      const connection = connectionBetween(edge, disease, targets[index]);
      if (connection) connections.push(connection);
      else setAside += 1;
    });
  }
  return { connections: connections.slice(0, max), found: candidates.length, setAside };
}

// The link between two named diseases, looked for from either side.
export function linkBetween(from, to) {
  const forward = similarEdges(from).find(({ target }) => target.id === to.id);
  const backward = similarEdges(to).find(({ target }) => target.id === from.id);
  const edge = forward?.edge || backward?.edge;
  return edge ? connectionBetween(edge, from, to) : null;
}

export function connectionsGap(disease, build, { found, setAside }) {
  const sourced = disease.edges.filter(isObserved).length;
  return gap({
    question: `Which diseases are closest to ${disease.name}?`,
    searched: [
      found
        ? `Similarity links recorded for ${disease.name}: ${found} found, none with observed evidence on both sides`
        : `Similarity links recorded for ${disease.name}: none found`,
      `The genes, symptoms and mechanisms recorded for ${disease.name}: ${sourced} sourced links`,
      sourcesLine(build),
    ],
    missing: [
      'A gene, a mechanism or a set of symptoms that a source records for both this disease and another one.',
      setAside ? 'Observed evidence, on both sides, for the inferred links that were set aside.' : '',
    ],
    nextSteps: [
      'If a genetic test or a paper names a gene for this disease, search for that gene: it gives the atlas more to match on.',
      disease.layer === 'deep' ? '' : 'This disease has not been checked by hand yet; a hand check could add links the bulk files miss.',
    ],
  });
}

// ---------------------------------------------------------------------------
// Who is already working on it
// ---------------------------------------------------------------------------

const WORK = { groups: EDGE.GROUP_DISEASE, assets: EDGE.GROUP_ASSET, studies: EDGE.STUDY_DISEASE };

export function workOf(disease) {
  const pick = type => disease.edges.filter(edge => edge.type === type);
  return { groups: pick(WORK.groups), assets: pick(WORK.assets), studies: pick(WORK.studies) };
}

const countWork = work => work.groups.length + work.assets.length + work.studies.length;

/** @returns {Promise<import('../../shared/schema.js').AssetsResponse>} */
export async function assetsFor(disease, load, build) {
  const own = workOf(disease);
  const response = { about: refOf(disease), groups: [...own.groups], assets: [...own.assets], studies: [...own.studies] };
  const seen = new Set([...own.groups, ...own.assets, ...own.studies].map(edge => edge.id));

  // A group working on a connected disease may be the nearest help there is,
  // so those are offered too, each marked as the neighbour's and not this
  // disease's own.
  const { connections } = await connectionsFor(disease, load, 5);
  const neighbours = [];
  let fromNeighbours = 0;
  for (const connection of connections) {
    const neighbour = await load(connection.to.id).catch(() => null);
    if (!neighbour) continue;
    neighbours.push(neighbour.name);
    const theirs = workOf(neighbour);
    for (const slot of Object.keys(WORK)) {
      for (const edge of theirs[slot]) {
        if (seen.has(edge.id)) continue;
        seen.add(edge.id);
        fromNeighbours += 1;
        response[slot].push({ ...edge, detail: { ...edge.detail, neighbour: connection.to, via: connection.edge.id } });
      }
    }
  }

  if (!countWork(own)) {
    response.gap = gap({
      question: `Who is already working on ${disease.name}?`,
      searched: [
        `Patient groups, registries, biobanks, research models and studies linked to ${disease.name} in the atlas: none found`,
        neighbours.length
          ? `The same for its closest connected diseases (${list(neighbours, 5)}): ${fromNeighbours} found`
          : 'Its connected diseases: none with a supported link',
        sourcesLine(build),
      ],
      missing: [
        `A public page from a patient group, a registry or a study register that names ${disease.name}.`,
      ],
      nextSteps: [
        fromNeighbours
          ? 'A group or study for a connected disease is listed. Contacting it is a lead to check, not a match.'
          : 'Look for the closest diseases first: a group working on one of them may be the nearest help.',
        disease.layer === 'deep' ? '' : 'Only the hand-checked part of the atlas holds verified patient-group links so far, and this disease is outside it.',
      ],
    });
  }
  return response;
}

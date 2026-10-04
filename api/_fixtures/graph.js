// A synthetic graph, so the atlas can be built and tested before the loader
// has run. Nothing here describes a real disease, gene, group or study: every
// name starts with "Example", every source says it is synthetic and points at
// example.org, and build.synthetic is true so the interface can say so.
//
// It holds about 600 points in 8 clusters. Twelve of them, "Example disease A"
// to "Example disease L", are fully linked and between them cover each case
// the interface has to draw:
//   A-B  inferred link through one shared gene whose mechanism differs
//   B    a mechanism link that another source contradicts
//   A, B, E  a patient group, a registry / biobank / research model, a study
//   F    no group of its own, so its neighbour E's are offered instead
//   G-H  a link a source states outright (observed, drawn solid)
//   J    a symptom link that another source contradicts
//   L    genes and symptoms but no supported connection: a Gap

import { NODE, EDGE, BASIS, CONFIDENCE, LAYER } from '../../shared/schema.js';

const RETRIEVED = '2026-10-03';
const BUILT_AT = '2026-10-03T00:00:00.000Z';
const TOTAL = 600;
const CLUSTERS = 8;
const LETTERS = 'ABCDEFGHIJKL';

const pad = (number, width) => String(number).padStart(width, '0');
const idOf = index => `EXAMPLE_${pad(index, 4)}`;

// A small seeded generator, so the sky looks the same on every run.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const source = (name, recordId) => ({
  name: `${name} (synthetic)`,
  recordId,
  url: `https://example.org/rare-atlas-fixture/${encodeURIComponent(recordId)}`,
  retrieved: RETRIEVED,
  version: 'fixture-1',
});

const SOURCES = {
  genes: 'Example gene catalogue',
  symptoms: 'Example symptom annotations',
  mechanisms: 'Example mechanism catalogue',
  functional: 'Example functional study',
  pathways: 'Example pathway catalogue',
  classification: 'Example disease classification',
  groups: 'Example group website',
  trials: 'Example trial register',
  papers: 'Example paper index',
  atlas: 'Atlas similarity, fixture',
};

const gene = number => ({ kind: NODE.GENE, id: `EXAMPLE_GENE_${number}`, label: `EXG${number}` });
const symptom = number => ({ kind: NODE.PHENOTYPE, id: `EXAMPLE_SYMPTOM_${pad(number, 2)}`, label: `Example symptom ${number}` });
const MECHANISM = {
  loss: { kind: NODE.MECHANISM, id: 'EXAMPLE_MECHANISM_LOSS', label: 'Example loss-of-function mechanism' },
  gain: { kind: NODE.MECHANISM, id: 'EXAMPLE_MECHANISM_GAIN', label: 'Example gain-of-function mechanism' },
};
const PATHWAY = { kind: NODE.PATHWAY, id: 'EXAMPLE_PATHWAY_1', label: 'Example pathway 1' };

// The twelve linked diseases. Symptoms carry a frequency, as the real
// annotations do.
const SPEC = {
  A: { cluster: 0, deep: true, genes: [1], mechanism: [1, 'loss'], symptoms: [[1, 'Very frequent'], [2, 'Frequent'], [3, 'Occasional'], [4, 'Frequent']], synonyms: ['Example syndrome A', "Maladie d'exemple A"] },
  B: { cluster: 0, deep: true, genes: [1], mechanism: [1, 'gain'], mechanismContradicted: true, symptoms: [[1, 'Frequent'], [2, 'Very frequent'], [5, 'Frequent']], synonyms: ['Example syndrome B', 'Síndrome de ejemplo B'] },
  C: { cluster: 0, deep: true, genes: [2], pathway: 2, symptoms: [[2, 'Frequent'], [3, 'Very frequent'], [6, 'Occasional']], synonyms: ['Example syndrome C'] },
  D: { cluster: 0, deep: true, genes: [2, 3], pathway: 2, symptoms: [[3, 'Frequent'], [6, 'Frequent'], [7, 'Occasional']], synonyms: [] },
  E: { cluster: 1, deep: true, genes: [4], mechanism: [4, 'gain'], symptoms: [[1, 'Occasional'], [5, 'Very frequent'], [8, 'Frequent']], synonyms: ['Example syndrome E'] },
  F: { cluster: 1, deep: true, genes: [4], symptoms: [[5, 'Frequent'], [8, 'Very frequent'], [9, 'Occasional']], synonyms: [] },
  G: { cluster: 1, deep: true, genes: [5], symptoms: [[8, 'Occasional'], [9, 'Frequent'], [10, 'Frequent']], synonyms: ['Example syndrome G'] },
  H: { cluster: 2, deep: false, genes: [5, 6], symptoms: [[9, 'Frequent'], [10, 'Very frequent'], [11, 'Occasional']], synonyms: [] },
  I: { cluster: 2, deep: false, genes: [6], symptoms: [[10, 'Frequent'], [11, 'Frequent']], synonyms: [] },
  J: { cluster: 3, deep: false, genes: [7], symptoms: [[11, 'Occasional'], [12, 'Frequent']], symptomContradicted: 12, synonyms: ['Example syndrome J'] },
  K: { cluster: 3, deep: false, genes: [7], symptoms: [[12, 'Very frequent'], [4, 'Occasional']], synonyms: [] },
  L: { cluster: 4, deep: false, genes: [8], symptoms: [[7, 'Frequent']], synonyms: ['Example syndrome L'] },
};

// [one, other, score, confidence, basis]
const SIMILAR = [
  ['A', 'B', 0.82, CONFIDENCE.MEDIUM, BASIS.INFERRED],
  ['A', 'C', 0.41, CONFIDENCE.LOW, BASIS.INFERRED],
  ['C', 'D', 0.66, CONFIDENCE.MEDIUM, BASIS.INFERRED],
  ['B', 'E', 0.58, CONFIDENCE.MEDIUM, BASIS.INFERRED],
  ['E', 'F', 0.88, CONFIDENCE.HIGH, BASIS.INFERRED],
  ['F', 'G', 0.37, CONFIDENCE.LOW, BASIS.INFERRED],
  ['G', 'H', 0.9, CONFIDENCE.HIGH, BASIS.OBSERVED],
  ['H', 'I', 0.6, CONFIDENCE.MEDIUM, BASIS.INFERRED],
  ['J', 'K', 0.7, CONFIDENCE.MEDIUM, BASIS.INFERRED],
];

// Who is already working on what: a group, something it holds, and a study.
const WORK = {
  A: { group: 'Example Family Foundation A', asset: ['Example registry A', 'patient registry'], study: ['Example natural history study A', 'natural history study'] },
  B: { group: 'Example Alliance B', asset: ['Example biobank B', 'biobank'], study: ['Example trial B', 'clinical trial'] },
  E: { group: 'Example Alliance E', asset: ['Example mouse model E', 'research model'], study: ['Example registry study E', 'registry study'] },
};

const letterIndex = letter => LETTERS.indexOf(letter) + 1;
const nameOf = index => (index <= LETTERS.length ? `Example disease ${LETTERS[index - 1]}` : `Example disease ${pad(index, 3)}`);
const diseaseRef = index => ({ kind: NODE.DISEASE, id: idOf(index), label: nameOf(index) });

function geneEdge(ref, number) {
  const to = gene(number);
  return {
    id: `${ref.id}.gene.${to.label}`,
    type: EDGE.DISEASE_GENE,
    from: ref,
    to,
    statement: `${ref.label} is linked to changes in the example gene ${to.label}.`,
    basis: BASIS.OBSERVED,
    confidence: CONFIDENCE.HIGH,
    confidenceWhy: 'Stated by a curated catalogue (synthetic).',
    sources: [source(SOURCES.genes, `EXAMPLE-GENE:${to.label}:${ref.id}`)],
  };
}

function symptomEdge(ref, number, frequency, contradicted) {
  const to = symptom(number);
  const edge = {
    id: `${ref.id}.symptom.${pad(number, 2)}`,
    type: EDGE.DISEASE_PHENOTYPE,
    from: ref,
    to,
    statement: `${to.label} is recorded in people with ${ref.label} (${frequency.toLowerCase()}).`,
    basis: BASIS.OBSERVED,
    confidence: contradicted ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH,
    confidenceWhy: contradicted ? 'One source records it and another disputes it (synthetic).' : 'Recorded in a symptom annotation file (synthetic).',
    sources: [source(SOURCES.symptoms, `EXAMPLE-ANNOTATION:${ref.id}:${pad(number, 2)}`)],
    detail: { frequency },
  };
  if (contradicted) {
    edge.contradictedBy = [source(SOURCES.papers, `EXAMPLE-PAPER:${ref.id}:no-${pad(number, 2)}`)];
  }
  return edge;
}

function mechanismEdge(ref, number, which, contradicted) {
  const from = gene(number);
  const to = MECHANISM[which];
  const edge = {
    id: `${ref.id}.mechanism.${from.label}.${which}`,
    type: EDGE.GENE_MECHANISM,
    from,
    to,
    statement: `In ${ref.label}, changes in ${from.label} act through an ${to.label.toLowerCase()}.`,
    basis: BASIS.OBSERVED,
    confidence: contradicted ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH,
    confidenceWhy: contradicted ? 'A catalogue states it and a functional study disagrees (synthetic).' : 'Stated by a curated catalogue (synthetic).',
    sources: [source(SOURCES.mechanisms, `EXAMPLE-MECHANISM:${from.label}:${ref.id}`)],
    detail: { disease: ref.id },
  };
  if (contradicted) {
    edge.contradictedBy = [source(SOURCES.functional, `EXAMPLE-FUNCTIONAL:${from.label}:${ref.id}`)];
  }
  return edge;
}

function pathwayEdge(ref, number) {
  const from = gene(number);
  return {
    id: `${ref.id}.pathway.${from.label}`,
    type: EDGE.GENE_PATHWAY,
    from,
    to: PATHWAY,
    statement: `${from.label} takes part in ${PATHWAY.label}.`,
    basis: BASIS.OBSERVED,
    confidence: CONFIDENCE.MEDIUM,
    confidenceWhy: 'Listed in a pathway catalogue (synthetic).',
    sources: [source(SOURCES.pathways, `EXAMPLE-PATHWAY:${from.label}`)],
  };
}

function workEdges(ref, letter, work) {
  const group = { kind: NODE.GROUP, id: `EXAMPLE_GROUP_${letter}`, label: work.group };
  const asset = { kind: NODE.ASSET, id: `EXAMPLE_ASSET_${letter}`, label: work.asset[0] };
  const study = { kind: NODE.STUDY, id: `EXAMPLE_STUDY_${letter}`, label: work.study[0] };
  const edges = [
    {
      id: `${ref.id}.group.${letter}`,
      type: EDGE.GROUP_DISEASE,
      from: group,
      to: ref,
      statement: `${group.label} supports families living with ${ref.label}.`,
      basis: BASIS.OBSERVED,
      confidence: CONFIDENCE.HIGH,
      confidenceWhy: "Stated on the group's own page (synthetic).",
      sources: [source(SOURCES.groups, `EXAMPLE-GROUP:${letter}`)],
    },
    {
      id: `${ref.id}.asset.${letter}`,
      type: EDGE.GROUP_ASSET,
      from: group,
      to: asset,
      statement: `${group.label} runs ${asset.label}, a ${work.asset[1]} for ${ref.label}.`,
      basis: BASIS.OBSERVED,
      confidence: CONFIDENCE.HIGH,
      confidenceWhy: "Stated on the group's own page (synthetic).",
      sources: [source(SOURCES.groups, `EXAMPLE-ASSET:${letter}`)],
      detail: { assetKind: work.asset[1], disease: ref.id },
    },
    {
      id: `${ref.id}.study.${letter}`,
      type: EDGE.STUDY_DISEASE,
      from: study,
      to: ref,
      statement: `${study.label} is a ${work.study[1]} for people with ${ref.label}.`,
      basis: BASIS.OBSERVED,
      confidence: CONFIDENCE.HIGH,
      confidenceWhy: 'Listed in a trial register (synthetic).',
      sources: [source(SOURCES.trials, `EXAMPLE-STUDY:${letter}`)],
      detail: { studyKind: work.study[1], status: 'Recruiting (synthetic)' },
    },
  ];
  // Disease A also carries a paper and a researcher, so those two edge
  // types can be drawn as well.
  if (letter === 'A') {
    edges.push(
      {
        id: `${ref.id}.paper.1`,
        type: EDGE.PUBLICATION_CLAIM,
        from: { kind: NODE.PUBLICATION, id: 'EXAMPLE_PAPER_1', label: 'Example paper 1' },
        to: ref,
        statement: `Example paper 1 describes families living with ${ref.label}.`,
        basis: BASIS.OBSERVED,
        confidence: CONFIDENCE.MEDIUM,
        confidenceWhy: 'A single paper (synthetic).',
        sources: [source(SOURCES.papers, 'EXAMPLE-PAPER:1')],
      },
      {
        id: `${ref.id}.person.1`,
        type: EDGE.PERSON_WORKS_ON,
        from: { kind: NODE.PERSON, id: 'EXAMPLE_PERSON_1', label: 'Example researcher A' },
        to: ref,
        statement: `Example researcher A leads ${study.label}.`,
        basis: BASIS.OBSERVED,
        confidence: CONFIDENCE.MEDIUM,
        confidenceWhy: 'Named on the study record (synthetic).',
        sources: [source(SOURCES.trials, 'EXAMPLE-STUDY:A')],
      },
    );
  }
  return edges;
}

// The observed links two diseases have in common: same gene, same symptom,
// same mechanism. These are what an inferred link is allowed to rest on.
function sharedEdges(mine, theirs) {
  const key = edge => (edge.from.kind === NODE.DISEASE ? edge.to.id : `${edge.type}:${edge.to.id}`);
  const theirKeys = new Set(theirs.map(key));
  const myKeys = new Set(mine.map(key));
  return [...mine.filter(edge => theirKeys.has(key(edge))), ...theirs.filter(edge => myKeys.has(key(edge)))];
}

function similarEdge(ref, otherRef, score, confidence, basis, shared) {
  const inferred = basis === BASIS.INFERRED;
  const sharedLabels = [...new Set(shared.map(edge => edge.to.label))];
  return {
    id: `${ref.id}.similar.${otherRef.id}`,
    type: EDGE.DISEASE_SIMILAR,
    from: ref,
    to: otherRef,
    statement: inferred
      ? `${ref.label} and ${otherRef.label} may be related: both are linked to ${sharedLabels.join(', ')}.`
      : `Example disease classification lists ${ref.label} and ${otherRef.label} in the same group.`,
    basis,
    confidence,
    confidenceWhy: inferred
      ? `Worked out by the atlas from ${shared.length / 2} shared observed links (synthetic).`
      : 'Stated by a classification (synthetic).',
    sources: [
      inferred
        ? source(SOURCES.atlas, `EXAMPLE-SIMILAR:${ref.id}:${otherRef.id}`)
        : source(SOURCES.classification, `EXAMPLE-CLASS:${ref.id}:${otherRef.id}`),
    ],
    detail: inferred ? { score, because: shared.map(edge => edge.id) } : { score },
  };
}

function biologyEdges(ref, spec) {
  const edges = spec.genes.map(number => geneEdge(ref, number));
  if (spec.mechanism) edges.push(mechanismEdge(ref, spec.mechanism[0], spec.mechanism[1], spec.mechanismContradicted));
  if (spec.pathway) edges.push(pathwayEdge(ref, spec.pathway));
  for (const [number, frequency] of spec.symptoms) {
    edges.push(symptomEdge(ref, number, frequency, spec.symptomContradicted === number));
  }
  return edges;
}

function build() {
  const random = seeded(20261003);
  const gaussian = () => {
    const u = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  const round = value => Math.round(Math.max(-0.98, Math.min(0.98, value)) * 10000) / 10000;

  // Eight centres spread evenly over a sphere.
  const centres = Array.from({ length: CLUSTERS }, (_, index) => {
    const y = 1 - ((index + 0.5) / CLUSTERS) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    return [round(Math.cos(angle) * radius * 0.6), round(y * 0.6), round(Math.sin(angle) * radius * 0.6)];
  });

  const clusterOf = index => (index <= LETTERS.length ? SPEC[LETTERS[index - 1]].cluster : index % CLUSTERS);
  const deepOf = index => index <= LETTERS.length && SPEC[LETTERS[index - 1]].deep;

  const points = [];
  const positions = new Map();
  const sizes = new Array(CLUSTERS).fill(0);
  for (let index = 1; index <= TOTAL; index += 1) {
    const cluster = clusterOf(index);
    const position = centres[cluster].map(value => round(value + gaussian() * 0.13));
    positions.set(idOf(index), position);
    sizes[cluster] += 1;
    points.push([idOf(index), nameOf(index), ...position, cluster, deepOf(index) ? 1 : 0]);
  }

  const clusters = centres.map((centre, index) => ({
    id: `example-cluster-${index + 1}`,
    label: `Example cluster ${index + 1}`,
    centre,
    size: sizes[index],
  }));

  // The twelve, built in two passes: their own biology first, then the
  // links between them, which point at the biology edges they rest on.
  const diseases = new Map();
  const biology = new Map();
  for (const letter of LETTERS) {
    const ref = diseaseRef(letterIndex(letter));
    biology.set(letter, biologyEdges(ref, SPEC[letter]));
  }
  for (const letter of LETTERS) {
    const index = letterIndex(letter);
    const ref = diseaseRef(index);
    const spec = SPEC[letter];
    const edges = [...biology.get(letter)];
    for (const [one, other, score, confidence, basis] of SIMILAR) {
      if (one !== letter && other !== letter) continue;
      const otherLetter = one === letter ? other : one;
      const shared = sharedEdges(biology.get(letter), biology.get(otherLetter));
      edges.push(similarEdge(ref, diseaseRef(letterIndex(otherLetter)), score, confidence, basis, shared));
    }
    if (WORK[letter]) edges.push(...workEdges(ref, letter, WORK[letter]));
    diseases.set(ref.id, {
      id: ref.id,
      name: ref.label,
      synonyms: spec.synonyms,
      definition: 'A synthetic record used to build and test the atlas. It describes no real condition.',
      xrefs: { EXAMPLE: [`EX:${pad(index, 4)}`] },
      layer: spec.deep ? LAYER.DEEP : LAYER.WIDE,
      clusterId: clusters[spec.cluster].id,
      position: positions.get(ref.id),
      edges,
    });
  }

  // The other points are plain wide-layer records: a gene and two symptoms,
  // no links to other diseases.
  const filler = index => {
    const ref = diseaseRef(index);
    const first = 20 + (index % 15);
    const second = 20 + ((index * 7 + 3) % 15);
    const symptoms = first === second ? [first] : [first, second];
    return {
      id: ref.id,
      name: ref.label,
      synonyms: [],
      definition: 'A synthetic record used to build and test the atlas. It describes no real condition.',
      xrefs: { EXAMPLE: [`EX:${pad(index, 4)}`] },
      layer: LAYER.WIDE,
      clusterId: clusters[clusterOf(index)].id,
      position: positions.get(ref.id),
      edges: [geneEdge(ref, 100 + (index % 40)), ...symptoms.map(number => symptomEdge(ref, number, 'Frequent', false))],
    };
  };

  const disease = id => {
    if (diseases.has(id)) return diseases.get(id);
    const match = /^EXAMPLE_(\d{4})$/.exec(id);
    const index = match ? Number(match[1]) : 0;
    return index > LETTERS.length && index <= TOTAL ? filler(index) : null;
  };

  const search = [];
  const counts = { diseases: TOTAL, deep: 0, wide: 0, clusters: CLUSTERS, edges: 0, genes: 0, symptoms: 0, groups: Object.keys(WORK).length, studies: Object.keys(WORK).length };
  const genes = new Set();
  const symptoms = new Set();
  for (let index = 1; index <= TOTAL; index += 1) {
    const record = disease(idOf(index));
    const symbols = record.edges.filter(edge => edge.type === EDGE.DISEASE_GENE).map(edge => edge.to.label);
    search.push([record.id, record.name, record.synonyms, symbols, record.layer]);
    counts[record.layer === LAYER.DEEP ? 'deep' : 'wide'] += 1;
    counts.edges += record.edges.length;
    symbols.forEach(symbol => genes.add(symbol));
    record.edges.filter(edge => edge.type === EDGE.DISEASE_PHENOTYPE).forEach(edge => symptoms.add(edge.to.id));
  }
  counts.genes = genes.size;
  counts.symptoms = symptoms.size;

  const buildInfo = {
    builtAt: BUILT_AT,
    synthetic: true,
    counts,
    sources: Object.entries(SOURCES).map(([key, name]) => source(name, `EXAMPLE-SOURCE:${key}`)),
  };

  return { map: { clusters, points, build: buildInfo }, search, build: buildInfo, disease };
}

let built = null;

export function fixture() {
  if (!built) built = build();
  return built;
}

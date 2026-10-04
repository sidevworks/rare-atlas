// Turns reconciled rows into observed links: disease to symptom and disease
// to gene. Each link keeps the source of every row it was merged from.

import { BASIS, CONFIDENCE, EDGE, NODE } from '../../shared/schema.js';
import { listInWords, lowerFirst, plural } from '../lib/text.js';
import { comparisonWeight, frequencyInWords, frequencyValue, pickFrequency } from './frequency.js';

export const SOURCE_NAME = Object.freeze({ HPO: 'HPO annotations', ORPHADATA: 'Orphadata', MONDO: 'Mondo Disease Ontology' });

// hpo.jax.org is a single-page site: these addresses open the disease page in
// a browser, though the server answers plain HTTP clients with a 404 status.
export const hpoDiseasePage = id => `https://hpo.jax.org/browse/disease/${id}`;
export const orphanetPage = code => `https://www.orpha.net/en/disease/detail/${code}`;
export const pubmedPage = pmid => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
export const mondoPage = id => `https://monarchinitiative.org/${id}`;

export const diseaseKey = mondoId => mondoId.replace(':', '_');
export const diseaseRef = record => ({ kind: NODE.DISEASE, id: diseaseKey(record.term.id), label: record.term.name });

const EVIDENCE_RANK = { PCS: 3, TAS: 2, IEA: 1 };
const EVIDENCE_WORDS = {
  PCS: 'Published clinical study',
  TAS: 'Curated statement from the literature',
  IEA: 'Electronic annotation, not individually reviewed',
};

const dedupe = sources => {
  const seen = new Set();
  return sources.filter(source => {
    const key = `${source.name}|${source.recordId}|${source.annotates || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// One source per reference a row cites. A paper is linked at PubMed; anything
// else is linked at the HPO page of the record the row annotates.
function phenotypeRowSources(row, stamp) {
  const references = row.references.length ? row.references : [row.diseaseId];
  return references.map(reference => {
    const paper = reference.startsWith('PMID:');
    const web = /^https?:\/\//.test(reference);
    return {
      name: SOURCE_NAME.HPO,
      recordId: web ? row.diseaseId : reference,
      url: paper ? pubmedPage(reference.slice(5)) : hpoDiseasePage(row.diseaseId),
      retrieved: stamp.hpoa.retrieved,
      version: stamp.hpoa.version,
      annotates: row.diseaseId,
      evidenceCode: row.evidence || undefined,
      frequency: row.frequency || undefined,
      cites: web ? reference : undefined,
    };
  });
}

function phenotypeConfidence({ best, frequency, origins, contradicted }) {
  const evidence = EVIDENCE_WORDS[best] || 'Evidence type not stated';
  if (contradicted) {
    return { level: CONFIDENCE.LOW, why: `${evidence}, but another record lists this symptom as absent.` };
  }
  if (best === 'IEA' || !EVIDENCE_RANK[best]) {
    return { level: CONFIDENCE.LOW, why: `${evidence}.` };
  }
  if (frequency?.kind === 'fraction' && frequency.of <= 2) {
    return { level: CONFIDENCE.LOW, why: `${evidence}, but it describes only ${plural(frequency.of, 'person', 'people')}.` };
  }
  const bothOrigins = origins.has('OMIM') && origins.has('ORPHA');
  const common = frequency && frequency.value >= 0.3 && (frequency.kind !== 'fraction' || frequency.of >= 5);
  if (bothOrigins || common) {
    const reasons = [];
    if (common) reasons.push(`recorded in ${frequencyInWords(frequency)}`);
    if (bothOrigins) reasons.push('listed by both the OMIM-based and the Orphanet-based record');
    return { level: CONFIDENCE.HIGH, why: `${evidence}; ${reasons.join('; ')}.` };
  }
  return {
    level: CONFIDENCE.MEDIUM,
    why: frequency ? `${evidence}; recorded in ${frequencyInWords(frequency)}.` : `${evidence}; how often it occurs is not recorded.`,
  };
}

function phenotypeStatement(shown, disease, frequency) {
  if (!frequency) return `${shown} is a recorded feature of ${disease}; how often it occurs is not recorded.`;
  if (frequency.kind === 'fraction') {
    return frequency.of === 1
      ? `${shown} was seen in the one person with ${disease} described in the report cited.`
      : `${shown} was seen in ${frequency.n} of ${frequency.of} people with ${disease} in the report cited.`;
  }
  if (frequency.kind === 'percent') return `${shown} is recorded in about ${frequency.percent}% of people with ${disease}.`;
  return frequency.value === 1
    ? `${shown} is recorded as always present in ${disease} (${frequency.range}).`
    : `${shown} is recorded as ${frequency.label} in ${disease} (${frequency.range}).`;
}

/**
 * @returns {{ edges: Object[], weights: Map<string, number> }} weights: how much each symptom counts when diseases are compared.
 */
export function phenotypeEdges(record, hpo, stamp) {
  const from = diseaseRef(record);
  const edges = [];
  const weights = new Map();

  for (const [hpoId, slot] of record.phenotypes) {
    const term = hpo.terms.get(hpoId);
    const frequency = pickFrequency(slot.present.map(row => row.parsed));
    const best = slot.present.map(row => row.evidence).sort((a, b) => (EVIDENCE_RANK[b] || 0) - (EVIDENCE_RANK[a] || 0))[0];
    const origins = new Set(slot.present.map(row => row.diseaseId.split(':')[0]));
    const contradicted = slot.absent.length > 0;
    const confidence = phenotypeConfidence({ best, frequency, origins, contradicted });
    const shown = term.plain === term.name ? term.name : `${term.plain} (${term.name})`;

    const edge = {
      id: `${from.id}--phenotype--${hpoId.replace(':', '_')}`,
      type: EDGE.DISEASE_PHENOTYPE,
      from,
      to: { kind: NODE.PHENOTYPE, id: hpoId, label: term.name },
      statement: phenotypeStatement(shown, record.term.name, frequency),
      basis: BASIS.OBSERVED,
      confidence: confidence.level,
      confidenceWhy: confidence.why,
      sources: dedupe(slot.present.flatMap(row => phenotypeRowSources(row, stamp))),
      detail: {
        frequency: frequencyInWords(frequency),
        frequencyValue: frequencyValue(frequency),
        evidenceCode: best || null,
        informative: 0,
        plain: term.plain,
      },
    };
    if (contradicted) edge.contradictedBy = dedupe(slot.absent.flatMap(row => phenotypeRowSources(row, stamp)));
    edges.push(edge);
    weights.set(hpoId, comparisonWeight(frequency));
  }
  return { edges, weights };
}

// How Orphanet and HPO word a gene link, strongest first, with the plain
// sentence each becomes. `role` says what the link may be used for: only
// causes and risk factors make two diseases look alike.
const GENE_TYPES = [
  {
    match: 'Disease-causing germline mutation(s) (loss of function) in',
    role: 'cause',
    say: (gene, disease) => `Changes in the ${gene} gene that stop it working (loss of function) are recorded as a cause of ${disease}.`,
  },
  {
    match: 'Disease-causing germline mutation(s) (gain of function) in',
    role: 'cause',
    say: (gene, disease) => `Changes in the ${gene} gene that make it more active or give it a new effect (gain of function) are recorded as a cause of ${disease}.`,
  },
  {
    match: 'Disease-causing germline mutation(s) in',
    role: 'cause',
    say: (gene, disease) => `Changes in the ${gene} gene are recorded as a cause of ${disease}.`,
  },
  {
    match: 'Disease-causing somatic mutation(s) in',
    role: 'cause',
    say: (gene, disease) => `Changes in the ${gene} gene that arise in some of the body's cells and are not inherited (somatic) are recorded as a cause of ${disease}.`,
  },
  {
    match: 'MENDELIAN',
    role: 'cause',
    say: (gene, disease) => `Changes in the ${gene} gene are recorded as a cause of ${disease}.`,
  },
  {
    match: 'Major susceptibility factor in',
    role: 'risk',
    say: (gene, disease) => `Changes in the ${gene} gene are recorded as a major susceptibility factor for ${disease}: they raise the risk rather than cause it outright.`,
  },
  {
    match: 'POLYGENIC',
    role: 'risk',
    say: (gene, disease) => `The ${gene} gene is recorded as contributing to the risk of ${disease} together with other factors (a polygenic link).`,
  },
  {
    match: 'Modifying germline mutation in',
    role: 'modifier',
    say: (gene, disease) => `Changes in the ${gene} gene are recorded as modifying how ${disease} shows itself.`,
  },
  {
    match: 'Role in the phenotype of',
    role: 'modifier',
    say: (gene, disease) => `The ${gene} gene is recorded as playing a part in the features of ${disease}.`,
  },
  {
    match: 'Part of a fusion gene in',
    role: 'other',
    say: (gene, disease) => `The ${gene} gene is recorded as part of a fusion gene found in ${disease}.`,
  },
  {
    match: 'Candidate gene tested in',
    role: 'candidate',
    say: (gene, disease) => `The ${gene} gene is recorded as a candidate that has been tested in ${disease}; a causal link is not established.`,
  },
  {
    match: 'Biomarker tested in',
    role: 'candidate',
    say: (gene, disease) => `The ${gene} gene is recorded as a biomarker tested in ${disease}.`,
  },
];
const UNSTATED = {
  match: 'UNKNOWN',
  role: 'unknown',
  say: (gene, disease) => `The ${gene} gene is recorded as linked to ${disease}; the kind of link is not stated.`,
};
const typeRank = type => {
  const index = GENE_TYPES.findIndex(known => known.match === type);
  return index < 0 ? GENE_TYPES.length : index;
};

const roleOf = type => (GENE_TYPES.find(known => known.match === type) || UNSTATED).role;

function geneConfidence({ kind, slot, omimBased }) {
  // Only Orphanet rows that say the same kind of thing as the sentence count
  // towards it: an assessed "candidate" row does not back up a "cause".
  const agreeing = slot.orphaRows.filter(row => roleOf(row.type) === kind.role);
  const assessed = agreeing.filter(row => row.status === 'Assessed');
  const papers = new Set(assessed.flatMap(row => row.pmids)).size;
  if (kind.role === 'candidate') {
    return { level: CONFIDENCE.LOW, why: 'Recorded by Orphanet only as tested, not as an established link.' };
  }
  if (kind.role === 'unknown') {
    return { level: CONFIDENCE.LOW, why: 'Listed in one gene table with no kind of link and no publication.' };
  }
  if (agreeing.length && !assessed.length && !omimBased) {
    return { level: CONFIDENCE.LOW, why: 'Orphanet lists this link as not yet assessed.' };
  }
  if (kind.role === 'cause') {
    if (assessed.length && papers) {
      return {
        level: CONFIDENCE.HIGH,
        why: `Assessed by Orphanet with ${plural(papers, 'publication', 'publications')}${omimBased ? ', and also in the OMIM-based gene table' : ''}.`,
      };
    }
    if (omimBased && agreeing.length) {
      return { level: CONFIDENCE.HIGH, why: 'Listed by both the OMIM-based gene table and Orphanet.' };
    }
    return {
      level: CONFIDENCE.MEDIUM,
      why: omimBased ? 'Listed in the OMIM-based gene table only; no publication attached to the row.' : 'Listed by Orphanet without a publication.',
    };
  }
  if (assessed.length && papers) {
    return { level: CONFIDENCE.MEDIUM, why: `Assessed by Orphanet with ${plural(papers, 'publication', 'publications')}; the gene is not recorded as a direct cause.` };
  }
  return { level: CONFIDENCE.LOW, why: 'A contributing or modifying link from one table, with no publication attached.' };
}

/**
 * @returns {{ edges: Object[], symbols: string[], comparable: string[] }} comparable: genes that may make two diseases look alike.
 */
export function geneEdges(record, geneIds, stamp) {
  const from = diseaseRef(record);
  const edges = [];
  const comparable = [];

  for (const [symbol, slot] of record.genes) {
    const types = [...slot.orphaRows.map(row => row.type), ...slot.hpoRows.map(row => row.type)].filter(Boolean);
    const strongest = types.sort((a, b) => typeRank(a) - typeRank(b))[0];
    const kind = GENE_TYPES.find(known => known.match === strongest) || UNSTATED;
    // HPO copies its ORPHA rows from Orphadata, so only its OMIM rows are a
    // second, separate origin.
    const omimBased = slot.hpoRows.some(row => row.diseaseId.startsWith('OMIM:') && roleOf(row.type) === kind.role);
    const confidence = geneConfidence({ kind, slot, omimBased });

    const sources = [];
    for (const row of slot.orphaRows) {
      sources.push({
        name: SOURCE_NAME.ORPHADATA,
        recordId: `ORPHA:${row.orphaCode}`,
        url: orphanetPage(row.orphaCode),
        retrieved: stamp.orphaGenes.retrieved,
        version: stamp.orphaGenes.version,
        associationType: row.type || undefined,
        status: row.status || undefined,
      });
      for (const pmid of row.pmids) {
        sources.push({
          name: SOURCE_NAME.ORPHADATA,
          recordId: `PMID:${pmid}`,
          url: pubmedPage(pmid),
          retrieved: stamp.orphaGenes.retrieved,
          version: stamp.orphaGenes.version,
          annotates: `ORPHA:${row.orphaCode}`,
        });
      }
    }
    for (const row of slot.hpoRows) {
      sources.push({
        name: SOURCE_NAME.HPO,
        recordId: row.diseaseId,
        url: hpoDiseasePage(row.diseaseId),
        retrieved: stamp.hpoGenes.retrieved,
        version: stamp.hpoGenes.version,
        associationType: row.type,
        origin: row.origin || undefined,
      });
    }

    const ids = geneIds.get(symbol) || {};
    edges.push({
      id: `${from.id}--gene--${symbol.replace(/[^A-Za-z0-9.-]/g, '_')}`,
      type: EDGE.DISEASE_GENE,
      from,
      to: { kind: NODE.GENE, id: ids.hgncId || ids.ncbiGeneId || symbol, label: symbol },
      statement: kind.say(symbol, record.term.name),
      basis: BASIS.OBSERVED,
      confidence: confidence.level,
      confidenceWhy: confidence.why,
      sources: dedupe(sources),
      detail: {
        symbol,
        associationType: strongest || 'UNKNOWN',
        role: kind.role,
        hgncId: ids.hgncId || null,
        ncbiGeneId: ids.ncbiGeneId || null,
      },
    });
    if (kind.role === 'cause' || kind.role === 'risk') comparable.push(symbol);
  }

  const order = { [CONFIDENCE.HIGH]: 0, [CONFIDENCE.MEDIUM]: 1, [CONFIDENCE.LOW]: 2 };
  edges.sort((a, b) => order[a.confidence] - order[b.confidence] || a.to.label.localeCompare(b.to.label));
  return { edges, symbols: edges.map(edge => edge.to.label), comparable };
}

// The source record that best stands for a disease: the one most rows came
// from. Used to cite both sides of a link the atlas worked out itself.
export function mainSource(record, stamp) {
  let best = null;
  for (const [externalId, tally] of record.annotated) {
    const rows = tally.hpoRows + tally.orphadataRows;
    if (!best || rows > best.rows || (rows === best.rows && externalId < best.externalId)) best = { externalId, rows, tally };
  }
  if (!best) return null;
  if (best.tally.hpoRows) {
    return {
      name: SOURCE_NAME.HPO,
      recordId: best.externalId,
      url: hpoDiseasePage(best.externalId),
      retrieved: stamp.hpoa.retrieved,
      version: stamp.hpoa.version,
    };
  }
  return {
    name: SOURCE_NAME.ORPHADATA,
    recordId: best.externalId,
    url: orphanetPage(best.externalId.replace('ORPHA:', '')),
    retrieved: stamp.orphaGenes.retrieved,
    version: stamp.orphaGenes.version,
  };
}

const SIMILAR_METHOD =
  'Weighted overlap of recorded symptoms (HPO terms and their parent terms, rarer symptoms counting for more) combined with shared causal or risk genes. Computed by the Rare Atlas loader.';

/**
 * An inferred link between two diseases. Never more than medium confidence,
 * and the sentence always says it is a lead to check.
 */
export function similarEdge(from, to, neighbour, hpo, stamp) {
  const fromRef = diseaseRef(from.record);
  const toRef = diseaseRef(to.record);
  const { sharedCount, shared, genes } = neighbour;

  const parts = [];
  if (sharedCount) {
    const words = shared.slice(0, 3).map(id => lowerFirst(hpo.terms.get(id).plain));
    parts.push(`${plural(sharedCount, 'recorded symptom', 'recorded symptoms')} (${sharedCount > words.length ? 'such as ' : ''}${listInWords(words)})`);
  }
  if (genes.length) {
    parts.push(genes.length === 1 ? `the gene ${genes[0]}` : `the genes ${listInWords(genes.slice(0, 3))}${genes.length > 3 ? ' and others' : ''}`);
  }

  // Medium at most, and only for a shared gene backed by shared symptoms or a
  // symptom overlap in the top fifth of all neighbour links.
  const strong = (genes.length > 0 && sharedCount >= 2) || (neighbour.phenotypeScore >= 0.3 && sharedCount >= 6);
  const thin = !genes.length && sharedCount < 4;
  const basedOn = [];
  if (genes.length) basedOn.push(plural(genes.length, 'shared gene', 'shared genes'));
  if (sharedCount) basedOn.push(plural(sharedCount, 'shared symptom', 'shared symptoms'));

  return {
    id: `${fromRef.id}--similar--${toRef.id}`,
    type: EDGE.DISEASE_SIMILAR,
    from: fromRef,
    to: toRef,
    statement: `A lead to check, not a finding: ${from.record.term.name} and ${to.record.term.name} share ${parts.join(' and ')}.`,
    basis: BASIS.INFERRED,
    confidence: strong ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    confidenceWhy: `Worked out by the atlas from ${basedOn.join(' and ')}${thin ? ', a thin overlap' : ''}; no source states this link and no expert has reviewed it.`,
    sources: dedupe([mainSource(from.record, stamp), mainSource(to.record, stamp)].filter(Boolean)),
    detail: {
      score: neighbour.score,
      because: {
        phenotypes: shared.map(id => ({ id, label: hpo.terms.get(id).name })),
        genes,
      },
      sharedSymptoms: sharedCount,
      symptomScore: neighbour.phenotypeScore,
      geneScore: neighbour.geneScore,
      method: SIMILAR_METHOD,
    },
  };
}

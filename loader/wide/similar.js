// The atlas's own work: for each disease, the eight diseases most like it.
//
// How two diseases are compared
//   Symptoms. Each disease's symptoms are widened to include their parent
//   terms in HPO, so "Infantile spasms" on one side still meets "Epileptic
//   spasm" on the other. A symptom counts for more the fewer diseases have it
//   (its information content) and the more often it is seen in the disease.
//   The symptom score is the weighted overlap of the two sets divided by
//   their weighted union (0 to 1).
//   Genes. The same overlap-over-union on the genes recorded as a cause or a
//   risk factor, weighted by how few diseases each gene is linked to.
//   Score = 1 - (1 - symptoms) x (1 - GENE_SHARE x genes).
//
// A neighbour is only kept when the two diseases share at least two symptoms
// recorded word for word on both, or at least one gene, so every link can be
// traced to observed links on both sides.
//
// Speed: an inverted index from symptom to diseases means a disease is only
// compared with diseases it shares something with, never with all of them.

import { PHENOTYPE_ROOT } from './hpo.js';
import { round } from '../lib/text.js';

const GENE_SHARE = 0.35;
// Symptoms found in more than this share of diseases say too little to be
// worth comparing on, and would make the index slow.
const MAX_SHARE_OF_DISEASES = 0.2;
const MIN_SCORE = 0.04;
const MIN_SHARED_SYMPTOMS = 2;
const LOOK_AT = 60;
const LIST_SHARED = 8;

/**
 * @param {{ id: string, weights: Map<string, number>, genes: string[] }[]} items  in a fixed order
 * @returns {{
 *   neighbours: { index: number, score: number, phenotypeScore: number, geneScore: number, shared: string[], sharedCount: number, genes: string[] }[][],
 *   informative: Map<string, { informative: number, sharedBy: number }>,
 *   features: { terms: Int32Array, weights: Float32Array }[],
 *   termIds: string[], termShare: Float64Array, withSymptoms: number,
 * }}
 */
export function findNeighbours(items, hpo, { k = 8 } = {}) {
  const count = items.length;
  const termIndex = new Map();
  const termIds = [];
  const indexOf = id => {
    let index = termIndex.get(id);
    if (index === undefined) {
      index = termIds.length;
      termIndex.set(id, index);
      termIds.push(id);
    }
    return index;
  };

  // Each disease's symptoms plus their parents; a parent takes the highest
  // frequency among the symptoms below it.
  const widened = items.map(item => {
    const terms = new Map();
    for (const [hpoId, frequency] of item.weights) {
      for (const above of hpo.ancestors(hpoId)) {
        if (above === PHENOTYPE_ROOT || above === 'HP:0000001') continue;
        const index = indexOf(above);
        if ((terms.get(index) || 0) < frequency) terms.set(index, frequency);
      }
    }
    return terms;
  });

  const termCount = termIds.length;
  const diseasesWith = new Int32Array(termCount);
  let withSymptoms = 0;
  for (const terms of widened) {
    if (terms.size) withSymptoms += 1;
    for (const index of terms.keys()) diseasesWith[index] += 1;
  }
  const scale = Math.log(Math.max(2, withSymptoms));
  const content = new Float64Array(termCount);
  const termShare = new Float64Array(termCount);
  for (let index = 0; index < termCount; index += 1) {
    content[index] = Math.log(withSymptoms / diseasesWith[index]);
    termShare[index] = diseasesWith[index] / withSymptoms;
  }

  const informative = new Map();
  termIds.forEach((id, index) => {
    informative.set(id, { informative: round(content[index] / scale), sharedBy: diseasesWith[index] });
  });

  const maxDiseases = Math.floor(withSymptoms * MAX_SHARE_OF_DISEASES);
  const features = [];
  const totals = new Float64Array(count);
  const postingSize = new Int32Array(termCount);
  widened.forEach((terms, at) => {
    const kept = [...terms].filter(([index]) => diseasesWith[index] <= maxDiseases && content[index] > 0).sort((a, b) => a[0] - b[0]);
    const feature = { terms: new Int32Array(kept.length), weights: new Float32Array(kept.length) };
    kept.forEach(([index, frequency], slot) => {
      feature.terms[slot] = index;
      feature.weights[slot] = content[index] * frequency;
      totals[at] += feature.weights[slot];
      postingSize[index] += 1;
    });
    features.push(feature);
  });

  const postDisease = Array.from({ length: termCount }, (_, index) => new Int32Array(postingSize[index]));
  const postWeight = Array.from({ length: termCount }, (_, index) => new Float32Array(postingSize[index]));
  const filled = new Int32Array(termCount);
  features.forEach((feature, at) => {
    for (let slot = 0; slot < feature.terms.length; slot += 1) {
      const index = feature.terms[slot];
      postDisease[index][filled[index]] = at;
      postWeight[index][filled[index]] = feature.weights[slot];
      filled[index] += 1;
    }
  });

  // Genes, the same way.
  const geneDiseases = new Map();
  let withGenes = 0;
  items.forEach((item, at) => {
    if (item.genes.length) withGenes += 1;
    for (const symbol of item.genes) {
      if (!geneDiseases.has(symbol)) geneDiseases.set(symbol, []);
      geneDiseases.get(symbol).push(at);
    }
  });
  const geneContent = symbol => Math.log((withGenes + 1) / geneDiseases.get(symbol).length);
  const geneTotals = new Float64Array(count);
  items.forEach((item, at) => {
    for (const symbol of item.genes) geneTotals[at] += geneContent(symbol);
  });

  const overlap = new Float64Array(count);
  const geneOverlap = new Float64Array(count);
  const seen = new Uint8Array(count);
  const neighbours = [];

  for (let at = 0; at < count; at += 1) {
    const feature = features[at];
    const touched = [];
    for (let slot = 0; slot < feature.terms.length; slot += 1) {
      const index = feature.terms[slot];
      const mine = feature.weights[slot];
      const diseases = postDisease[index];
      const weights = postWeight[index];
      for (let entry = 0; entry < diseases.length; entry += 1) {
        const other = diseases[entry];
        if (!seen[other]) {
          seen[other] = 1;
          touched.push(other);
        }
        overlap[other] += mine < weights[entry] ? mine : weights[entry];
      }
    }
    for (const symbol of items[at].genes) {
      const value = geneContent(symbol);
      for (const other of geneDiseases.get(symbol)) {
        if (!seen[other]) {
          seen[other] = 1;
          touched.push(other);
        }
        geneOverlap[other] += value;
      }
    }

    const candidates = [];
    for (const other of touched) {
      if (other !== at) {
        const union = totals[at] + totals[other] - overlap[other];
        const phenotypeScore = union > 0 ? overlap[other] / union : 0;
        const geneUnion = geneTotals[at] + geneTotals[other] - geneOverlap[other];
        const geneScore = geneOverlap[other] > 0 && geneUnion > 0 ? geneOverlap[other] / geneUnion : 0;
        const score = 1 - (1 - phenotypeScore) * (1 - GENE_SHARE * geneScore);
        if (score >= MIN_SCORE) candidates.push({ index: other, score, phenotypeScore, geneScore });
      }
      overlap[other] = 0;
      geneOverlap[other] = 0;
      seen[other] = 0;
    }
    candidates.sort((a, b) => b.score - a.score || (items[a.index].id < items[b.index].id ? -1 : 1));

    const chosen = [];
    const mine = items[at];
    for (const candidate of candidates.slice(0, LOOK_AT)) {
      const theirs = items[candidate.index];
      const shared = [];
      for (const [hpoId, frequency] of mine.weights) {
        const other = theirs.weights.get(hpoId);
        if (other === undefined) continue;
        shared.push({ id: hpoId, weight: content[termIndex.get(hpoId)] * Math.min(frequency, other) });
      }
      const genes = mine.genes.filter(symbol => theirs.genes.includes(symbol)).sort();
      if (shared.length < MIN_SHARED_SYMPTOMS && !genes.length) continue;
      shared.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));
      chosen.push({
        index: candidate.index,
        score: round(candidate.score),
        phenotypeScore: round(candidate.phenotypeScore),
        geneScore: round(candidate.geneScore),
        shared: shared.slice(0, LIST_SHARED).map(item => item.id),
        sharedCount: shared.length,
        genes,
      });
      if (chosen.length === k) break;
    }
    neighbours.push(chosen);
  }

  return { neighbours, informative, features, termIds, termShare, withSymptoms };
}

// The hand-checked layer, written by loader/deep to data/build/deep.json:
//   { generatedAt, sources, diseases: { [id]: { edges, definition?, synonyms? } } }
// It is merged over the wide layer: a deep edge replaces a wide edge with the
// same id, and the disease is marked as checked by hand.

import fs from 'node:fs';
import { LAYER, NODE } from '../../shared/schema.js';
import { DEEP_FILE } from './paths.js';

const asKey = id => String(id).replace(':', '_');
const asCurie = id => String(id).replace('_', ':');

export function readDeep() {
  if (!fs.existsSync(DEEP_FILE)) return null;
  const deep = JSON.parse(fs.readFileSync(DEEP_FILE, 'utf8'));
  return { generatedAt: deep.generatedAt || '', sources: deep.sources || [], diseases: deep.diseases || {} };
}

// Every disease the deep layer mentions, as MONDO ids, so the wide build
// keeps them even where the bulk files alone would not.
export function deepDiseaseIds(deep) {
  const ids = new Set();
  if (!deep) return ids;
  for (const [id, entry] of Object.entries(deep.diseases)) {
    ids.add(asCurie(id));
    for (const edge of entry.edges || []) {
      for (const end of [edge.from, edge.to]) {
        if (end?.kind === NODE.DISEASE && /^MONDO[_:]\d+$/.test(end.id || '')) ids.add(asCurie(end.id));
      }
    }
  }
  return ids;
}

/**
 * @param {Map<string, Object>} diseases  by id, e.g. MONDO_0012812
 * @returns {{ diseases: number, edgesAdded: number, edgesReplaced: number, missing: string[] }}
 */
export function mergeDeep(diseases, deep) {
  const result = { diseases: 0, edgesAdded: 0, edgesReplaced: 0, missing: [] };
  if (!deep) return result;
  for (const [rawId, entry] of Object.entries(deep.diseases)) {
    const disease = diseases.get(asKey(rawId));
    if (!disease) {
      result.missing.push(rawId);
      continue;
    }
    const deepEdges = entry.edges || [];
    const deepIds = new Set(deepEdges.map(edge => edge.id));
    const before = disease.edges.length;
    const kept = disease.edges.filter(edge => !deepIds.has(edge.id));
    result.edgesReplaced += before - kept.length;
    result.edgesAdded += deepEdges.length - (before - kept.length);
    // Checked links come first: they are what the agent reads out first.
    disease.edges = [...deepEdges, ...kept];
    disease.layer = LAYER.DEEP;
    if (entry.definition) {
      disease.definition = entry.definition;
      disease.definitionLayer = LAYER.DEEP;
    }
    if (entry.synonyms?.length) {
      const seen = new Set([disease.name.toLowerCase(), ...disease.synonyms.map(text => text.toLowerCase())]);
      for (const synonym of entry.synonyms) {
        if (!synonym || seen.has(synonym.toLowerCase())) continue;
        seen.add(synonym.toLowerCase());
        disease.synonyms.push(synonym);
      }
    }
    result.diseases += 1;
  }
  return result;
}

// Finding a disease by what a person says or types: its name, a synonym, or
// the symbol of a gene linked to it. Every result says what matched.

import { NODE } from '../../shared/schema.js';
import { getBuild, getSearchIndex } from './store.js';
import { gap, sourcesLine } from './gap.js';
import { normalise, tokens, tokenMatches } from './text.js';

// Words that appear in almost every disease name. They are ignored when a
// query is matched across several fields, so "STXBP1 disorder" still finds
// the diseases linked to STXBP1.
const FILLER = new Set(['disease', 'diseases', 'disorder', 'disorders', 'syndrome', 'syndromes', 'related', 'associated', 'type', 'the', 'of', 'and', 'with', 'in', 'a', 'an', 'gene']);

const allMatch = (queryTokens, fieldTokens) => queryTokens.every(token => tokenMatches(token, fieldTokens));

// A closer, shorter name ranks a little higher among equal kinds of match.
const closeness = (query, queryTokens, norm, fieldTokens) =>
  (norm.startsWith(query) ? 5 : 0) + (5 * queryTokens.length) / Math.max(fieldTokens.length, 1);

function score(entry, query, queryTokens, significant) {
  if (entry.nameNorm === query) return { points: 100, matched: 'name' };

  let best = null;
  const offer = (points, matched) => {
    if (!best || points > best.points) best = { points, matched };
  };

  for (const synonym of entry.synonyms) {
    if (synonym.norm === query) offer(95, `synonym: ${synonym.text}`);
  }
  if (queryTokens.length === 1) {
    // A disease linked to this gene alone comes before one where it is one
    // gene among several (a deletion spanning many genes, say).
    const alone = 4 / entry.genes.length;
    for (const gene of entry.genes) {
      if (gene.norm === query) offer(90 + alone, `gene: ${gene.text}`);
      else if (query.length >= 3 && gene.norm.startsWith(query)) offer(60 + alone, `gene: ${gene.text}`);
    }
  }
  if (allMatch(queryTokens, entry.nameTokens)) {
    offer(80 + closeness(query, queryTokens, entry.nameNorm, entry.nameTokens), 'name');
  }
  for (const synonym of entry.synonyms) {
    if (allMatch(queryTokens, synonym.tokens)) {
      offer(70 + closeness(query, queryTokens, synonym.norm, synonym.tokens), `synonym: ${synonym.text}`);
    }
  }
  if (best) return best;

  // The words are spread over several fields, e.g. a gene symbol plus a
  // word from the name.
  if (significant.length) {
    const used = new Set();
    const everyWordFound = significant.every(token => {
      const gene = entry.genes.find(item => item.norm === token);
      if (gene) return used.add(`gene: ${gene.text}`);
      if (tokenMatches(token, entry.nameTokens)) return used.add('name');
      const synonym = entry.synonyms.find(item => tokenMatches(token, item.tokens));
      if (synonym) return used.add(`synonym: ${synonym.text}`);
      return false;
    });
    if (everyWordFound) return { points: 50 + significant.length, matched: [...used].join(' and ') };
  }
  return null;
}

// Used only when nothing matched in full: a name that holds most of the
// words. It says which words it did and did not find, so nobody mistakes it
// for a clean match.
function partial(entry, significant) {
  const fields = [entry.nameTokens, ...entry.synonyms.map(synonym => synonym.tokens)];
  let best = null;
  for (const fieldTokens of fields) {
    const found = significant.filter(token => tokenMatches(token, fieldTokens));
    if (!best || found.length > best.length) best = found;
  }
  if (!best || best.length * 2 < significant.length || !best.some(token => token.length >= 4)) return null;
  const notFound = significant.filter(token => !best.includes(token));
  return {
    points: (30 * best.length) / significant.length,
    matched: `partial: found "${best.join(' ')}", not "${notFound.join(' ')}"`,
  };
}

const order = (a, b) =>
  b.points - a.points ||
  Number(b.entry.layer === 'deep') - Number(a.entry.layer === 'deep') ||
  a.entry.name.length - b.entry.name.length ||
  a.entry.name.localeCompare(b.entry.name);

/** @returns {Promise<import('../../shared/schema.js').SearchResponse>} */
export async function search(rawQuery, max = 12) {
  const query = normalise(rawQuery);
  const queryTokens = tokens(rawQuery);
  const index = await getSearchIndex();

  const meaningful = queryTokens.filter(token => !FILLER.has(token));
  const significant = meaningful.length ? meaningful : queryTokens;

  let hits = [];
  if (query.length >= 2) {
    for (const entry of index) {
      const hit = score(entry, query, queryTokens, significant);
      if (hit) hits.push({ entry, ...hit });
    }
    if (!hits.length && significant.length >= 2) {
      for (const entry of index) {
        const hit = partial(entry, significant);
        if (hit) hits.push({ entry, ...hit });
      }
    }
  }

  hits = hits.sort(order).slice(0, max);
  const results = hits.map(({ entry, matched }) => ({
    id: entry.id,
    kind: NODE.DISEASE,
    name: entry.name,
    matched,
    layer: entry.layer,
  }));

  const response = { query: String(rawQuery), results };
  if (!results.length) {
    const build = await getBuild();
    response.gap = gap({
      question: `Is "${String(rawQuery).trim()}" in the atlas?`,
      searched: [
        `The names of the ${index.length} diseases in the atlas`,
        'The synonyms recorded for each of them',
        'The symbols of the genes linked to them',
        sourcesLine(build),
      ],
      missing: [
        'A disease in the atlas whose name, synonym or linked gene symbol starts with these words.',
        'Symptoms are not searched by name yet: only disease names, synonyms and gene symbols are.',
      ],
      nextSteps: [
        'Try the name used in medical papers, another spelling, or the English name.',
        'If a genetic test named a gene, search for the gene symbol.',
      ],
    });
  }
  return response;
}

// Reads the Human Phenotype Ontology and its two annotation files.
// Nothing here rewrites what HPO says: labels, plain-language synonyms and
// frequency classes are taken as written (the HPO licence asks for that).

import { readObo, quoted, firstToken } from '../lib/obo.js';
import { readTsv } from '../lib/tsv.js';

export const PHENOTYPE_ROOT = 'HP:0000118';
const FREQUENCY_ROOT = 'HP:0040279';

/**
 * @returns {Promise<{
 *   version: string,
 *   terms: Map<string, { id: string, name: string, plain: string, parents: string[] }>,
 *   resolve: (id: string) => string | null,
 *   ancestors: (id: string) => string[],
 *   frequencyClasses: Map<string, { id: string, label: string, range: string, value: number }>,
 * }>}
 */
export async function readHpo(file) {
  const { header, terms: stanzas } = await readObo(file);
  const version = (header['data-version']?.[0] || '').replace(/^hp\/releases\//, '');
  const terms = new Map();
  const moved = new Map();
  const frequencyClasses = new Map();

  for (const stanza of stanzas) {
    const id = stanza.id?.[0];
    if (!id || !id.startsWith('HP:')) continue;
    if (stanza.is_obsolete) {
      const replacement = stanza.replaced_by?.[0];
      if (replacement) moved.set(id, firstToken(replacement));
      continue;
    }
    for (const alt of stanza.alt_id || []) moved.set(firstToken(alt), id);

    // HPO's own "layperson" synonym, when it has an exact one, is the plain
    // wording a family is most likely to recognise.
    let plain = '';
    for (const raw of stanza.synonym || []) {
      const { text, rest } = quoted(raw);
      if (text && /^EXACT layperson\b/.test(rest)) {
        plain = text;
        break;
      }
    }

    const parents = (stanza.is_a || []).map(firstToken);
    const name = stanza.name?.[0] || id;
    terms.set(id, { id, name, plain: plain || name, parents });

    if (parents.includes(FREQUENCY_ROOT)) {
      // "Present in 30% to 79% of the cases." -> range "30% to 79% of cases", value 0.545
      const definition = stanza.def ? quoted(stanza.def[0]).text : '';
      const numbers = [...definition.matchAll(/(\d+(?:\.\d+)?)%/g)].map(match => Number(match[1]));
      if (numbers.length) {
        const low = Math.min(...numbers);
        const high = Math.max(...numbers);
        frequencyClasses.set(id, {
          id,
          label: name.toLowerCase(),
          range: low === high ? `${low}% of cases` : `${low}% to ${high}% of cases`,
          value: (low + high) / 200,
        });
      }
    }
  }

  const resolve = id => (terms.has(id) ? id : terms.has(moved.get(id)) ? moved.get(id) : null);

  const memo = new Map();
  // The term itself and everything above it.
  const ancestors = id => {
    const known = memo.get(id);
    if (known) return known;
    const found = new Set([id]);
    for (const parent of terms.get(id)?.parents || []) {
      for (const above of ancestors(parent)) found.add(above);
    }
    const list = [...found];
    memo.set(id, list);
    return list;
  };

  return { version, terms, resolve, ancestors, frequencyClasses };
}

/**
 * phenotype.hpoa, one object per row, nothing filtered.
 * @returns {Promise<{ version: string, rows: Object[] }>}
 */
export async function readPhenotypeAnnotations(file) {
  let version = '';
  const rows = [];
  await readTsv(file, {
    onComment: line => {
      const match = line.match(/^#version:\s*(\S+)/);
      if (match) version = match[1];
    },
    onRow: cells => {
      rows.push({
        diseaseId: cells[0],
        diseaseName: cells[1],
        negated: cells[2] === 'NOT',
        hpoId: cells[3],
        references: (cells[4] || '').split(';').map(part => part.trim()).filter(Boolean),
        evidence: cells[5] || '',
        frequency: cells[7] || '',
        aspect: cells[10] || '',
        // "HPO:probinson[2021-06-21];..." -> the earliest year a curator touched the row
        curatedYear: Math.min(...[...(cells[11] || '').matchAll(/\[(\d{4})-\d\d-\d\d\]/g)].map(match => Number(match[1])), Infinity),
      });
    },
  });
  return { version, rows };
}

/**
 * genes_to_disease.txt, one object per row.
 * @returns {Promise<{ rows: { ncbiGeneId: string, symbol: string, type: string, diseaseId: string, origin: string }[] }>}
 */
export async function readGeneAnnotations(file) {
  const rows = [];
  await readTsv(file, {
    onRow: cells => {
      rows.push({
        ncbiGeneId: cells[0],
        symbol: cells[1],
        type: cells[2] || 'UNKNOWN',
        diseaseId: cells[3],
        origin: cells[4] || '',
      });
    },
  });
  return { rows };
}

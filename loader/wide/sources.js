// The open files the wide layer is built from. Each was confirmed with a HEAD
// request on 2026-10-03. OMIM's own files and API are not used: OMIM numbers
// reach the atlas only as cross-references inside MONDO and as disease ids in
// the HPO annotation files.

import { fetchCached } from '../lib/download.js';

export const FILES = Object.freeze([
  {
    // The full ontology rather than the smaller mondo-rare.obo: an OMIM or
    // Orphanet id that maps to a disease MONDO does not call rare must be
    // counted as "mapped, not rare", which needs every cross-reference.
    key: 'mondo',
    name: 'Mondo Disease Ontology',
    url: 'https://purl.obolibrary.org/obo/mondo.obo',
    file: 'mondo.obo',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    homepage: 'https://mondo.monarchinitiative.org/',
    required: true,
  },
  {
    key: 'hpo',
    name: 'Human Phenotype Ontology',
    url: 'https://purl.obolibrary.org/obo/hp.obo',
    file: 'hp.obo',
    licence: 'HPO licence: free to use with acknowledgement, the version shown, and the content unaltered',
    licenceUrl: 'https://hpo.jax.org/app/license',
    homepage: 'https://hpo.jax.org/',
    required: true,
  },
  {
    key: 'hpoa',
    name: 'HPO annotations (phenotype.hpoa)',
    url: 'https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa',
    file: 'phenotype.hpoa',
    licence: 'HPO licence: free to use with acknowledgement, the version shown, and the content unaltered',
    licenceUrl: 'https://hpo.jax.org/app/license',
    homepage: 'https://hpo.jax.org/data/annotations',
    required: true,
  },
  {
    key: 'hpoGenes',
    name: 'HPO annotations (genes_to_disease.txt)',
    url: 'https://purl.obolibrary.org/obo/hp/hpoa/genes_to_disease.txt',
    file: 'genes_to_disease.txt',
    licence: 'HPO licence: free to use with acknowledgement, the version shown, and the content unaltered',
    licenceUrl: 'https://hpo.jax.org/app/license',
    homepage: 'https://hpo.jax.org/data/annotations',
    required: true,
  },
  {
    // Optional: the build carries on without it and says so.
    key: 'orphaGenes',
    name: 'Orphadata: genes associated with rare diseases',
    url: 'https://www.orphadata.com/data/xml/en_product6.xml',
    file: 'en_product6.xml',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    homepage: 'https://www.orphadata.com/genes/',
    required: false,
  },
]);

/**
 * Fetches (or finds cached) every file.
 * @returns {Promise<{ files: Object<string, { path: string, meta: Object, spec: Object }>, skipped: { key: string, reason: string }[] }>}
 */
export async function fetchAll(log = console.log) {
  const files = {};
  const skipped = [];
  for (const spec of FILES) {
    try {
      const got = await fetchCached(spec, log);
      files[spec.key] = { ...got, spec };
    } catch (error) {
      if (spec.required) throw error;
      skipped.push({ key: spec.key, reason: error.message });
      log(`  ${spec.file}: skipped (${error.message})`);
    }
  }
  return { files, skipped };
}

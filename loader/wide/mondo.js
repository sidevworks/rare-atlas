// Reads MONDO: one record per live disease term, plus the cross-reference
// table that turns an OMIM, Orphanet or DECIPHER id into its MONDO id.

import { readObo, quoted, firstToken } from '../lib/obo.js';

// Vocabularies worth carrying on a disease record so other parts of the atlas
// can look the disease up elsewhere.
const KEEP_XREFS = new Set([
  'OMIM', 'OMIMPS', 'Orphanet', 'DECIPHER', 'GARD', 'NORD', 'MEDGEN', 'UMLS',
  'MESH', 'DOID', 'NCIT', 'ICD10CM', 'icd11.foundation', 'SCTID',
]);

// Vocabularies whose ids appear in the annotation files and must be mapped.
const MAPPED = { OMIM: 'OMIM', Orphanet: 'ORPHA', DECIPHER: 'DECIPHER' };

// Synonym types MONDO itself marks as not to be shown or not about people.
const BAD_SYNONYM = /\b(DEPRECATED|EXCLUDE|MISSPELLING|NON_HUMAN|AMBIGUOUS|DUBIOUS)\b/;

const GENE_RELATION = 'has_material_basis_in_germline_mutation_in http://identifiers.org/hgnc/';

export const mondoKey = id => id.replace(':', '_');

/**
 * @returns {Promise<{
 *   version: string,
 *   terms: Map<string, Object>,
 *   byXref: Map<string, { mondoId: string, relation: string }>,
 *   hgncBySymbol: Map<string, string>,
 *   counts: Object<string, number>,
 * }>}
 */
export async function readMondo(file) {
  const { header, terms: stanzas } = await readObo(file);
  const version = (header['data-version']?.[0] || '').replace(/^releases\//, '');
  const terms = new Map();
  const byXref = new Map();
  const hgncBySymbol = new Map();
  const obsoleteWithReplacement = new Map();
  let obsolete = 0;

  for (const stanza of stanzas) {
    const id = stanza.id?.[0];
    if (!id || !id.startsWith('MONDO:')) continue;
    if (stanza.is_obsolete) {
      obsolete += 1;
      const replacement = stanza.replaced_by?.[0];
      if (replacement) obsoleteWithReplacement.set(id, firstToken(replacement));
      continue;
    }

    const synonyms = [];
    const seen = new Set();
    for (const raw of stanza.synonym || []) {
      const { text, rest } = quoted(raw);
      const scopeAndType = rest.split('[')[0].trim();
      if (!text || !scopeAndType.startsWith('EXACT') || BAD_SYNONYM.test(scopeAndType)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      synonyms.push(text);
    }

    const xrefs = {};
    const mapsFrom = [];
    for (const raw of stanza.xref || []) {
      const xref = firstToken(raw);
      const colon = xref.indexOf(':');
      if (colon < 1) continue;
      const prefix = xref.slice(0, colon);
      const local = xref.slice(colon + 1);
      const equivalent = raw.includes('source="MONDO:equivalentTo"');
      const equivalentObsolete = raw.includes('source="MONDO:equivalentObsolete"');
      // Firestore field names read more safely without a dot in them.
      const shown = prefix === 'icd11.foundation' ? 'ICD11' : prefix;
      if (KEEP_XREFS.has(prefix) && (equivalent || !MAPPED[prefix])) (xrefs[shown] ||= []).push(local);
      // Only MONDO's own "equivalent" marks are trusted for mapping. An
      // "equivalentObsolete" mark means the other vocabulary retired that id;
      // rows that still use it are mapped and counted separately.
      if (MAPPED[prefix] && (equivalent || equivalentObsolete)) {
        const external = `${MAPPED[prefix]}:${local}`;
        const relation = equivalent ? 'equivalentTo' : 'equivalentObsolete';
        const before = byXref.get(external);
        if (!before || (before.relation !== 'equivalentTo' && equivalent)) byXref.set(external, { mondoId: id, relation });
        mapsFrom.push({ external, relation });
      }
    }

    let germlineGene = false;
    for (const raw of stanza.relationship || []) {
      if (!raw.startsWith(GENE_RELATION)) continue;
      germlineGene = true;
      const hgnc = raw.slice(GENE_RELATION.length).split(/[\s{]/, 1)[0];
      const symbol = raw.includes(' ! ') ? raw.slice(raw.lastIndexOf(' ! ') + 3).trim() : '';
      if (hgnc && symbol && !hgncBySymbol.has(symbol)) hgncBySymbol.set(symbol, `HGNC:${hgnc}`);
    }

    const subsets = new Set((stanza.subset || []).map(firstToken));
    terms.set(id, {
      id,
      name: stanza.name?.[0] || id,
      definition: stanza.def ? quoted(stanza.def[0]).text : '',
      synonyms,
      xrefs,
      mapsFrom,
      rareSubset: subsets.has('rare'),
      hasOrphanet: mapsFrom.some(link => link.external.startsWith('ORPHA:') && link.relation === 'equivalentTo'),
      // MONDO's own marks for "raises the risk of" entries, which are not
      // diseases a family is diagnosed with.
      susceptibility: subsets.has('omim_susceptibility') || subsets.has('predisposition'),
      // MONDO itself records an inherited change in a named gene as the basis.
      germlineGene,
      hasNarrowerForms: false,
      parents: (stanza.is_a || []).map(firstToken).filter(parent => parent.startsWith('MONDO:')),
    });
  }

  for (const term of terms.values()) {
    for (const parent of term.parents) {
      const above = terms.get(parent);
      if (above) above.hasNarrowerForms = true;
    }
  }

  return {
    version,
    terms,
    byXref,
    hgncBySymbol,
    obsoleteWithReplacement,
    counts: { mondoLiveTerms: terms.size, mondoObsoleteTerms: obsolete },
  };
}

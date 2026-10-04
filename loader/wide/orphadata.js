// Reads Orphadata's free gene file (en_product6.xml): for each disorder, the
// genes Orphanet links to it, how (the association type), whether Orphanet
// has assessed the link, and the PubMed ids it gives as validation.
//
// The file is machine-written with one fixed layout, so it is read with
// patterns rather than a full XML parser (no parser is installed).

import fs from 'node:fs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = text =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);

const first = (block, pattern) => {
  const match = block.match(pattern);
  return match ? decode(match[1].trim()) : '';
};

/**
 * @returns {{
 *   version: string,
 *   licence: string,
 *   disorders: { orphaCode: string, name: string, type: string, genes: {
 *     symbol: string, hgncId: string, type: string, status: string, pmids: string[]
 *   }[] }[],
 * }}
 */
export function readOrphaGenes(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const version = first(xml, /<JDBOR date="([^"]+)"/).slice(0, 10);
  const licence = first(xml, /<ShortIdentifier>([^<]+)<\/ShortIdentifier>/);
  const declared = Number(first(xml, /<DisorderList count="(\d+)"/));

  const disorders = [];
  const blocks = xml.split(/<Disorder id="\d+">/).slice(1);
  for (const block of blocks) {
    const genes = [];
    for (const part of block.split('<DisorderGeneAssociation>').slice(1)) {
      const symbol = first(part, /<Symbol>([^<]+)<\/Symbol>/);
      if (!symbol) continue;
      const hgnc = first(part, /<Source>HGNC<\/Source>\s*<Reference>([^<]+)<\/Reference>/);
      const validation = first(part, /<SourceOfValidation>([^<]*)<\/SourceOfValidation>/);
      genes.push({
        symbol,
        hgncId: hgnc ? `HGNC:${hgnc}` : '',
        type: first(part, /<DisorderGeneAssociationType[^>]*>\s*<Name lang="en">([^<]+)<\/Name>/),
        status: first(part, /<DisorderGeneAssociationStatus[^>]*>\s*<Name lang="en">([^<]+)<\/Name>/),
        pmids: [...validation.matchAll(/(\d+)\[PMID\]/g)].map(match => match[1]),
      });
    }
    disorders.push({
      orphaCode: first(block, /<OrphaCode>(\d+)<\/OrphaCode>/),
      name: first(block, /<Name lang="en">([^<]+)<\/Name>/),
      type: first(block, /<DisorderType[^>]*>\s*<Name lang="en">([^<]+)<\/Name>/),
      genes,
    });
  }

  // A layout change upstream would show up here first.
  if (!disorders.length || (declared && declared !== disorders.length)) {
    throw new Error(`Orphadata gene file: expected ${declared} disorders, read ${disorders.length}. The layout may have changed.`);
  }
  return { version, licence, disorders };
}

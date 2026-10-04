// Builds the wide layer of the atlas: every rare disease the open files
// cover, with its symptoms, genes, nearest neighbours, region and position.
//
//   node loader/build.js
//
// Reads the source files (downloading any that are not already in
// data/raw/wide), and writes data/build exactly as the storage contract in
// the README describes. If data/build/deep.json exists it is merged in.

import fs from 'node:fs';
import path from 'node:path';
import { LAYER } from '../shared/schema.js';
import { BUILD_DIR, DISEASE_DIR } from './lib/paths.js';
import { deepDiseaseIds, mergeDeep, readDeep } from './lib/deep.js';
import { MAX_DOCUMENT_BYTES } from './lib/build-files.js';
import { fetchAll } from './wide/sources.js';
import { readMondo } from './wide/mondo.js';
import { readGeneAnnotations, readHpo, readPhenotypeAnnotations } from './wide/hpo.js';
import { readOrphaGenes } from './wide/orphadata.js';
import { RARITY, reconcile } from './wide/reconcile.js';
import { SOURCE_NAME, diseaseKey, geneEdges, mondoPage, phenotypeEdges, similarEdge } from './wide/edges.js';
import { findNeighbours } from './wide/similar.js';
import { findClusters } from './wide/clusters.js';
import { layout } from './wide/layout.js';

const started = Date.now();
const log = (...parts) => console.log(...parts);
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
const number = value => value.toLocaleString('en');

const RARITY_WORDS = {
  [RARITY.MONDO]: { basis: 'observed', why: "In MONDO's rare disease subset." },
  [RARITY.ORPHANET]: { basis: 'observed', why: 'Has an entry in Orphanet, the catalogue of rare diseases.' },
  [RARITY.SINGLE_GENE]: {
    basis: 'inferred',
    why: "Not yet on MONDO's rare list. Kept by the atlas as a recently described single-gene disease: HPO's rare-disease annotations and MONDO both record a causal gene.",
  },
  [RARITY.DEEP]: { basis: 'observed', why: 'Named in the hand-checked layer.' },
};

async function main() {
  log('Rare Atlas loader, wide layer');

  log('\n1. Source files');
  const { files, skipped } = await fetchAll(log);

  log('\n2. Reading');
  const mondo = await readMondo(files.mondo.path);
  const hpo = await readHpo(files.hpo.path);
  const annotations = await readPhenotypeAnnotations(files.hpoa.path);
  const geneFile = await readGeneAnnotations(files.hpoGenes.path);
  let orpha = null;
  if (files.orphaGenes) {
    try {
      orpha = readOrphaGenes(files.orphaGenes.path);
    } catch (error) {
      skipped.push({ key: 'orphaGenes', reason: error.message });
      log(`  Orphadata gene file could not be read and is left out: ${error.message}`);
    }
  }
  log(`  MONDO ${mondo.version}: ${number(mondo.terms.size)} live disease terms`);
  log(`  HPO ${hpo.version}: ${number(hpo.terms.size)} terms`);
  log(`  phenotype.hpoa ${annotations.version}: ${number(annotations.rows.length)} rows`);
  log(`  genes_to_disease.txt: ${number(geneFile.rows.length)} rows`);
  log(orpha ? `  Orphadata genes ${orpha.version}: ${number(orpha.disorders.length)} disorders` : '  Orphadata genes: not used');

  // The version each edge cites is the one written inside the file where it
  // has one, and the release tag it was downloaded under where it has not.
  const releaseTag = key => (files[key].meta.releaseTag || '').replace(/^v/, '');
  const versions = {
    mondo: mondo.version || releaseTag('mondo'),
    hpo: hpo.version || releaseTag('hpo'),
    hpoa: annotations.version || releaseTag('hpoa'),
    hpoGenes: releaseTag('hpoGenes') || annotations.version,
    orphaGenes: orpha?.version || '',
  };
  const stamp = {};
  for (const key of Object.keys(files)) stamp[key] = { retrieved: files[key].meta.retrieved, version: versions[key] };
  stamp.orphaGenes ||= { retrieved: '', version: '' };

  const deep = readDeep();
  const forceIds = deepDiseaseIds(deep);
  if (deep) log(`  deep.json (${deep.generatedAt || 'no date'}): ${Object.keys(deep.diseases).length} diseases checked by hand`);

  log('\n3. One MONDO id per disease');
  const { kept, report } = reconcile({ mondo, hpo, annotations, geneRows: geneFile.rows, orpha, forceIds });
  const unmappedIds = report.unmapped.length;
  log(`  phenotype.hpoa: ${number(report.phenotypeFile.diseaseIds.mapped)} of ${number(report.phenotypeFile.diseaseIds.ids)} disease ids mapped; ${number(report.phenotypeFile.rowsOnUnmappedDisease)} rows sit on ids MONDO does not know`);
  log(`  genes_to_disease.txt: ${number(report.geneFile.diseaseIds.mapped)} of ${number(report.geneFile.diseaseIds.ids)} disease ids mapped; ${number(report.geneFile.rowsOnUnmappedDisease)} rows unmapped`);
  if (report.orphadata) log(`  Orphadata: ${number(report.orphadata.diseaseIds.mapped)} of ${number(report.orphadata.diseaseIds.ids)} disorders mapped; ${number(report.orphadata.associationsOnUnmappedDisease)} gene links unmapped`);
  log(`  ${number(unmappedIds)} source ids could not be mapped to MONDO (listed in report.json)`);
  log(`  rows not turned into links: ${number(report.phenotypeFile.rowsInheritance)} inheritance, ${number(report.phenotypeFile.rowsClinicalCourse)} onset and course, ${number(report.phenotypeFile.rowsModifier)} modifiers, ${number(report.phenotypeFile.rowsHistory)} history, ${number(report.phenotypeFile.rowsRecordedAbsent)} recorded as absent, ${number(report.phenotypeFile.rowsUnknownTerm)} with an unknown HPO term`);
  log(`  kept ${number(kept.size)} diseases: ${number(report.tally.keptByMondoRareSubset)} in MONDO's rare subset, ${number(report.tally.keptByOrphanetEntry)} by Orphanet entry, ${number(report.tally.keptSingleGeneNotYetListed)} single-gene and not yet listed, ${number(report.tally.keptForDeepLayerOnly)} for the deep layer only`);
  log(`  left out: ${number(report.tally.excludedNotMarkedRare)} not marked rare, ${number(report.tally.excludedSusceptibility)} susceptibility entries, ${number(report.tally.excludedNothingRecorded)} with nothing recorded`);
  if (report.deepUnknown.length) log(`  WARNING: deep.json names ids MONDO does not have: ${report.deepUnknown.join(', ')}`);

  log('\n4. Observed links');
  const geneIds = new Map();
  const noteGene = (symbol, field, value) => {
    if (!value) return;
    const entry = geneIds.get(symbol) || {};
    entry[field] ||= value;
    geneIds.set(symbol, entry);
  };
  for (const [symbol, hgncId] of mondo.hgncBySymbol) noteGene(symbol, 'hgncId', hgncId);
  for (const disorder of orpha?.disorders || []) for (const gene of disorder.genes) noteGene(gene.symbol, 'hgncId', gene.hgncId);
  for (const row of geneFile.rows) noteGene(row.symbol, 'ncbiGeneId', row.ncbiGeneId);

  const items = [...kept.keys()].sort().map(mondoId => {
    const record = kept.get(mondoId);
    const phenotype = phenotypeEdges(record, hpo, stamp);
    const gene = geneEdges(record, geneIds, stamp);
    return {
      id: diseaseKey(mondoId),
      mondoId,
      record,
      phenotypeEdges: phenotype.edges,
      weights: phenotype.weights,
      geneEdges: gene.edges,
      symbols: gene.symbols,
      genes: gene.comparable,
    };
  });
  const phenotypeLinks = items.reduce((sum, item) => sum + item.phenotypeEdges.length, 0);
  const geneLinks = items.reduce((sum, item) => sum + item.geneEdges.length, 0);
  log(`  ${number(phenotypeLinks)} disease-symptom links, ${number(geneLinks)} disease-gene links (${seconds()} s)`);

  log('\n5. Nearest neighbours');
  const near = findNeighbours(items, hpo, { k: 8 });
  let similarLinks = 0;
  const confidenceOrder = { high: 1, medium: 0.8, low: 0.5 };
  items.forEach((item, at) => {
    for (const edge of item.phenotypeEdges) {
      const info = near.informative.get(edge.to.id);
      edge.detail.informative = info.informative;
      edge.detail.sharedBy = info.sharedBy;
    }
    // The most telling symptoms first: common in this disease, rare elsewhere.
    // (The weight tempers counts from one or two people, so "1 of 1" does
    // not outrank a symptom curated as very frequent.)
    const salience = edge => (item.weights.get(edge.to.id) ?? 0.5) * edge.detail.informative * confidenceOrder[edge.confidence];
    item.phenotypeEdges.sort((a, b) => salience(b) - salience(a) || (a.to.id < b.to.id ? -1 : 1));
    item.similarEdges = near.neighbours[at].map(neighbour => similarEdge(item, items[neighbour.index], neighbour, hpo, stamp));
    similarLinks += item.similarEdges.length;
  });
  const withoutNeighbours = items.filter(item => !item.similarEdges.length).length;
  log(`  ${number(similarLinks)} inferred links; ${number(withoutNeighbours)} diseases have no neighbour that passes the bar (${seconds()} s)`);

  log('\n6. Regions');
  const grouped = findClusters({ items, neighbours: near.neighbours, features: near.features, hpo });
  for (const cluster of grouped.clusters) log(`  ${cluster.id}  ${String(cluster.size).padStart(5)}  ${cluster.label}`);

  log('\n7. Positions');
  const placed = layout({ count: items.length, assignment: grouped.assignment, clusters: grouped.clusters, ties: grouped.ties, links: grouped.links });
  log(`  ${number(items.length)} positions (${seconds()} s)`);

  log('\n8. Writing');
  const diseases = new Map();
  items.forEach((item, at) => {
    const { term, names } = item.record;
    const seen = new Set([term.name.toLowerCase()]);
    const synonyms = [];
    // MONDO's exact synonyms, then the names the mapped OMIM and Orphanet
    // records use for the same disease.
    for (const text of [...term.synonyms, ...names.values()]) {
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      synonyms.push(text);
    }
    const disease = {
      id: item.id,
      name: term.name,
      synonyms,
      xrefs: term.xrefs,
      layer: LAYER.WIDE,
      clusterId: grouped.clusters[grouped.assignment[at]].id,
      position: placed.positions[at],
      rarity: { reason: item.record.rarity, ...RARITY_WORDS[item.record.rarity] },
      // Name, synonyms, definition and cross-references come from this record.
      source: {
        name: SOURCE_NAME.MONDO,
        recordId: item.mondoId,
        url: mondoPage(item.mondoId),
        retrieved: stamp.mondo.retrieved,
        version: stamp.mondo.version,
      },
      edges: [...item.geneEdges, ...item.phenotypeEdges, ...item.similarEdges],
    };
    if (term.definition) disease.definition = term.definition;
    diseases.set(item.id, disease);
  });

  const merged = mergeDeep(diseases, deep);
  if (deep) {
    log(`  deep layer: ${merged.diseases} diseases, ${merged.edgesAdded} links added, ${merged.edgesReplaced} wide links replaced`);
    if (merged.missing.length) log(`  WARNING: deep.json diseases not in the build: ${merged.missing.join(', ')}`);
  }

  const sources = Object.values(files).map(({ spec, meta }) => ({
    name: spec.name,
    recordId: spec.file,
    url: spec.url,
    retrieved: meta.retrieved,
    version: versions[spec.key],
    licence: spec.licence,
    licenceUrl: spec.licenceUrl,
    bytes: meta.bytes,
    lastModified: meta.lastModified,
  }));
  const known = new Set(sources.map(source => `${source.name}|${source.url}`));
  for (const source of deep?.sources || []) {
    if (!source?.name || known.has(`${source.name}|${source.url}`)) continue;
    known.add(`${source.name}|${source.url}`);
    sources.push(source);
  }

  const all = [...diseases.values()];
  const typeCount = type => all.reduce((sum, disease) => sum + disease.edges.filter(edge => edge.type === type).length, 0);
  const counts = {
    diseases: all.length,
    diseasesDeep: all.filter(disease => disease.layer === LAYER.DEEP).length,
    diseasesWithPhenotypes: items.filter(item => item.phenotypeEdges.length).length,
    diseasesWithGenes: items.filter(item => item.geneEdges.length).length,
    diseasesWithOneGene: items.filter(item => item.geneEdges.length === 1).length,
    diseasesWithoutNeighbours: withoutNeighbours,
    phenotypeLinks: typeCount('disease-phenotype'),
    phenotypeLinksContradicted: all.reduce((sum, disease) => sum + disease.edges.filter(edge => edge.type === 'disease-phenotype' && edge.contradictedBy?.length).length, 0),
    geneLinks: typeCount('disease-gene'),
    similarLinks: typeCount('disease-similar'),
    links: all.reduce((sum, disease) => sum + disease.edges.length, 0),
    distinctPhenotypes: new Set(items.flatMap(item => item.phenotypeEdges.map(edge => edge.to.id))).size,
    distinctGenes: new Set(items.flatMap(item => item.symbols)).size,
    clusters: grouped.clusters.length,
    keptByMondoRareSubset: report.tally.keptByMondoRareSubset,
    keptByOrphanetEntry: report.tally.keptByOrphanetEntry,
    keptSingleGeneNotYetListed: report.tally.keptSingleGeneNotYetListed,
    keptForDeepLayerOnly: report.tally.keptForDeepLayerOnly,
    excludedNotMarkedRare: report.tally.excludedNotMarkedRare,
    excludedSusceptibility: report.tally.excludedSusceptibility,
    excludedNothingRecorded: report.tally.excludedNothingRecorded,
    unmappedSourceIds: unmappedIds,
    unmappedPhenotypeRows: report.phenotypeFile.rowsOnUnmappedDisease,
    unmappedGeneRows: report.geneFile.rowsOnUnmappedDisease + (report.orphadata?.associationsOnUnmappedDisease || 0),
    sourceFilesSkipped: skipped.length,
  };

  const build = { builtAt: new Date().toISOString(), synthetic: false, counts, sources };
  const map = {
    clusters: grouped.clusters.map((cluster, index) => ({ id: cluster.id, label: cluster.label, centre: placed.centres[index], size: cluster.size })),
    points: all.map(disease => [
      disease.id,
      disease.name,
      ...disease.position,
      grouped.clusters.findIndex(cluster => cluster.id === disease.clusterId),
      disease.layer === LAYER.DEEP ? 1 : 0,
    ]),
    build,
  };
  const symbolsOf = disease => [...new Set(disease.edges.filter(edge => edge.type === 'disease-gene').map(edge => edge.to.label))];
  const search = all.map(disease => [disease.id, disease.name, disease.synonyms, symbolsOf(disease), disease.layer]);

  fs.mkdirSync(DISEASE_DIR, { recursive: true });
  const written = new Map();
  let largest = { id: '', bytes: 0 };
  const write = (file, value, pretty = false) => {
    const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value);
    fs.writeFileSync(file, text);
    const size = Buffer.byteLength(text, 'utf8');
    written.set(file, size);
    return size;
  };
  const bytesWritten = () => [...written.values()].reduce((sum, size) => sum + size, 0);
  const current = new Set();
  for (const disease of all) {
    const name = `${disease.id}.json`;
    current.add(name);
    const size = write(path.join(DISEASE_DIR, name), disease);
    if (size > largest.bytes) largest = { id: disease.id, bytes: size };
  }
  // Disease files left by an earlier build would be uploaded as if current.
  let stale = 0;
  for (const name of fs.readdirSync(DISEASE_DIR)) {
    if (name.endsWith('.json') && !current.has(name)) {
      fs.rmSync(path.join(DISEASE_DIR, name));
      stale += 1;
    }
  }

  counts.largestDiseaseBytes = largest.bytes;
  write(path.join(BUILD_DIR, 'search.json'), search);
  write(
    path.join(BUILD_DIR, 'report.json'),
    {
      builtAt: build.builtAt,
      skippedSources: skipped,
      phenotypeFile: report.phenotypeFile,
      geneFile: report.geneFile,
      orphadata: report.orphadata,
      kept: report.tally,
      deep: deep ? { ...merged, unknownToMondo: report.deepUnknown } : null,
      unmapped: report.unmapped,
      unknownTerms: report.unknownTerms,
      excluded: report.excluded,
      clusters: grouped.clusters,
    },
    true,
  );
  // The last two counts describe the build itself, so both files that carry
  // the counts are written once to measure them and once more to record them.
  counts.buildSeconds = Number(seconds());
  counts.bytesOnDisk = 0;
  write(path.join(BUILD_DIR, 'build.json'), build, true);
  write(path.join(BUILD_DIR, 'map.json'), map);
  counts.bytesOnDisk = bytesWritten();
  write(path.join(BUILD_DIR, 'build.json'), build, true);
  write(path.join(BUILD_DIR, 'map.json'), map);

  log(`  ${number(all.length)} disease files${stale ? `, ${stale} stale files removed` : ''}`);
  log(`  largest disease file: ${largest.id}, ${number(largest.bytes)} bytes (limit ${number(MAX_DOCUMENT_BYTES)})`);
  log(`  ${(counts.bytesOnDisk / 1e6).toFixed(1)} MB in ${BUILD_DIR}`);
  if (skipped.length) for (const item of skipped) log(`  NOTE: ${item.key} was not used: ${item.reason}`);

  log('\nCounts');
  for (const [key, value] of Object.entries(counts)) log(`  ${key}: ${number(value)}`);
  log(`\nDone in ${seconds()} s. Next: node loader/check.js`);
}

main().catch(error => {
  console.error(`\nThe build stopped: ${error.stack || error.message}`);
  process.exit(1);
});

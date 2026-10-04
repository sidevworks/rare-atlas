// Checks the local build before anything is uploaded or shown.
//
//   node loader/check.js
//
// Exits with an error unless: every link has at least one source with a web
// address, no link points at a disease the build does not hold, every
// position is in range, and no disease record is over 900 KB. Then prints a
// spot check of one disease so a person can judge the content by eye.

import { BASIS, CONFIDENCE, EDGE, LAYER, NODE } from '../shared/schema.js';
import { MAX_DOCUMENT_BYTES, eachDisease, firestoreProblems, loadBuild } from './lib/build-files.js';

const SPOT_CHECK = 'MONDO_0012812';
const SHOW_FAILURES = 12;

const failures = new Map();
const fail = (kind, message) => {
  if (!failures.has(kind)) failures.set(kind, []);
  failures.get(kind).push(message);
};
const number = value => value.toLocaleString('en');
const isWebAddress = value => typeof value === 'string' && /^https?:\/\/\S+$/.test(value);
const allowed = values => new Set(Object.values(values));
const EDGE_TYPES = allowed(EDGE);
const BASES = allowed(BASIS);
const CONFIDENCES = allowed(CONFIDENCE);
const LAYERS = allowed(LAYER);

function checkEdge(edge, disease, known, seen) {
  const where = `${disease.id} / ${edge?.id || '(no id)'}`;
  if (!edge || typeof edge !== 'object') return fail('edge shape', `${disease.id}: an edge is not an object`);
  if (!edge.id) fail('edge shape', `${where}: no id`);
  else if (seen.has(edge.id)) fail('edge shape', `${where}: the same edge id twice on one disease`);
  seen.add(edge.id);
  if (!EDGE_TYPES.has(edge.type)) fail('edge shape', `${where}: unknown type "${edge.type}"`);
  if (!BASES.has(edge.basis)) fail('edge shape', `${where}: unknown basis "${edge.basis}"`);
  if (!CONFIDENCES.has(edge.confidence)) fail('edge shape', `${where}: unknown confidence "${edge.confidence}"`);
  if (!edge.statement || !edge.confidenceWhy) fail('edge shape', `${where}: no statement or no reason for its confidence`);
  for (const end of ['from', 'to']) {
    const ref = edge[end];
    if (!ref?.kind || !ref?.id || !ref?.label) fail('edge shape', `${where}: "${end}" lacks a kind, id or label`);
    else if (ref.kind === NODE.DISEASE && !known.has(ref.id)) fail('missing disease', `${where}: ${end} points at ${ref.id}, which is not in the build`);
  }

  if (!Array.isArray(edge.sources) || !edge.sources.length) fail('no source', `${where}: no sources`);
  else if (!edge.sources.some(source => isWebAddress(source?.url))) fail('no source', `${where}: no source has a web address`);
  for (const source of [...(edge.sources || []), ...(edge.contradictedBy || [])]) {
    if (!source?.name || !isWebAddress(source?.url) || !source?.retrieved) fail('source shape', `${where}: a source lacks a name, a web address or the date it was read`);
  }

  // The atlas's own inferences must stay modest and say what they are.
  if (edge.type === EDGE.DISEASE_SIMILAR && edge.basis === BASIS.INFERRED) {
    if (edge.confidence === CONFIDENCE.HIGH) fail('overclaim', `${where}: an inferred link marked high confidence`);
    if (!/lead to check/i.test(edge.statement)) fail('overclaim', `${where}: an inferred link whose sentence does not say it is a lead to check`);
    const score = edge.detail?.score;
    if (!(score >= 0 && score <= 1)) fail('edge shape', `${where}: score ${score} is outside 0..1`);
    const because = edge.detail?.because;
    if (!because || (!because.phenotypes?.length && !because.genes?.length)) fail('edge shape', `${where}: an inferred link with nothing it rests on`);
  }
}

function main() {
  const { build, map, search, diseaseFiles } = loadBuild();
  const known = new Set(diseaseFiles.map(name => name.replace(/\.json$/, '')));
  const clusterIds = new Set(map.clusters.map(cluster => cluster.id));

  let edges = 0;
  let largest = { id: '', bytes: 0 };
  const tally = { [EDGE.DISEASE_PHENOTYPE]: 0, [EDGE.DISEASE_GENE]: 0, [EDGE.DISEASE_SIMILAR]: 0 };
  const byConfidence = {};
  let spot = null;

  for (const { id, bytes, disease } of eachDisease(diseaseFiles)) {
    if (bytes > largest.bytes) largest = { id, bytes };
    if (bytes > MAX_DOCUMENT_BYTES) fail('too large', `${id}: ${number(bytes)} bytes, over ${number(MAX_DOCUMENT_BYTES)}`);
    if (disease.id !== id) fail('disease shape', `${id}: the file holds id ${disease.id}`);
    if (!disease.name) fail('disease shape', `${id}: no name`);
    if (!LAYERS.has(disease.layer)) fail('disease shape', `${id}: unknown layer "${disease.layer}"`);
    if (!Array.isArray(disease.synonyms) || !disease.xrefs || !Array.isArray(disease.edges)) fail('disease shape', `${id}: synonyms, xrefs or edges missing`);
    if (!clusterIds.has(disease.clusterId)) fail('disease shape', `${id}: cluster ${disease.clusterId} is not in the map`);
    const position = disease.position;
    if (!Array.isArray(position) || position.length !== 3 || position.some(value => typeof value !== 'number' || !(value >= -1 && value <= 1))) {
      fail('position', `${id}: position ${JSON.stringify(position)} is not three numbers between -1 and 1`);
    }
    for (const problem of firestoreProblems(disease).slice(0, 3)) fail('not storable', `${id}: ${problem}`);

    const seen = new Set();
    for (const edge of disease.edges || []) {
      checkEdge(edge, disease, known, seen);
      edges += 1;
      tally[edge.type] = (tally[edge.type] || 0) + 1;
      const key = `${edge.type} ${edge.confidence}`;
      byConfidence[key] = (byConfidence[key] || 0) + 1;
    }
    if (id === SPOT_CHECK) spot = disease;
  }

  // The map and the search list must describe the same diseases as the files.
  if (map.points.length !== known.size) fail('map', `map.json has ${map.points.length} points for ${known.size} disease files`);
  for (const point of map.points) {
    const [id, name, x, y, z, cluster, deep] = point;
    if (!known.has(id)) fail('map', `map point ${id} has no disease file`);
    if (!name || point.length !== 7) fail('map', `map point ${id} is not [id, name, x, y, z, cluster, deep]`);
    if ([x, y, z].some(value => typeof value !== 'number' || !(value >= -1 && value <= 1))) fail('position', `map point ${id}: ${x}, ${y}, ${z} out of range`);
    if (!map.clusters[cluster]) fail('map', `map point ${id}: no cluster at index ${cluster}`);
    if (deep !== 0 && deep !== 1) fail('map', `map point ${id}: deep flag ${deep}`);
  }
  for (const cluster of map.clusters) {
    if (!cluster.id || !cluster.label || !Array.isArray(cluster.centre) || cluster.centre.some(value => !(value >= -1 && value <= 1))) fail('map', `cluster ${cluster.id}: bad label or centre`);
  }
  if (search.length !== known.size) fail('search', `search.json has ${search.length} rows for ${known.size} disease files`);
  for (const row of search) {
    if (!known.has(row[0]) || !row[1] || !Array.isArray(row[2]) || !Array.isArray(row[3]) || !LAYERS.has(row[4])) fail('search', `search row ${row[0]} is not [id, name, [synonyms], [genes], layer]`);
  }
  if (build.synthetic !== false || !build.builtAt || !build.sources?.length) fail('build', 'build.json must say synthetic: false and carry builtAt and sources');
  for (const source of build.sources || []) {
    if (!source.name || !isWebAddress(source.url) || !source.retrieved) fail('build', `build source "${source.name}" lacks a web address or the date it was read`);
  }
  if (build.counts?.diseases !== known.size) fail('build', `build.json counts ${build.counts?.diseases} diseases; there are ${known.size} files`);

  console.log(`Checked ${number(known.size)} diseases and ${number(edges)} links (built ${build.builtAt}).`);
  console.log(`  symptom links ${number(tally[EDGE.DISEASE_PHENOTYPE])}, gene links ${number(tally[EDGE.DISEASE_GENE])}, inferred neighbour links ${number(tally[EDGE.DISEASE_SIMILAR])}`);
  console.log(`  by confidence: ${Object.entries(byConfidence).sort().map(([key, value]) => `${key} ${number(value)}`).join('; ')}`);
  console.log(`  largest disease record: ${largest.id}, ${number(largest.bytes)} bytes (limit ${number(MAX_DOCUMENT_BYTES)})`);
  console.log(`  ${map.clusters.length} regions; ${number(map.points.length)} points; ${number(search.length)} search rows`);

  if (failures.size) {
    console.error('\nFAILED');
    for (const [kind, messages] of failures) {
      console.error(`\n  ${kind}: ${number(messages.length)}`);
      for (const message of messages.slice(0, SHOW_FAILURES)) console.error(`    ${message}`);
      if (messages.length > SHOW_FAILURES) console.error(`    ... and ${number(messages.length - SHOW_FAILURES)} more`);
    }
    process.exit(1);
  }
  console.log('  every link has a source with a web address; no link points at a missing disease; positions in range; sizes within the limit.');

  console.log(`\nSpot check: ${SPOT_CHECK}`);
  if (!spot) {
    console.error(`  ${SPOT_CHECK} is not in the build.`);
    process.exit(1);
  }
  const cluster = map.clusters.find(item => item.id === spot.clusterId);
  console.log(`  ${spot.name}  [${spot.layer}]`);
  console.log(`  also called: ${spot.synonyms.slice(0, 6).join('; ')}${spot.synonyms.length > 6 ? `; and ${spot.synonyms.length - 6} more` : ''}`);
  console.log(`  ids elsewhere: ${Object.entries(spot.xrefs).filter(([key]) => ['OMIM', 'Orphanet', 'GARD'].includes(key)).map(([key, values]) => `${key} ${values.join(', ')}`).join('; ')}`);
  console.log(`  region: ${cluster.label} (${cluster.id}); position ${spot.position.join(', ')}`);
  const sourcesOf = edge => [...new Set(edge.sources.map(source => `${source.name} ${source.recordId || ''}`.trim()))];
  const short = list => `${list.slice(0, 4).join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}`;

  console.log('\n  Genes');
  for (const edge of spot.edges.filter(item => item.type === EDGE.DISEASE_GENE)) {
    console.log(`    ${edge.to.label} (${edge.to.id}), ${edge.confidence}: ${edge.statement}`);
    console.log(`      why: ${edge.confidenceWhy}`);
    console.log(`      sources: ${short(sourcesOf(edge))}`);
  }

  const symptoms = spot.edges.filter(item => item.type === EDGE.DISEASE_PHENOTYPE);
  console.log(`\n  Five most informative symptoms (of ${symptoms.length})`);
  for (const edge of [...symptoms].sort((a, b) => (b.detail?.informative ?? 0) - (a.detail?.informative ?? 0)).slice(0, 5)) {
    console.log(`    ${edge.to.label} (${edge.to.id}); informative ${edge.detail.informative}, shared by ${edge.detail.sharedBy} diseases; frequency ${edge.detail.frequency || 'not recorded'}; ${edge.confidence}`);
    console.log(`      ${edge.statement}`);
    console.log(`      sources: ${short(sourcesOf(edge))}`);
  }

  const neighbours = spot.edges.filter(item => item.type === EDGE.DISEASE_SIMILAR);
  console.log(`\n  Neighbours (${neighbours.length}), each a lead to check`);
  for (const edge of neighbours) {
    const because = edge.detail?.because || { phenotypes: [], genes: [] };
    console.log(`    ${edge.to.label} (${edge.to.id}); score ${edge.detail?.score}, ${edge.confidence}`);
    console.log(`      shared genes: ${because.genes.join(', ') || 'none'}`);
    console.log(`      shared symptoms (${edge.detail?.sharedSymptoms ?? because.phenotypes.length}): ${because.phenotypes.map(item => item.label).join(', ') || 'none'}`);
  }
  console.log('\nThe build passes.');
}

try {
  main();
} catch (error) {
  console.error(`The check could not run: ${error.message}`);
  process.exit(1);
}

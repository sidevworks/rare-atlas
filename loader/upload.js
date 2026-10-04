// Writes the local build to Firestore, exactly as the storage contract says:
//
//   diseases/{id}   the Disease object
//   map/meta        { clusters, chunks, build }
//   map/{0..n-1}    { index, points: <JSON text of a slice of the points> }
//   search/meta     { chunks }
//   search/{0..n-1} { index, entries: <JSON text of a slice of the rows> }
//   meta/build      the build.json object
//
//   node loader/upload.js --dry-run     checks sizes and counts, writes nothing
//   node loader/upload.js               writes; needs FIREBASE_PROJECT_ID and
//                                       Application Default Credentials
//                                       (gcloud auth application-default login)
//   node loader/upload.js --prune       also deletes diseases and slices left
//                                       over from an earlier, different build
//
// Points and search rows are arrays of arrays, which Firestore cannot hold,
// so each slice travels as JSON text.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/paths.js';
import { MAX_DOCUMENT_BYTES, chunkAsText, eachDisease, firestoreProblems, jsonBytes, loadBuild } from './lib/build-files.js';

const number = value => value.toLocaleString('en');
const megabytes = bytes => `${(bytes / 1e6).toFixed(1)} MB`;

// Everything except the diseases, which are read one at a time.
export function smallDocuments({ build, map, search }) {
  const mapChunks = chunkAsText(map.points);
  const searchChunks = chunkAsText(search);
  return [
    { path: 'meta/build', data: build },
    { path: 'map/meta', data: { clusters: map.clusters, chunks: mapChunks.length, build } },
    ...mapChunks.map((text, index) => ({ path: `map/${index}`, data: { index, points: text } })),
    { path: 'search/meta', data: { chunks: searchChunks.length } },
    ...searchChunks.map((text, index) => ({ path: `search/${index}`, data: { index, entries: text } })),
  ];
}

// Reads the whole build once and refuses to go on if anything would not fit
// or could not be stored. Runs before every upload, dry or real.
export function validate(local) {
  const problems = [];
  const small = smallDocuments(local);
  let bytes = 0;
  let largest = { path: '', bytes: 0 };
  const measure = (where, data, knownBytes) => {
    const size = knownBytes ?? jsonBytes(data);
    bytes += size;
    if (size > largest.bytes) largest = { path: where, bytes: size };
    if (size > MAX_DOCUMENT_BYTES) problems.push(`${where}: ${number(size)} bytes, over the ${number(MAX_DOCUMENT_BYTES)} limit`);
    for (const problem of firestoreProblems(data).slice(0, 3)) problems.push(`${where}: ${problem}`);
  };

  for (const document of small) measure(document.path, document.data);
  let diseases = 0;
  let links = 0;
  for (const { id, bytes: size, disease } of eachDisease(local.diseaseFiles)) {
    if (disease.id !== id) problems.push(`diseases/${id}: the file holds id ${disease.id}`);
    measure(`diseases/${id}`, disease, size);
    diseases += 1;
    links += disease.edges?.length || 0;
  }

  // The slices must give back exactly the rows they were cut from.
  const rejoin = prefix => small.filter(document => new RegExp(`^${prefix}/\\d+$`).test(document.path)).flatMap(document => JSON.parse(document.data.points || document.data.entries));
  if (rejoin('map').length !== local.map.points.length) problems.push('map slices do not add up to the points in map.json');
  if (rejoin('search').length !== local.search.length) problems.push('search slices do not add up to the rows in search.json');
  if (local.map.points.length !== diseases) problems.push(`map.json has ${local.map.points.length} points for ${diseases} disease files`);
  if (local.search.length !== diseases) problems.push(`search.json has ${local.search.length} rows for ${diseases} disease files`);
  if (local.build.counts?.diseases !== diseases) problems.push(`build.json counts ${local.build.counts?.diseases} diseases; there are ${diseases} files`);
  if (local.build.synthetic !== false) problems.push('build.json does not say synthetic: false');

  return { problems, small, diseases, links, documents: small.length + diseases, bytes, largest };
}

/**
 * Writes every document through a BulkWriter.
 * @param {FirebaseFirestore.Firestore} db
 */
export async function upload(db, local, plan, { prune = false, log = console.log } = {}) {
  const writer = db.bulkWriter();
  let written = 0;
  const failed = [];
  // The writer retries on its own; a write that still fails is reported at
  // the end and makes the run fail.
  writer.onWriteError(error => {
    if (error.failedAttempts < 5) return true;
    failed.push(`${error.documentRef.path}: ${error.message}`);
    return false;
  });
  writer.onWriteResult(() => {
    written += 1;
    if (written % 500 === 0) log(`  ${number(written)} of ${number(plan.documents)} written`);
  });

  let queued = 0;
  for (const { id, disease } of eachDisease(local.diseaseFiles)) {
    writer.set(db.doc(`diseases/${id}`), disease);
    queued += 1;
    // Flushing in steps keeps a few hundred megabytes from queueing in memory.
    if (queued % 200 === 0) await writer.flush();
  }
  // The small documents go last: map/meta and search/meta tell the server
  // how many slices to read, so they should only change once the slices have.
  for (const document of [...plan.small].reverse()) writer.set(db.doc(document.path), document.data);
  await writer.close();

  let pruned = 0;
  if (prune) {
    const current = new Set([...local.diseaseFiles.map(name => `diseases/${name.replace(/\.json$/, '')}`), ...plan.small.map(document => document.path)]);
    const cleaner = db.bulkWriter();
    for (const collection of ['diseases', 'map', 'search']) {
      for (const reference of await db.collection(collection).listDocuments()) {
        if (current.has(reference.path)) continue;
        cleaner.delete(reference);
        pruned += 1;
      }
    }
    await cleaner.close();
  }
  return { written, failed, pruned };
}

function loadEnvFiles() {
  if (typeof process.loadEnvFile !== 'function') return;
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const unknown = [...flags].filter(flag => !['--dry-run', '--prune'].includes(flag));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(', ')}. Use --dry-run or --prune.`);
  const dryRun = flags.has('--dry-run');

  const local = loadBuild();
  console.log(`Build of ${local.build.builtAt}: checking ${number(local.diseaseFiles.length)} diseases before ${dryRun ? 'a dry run' : 'uploading'}`);
  const plan = validate(local);
  const mapChunks = plan.small.filter(document => /^map\/\d+$/.test(document.path)).length;
  const searchChunks = plan.small.filter(document => /^search\/\d+$/.test(document.path)).length;
  console.log(`  diseases/{id}: ${number(plan.diseases)} documents holding ${number(plan.links)} links`);
  console.log(`  map: meta + ${mapChunks} slice${mapChunks === 1 ? '' : 's'}; search: meta + ${searchChunks} slice${searchChunks === 1 ? '' : 's'}; meta/build`);
  console.log(`  ${number(plan.documents)} documents, ${megabytes(plan.bytes)} as JSON; largest ${plan.largest.path} at ${number(plan.largest.bytes)} bytes (limit ${number(MAX_DOCUMENT_BYTES)})`);

  if (plan.problems.length) {
    console.error(`\n${number(plan.problems.length)} problem${plan.problems.length === 1 ? '' : 's'}; nothing was written.`);
    for (const problem of plan.problems.slice(0, 20)) console.error(`  ${problem}`);
    process.exit(1);
  }
  if (dryRun) {
    console.log('\nDry run: sizes and counts are fine. Nothing was written.');
    return;
  }

  loadEnvFiles();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set. Put it in .env.local or the environment, or use --dry-run.');

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  console.log(`\nWriting to Firestore project ${projectId}`);
  const started = Date.now();
  const result = await upload(db, local, plan, { prune: flags.has('--prune') });
  console.log(`  ${number(result.written)} of ${number(plan.documents)} documents written in ${((Date.now() - started) / 1000).toFixed(0)} s${flags.has('--prune') ? `; ${number(result.pruned)} left-over documents deleted` : ''}`);
  if (result.failed.length) {
    console.error(`\n${number(result.failed.length)} writes failed:`);
    for (const failure of result.failed.slice(0, 20)) console.error(`  ${failure}`);
    process.exit(1);
  }

  // Read one thing back so "done" means the server has it.
  const stored = await db.doc('meta/build').get();
  const count = await db.collection('diseases').count().get();
  console.log(`  read back: meta/build built ${stored.get('builtAt')}; diseases collection holds ${number(count.data().count)} documents`);
  console.log('\nUpload complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`The upload stopped: ${error.message}`);
    process.exit(1);
  });
}

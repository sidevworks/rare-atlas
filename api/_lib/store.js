// Where the graph is read from. The first of these that answers is used:
//   1. Firestore, over its public REST API, when FIREBASE_PROJECT_ID is set.
//      The rules allow anyone to read, so no credentials are involved.
//   2. The loader's local build in data/build/, when it exists.
//   3. The synthetic fixture in api/_fixtures/, so the atlas always runs.
// ATLAS_SOURCE=firestore|local|fixture forces one, for testing.
//
// The map and the search rows are kept in this server's memory; disease
// records are kept for the most recently asked few hundred.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';
import { normalise, tokens } from './text.js';

const FIRESTORE_RECHECK_MS = 10 * 60 * 1000;
const LOCAL_RECHECK_MS = 15 * 1000;
const AFTER_FAILURE_MS = 60 * 1000;
const DISEASES_KEPT = 400;

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

// Firestore's REST API wraps every value in its type: { stringValue: "x" }.
function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  return null;
}

export function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

async function firestoreGet(projectId, documentPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore answered ${response.status} for ${documentPath}`);
  const document = await response.json();
  return decodeFields(document.fields);
}

// Points and search rows are stored as JSON strings in numbered documents,
// because Firestore cannot hold an array directly inside an array.
async function firestoreChunks(projectId, collection, count, field) {
  const parts = await Promise.all(
    Array.from({ length: count }, (_, index) => firestoreGet(projectId, `${collection}/${index}`)),
  );
  return parts.flatMap((part, index) => {
    if (!part) throw new Error(`Firestore is missing ${collection}/${index}`);
    return typeof part[field] === 'string' ? JSON.parse(part[field]) : part[field] || [];
  });
}

function firestoreReader(projectId, build) {
  return {
    kind: 'firestore',
    stamp: `firestore:${projectId}:${build.builtAt}`,
    build: async () => build,
    async map() {
      const meta = await firestoreGet(projectId, 'map/meta');
      if (!meta) throw new Error('Firestore is missing map/meta');
      const points = await firestoreChunks(projectId, 'map', meta.chunks || 0, 'points');
      return { clusters: meta.clusters || [], points, build: meta.build || build };
    },
    async searchRows() {
      const meta = await firestoreGet(projectId, 'search/meta');
      if (!meta) throw new Error('Firestore is missing search/meta');
      return firestoreChunks(projectId, 'search', meta.chunks || 0, 'entries');
    },
    disease: id => firestoreGet(projectId, `diseases/${encodeURIComponent(id)}`),
  };
}

// ---------------------------------------------------------------------------
// The loader's local build
// ---------------------------------------------------------------------------

const readJsonFile = async file => JSON.parse(await readFile(file, 'utf8'));

async function findLocalBuild() {
  // Beside this file's project first, then wherever the server was started.
  const places = [path.join(process.cwd(), 'data', 'build')];
  try {
    places.unshift(fileURLToPath(new URL('../../data/build/', import.meta.url)));
  } catch {
    // Some runners give this module no file address; the second place covers it.
  }
  for (const directory of places) {
    try {
      const info = await stat(path.join(directory, 'build.json'));
      await stat(path.join(directory, 'map.json'));
      return { directory, modified: info.mtimeMs };
    } catch {
      // Not here; try the next place.
    }
  }
  return null;
}

function localReader({ directory, modified }) {
  return {
    kind: 'local',
    stamp: `local:${directory}:${modified}`,
    build: () => readJsonFile(path.join(directory, 'build.json')),
    map: () => readJsonFile(path.join(directory, 'map.json')),
    searchRows: () => readJsonFile(path.join(directory, 'search.json')),
    async disease(id) {
      try {
        return await readJsonFile(path.join(directory, 'diseases', `${id}.json`));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The synthetic fixture
// ---------------------------------------------------------------------------

async function fixtureReader() {
  const { fixture } = await import('../_fixtures/graph.js');
  const graph = fixture();
  return {
    kind: 'fixture',
    stamp: 'fixture',
    build: async () => graph.build,
    map: async () => graph.map,
    searchRows: async () => graph.search,
    disease: async id => graph.disease(id),
  };
}

// ---------------------------------------------------------------------------
// Choosing, and remembering
// ---------------------------------------------------------------------------

let current = null; // { reader, until }
let choosing = null;
let memory = { stamp: null, map: null, index: null, build: null, diseases: new Map() };

async function choose() {
  const forced = (process.env.ATLAS_SOURCE || '').trim().toLowerCase();
  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const now = Date.now();
  let firestoreFailed = false;

  if (projectId && (!forced || forced === 'firestore')) {
    try {
      const build = await firestoreGet(projectId, 'meta/build');
      if (build) return { reader: firestoreReader(projectId, build), until: now + FIRESTORE_RECHECK_MS };
      console.warn(`Firestore project ${projectId} holds no graph yet (meta/build is missing).`);
    } catch (error) {
      console.warn(`Firestore project ${projectId} could not be read: ${error.message}`);
    }
    firestoreFailed = true;
  }
  if (forced === 'firestore') {
    throw new HttpError(503, 'The graph database could not be read just now.');
  }

  // After a Firestore failure, look again soon rather than settling on a
  // fallback for long.
  const until = now + (firestoreFailed ? AFTER_FAILURE_MS : LOCAL_RECHECK_MS);

  if (!forced || forced === 'local') {
    const local = await findLocalBuild();
    if (local) return { reader: localReader(local), until };
    if (forced === 'local') throw new HttpError(503, 'There is no local build in data/build. Run the loader first.');
  }

  return { reader: await fixtureReader(), until };
}

async function reader() {
  if (current && Date.now() < current.until) return current.reader;
  if (!choosing) {
    choosing = choose()
      .then(choice => {
        current = choice;
        // A different source, or a newer build of the same one: forget
        // everything that was read from the old one.
        if (choice.reader.stamp !== memory.stamp) {
          memory = { stamp: choice.reader.stamp, map: null, index: null, build: null, diseases: new Map() };
        }
        return choice.reader;
      })
      .finally(() => {
        choosing = null;
      });
  }
  return choosing;
}

// A failed read must not be remembered, or one bad moment would stick.
function remember(slot, load) {
  const mine = memory;
  if (!mine[slot]) {
    mine[slot] = load().catch(error => {
      mine[slot] = null;
      throw error;
    });
  }
  return mine[slot];
}

export async function sourceKind() {
  return (await reader()).kind;
}

export async function getBuild() {
  const from = await reader();
  return remember('build', () => from.build());
}

/** @returns {Promise<import('../../shared/schema.js').MapResponse>} */
export async function getMap() {
  const from = await reader();
  return remember('map', () => from.map());
}

// Search rows, with their names already normalised so a search is one pass.
export async function getSearchIndex() {
  const from = await reader();
  return remember('index', async () => {
    const rows = await from.searchRows();
    return rows.map(([id, name, synonyms, genes, layer]) => ({
      id,
      name,
      layer: layer || 'wide',
      nameNorm: normalise(name),
      nameTokens: tokens(name),
      synonyms: (synonyms || []).map(text => ({ text, norm: normalise(text), tokens: tokens(text) })),
      genes: (genes || []).map(text => ({ text, norm: normalise(text) })),
    }));
  });
}

// The server's own check on the one rule: a link with no source that a
// person can open is never passed on, whatever the database holds.
const hasSource = edge =>
  edge && edge.id && edge.statement && Array.isArray(edge.sources) &&
  edge.sources.some(source => source && source.name && (source.url || source.recordId));

function tidy(disease) {
  return {
    ...disease,
    synonyms: disease.synonyms || [],
    xrefs: disease.xrefs || {},
    position: disease.position || [0, 0, 0],
    edges: (Array.isArray(disease.edges) ? disease.edges : []).filter(hasSource),
  };
}

/** @returns {Promise<import('../../shared/schema.js').Disease | null>} */
export async function getDisease(id) {
  const from = await reader();
  const kept = memory.diseases;
  if (kept.has(id)) {
    const disease = kept.get(id);
    // Re-insert so the most recently asked stay longest.
    kept.delete(id);
    kept.set(id, disease);
    return disease;
  }
  const raw = await from.disease(id);
  if (!raw || !raw.id) return null;
  const disease = tidy(raw);
  kept.set(id, disease);
  if (kept.size > DISEASES_KEPT) kept.delete(kept.keys().next().value);
  return disease;
}

export async function requireDisease(id) {
  const disease = await getDisease(id);
  if (!disease) throw new HttpError(404, `The atlas has no disease with the id ${id}.`);
  return disease;
}

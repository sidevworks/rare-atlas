// Builds the Mondo floor dataset: one compact record per rare disease in the
// Mondo Disease Ontology, grouped by Mondo's body-system categories, ready
// for the atlas world to lay out as a mosaic of tiles.
//
//   node loader/mondo/build.js                 reads data/raw/mondo.json
//                                              (downloads it when missing)
//   node loader/mondo/build.js --dir ./files   reads a folder of per-disease
//                                              JSON files (OBO-graph node or
//                                              {id,name,...} shape) instead
//   node loader/mondo/build.js --all           keeps every Mondo disease, not
//                                              only the rare subset
//
// Writes data/build/mondo-floor.json (full records, for the server and the
// desk) and data/build/mondo-floor.compact.json (typed arrays, for the world).
// Neither is committed; both are reproduced by this script.

import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const MONDO_URL = 'https://github.com/monarch-initiative/mondo/releases/latest/download/mondo.json';
const OBO = 'http://purl.obolibrary.org/obo/';
const RAW = path.join('data', 'raw', 'mondo.json');
const OUT_DIR = path.join('data', 'build');

// The floor's galleries. The first group is Mondo's "disease by body system or
// component"; the second adds the branches that the body-system view leaves
// out, so that almost every rare disease has a home. Order is the walking
// order around the floor. Counts are only used to pick a primary gallery when
// a disease sits under several: the smallest wins, and "syndromic disease"
// only wins when nothing else claims the disease.
const CATEGORIES = [
  ['MONDO_0005071', 'Nervous system', 'nervous system disorder'],
  ['MONDO_0002081', 'Musculoskeletal', 'musculoskeletal system disorder'],
  ['MONDO_0003900', 'Connective tissue', 'connective tissue disorder'],
  ['MONDO_0005151', 'Endocrine', 'endocrine system disorder'],
  ['MONDO_0005066', 'Metabolic', 'metabolic disease'],
  ['MONDO_0005046', 'Immune system', 'immune system disorder'],
  ['MONDO_0005570', 'Blood', 'hematologic disorder'],
  ['MONDO_0004995', 'Heart & vessels', 'cardiovascular disorder'],
  ['MONDO_0005087', 'Respiratory', 'respiratory system disorder'],
  ['MONDO_0004335', 'Digestive', 'digestive system disorder'],
  ['MONDO_0002118', 'Urinary', 'urinary system disorder'],
  ['MONDO_0005039', 'Reproductive', 'reproductive system disorder'],
  ['MONDO_0002051', 'Skin', 'integumentary system disorder'],
  ['MONDO_0024458', 'Vision', 'disorder of visual system'],
  ['MONDO_0002409', 'Hearing', 'auditory system disorder'],
  ['MONDO_0024623', 'Ear, nose & throat', 'otorhinolaryngologic disease'],
  ['MONDO_0006858', 'Mouth', 'mouth disorder'],
  ['MONDO_0002657', 'Breast', 'breast disorder'],
  ['MONDO_0005070', 'Neoplasm', 'neoplasm'],
  ['MONDO_0005550', 'Infectious', 'infectious disease'],
  ['MONDO_0002025', 'Mental', 'psychiatric disorder'],
  ['MONDO_0002254', 'Syndromic', 'syndromic disease'],
];
const OTHER = 'Other';

// Bits in each record's flags byte.
export const FLAG = Object.freeze({
  GARD: 1, NORD: 2, ORPHANET: 4, OMIM: 8, DEFINITION: 16, SYNDROMIC: 32, CLINGEN: 64, GROUPING: 128,
});

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dir = option('--dir');
const keepAll = args.includes('--all');

const short = iri => iri.replace(OBO, '').replace('http://purl.obolibrary.org/obo/mondo#', '');
const subsetName = s => s.split('#').pop();

async function download(url, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(to));
}

function readGraph() {
  if (!existsSync(RAW)) return null;
  const graph = JSON.parse(readFileSync(RAW, 'utf8')).graphs[0];
  const nodes = new Map();
  for (const n of graph.nodes) {
    if (n.type !== 'CLASS' || !n.id.startsWith(OBO + 'MONDO_') || n.meta?.deprecated) continue;
    nodes.set(short(n.id), n);
  }
  const parents = new Map();
  for (const e of graph.edges) {
    if (e.pred !== 'is_a') continue;
    const sub = short(e.sub), obj = short(e.obj);
    if (!nodes.has(sub) || !nodes.has(obj)) continue;
    if (!parents.has(sub)) parents.set(sub, []);
    parents.get(sub).push(obj);
  }
  return { nodes, parents };
}

// A folder of one JSON file per disease. Each file is either an OBO-graph
// node ({id, lbl, meta}) or a plain record ({id, name, definition, synonyms,
// xrefs, parents, subsets}). Parents may be missing; then categories come
// from a "categories" or "category" field when present, else Other.
function readDirectory(folder) {
  const nodes = new Map(), parents = new Map();
  const files = readdirSync(folder, { recursive: true }).filter(f => f.endsWith('.json'));
  console.log(`Reading ${files.length} files from ${folder}`);
  for (const file of files) {
    let data;
    try { data = JSON.parse(readFileSync(path.join(folder, file), 'utf8')); } catch { continue; }
    const list = Array.isArray(data) ? data : [data];
    for (const item of list) {
      const id = String(item.id || item.mondoId || item.curie || '').replace(OBO, '').replace(':', '_');
      if (!/^MONDO_\d+$/.test(id)) continue;
      const node = item.lbl !== undefined ? item : {
        id, lbl: item.name || item.label || id, meta: {
          definition: item.definition ? { val: typeof item.definition === 'string' ? item.definition : item.definition.val } : undefined,
          synonyms: (item.synonyms || []).map(s => (typeof s === 'string' ? { val: s } : s)),
          xrefs: (Array.isArray(item.xrefs) ? item.xrefs : Object.entries(item.xrefs || {}).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => `${k}:${x}`))).map(x => (typeof x === 'string' ? { val: x } : x)),
          subsets: (item.subsets || []).map(s => (s.includes('#') ? s : `mondo#${s}`)),
        },
        categories: item.categories || (item.category ? [item.category] : []),
      };
      nodes.set(id, node);
      const ps = (item.parents || item.is_a || []).map(p => String(p).replace(OBO, '').replace(':', '_'));
      if (ps.length) parents.set(id, ps);
    }
  }
  return { nodes, parents };
}

function build({ nodes, parents }) {
  const ancestorsOf = new Map();
  const ancestors = id => {
    if (ancestorsOf.has(id)) return ancestorsOf.get(id);
    const out = new Set();
    ancestorsOf.set(id, out); // guards against cycles
    for (const p of parents.get(id) || []) { out.add(p); for (const a of ancestors(p)) out.add(a); }
    return out;
  };
  const childCount = new Map();
  for (const [id] of nodes) for (const a of ancestors(id)) childCount.set(a, (childCount.get(a) || 0) + 1);
  const depthOf = new Map();
  const depth = id => {
    if (depthOf.has(id)) return depthOf.get(id);
    depthOf.set(id, 0);
    const ps = parents.get(id) || [];
    const d = ps.length ? 1 + Math.min(...ps.map(depth)) : 0;
    depthOf.set(id, d);
    return d;
  };

  const categoryIndex = new Map(CATEGORIES.map(([id], i) => [id, i]));
  const labelIndex = new Map(CATEGORIES.map(([, label, mondoLabel], i) => [mondoLabel, i]).concat(CATEGORIES.map(([, label], i) => [label.toLowerCase(), i])));
  const members = CATEGORIES.map(() => 0);
  const records = [];

  for (const [id, n] of nodes) {
    const meta = n.meta || {};
    const subsets = (meta.subsets || []).map(subsetName);
    const rare = subsets.includes('rare') || subsets.includes('gard_rare') || subsets.includes('nord_rare') || subsets.includes('orphanet_rare') || subsets.includes('ordo_disorder');
    if (!keepAll && !rare) continue;
    const anc = ancestors(id);
    const cats = new Set();
    for (const a of anc) if (categoryIndex.has(a)) cats.add(categoryIndex.get(a));
    for (const c of n.categories || []) { const i = labelIndex.get(String(c).toLowerCase()); if (i !== undefined) cats.add(i); }
    const xrefs = {};
    for (const x of meta.xrefs || []) { const [prefix, ...rest] = String(x.val).split(':'); (xrefs[prefix] ||= []).push(rest.join(':')); }
    const synonyms = [...new Set((meta.synonyms || []).map(s => s.val).filter(Boolean))];
    let flags = 0;
    if (subsets.includes('gard_rare') || xrefs.GARD) flags |= FLAG.GARD;
    if (subsets.includes('nord_rare')) flags |= FLAG.NORD;
    if (subsets.includes('orphanet_rare') || subsets.includes('ordo_disorder') || xrefs.Orphanet) flags |= FLAG.ORPHANET;
    if (xrefs.OMIM || xrefs.OMIMPS) flags |= FLAG.OMIM;
    if (meta.definition?.val) flags |= FLAG.DEFINITION;
    if (cats.has(categoryIndex.get('MONDO_0002254'))) flags |= FLAG.SYNDROMIC;
    if (subsets.includes('clingen')) flags |= FLAG.CLINGEN;
    if (subsets.includes('disease_grouping') || subsets.includes('rare_grouping') || subsets.includes('ordo_group_of_disorders')) flags |= FLAG.GROUPING;
    for (const c of cats) members[c]++;
    records.push({
      id, name: n.lbl || id, definition: meta.definition?.val || '', synonyms, xrefs, subsets,
      categories: [...cats], parents: parents.get(id) || [], descendants: childCount.get(id) || 0, depth: depth(id), flags,
    });
  }

  // Primary gallery: the most specific (smallest) category, syndromic last.
  const syndromic = categoryIndex.get('MONDO_0002254');
  for (const r of records) {
    const options = r.categories.filter(c => c !== syndromic);
    const pool = options.length ? options : r.categories;
    r.category = pool.length ? pool.reduce((best, c) => (members[c] < members[best] ? c : best)) : CATEGORIES.length;
  }
  records.sort((a, b) => a.category - b.category || a.name.localeCompare(b.name, 'en'));
  return records;
}

const b64 = typed => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

function compact(records, source) {
  const n = records.length;
  const ids = new Uint32Array(n), cat = new Uint8Array(n), cats = new Uint32Array(n), flags = new Uint8Array(n);
  const syn = new Uint8Array(n), xref = new Uint8Array(n), kids = new Uint16Array(n), depth = new Uint8Array(n);
  records.forEach((r, i) => {
    ids[i] = Number(r.id.slice(6));
    cat[i] = r.category;
    cats[i] = r.categories.reduce((m, c) => m | (1 << c), 0);
    flags[i] = r.flags;
    syn[i] = Math.min(255, r.synonyms.length);
    xref[i] = Math.min(255, Object.values(r.xrefs).reduce((s, v) => s + v.length, 0));
    kids[i] = Math.min(65535, r.descendants);
    depth[i] = Math.min(255, r.depth);
  });
  const counts = CATEGORIES.map(() => 0).concat([0]);
  for (const r of records) counts[r.category]++;
  return {
    format: 'mondo-floor-compact/1',
    builtAt: new Date().toISOString(),
    source,
    categories: CATEGORIES.map(([id, label, mondoLabel], i) => ({ id, label, mondoLabel, count: counts[i] })).concat([{ id: null, label: OTHER, mondoLabel: 'unclassified', count: counts[CATEGORIES.length] }]),
    flagBits: FLAG,
    n,
    names: records.map(r => r.name.replace(/[\n\r]+/g, ' ')).join('\n'),
    ids: b64(ids), cat: b64(cat), cats: b64(cats), flags: b64(flags), syn: b64(syn), xref: b64(xref), kids: b64(kids), depth: b64(depth),
  };
}

async function main() {
  let graph;
  if (dir) graph = readDirectory(dir);
  else {
    if (!existsSync(RAW)) await download(MONDO_URL, RAW);
    graph = readGraph();
  }
  console.log(`${graph.nodes.size} Mondo classes read`);
  const records = build(graph);
  const source = { name: 'Mondo Disease Ontology', url: dir ? `file:${dir}` : MONDO_URL, retrieved: new Date().toISOString().slice(0, 10), subset: keepAll ? 'all' : 'rare' };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'mondo-floor.json'), JSON.stringify({ source, categories: CATEGORIES.map(([id, label, mondoLabel]) => ({ id, label, mondoLabel })).concat([{ id: null, label: OTHER }]), flagBits: FLAG, records }));
  const small = compact(records, source);
  writeFileSync(path.join(OUT_DIR, 'mondo-floor.compact.json'), JSON.stringify(small));
  console.log(`${records.length} diseases written to ${OUT_DIR}`);
  for (const c of small.categories) console.log(`  ${String(c.count).padStart(6)}  ${c.label}`);
}

main().catch(error => { console.error(error); process.exit(1); });

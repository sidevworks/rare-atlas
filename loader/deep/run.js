// The deep layer, from the hand-checked file only.
//
//   node loader/deep/run.js            writes the local build
//   node loader/deep/run.js --upload   also writes the changed diseases to Firestore
//
// Adds to each disease in the developmental-epilepsy cluster: the patient
// organisations working on it, what they have built, and the infrastructure
// it already shares with other communities. Every link names the page it was
// read on. Nothing here is inferred from biology: a shared study or registry
// is a fact about shared work, and the statements say so.
//
// It changes a handful of disease records in place, so it does not need the
// full build or a full upload.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const curated = JSON.parse(readFileSync(path.join(root, 'loader/deep/curated/groups.json'), 'utf8'));
const diseaseFile = id => path.join(root, 'data/build/diseases', `${id}.json`);

// The single-gene disease each community is organised around. Two genes have
// no disease of their own in the wide layer; those are named with the closest
// record the layer holds and a note saying so.
const DISEASE_FOR_GENE = {
  STXBP1: 'MONDO_0012812',
  SCN2A: 'MONDO_0013388',
  SYNGAP1: 'MONDO_0012960',
  CDKL5: 'MONDO_0010396',
  SCN8A: 'MONDO_0013801',
  KCNQ2: 'MONDO_0013387',
  SLC6A1: 'MONDO_0014633',
  SCN1A: 'MONDO_0100135',
};
const GENES = Object.keys(DISEASE_FOR_GENE);

const STUDY = /trial|natural history|study/i;
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const source = (name, url) => ({ name, url, retrieved: curated.retrieved });
const CHECKED = 'Read on the page named as the source, then confirmed by a second reader who reopened it.';

const diseases = new Map();
const skipped = [];
for (const [gene, id] of Object.entries(DISEASE_FOR_GENE)) {
  if (!existsSync(diseaseFile(id))) {
    skipped.push(`${gene}: ${id} is not in the wide layer`);
    continue;
  }
  const disease = JSON.parse(readFileSync(diseaseFile(id), 'utf8'));
  // Running this twice must not pile up copies.
  disease.edges = disease.edges.filter(edge => !edge.detail?.deep);
  diseases.set(gene, disease);
}

const ref = disease => ({ kind: 'disease', id: disease.id, label: disease.name });
const add = (disease, edge) => disease.edges.push({ ...edge, detail: { ...edge.detail, deep: true } });

// 1. Organisations and what they have built.
for (const group of curated.groups) {
  const disease = diseases.get(group.gene);
  if (!disease) continue;
  const org = { kind: 'group', id: `group:${slug(group.organisation)}`, label: group.organisation };
  add(disease, {
    id: `${disease.id}--group--${slug(group.organisation)}`,
    type: 'group-disease',
    from: org,
    to: ref(disease),
    statement: `${group.organisation} is a patient organisation for ${group.gene}-related disorders.`,
    basis: 'observed',
    confidence: 'high',
    confidenceWhy: CHECKED,
    sources: [source(group.organisation, group.organisationUrl)],
    detail: { gene: group.gene },
  });
  for (const asset of group.assets) {
    const study = STUDY.test(asset.kind);
    add(disease, {
      id: `${disease.id}--${study ? 'study' : 'asset'}--${slug(group.organisation)}--${slug(asset.name)}`,
      type: study ? 'study-disease' : 'group-asset',
      from: org,
      to: { kind: study ? 'study' : 'asset', id: `asset:${slug(asset.name)}`, label: asset.name },
      statement: `${group.organisation}: ${asset.name} (${asset.kind}).`,
      basis: 'observed',
      confidence: 'high',
      confidenceWhy: CHECKED,
      sources: [source(group.organisation, asset.evidenceUrl)],
      detail: { kind: asset.kind, gene: group.gene, ...(asset.quote ? { quote: asset.quote } : {}) },
    });
  }
}

// 2. Infrastructure that already links communities.
const pairs = new Map();
for (const shared of curated.sharedInfrastructure) {
  const text = `${shared.name} ${shared.links}`;
  const genes = GENES.filter(gene => new RegExp(`\\b${gene}\\b`).test(text) && diseases.has(gene));
  if (genes.length < 2) continue;
  for (const gene of genes) {
    const disease = diseases.get(gene);
    const others = genes.filter(other => other !== gene);
    add(disease, {
      id: `${disease.id}--shared--${slug(shared.name)}`,
      type: STUDY.test(shared.name) ? 'study-disease' : 'group-asset',
      from: ref(disease),
      to: { kind: 'asset', id: `shared:${slug(shared.name)}`, label: shared.name },
      statement: `Shared with the ${others.join(', ')} ${others.length === 1 ? 'community' : 'communities'}: ${shared.name}.`,
      basis: 'observed',
      confidence: 'high',
      confidenceWhy: CHECKED,
      sources: [source(shared.name, shared.evidenceUrl)],
      detail: { sharedWith: others, links: shared.links },
    });
    for (const other of others) {
      const key = `${gene}|${other}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(shared);
    }
  }
}

// 3. One connection per pair of communities that share infrastructure. It
// outranks the symptom-based leads because it is observed, not inferred, but
// it is a statement about shared work and says so.
for (const [key, items] of pairs) {
  const [gene, other] = key.split('|');
  const from = diseases.get(gene);
  const to = diseases.get(other);
  const names = items.map(item => item.name);
  add(from, {
    id: `${from.id}--shared-work--${to.id}`,
    type: 'disease-similar',
    from: ref(from),
    to: ref(to),
    statement:
      `The ${gene} and ${other} communities already share ${items.length} piece${items.length === 1 ? '' : 's'} of research infrastructure ` +
      `(such as ${names.slice(0, 2).join(' and ')}). This is shared work, not proof that the two diseases share a mechanism or a treatment.`,
    basis: 'observed',
    confidence: 'high',
    confidenceWhy: `${CHECKED} It establishes that the communities work together, nothing about biology.`,
    sources: items.map(item => source(item.name, item.evidenceUrl)),
    detail: {
      score: Math.min(0.99, 0.6 + 0.05 * items.length),
      relation: 'shared-infrastructure',
      because: { shared: names },
      differs: ['Whether the two diseases share a mechanism has not been established by this link.'],
    },
  });
}

for (const disease of diseases.values()) {
  disease.layer = 'deep';
  writeFileSync(diseaseFile(disease.id), JSON.stringify(disease));
}

const count = type => [...diseases.values()].reduce((n, d) => n + d.edges.filter(e => e.detail?.deep && e.type === type).length, 0);
console.log(`Deep layer: ${diseases.size} diseases; ${count('group-disease')} organisations, ${count('group-asset')} assets, ${count('study-disease')} studies, ${count('disease-similar')} shared-work connections.`);
if (skipped.length) console.log(`Not covered: ${skipped.join('; ')}`);

if (process.argv.includes('--upload')) {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  const db = getFirestore();
  for (const disease of diseases.values()) await db.doc(`diseases/${disease.id}`).set(disease);
  console.log(`Uploaded ${diseases.size} disease records.`);
}

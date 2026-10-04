// Brings every row of every source onto one MONDO id per disease, decides
// which diseases the atlas keeps, and counts everything that did not make it.
//
// WHAT COUNTS AS A RARE DISEASE HERE
// A disease is kept when a source calls it rare and the atlas has something to
// say about it:
//   1. it is a live MONDO term, and
//   2. MONDO puts it in its "rare" subset (which gathers GARD, NORD, Orphanet,
//      DOID and NCIT rare lists), or MONDO gives it an equivalent Orphanet
//      entry (Orphanet is a catalogue of rare diseases), and
//   3. at least one symptom or one gene is recorded for it.
// One further group is kept and marked as the atlas's own call, not a
// source's: recently described single-gene diseases that the rare lists have
// not caught up with. A disease is in this group only when all of these hold:
// MONDO has not marked it rare; HPO first annotated it in RECENT_SINCE or
// later; HPO's gene table gives it a Mendelian gene; MONDO itself records an
// inherited change in a gene as its basis; it has no narrower forms (it is
// one disease, not a family of them); and it is not a "susceptibility to"
// entry. Each disease record says which reason applied (rarity.reason).
// Everything else that mapped to MONDO is left out and listed in report.json.

import { PHENOTYPE_ROOT } from './hpo.js';
import { parseFrequency } from './frequency.js';

// Set to false to keep only diseases a source itself lists as rare.
export const INCLUDE_UNLISTED_SINGLE_GENE = true;
// Older entries that no rare list has picked up in all this time are mostly
// common conditions and harmless traits, so only recent ones qualify.
export const RECENT_SINCE = 2017;

const SUSCEPTIBILITY_NAME = /susceptib|predispos|resistance to|protection against|response to|quantitative trait/i;

export const RARITY = Object.freeze({
  MONDO: 'mondo-rare-subset',
  ORPHANET: 'orphanet-entry',
  SINGLE_GENE: 'single-gene-not-yet-listed',
  DEEP: 'checked-by-hand',
});

export function reconcile({ mondo, hpo, annotations, geneRows, orpha, forceIds = [] }) {
  const records = new Map();
  const unmapped = new Map();
  const unknownTerms = new Map();

  const recordFor = mondoId => {
    let record = records.get(mondoId);
    if (!record) {
      record = {
        term: mondo.terms.get(mondoId),
        phenotypes: new Map(),
        genes: new Map(),
        names: new Map(),
        annotated: new Map(),
        firstCurated: Infinity,
        forced: false,
      };
      records.set(mondoId, record);
    }
    return record;
  };

  const noteUnmapped = (id, name, field) => {
    let entry = unmapped.get(id);
    if (!entry) {
      entry = { id, name: name || '', phenotypeRows: 0, geneRows: 0, orphadataAssociations: 0 };
      unmapped.set(id, entry);
    }
    if (name && !entry.name) entry.name = name;
    entry[field] += 1;
  };

  // Every row that names a disease id goes through here, so nothing can be
  // dropped without being counted.
  const place = (externalId, name, field) => {
    const hit = mondo.byXref.get(externalId);
    if (!hit) {
      noteUnmapped(externalId, name, field);
      return null;
    }
    const record = recordFor(hit.mondoId);
    // Which source records were merged into this disease, and how many rows
    // each gave, split by the file they came from.
    const tally = record.annotated.get(externalId) || { hpoRows: 0, orphadataRows: 0 };
    tally[field === 'orphadataAssociations' ? 'orphadataRows' : 'hpoRows'] += 1;
    record.annotated.set(externalId, tally);
    if (name) record.names.set(name.toLowerCase(), name);
    return record;
  };

  const phenotypeFile = {
    rows: annotations.rows.length,
    rowsOnUnmappedDisease: 0,
    rowsInheritance: 0,
    rowsClinicalCourse: 0,
    rowsModifier: 0,
    rowsHistory: 0,
    rowsUnknownTerm: 0,
    rowsNotAnAbnormality: 0,
    rowsRecordedAbsent: 0,
    rowsUsed: 0,
  };
  const aspectField = { I: 'rowsInheritance', C: 'rowsClinicalCourse', M: 'rowsModifier', H: 'rowsHistory' };
  const hpoaIds = new Set();

  for (const row of annotations.rows) {
    hpoaIds.add(row.diseaseId);
    const record = place(row.diseaseId, row.diseaseName, 'phenotypeRows');
    if (!record) {
      phenotypeFile.rowsOnUnmappedDisease += 1;
      continue;
    }
    if (row.curatedYear < record.firstCurated) record.firstCurated = row.curatedYear;
    // Only aspect P is a symptom or sign. Inheritance, age of onset and the
    // like are real annotations the atlas does not yet turn into links.
    if (row.aspect !== 'P') {
      phenotypeFile[aspectField[row.aspect] || 'rowsModifier'] += 1;
      continue;
    }
    const hpoId = hpo.resolve(row.hpoId);
    if (!hpoId) {
      phenotypeFile.rowsUnknownTerm += 1;
      unknownTerms.set(row.hpoId, (unknownTerms.get(row.hpoId) || 0) + 1);
      continue;
    }
    // The root term itself ("Phenotypic abnormality") says nothing, and a
    // term outside that branch is not a symptom.
    if (hpoId === PHENOTYPE_ROOT || !hpo.ancestors(hpoId).includes(PHENOTYPE_ROOT)) {
      phenotypeFile.rowsNotAnAbnormality += 1;
      continue;
    }
    const parsed = parseFrequency(row.frequency, hpo.frequencyClasses);
    let slot = record.phenotypes.get(hpoId);
    if (!slot) {
      slot = { present: [], absent: [] };
      record.phenotypes.set(hpoId, slot);
    }
    // "NOT", "0 of 5" and the class Excluded all say the symptom was looked
    // for and not found. That is kept as a contradiction, never as a link.
    if (row.negated || (parsed && parsed.value === 0)) {
      slot.absent.push({ ...row, parsed });
      phenotypeFile.rowsRecordedAbsent += 1;
    } else {
      slot.present.push({ ...row, parsed });
      phenotypeFile.rowsUsed += 1;
    }
  }

  const geneFile = { rows: geneRows.length, rowsOnUnmappedDisease: 0, rowsUsed: 0 };
  const geneFileIds = new Set();
  const geneSlot = (record, symbol) => {
    let slot = record.genes.get(symbol);
    if (!slot) {
      slot = { hpoRows: [], orphaRows: [] };
      record.genes.set(symbol, slot);
    }
    return slot;
  };

  for (const row of geneRows) {
    geneFileIds.add(row.diseaseId);
    const record = place(row.diseaseId, '', 'geneRows');
    if (!record) {
      geneFile.rowsOnUnmappedDisease += 1;
      continue;
    }
    geneSlot(record, row.symbol).hpoRows.push(row);
    geneFile.rowsUsed += 1;
  }

  const orphadata = { disorders: 0, associations: 0, associationsOnUnmappedDisease: 0, associationsUsed: 0 };
  const orphaIds = new Set();
  for (const disorder of orpha?.disorders || []) {
    orphadata.disorders += 1;
    const externalId = `ORPHA:${disorder.orphaCode}`;
    orphaIds.add(externalId);
    for (const gene of disorder.genes) {
      orphadata.associations += 1;
      const record = place(externalId, disorder.name, 'orphadataAssociations');
      if (!record) {
        orphadata.associationsOnUnmappedDisease += 1;
        continue;
      }
      geneSlot(record, gene.symbol).orphaRows.push({ ...gene, orphaCode: disorder.orphaCode });
      orphadata.associationsUsed += 1;
    }
  }

  // Diseases the hand-checked layer talks about stay in the atlas whatever
  // the bulk files hold on them.
  const deepUnknown = [];
  for (const mondoId of forceIds) {
    if (!mondo.terms.has(mondoId)) {
      deepUnknown.push(mondoId);
      continue;
    }
    recordFor(mondoId).forced = true;
  }

  const kept = new Map();
  const excluded = [];
  const tally = {
    mondoTermsWithRows: records.size,
    keptByMondoRareSubset: 0,
    keptByOrphanetEntry: 0,
    keptSingleGeneNotYetListed: 0,
    keptForDeepLayerOnly: 0,
    excludedSusceptibility: 0,
    excludedNotMarkedRare: 0,
    excludedNothingRecorded: 0,
  };

  for (const [mondoId, record] of records) {
    const { term } = record;
    for (const [hpoId, slot] of record.phenotypes) {
      if (!slot.present.length) record.phenotypes.delete(hpoId);
    }
    const hasLinks = record.phenotypes.size > 0 || record.genes.size > 0;
    const susceptibility = term.susceptibility || SUSCEPTIBILITY_NAME.test(term.name);
    const mendelian = [...record.genes.values()].some(slot => slot.hpoRows.some(row => row.type === 'MENDELIAN'));

    let reason = '';
    if (term.rareSubset) reason = RARITY.MONDO;
    else if (term.hasOrphanet) reason = RARITY.ORPHANET;
    else if (
      INCLUDE_UNLISTED_SINGLE_GENE &&
      mendelian &&
      !susceptibility &&
      term.germlineGene &&
      !term.hasNarrowerForms &&
      record.firstCurated >= RECENT_SINCE &&
      record.firstCurated !== Infinity
    ) {
      reason = RARITY.SINGLE_GENE;
    }

    if (reason && !hasLinks && !record.forced) {
      tally.excludedNothingRecorded += 1;
      excluded.push({ id: mondoId, name: term.name, why: 'no symptom and no gene recorded after filtering' });
      continue;
    }
    if (!reason && record.forced) reason = RARITY.DEEP;
    if (!reason) {
      const field = susceptibility ? 'excludedSusceptibility' : 'excludedNotMarkedRare';
      tally[field] += 1;
      excluded.push({
        id: mondoId,
        name: term.name,
        why: susceptibility
          ? 'a susceptibility entry, not marked rare by MONDO'
          : 'not marked rare by MONDO, no Orphanet entry, and not a recently described single-gene disease',
        from: [...record.annotated.keys()],
      });
      continue;
    }
    if (reason === RARITY.MONDO) tally.keptByMondoRareSubset += 1;
    else if (reason === RARITY.ORPHANET) tally.keptByOrphanetEntry += 1;
    else if (reason === RARITY.SINGLE_GENE) tally.keptSingleGeneNotYetListed += 1;
    else tally.keptForDeepLayerOnly += 1;
    record.rarity = reason;
    kept.set(mondoId, record);
  }

  const countIds = ids => {
    let mapped = 0;
    for (const id of ids) if (mondo.byXref.has(id)) mapped += 1;
    return { ids: ids.size, mapped, unmapped: ids.size - mapped };
  };

  return {
    kept,
    report: {
      phenotypeFile: { ...phenotypeFile, diseaseIds: countIds(hpoaIds) },
      geneFile: { ...geneFile, diseaseIds: countIds(geneFileIds) },
      orphadata: orpha ? { ...orphadata, diseaseIds: countIds(orphaIds) } : null,
      tally,
      unmapped: [...unmapped.values()].sort((a, b) => a.id.localeCompare(b.id)),
      unknownTerms: [...unknownTerms].map(([id, rows]) => ({ id, rows })),
      excluded: excluded.sort((a, b) => a.id.localeCompare(b.id)),
      deepUnknown,
    },
  };
}

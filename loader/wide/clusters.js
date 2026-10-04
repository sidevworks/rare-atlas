// Groups diseases into the regions of the sky. Communities are found on the
// nearest-neighbour graph with the Louvain method, visiting diseases in a
// fixed order with no random choices, so the same input always gives the same
// groups. Small groups are then folded into the group they are most tied to
// until between 12 and 30 remain, and each group is named after the symptoms
// that set it apart.

import { listInWords, lowerFirst } from '../lib/text.js';

const MAX_CLUSTERS = 26;
const MIN_CLUSTERS = 12;
const MIN_SHARE = 0.006; // a group smaller than this share of all diseases is folded in
const LABEL_TERMS = 3;

function louvain(size, firstLinks) {
  let links = firstLinks;
  let nodes = size;
  let membership = Int32Array.from({ length: size }, (_, index) => index);

  for (let level = 0; level < 20; level += 1) {
    const degree = new Float64Array(nodes);
    let total = 0;
    for (let node = 0; node < nodes; node += 1) {
      for (const weight of links[node].values()) degree[node] += weight;
      total += degree[node];
    }
    if (total === 0) break;

    const community = Int32Array.from({ length: nodes }, (_, index) => index);
    const communityDegree = Float64Array.from(degree);
    let movedAtAll = false;
    for (let pass = 0; pass < 100; pass += 1) {
      let moved = 0;
      for (let node = 0; node < nodes; node += 1) {
        const home = community[node];
        const toCommunity = new Map();
        for (const [other, weight] of links[node]) {
          if (other === node) continue;
          const there = community[other];
          toCommunity.set(there, (toCommunity.get(there) || 0) + weight);
        }
        communityDegree[home] -= degree[node];
        let best = home;
        let bestGain = (toCommunity.get(home) || 0) - (communityDegree[home] * degree[node]) / total;
        for (const [there, weight] of toCommunity) {
          const gain = weight - (communityDegree[there] * degree[node]) / total;
          if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && there < best)) {
            best = there;
            bestGain = gain;
          }
        }
        communityDegree[best] += degree[node];
        if (best !== home) {
          community[node] = best;
          moved += 1;
        }
      }
      if (!moved) break;
      movedAtAll = true;
    }
    if (!movedAtAll) break;

    // Each community becomes one node of the next, smaller graph.
    const renumber = new Map();
    for (let node = 0; node < nodes; node += 1) {
      if (!renumber.has(community[node])) renumber.set(community[node], renumber.size);
    }
    const merged = Array.from({ length: renumber.size }, () => new Map());
    for (let node = 0; node < nodes; node += 1) {
      const from = renumber.get(community[node]);
      for (const [other, weight] of links[node]) {
        const to = renumber.get(community[other]);
        merged[from].set(to, (merged[from].get(to) || 0) + weight);
      }
    }
    membership = membership.map(node => renumber.get(community[node]));
    links = merged;
    nodes = renumber.size;
  }
  return membership;
}

/**
 * @returns {{ assignment: Int32Array, clusters: { id: string, label: string, size: number, terms: string[] }[], ties: Map<number, number>[] }}
 */
export function findClusters({ items, neighbours, features, hpo }) {
  const count = items.length;
  const links = Array.from({ length: count }, () => new Map());
  neighbours.forEach((list, at) => {
    for (const { index, score } of list) {
      links[at].set(index, (links[at].get(index) || 0) + score);
      links[index].set(at, (links[index].get(at) || 0) + score);
    }
  });

  const membership = louvain(count, links);

  // Group bookkeeping: members, ties between groups, and a symptom profile
  // for groups that have no tie to anything.
  const groups = new Map();
  for (let at = 0; at < count; at += 1) {
    const key = membership[at];
    if (!groups.has(key)) groups.set(key, { key, members: [], ties: new Map(), degree: 0, profile: new Map() });
    groups.get(key).members.push(at);
  }
  let total = 0;
  for (let at = 0; at < count; at += 1) {
    const group = groups.get(membership[at]);
    for (const [other, weight] of links[at]) {
      group.degree += weight;
      total += weight;
      const there = membership[other];
      if (there !== group.key) group.ties.set(there, (group.ties.get(there) || 0) + weight);
    }
    const feature = features[at];
    for (let slot = 0; slot < feature.terms.length; slot += 1) {
      group.profile.set(feature.terms[slot], (group.profile.get(feature.terms[slot]) || 0) + feature.weights[slot]);
    }
  }

  const likeness = (a, b) => {
    let dot = 0;
    let lengthA = 0;
    let lengthB = 0;
    for (const [term, weight] of a.profile) {
      lengthA += weight * weight;
      const other = b.profile.get(term);
      if (other) dot += weight * other;
    }
    for (const weight of b.profile.values()) lengthB += weight * weight;
    return lengthA && lengthB ? dot / Math.sqrt(lengthA * lengthB) : 0;
  };

  const absorb = (target, small) => {
    for (const member of small.members) membership[member] = target.key;
    target.members.push(...small.members);
    target.degree += small.degree;
    for (const [term, weight] of small.profile) target.profile.set(term, (target.profile.get(term) || 0) + weight);
    target.ties.delete(small.key);
    for (const [there, weight] of small.ties) {
      if (there === target.key) continue;
      target.ties.set(there, (target.ties.get(there) || 0) + weight);
      const third = groups.get(there);
      third.ties.set(target.key, (third.ties.get(target.key) || 0) + weight);
      third.ties.delete(small.key);
    }
    groups.delete(small.key);
  };

  // Diseases with no symptoms on record and no neighbour cannot honestly be
  // placed near anything; they are kept together and labelled as such.
  const apart = { key: -1, members: [], ties: new Map(), degree: 0, profile: new Map(), apart: true };
  for (const group of [...groups.values()]) {
    if (!group.ties.size && !group.degree && !group.profile.size) {
      apart.members.push(...group.members);
      groups.delete(group.key);
    }
  }

  const minSize = Math.max(20, Math.round(count * MIN_SHARE));
  for (;;) {
    const ordered = [...groups.values()].sort((a, b) => a.members.length - b.members.length || a.key - b.key);
    const smallest = ordered[0];
    if (!smallest || groups.size <= MIN_CLUSTERS) break;
    if (groups.size <= MAX_CLUSTERS && smallest.members.length >= minSize) break;

    let target = null;
    let bestGain = -Infinity;
    for (const [there, weight] of smallest.ties) {
      const other = groups.get(there);
      const gain = weight - (smallest.degree * other.degree) / total;
      if (!target || gain > bestGain || (gain === bestGain && there < target.key)) {
        bestGain = gain;
        target = other;
      }
    }
    // No tie to any group: go by the closest symptom profile instead.
    if (!target) {
      let best = -1;
      for (const other of ordered.slice(1)) {
        const score = likeness(smallest, other);
        if (!target || score > best || (score === best && other.key < target.key)) {
          best = score;
          target = other;
        }
      }
    }
    absorb(target, smallest);
  }

  const final = [...groups.values()].sort((a, b) => b.members.length - a.members.length || a.key - b.key);
  if (apart.members.length) final.push(apart);

  const assignment = new Int32Array(count);
  final.forEach((group, index) => {
    for (const member of group.members) assignment[member] = index;
  });

  // Names: the symptoms far more common inside the group than across the
  // atlas, counted on the symptoms as recorded (not their parent terms) so
  // the words are ones a family would use.
  const everywhere = new Map();
  let allWithSymptoms = 0;
  for (const item of items) {
    if (item.weights.size) allWithSymptoms += 1;
    for (const hpoId of item.weights.keys()) everywhere.set(hpoId, (everywhere.get(hpoId) || 0) + 1);
  }
  const used = new Set();
  const clusters = final.map((group, index) => {
    const id = `c${String(index + 1).padStart(2, '0')}`;
    if (group.apart) {
      return { id, label: 'No symptoms on record and no shared gene yet', size: group.members.length, terms: [] };
    }
    const inGroup = new Map();
    let withSymptoms = 0;
    for (const member of group.members) {
      const { weights } = items[member];
      if (weights.size) withSymptoms += 1;
      for (const hpoId of weights.keys()) inGroup.set(hpoId, (inGroup.get(hpoId) || 0) + 1);
    }
    const ranked = [];
    for (const [hpoId, members] of inGroup) {
      const share = members / Math.max(1, withSymptoms);
      if (members < 3) continue;
      const lift = share / (everywhere.get(hpoId) / allWithSymptoms);
      if (lift <= 1) continue;
      ranked.push({ hpoId, score: share * Math.log(lift) });
    }
    ranked.sort((a, b) => b.score - a.score || (a.hpoId < b.hpoId ? -1 : 1));
    const chosen = [];
    for (const { hpoId } of ranked) {
      const related = chosen.some(other => hpo.ancestors(hpoId).includes(other) || hpo.ancestors(other).includes(hpoId));
      if (!related) chosen.push(hpoId);
      if (chosen.length === LABEL_TERMS + 2) break;
    }
    const words = chosen.map(termId => hpo.terms.get(termId).plain);
    let take = Math.min(LABEL_TERMS, words.length);
    const name = () => listInWords(words.slice(0, take).map((word, at) => (at ? lowerFirst(word) : word)));
    let label = name() || 'Mixed features';
    while (used.has(label) && take < words.length) {
      take += 1;
      label = name();
    }
    if (used.has(label)) label = `${label} (${id})`;
    used.add(label);
    return { id, label, size: group.members.length, terms: chosen.slice(0, take) };
  });

  // Ties between the final groups, for laying their centres out.
  const ties = final.map(() => new Map());
  for (let at = 0; at < count; at += 1) {
    for (const [other, weight] of links[at]) {
      const a = assignment[at];
      const b = assignment[other];
      if (a !== b) ties[a].set(b, (ties[a].get(b) || 0) + weight);
    }
  }

  return { assignment, clusters, ties, links };
}

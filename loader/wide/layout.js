// Where each disease sits in the sky. Group centres are spread through
// -0.85..0.85 on each axis with related groups nearer each other; the
// diseases of a group sit in a ball around its centre, pulled towards their
// own neighbours. A fixed seed makes every run give the same positions.

import { seeded } from '../lib/rng.js';
import { round } from '../lib/text.js';

const SEED = 20261003;
const SPREAD = 0.85;
const MIN_RADIUS = 0.07;
const MAX_RADIUS = 0.15;

const length = vector => Math.hypot(vector[0], vector[1], vector[2]);

// Centres go on fixed, evenly spread spots; which group takes which spot is
// then improved by swapping pairs until strongly tied groups sit close.
function layoutCentres(clusters, ties) {
  const count = clusters.length;
  // Spots start on a Halton sequence, which fills a cube evenly without
  // randomness, and are then nudged apart wherever two sit too close.
  const halton = (index, base) => {
    let result = 0;
    let fraction = 1 / base;
    for (let rest = index; rest > 0; rest = Math.floor(rest / base)) {
      result += fraction * (rest % base);
      fraction /= base;
    }
    return result;
  };
  const spots = clusters.map((_, index) => [2, 3, 5].map(base => halton(index + 1, base) * 2 - 1));
  const spacing = 1.8 / Math.cbrt(count);
  for (let step = 0; step < 300; step += 1) {
    let moved = false;
    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        const delta = [spots[a][0] - spots[b][0], spots[a][1] - spots[b][1], spots[a][2] - spots[b][2]];
        const distance = length(delta) || 0.001;
        if (distance >= spacing) continue;
        moved = true;
        const shift = (spacing - distance) / 4;
        for (let axis = 0; axis < 3; axis += 1) {
          const unit = delta[axis] / distance;
          spots[a][axis] = Math.max(-1, Math.min(1, spots[a][axis] + unit * shift));
          spots[b][axis] = Math.max(-1, Math.min(1, spots[b][axis] - unit * shift));
        }
      }
    }
    if (!moved) break;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    let low = Infinity;
    let high = -Infinity;
    for (const spot of spots) {
      low = Math.min(low, spot[axis]);
      high = Math.max(high, spot[axis]);
    }
    const span = high - low || 1;
    for (const spot of spots) spot[axis] = ((spot[axis] - low) / span) * 2 * SPREAD - SPREAD;
  }
  // Middle spots first: the largest groups start in the middle and groups
  // tied to nothing end up on the rim.
  spots.sort((a, b) => length(a) - length(b) || a[0] - b[0]);

  const tie = (a, b) => (ties[a].get(b) || 0) + (ties[b].get(a) || 0);
  const apart = (a, b) => length([spots[a][0] - spots[b][0], spots[a][1] - spots[b][1], spots[a][2] - spots[b][2]]);
  // Groups tied to nothing keep the outermost spots and are never swapped in.
  const free = clusters.map((_, index) => index).filter(index => ties[index].size > 0);
  const spotOf = clusters.map((_, index) => index);

  for (let pass = 0; pass < 60; pass += 1) {
    let swapped = false;
    for (let i = 0; i < free.length; i += 1) {
      for (let j = i + 1; j < free.length; j += 1) {
        const a = free[i];
        const b = free[j];
        let change = 0;
        for (const c of free) {
          if (c === a || c === b) continue;
          const toA = apart(spotOf[a], spotOf[c]);
          const toB = apart(spotOf[b], spotOf[c]);
          change += tie(a, c) * (toB - toA) + tie(b, c) * (toA - toB);
        }
        if (change < -1e-9) {
          [spotOf[a], spotOf[b]] = [spotOf[b], spotOf[a]];
          swapped = true;
        }
      }
    }
    if (!swapped) break;
  }
  return clusters.map((_, index) => [...spots[spotOf[index]]]);
}

/**
 * @returns {{ positions: number[][], centres: number[][], radii: number[] }}
 */
export function layout({ count, assignment, clusters, ties, links }) {
  const centres = layoutCentres(clusters, ties);
  const largest = Math.max(...clusters.map(cluster => cluster.size));
  const radii = clusters.map(cluster => MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.cbrt(cluster.size / largest));

  // Keep neighbouring balls from sitting on top of each other, inside the cube.
  for (let step = 0; step < 200; step += 1) {
    let moved = false;
    for (let a = 0; a < centres.length; a += 1) {
      for (let b = a + 1; b < centres.length; b += 1) {
        const delta = [centres[a][0] - centres[b][0], centres[a][1] - centres[b][1], centres[a][2] - centres[b][2]];
        const distance = length(delta) || 0.001;
        const wanted = (radii[a] + radii[b]) * 0.9;
        if (distance >= wanted) continue;
        moved = true;
        const shift = (wanted - distance) / 2;
        for (let axis = 0; axis < 3; axis += 1) {
          const unit = delta[axis] / distance;
          centres[a][axis] = Math.max(-SPREAD, Math.min(SPREAD, centres[a][axis] + unit * shift));
          centres[b][axis] = Math.max(-SPREAD, Math.min(SPREAD, centres[b][axis] - unit * shift));
        }
      }
    }
    if (!moved) break;
  }

  const members = clusters.map(() => []);
  for (let at = 0; at < count; at += 1) members[assignment[at]].push(at);

  const positions = new Array(count);
  members.forEach((list, clusterIndex) => {
    const random = seeded(SEED + clusterIndex * 7919);
    const local = new Map();
    const place = new Float64Array(list.length * 3);
    list.forEach((at, slot) => {
      local.set(at, slot);
      // A random point inside the unit ball.
      const radius = Math.cbrt(random());
      const height = 2 * random() - 1;
      const angle = 2 * Math.PI * random();
      const ring = Math.sqrt(1 - height * height);
      place[slot * 3] = radius * ring * Math.cos(angle);
      place[slot * 3 + 1] = radius * height;
      place[slot * 3 + 2] = radius * ring * Math.sin(angle);
    });

    // A disease whose neighbours live in another group leans towards it.
    const lean = new Float64Array(list.length * 3);
    list.forEach((at, slot) => {
      for (const [other, weight] of links[at]) {
        const there = assignment[other];
        if (there === clusterIndex) continue;
        const delta = [0, 1, 2].map(axis => centres[there][axis] - centres[clusterIndex][axis]);
        const distance = length(delta) || 1;
        for (let axis = 0; axis < 3; axis += 1) lean[slot * 3 + axis] += (delta[axis] / distance) * weight;
      }
    });

    const samples = Math.min(16, Math.max(0, list.length - 1));
    const steps = list.length > 1 ? 90 : 0;
    // Linked diseases settle this far apart rather than on top of each other.
    const rest = 0.8 / Math.cbrt(list.length);
    const move = new Float64Array(list.length * 3);
    for (let step = 0; step < steps; step += 1) {
      const heat = 0.12 * (1 - step / steps) + 0.005;
      move.fill(0);
      list.forEach((at, slot) => {
        const x = place[slot * 3];
        const y = place[slot * 3 + 1];
        const z = place[slot * 3 + 2];
        let pullX = 0;
        let pullY = 0;
        let pullZ = 0;
        let pulls = 0;
        for (const [other, weight] of links[at]) {
          const there = local.get(other);
          if (there === undefined || there === slot) continue;
          const dx = place[there * 3] - x;
          const dy = place[there * 3 + 1] - y;
          const dz = place[there * 3 + 2] - z;
          const distance = Math.hypot(dx, dy, dz);
          if (!distance) continue;
          const stretch = ((distance - rest) / distance) * weight;
          pullX += dx * stretch;
          pullY += dy * stretch;
          pullZ += dz * stretch;
          pulls += weight;
        }
        if (pulls) {
          move[slot * 3] += (pullX / pulls) * 0.8;
          move[slot * 3 + 1] += (pullY / pulls) * 0.8;
          move[slot * 3 + 2] += (pullZ / pulls) * 0.8;
        }
        // Push away from a few others chosen at random, standing in for all.
        for (let sample = 0; sample < samples; sample += 1) {
          const there = Math.floor(random() * list.length);
          if (there === slot) continue;
          const dx = x - place[there * 3];
          const dy = y - place[there * 3 + 1];
          const dz = z - place[there * 3 + 2];
          const distance = Math.hypot(dx, dy, dz) || 0.001;
          const force = 0.006 / (distance * (distance + 0.05));
          move[slot * 3] += dx * force;
          move[slot * 3 + 1] += dy * force;
          move[slot * 3 + 2] += dz * force;
        }
        const leaning = Math.hypot(lean[slot * 3], lean[slot * 3 + 1], lean[slot * 3 + 2]);
        if (leaning) {
          move[slot * 3] += (lean[slot * 3] / leaning) * 0.05;
          move[slot * 3 + 1] += (lean[slot * 3 + 1] / leaning) * 0.05;
          move[slot * 3 + 2] += (lean[slot * 3 + 2] / leaning) * 0.05;
        }
      });
      for (let slot = 0; slot < list.length; slot += 1) {
        const size = Math.hypot(move[slot * 3], move[slot * 3 + 1], move[slot * 3 + 2]);
        if (!size) continue;
        const stride = Math.min(heat, size) / size;
        place[slot * 3] += move[slot * 3] * stride;
        place[slot * 3 + 1] += move[slot * 3 + 1] * stride;
        place[slot * 3 + 2] += move[slot * 3 + 2] * stride;
      }
    }

    // Recentre, then scale so nearly every disease fits inside the ball.
    const middle = [0, 0, 0];
    for (let slot = 0; slot < list.length; slot += 1) for (let axis = 0; axis < 3; axis += 1) middle[axis] += place[slot * 3 + axis] / list.length;
    const reach = [];
    for (let slot = 0; slot < list.length; slot += 1) {
      for (let axis = 0; axis < 3; axis += 1) place[slot * 3 + axis] -= middle[axis];
      reach.push(Math.hypot(place[slot * 3], place[slot * 3 + 1], place[slot * 3 + 2]));
    }
    const sorted = [...reach].sort((a, b) => a - b);
    const edge = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.97))] || 1;

    list.forEach((at, slot) => {
      const squeeze = reach[slot] > edge ? edge / reach[slot] : 1;
      positions[at] = [0, 1, 2].map(axis => {
        const value = centres[clusterIndex][axis] + (place[slot * 3 + axis] * squeeze * radii[clusterIndex]) / edge;
        return round(Math.max(-1, Math.min(1, value)));
      });
    });
  });

  return { positions, centres: centres.map(centre => centre.map(value => round(value))), radii };
}

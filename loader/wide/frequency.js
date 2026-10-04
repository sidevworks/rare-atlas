// How often a symptom is seen, as phenotype.hpoa writes it: a fraction of the
// people in one report ("12/15"), a percentage ("45%"), or one of HPO's
// frequency classes ("HP:0040282", Frequent).

import { round } from '../lib/text.js';

/**
 * @returns {null | { kind: 'fraction'|'percent'|'class', value: number, raw: string, n?: number, of?: number, percent?: number, label?: string, range?: string }}
 */
export function parseFrequency(raw, frequencyClasses) {
  if (!raw) return null;
  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const n = Number(fraction[1]);
    const of = Number(fraction[2]);
    if (!of || n > of) return null;
    return { kind: 'fraction', raw, n, of, value: n / of };
  }
  const percent = raw.match(/^(\d+(?:\.\d+)?)%$/);
  if (percent) return { kind: 'percent', raw, percent: Number(percent[1]), value: Number(percent[1]) / 100 };
  const known = frequencyClasses.get(raw);
  if (known) return { kind: 'class', raw, label: known.label, range: known.range, value: known.value };
  return null;
}

// One frequency to speak for a symptom that several rows describe. A class
// set by a curator across the literature says more than a count from a
// handful of people, unless the count comes from at least ten.
export function pickFrequency(parsed) {
  const known = parsed.filter(Boolean);
  if (!known.length) return null;
  const fractions = known.filter(item => item.kind === 'fraction').sort((a, b) => b.of - a.of || b.n - a.n);
  if (fractions[0]?.of >= 10) return fractions[0];
  const classes = known.filter(item => item.kind === 'class').sort((a, b) => b.value - a.value);
  if (classes.length) return classes[0];
  const percents = known.filter(item => item.kind === 'percent').sort((a, b) => b.value - a.value);
  return percents[0] || fractions[0];
}

// The frequency in words, for the edge's detail.
export function frequencyInWords(frequency) {
  if (!frequency) return null;
  if (frequency.kind === 'fraction') return `${frequency.n} of ${frequency.of} ${frequency.of === 1 ? 'person' : 'people'}`;
  if (frequency.kind === 'percent') return `about ${frequency.percent}% of people`;
  return frequency.value === 1 ? `always present (${frequency.range})` : `${frequency.label} (${frequency.range})`;
}

export const frequencyValue = frequency => (frequency ? round(frequency.value) : null);

// How much a symptom counts when two diseases are compared. A count from a
// few people is pulled towards the middle so that "1 of 1" does not outweigh
// "40 of 50"; a symptom with no recorded frequency counts as half.
export function comparisonWeight(frequency) {
  if (!frequency) return 0.5;
  const weight = frequency.kind === 'fraction' ? (frequency.n + 1) / (frequency.of + 2) : frequency.value;
  return Math.max(0.02, Math.min(1, weight));
}

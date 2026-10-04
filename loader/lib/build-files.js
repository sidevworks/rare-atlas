// Reads the local build back, for the checker and the uploader, and holds the
// limits both of them enforce.

import fs from 'node:fs';
import path from 'node:path';
import { BUILD_DIR, DISEASE_DIR } from './paths.js';

// Firestore refuses a document over 1 MiB; the contract keeps well under it.
export const MAX_DOCUMENT_BYTES = 900 * 1000;

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const jsonBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

export function loadBuild() {
  const need = name => {
    const file = path.join(BUILD_DIR, name);
    if (!fs.existsSync(file)) throw new Error(`${file} is missing. Run "node loader/build.js" first.`);
    return readJson(file);
  };
  const build = need('build.json');
  const map = need('map.json');
  const search = need('search.json');
  if (!fs.existsSync(DISEASE_DIR)) throw new Error(`${DISEASE_DIR} is missing. Run "node loader/build.js" first.`);
  const diseaseFiles = fs.readdirSync(DISEASE_DIR).filter(name => name.endsWith('.json')).sort();
  return { build, map, search, diseaseFiles };
}

export function* eachDisease(diseaseFiles) {
  for (const name of diseaseFiles) {
    const file = path.join(DISEASE_DIR, name);
    const text = fs.readFileSync(file, 'utf8');
    yield { file: name, id: name.replace(/\.json$/, ''), bytes: Buffer.byteLength(text, 'utf8'), disease: JSON.parse(text) };
  }
}

// Splits rows into slices of JSON text, because Firestore cannot hold an
// array of arrays and so each slice travels as text. The slices are kept well
// under the document limit: measured as JSON, the text grows again when its
// own quotes are escaped.
export function chunkAsText(rows, limit = 700 * 1000) {
  const chunks = [];
  let current = [];
  let size = 2;
  for (const row of rows) {
    const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
    if (current.length && size + bytes > limit) {
      chunks.push(JSON.stringify(current));
      current = [];
      size = 2;
    }
    current.push(row);
    size += bytes;
  }
  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

// The things Firestore will not store: an array directly inside an array, a
// value that is undefined or not finite, an empty field name.
export function firestoreProblems(value, where = '') {
  const problems = [];
  const walk = (item, at, insideArray) => {
    if (item === undefined) problems.push(`${at}: undefined`);
    else if (typeof item === 'number' && !Number.isFinite(item)) problems.push(`${at}: not a finite number`);
    else if (Array.isArray(item)) {
      if (insideArray) problems.push(`${at}: an array directly inside an array`);
      item.forEach((child, index) => walk(child, `${at}[${index}]`, true));
    } else if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (!key) problems.push(`${at}: an empty field name`);
        walk(child, at ? `${at}.${key}` : key, false);
      }
    }
  };
  walk(value, where, false);
  return problems;
}

// A small reader for OBO ontology files: enough for MONDO and HPO, which is
// all the loader reads. It yields one object per [Term] stanza and keeps each
// tag's values as raw strings, so each caller parses only the tags it needs.

import fs from 'node:fs';
import readline from 'node:readline';

/**
 * @param {string} file
 * @returns {Promise<{ header: Object<string, string[]>, terms: Object<string, string[]>[] }>}
 */
export async function readObo(file) {
  const header = {};
  const terms = [];
  let stanza = header;
  let keep = true;

  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    if (line[0] === '[') {
      keep = line === '[Term]';
      stanza = {};
      if (keep) terms.push(stanza);
      continue;
    }
    if (!keep) continue;
    const colon = line.indexOf(': ');
    if (colon < 1) continue;
    const tag = line.slice(0, colon);
    (stanza[tag] ||= []).push(line.slice(colon + 2));
  }
  return { header, terms };
}

// The text between the first pair of unescaped double quotes.
export function quoted(value) {
  if (value[0] !== '"') return { text: '', rest: value };
  let text = '';
  let index = 1;
  for (; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && index + 1 < value.length) {
      const next = value[index + 1];
      text += next === 'n' ? ' ' : next;
      index += 1;
      continue;
    }
    if (char === '"') break;
    text += char;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), rest: value.slice(index + 1).trim() };
}

// "MONDO:0100062 {source=...} ! label" -> "MONDO:0100062"
export const firstToken = value => value.split(/[\s{!]/, 1)[0];

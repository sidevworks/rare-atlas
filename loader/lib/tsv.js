// Reads a tab-separated file line by line. Lines starting with # are handed
// to onComment (the HPO files keep their version there).

import fs from 'node:fs';
import readline from 'node:readline';

export async function readTsv(file, { onComment, onRow }) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!line) continue;
    if (line[0] === '#') {
      onComment?.(line);
      continue;
    }
    const cells = line.split('\t');
    if (!header) {
      header = cells;
      continue;
    }
    onRow(cells, header);
  }
  return header;
}

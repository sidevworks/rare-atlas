// Where the loader reads and writes. Everything under data/ is reproducible
// and gitignored.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = path.join(ROOT, 'data', 'raw', 'wide');
// RARE_ATLAS_BUILD_DIR points the build, the checker and the uploader at
// another folder, so a trial build never overwrites the real one.
export const BUILD_DIR = process.env.RARE_ATLAS_BUILD_DIR ? path.resolve(process.env.RARE_ATLAS_BUILD_DIR) : path.join(ROOT, 'data', 'build');
export const DISEASE_DIR = path.join(BUILD_DIR, 'diseases');
export const DEEP_FILE = path.join(BUILD_DIR, 'deep.json');

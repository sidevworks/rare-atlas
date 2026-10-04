// Where the deep loader reads and writes. Everything under data/ is
// reproducible and gitignored.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..', '..');
export const RAW_DEEP_DIR = path.join(ROOT, 'data', 'raw', 'deep');
export const BUILD_DIR = path.join(ROOT, 'data', 'build');
export const DEEP_FILE = path.join(BUILD_DIR, 'deep.json');
export const REPORT_FILE = path.join(RAW_DEEP_DIR, 'report.json');
export const CLAIMS_FILE = path.join(RAW_DEEP_DIR, 'claims.json');
export const GROUPS_FILE = path.join(HERE, '..', 'curated', 'groups.json');
export const SHARED_LINKS_FILE = path.join(HERE, '..', 'curated', 'shared-links.json');

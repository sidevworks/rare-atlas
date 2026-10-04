// Downloads a source file once and remembers where it came from. A file that
// is already in data/raw/wide is never fetched again; its sidecar keeps the
// date it was really read, which is the date every edge built from it cites.

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RAW_DIR } from './paths.js';

const MAX_REDIRECTS = 8;
const AGENT = 'rare-atlas-loader/0.1 (hackathon research build; reads open files once and caches them)';

// Redirects are followed by hand because the release tag of a GitHub-hosted
// file only appears in the middle of the chain.
async function follow(url, method) {
  const chain = [url];
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { method, redirect: 'manual', headers: { 'User-Agent': AGENT } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel();
      current = new URL(response.headers.get('location'), current).toString();
      chain.push(current);
      continue;
    }
    return { response, chain };
  }
  throw new Error(`Too many redirects from ${url}`);
}

const releaseFromChain = chain => {
  for (const link of chain) {
    const match = link.match(/\/releases\/download\/([^/]+)\//);
    if (match) return match[1];
  }
  return '';
};

async function head(url) {
  try {
    const { response, chain } = await follow(url, 'HEAD');
    await response.body?.cancel();
    return {
      ok: response.ok,
      status: response.status,
      bytes: Number(response.headers.get('content-length')) || 0,
      lastModified: response.headers.get('last-modified') || '',
      releaseTag: releaseFromChain(chain),
    };
  } catch (error) {
    return { ok: false, status: 0, error: error.message, bytes: 0, lastModified: '', releaseTag: '' };
  }
}

/**
 * @param {{ key: string, url: string, file: string }} spec
 * @returns {Promise<{ path: string, meta: Object, downloaded: boolean, head: Object }>}
 */
export async function fetchCached(spec, log = console.log) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const target = path.join(RAW_DIR, spec.file);
  const metaPath = `${target}.meta.json`;
  const checked = await head(spec.url);

  if (fs.existsSync(target) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const onDisk = fs.statSync(target).size;
    // A newer file upstream is reported, never fetched behind the reader's
    // back: the cached copy is the one the recorded date and version describe.
    const stale = checked.ok && checked.releaseTag && meta.releaseTag && checked.releaseTag !== meta.releaseTag;
    log(`  ${spec.file}: cached (${onDisk.toLocaleString('en')} bytes, read ${meta.retrieved})${stale ? `; upstream is now ${checked.releaseTag}, delete the file to refresh` : ''}`);
    return { path: target, meta: { ...meta, bytes: onDisk }, downloaded: false, head: checked };
  }

  if (!checked.ok) {
    throw new Error(`${spec.url} answered ${checked.status || checked.error} to a HEAD request; not downloading.`);
  }

  log(`  ${spec.file}: downloading from ${spec.url}`);
  const { response, chain } = await follow(spec.url, 'GET');
  if (!response.ok || !response.body) throw new Error(`${spec.url} answered ${response.status}.`);
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  const bytes = fs.statSync(partial).size;
  // Compressed transfers report the compressed length, so only an uncompressed
  // answer can be checked against it.
  const declared = Number(response.headers.get('content-length')) || 0;
  if (declared && !response.headers.get('content-encoding') && declared !== bytes) {
    fs.rmSync(partial);
    throw new Error(`${spec.file}: got ${bytes} bytes, the server promised ${declared}.`);
  }
  fs.renameSync(partial, target);

  const meta = {
    key: spec.key,
    url: spec.url,
    file: spec.file,
    bytes,
    retrieved: new Date().toISOString().slice(0, 10),
    lastModified: response.headers.get('last-modified') || checked.lastModified,
    releaseTag: releaseFromChain(chain) || checked.releaseTag,
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  log(`  ${spec.file}: saved, ${bytes.toLocaleString('en')} bytes`);
  return { path: target, meta, downloaded: true, head: checked };
}

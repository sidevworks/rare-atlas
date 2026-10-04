// Reads a source once and keeps the raw answer under data/raw/deep, so a
// second run asks nobody anything. Each cached answer has a sidecar that
// records the address and the day it was really read; that day is the one
// every edge built from it cites.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DEEP_DIR } from './paths.js';

const AGENT = 'rare-atlas-deep-loader/0.1 (hackathon research build; reads each record once and caches it)';
const TIMEOUT_MS = 60_000;
const RETRIES = 3;

// The shortest wait between two requests to one host. NCBI asks for at most
// three a second without a key; the others publish no limit, so they get a
// modest pace too.
const GAP_MS = {
  'eutils.ncbi.nlm.nih.gov': 400,
  'api.reporter.nih.gov': 1100,
  'api.openalex.org': 500,
  default: 300,
};

const lastCall = new Map();
const ledger = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);
const safe = text => String(text).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150);

async function pace(host) {
  const gap = GAP_MS[host] ?? GAP_MS.default;
  const wait = (lastCall.get(host) || 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
}

/**
 * @param {{ source: string, key: string, url: string, method?: string, body?: Object, headers?: Object, as?: 'json'|'text' }} spec
 * @returns {Promise<{ data: any, meta: { url: string, retrieved: string, status: number, bytes: number }, fromCache: boolean }>}
 */
export async function cached(spec) {
  const { source, key, url, method = 'GET', body, headers = {}, as = 'json' } = spec;
  const dir = path.join(RAW_DEEP_DIR, safe(source));
  const file = path.join(dir, `${safe(key)}.${as === 'json' ? 'json' : 'txt'}`);
  const metaFile = `${file}.meta.json`;

  if (fs.existsSync(file) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const text = fs.readFileSync(file, 'utf8');
    ledger.push({ source, url, status: meta.status, bytes: meta.bytes, fromCache: true });
    return { data: as === 'json' ? JSON.parse(text) : text, meta, fromCache: true };
  }

  const host = new URL(url).host;
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    await pace(host);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': AGENT,
          Accept: as === 'json' ? 'application/json' : '*/*',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${url} answered ${response.status}`);
        lastError.status = response.status;
        await sleep(1500 * attempt);
        continue;
      }
      if (!response.ok) {
        const error = new Error(`${url} answered ${response.status}`);
        error.status = response.status;
        ledger.push({ source, url, status: response.status, bytes: text.length, fromCache: false });
        throw error;
      }
      const data = as === 'json' ? JSON.parse(text) : text;
      const meta = {
        source,
        url,
        method,
        body: body || undefined,
        status: response.status,
        bytes: Buffer.byteLength(text, 'utf8'),
        retrieved: today(),
        contentType: response.headers.get('content-type') || '',
      };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, text);
      fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
      ledger.push({ source, url, status: response.status, bytes: meta.bytes, fromCache: false });
      return { data, meta, fromCache: false };
    } catch (error) {
      if (error.status && error.status < 500 && error.status !== 429) throw error;
      lastError = error;
      await sleep(1500 * attempt);
    }
  }
  ledger.push({ source, url, status: lastError?.status || 0, bytes: 0, fromCache: false, error: lastError?.message });
  throw lastError || new Error(`${url} could not be read`);
}

// What was asked of whom during this run, for the report.
export function requestSummary() {
  const bySource = {};
  for (const entry of ledger) {
    const slot = (bySource[entry.source] ||= { requests: 0, fromCache: 0, fetched: 0, failed: 0, bytes: 0 });
    slot.requests += 1;
    if (entry.fromCache) slot.fromCache += 1;
    else if (entry.status >= 200 && entry.status < 300) slot.fetched += 1;
    else slot.failed += 1;
    slot.bytes += entry.bytes || 0;
  }
  return bySource;
}

// What every route shares: CORS for the phone apps, a method check, a JSON
// body, and one way to answer when something goes wrong.

// The phone apps are served from their own local origin (Capacitor), so they
// reach this server cross-origin. The web atlas is same-origin.
// The world is also built and run inside LiveLoop on sary-os.com, whose stage
// is a sandboxed frame that sends the origin "null", as does a file opened
// from disk. The graph is public data and the voice route is rate-limited.
const APP_ORIGINS = [/^capacitor:\/\/localhost$/, /^https?:\/\/localhost(:\d+)?$/, /^https:\/\/(www\.)?sary-os\.com$/, /^null$/];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function originAllowed(req) {
  const origin = req.headers?.origin;
  // Same-origin GETs and non-browser callers send no Origin at all.
  if (!origin) return true;
  if (APP_ORIGINS.some(pattern => pattern.test(origin))) return true;
  const extra = (process.env.CORS_ALLOW_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (extra.includes(origin)) return true;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || host === req.headers['x-forwarded-host'];
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const allowed = originAllowed(req);
  res.setHeader('Vary', 'Origin');
  if (allowed && req.headers?.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  return allowed;
}

/**
 * Runs one route. `run` returns the body to send, or throws HttpError.
 * @param {string[]} methods
 * @param {{ cache?: string }} [options]
 */
export async function answer(req, res, methods, run, options = {}) {
  const allowed = applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  try {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '));
      throw new HttpError(405, 'That method is not used here.');
    }
    // The graph is public, so anyone may read it. The routes that spend
    // money (POST) are refused to pages on other sites.
    if (!allowed && req.method !== 'GET') {
      throw new HttpError(403, 'This page may not call the atlas server.');
    }
    const body = await run();
    if (options.cache && req.method === 'GET') res.setHeader('Cache-Control', options.cache);
    res.status(200).json(body);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(`${req.method} ${req.url} failed:`, error);
    res.status(500).json({ error: 'The atlas could not answer just now. Try again in a moment.' });
  }
}

export function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const url = new URL(req.url || '/', 'http://localhost');
  return Object.fromEntries(url.searchParams);
}

// A query value arrives as an array when the same name is given twice.
export function first(value) {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();
}

const parse = text => {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
};

export async function readJson(req) {
  let body;
  try {
    body = req.body;
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  if (Buffer.isBuffer(body)) return parse(body.toString('utf8'));
  if (typeof body === 'string') return parse(body);
  if (body && typeof body === 'object') return body;
  // Nothing parsed it for us, so read the stream, with a small cap.
  if (typeof req.on !== 'function' || req.readableEnded) return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new HttpError(413, 'The request body is too large.');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8'));
}

// Disease ids look like MONDO_0012812. A colon is accepted because people
// (and the voice agent) often write MONDO:0012812.
export function diseaseId(value) {
  const id = first(value).replace(/:/g, '_');
  if (!id) throw new HttpError(400, 'A disease id is needed, for example id=MONDO_0012812.');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new HttpError(400, 'That does not look like a disease id.');
  return id;
}

export function addressOf(req) {
  const forwarded = first(req.headers?.['x-forwarded-for']).split(',')[0].trim();
  return forwarded || first(req.headers?.['x-real-ip']) || req.socket?.remoteAddress || 'unknown';
}

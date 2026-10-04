// A simple per-address limit for the routes that spend money. It lives in
// this server instance's memory, so it slows a runaway page or a careless
// loop; it is not a defence against a determined attacker.

import { HttpError, addressOf } from './http.js';

const seen = new Map();

export function limit(req, res, { name, max, windowMs, message }) {
  const key = `${name}:${addressOf(req)}`;
  const now = Date.now();
  const recent = (seen.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= max) {
    seen.set(key, recent);
    res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
    throw new HttpError(429, message);
  }
  recent.push(now);
  seen.set(key, recent);
  if (seen.size > 5000) {
    for (const [other, times] of seen) {
      if (!times.some(time => now - time < windowMs)) seen.delete(other);
    }
  }
}

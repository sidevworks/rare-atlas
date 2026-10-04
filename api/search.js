// GET /api/search?q=: find a disease by name, synonym or gene symbol.
// Answers SearchResponse, with a Gap saying where it looked when nothing
// matches.

import { answer, first, queryOf, HttpError } from './_lib/http.js';
import { search } from './_lib/search.js';

export default async function handler(req, res) {
  return answer(req, res, ['GET'], async () => {
    const query = queryOf(req);
    const q = first(query.q).slice(0, 200);
    if (!q) throw new HttpError(400, 'Give a name to look for, for example q=STXBP1.');
    const max = Math.min(Math.max(Number.parseInt(first(query.limit), 10) || 12, 1), 50);
    return search(q, max);
  }, { cache: 'public, max-age=0, s-maxage=60' });
}

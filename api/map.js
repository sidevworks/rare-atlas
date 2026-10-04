// GET /api/map: every disease as a point in the sky, with its cluster, and
// what this build of the graph was made from. Answers MapResponse.

import { answer } from './_lib/http.js';
import { getMap } from './_lib/store.js';

export default async function handler(req, res) {
  return answer(req, res, ['GET'], () => getMap(), {
    cache: 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  });
}

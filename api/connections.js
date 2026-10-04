// GET /api/connections?id=&limit=: the closest diseases, each with the
// observed links it rests on and what is not shared. Answers
// ConnectionsResponse. A connection is a lead to check, never a finding.

import { answer, diseaseId, first, queryOf } from './_lib/http.js';
import { getBuild, getDisease, requireDisease } from './_lib/store.js';
import { connectionsFor, connectionsGap, refOf } from './_lib/graph.js';

export default async function handler(req, res) {
  return answer(req, res, ['GET'], async () => {
    const query = queryOf(req);
    const disease = await requireDisease(diseaseId(query.id));
    const max = Math.min(Math.max(Number.parseInt(first(query.limit), 10) || 5, 1), 20);
    const { connections, found, setAside } = await connectionsFor(disease, getDisease, max);
    const response = { from: refOf(disease), connections };
    if (!connections.length) response.gap = connectionsGap(disease, await getBuild(), { found, setAside });
    return response;
  }, { cache: 'public, max-age=0, s-maxage=60' });
}

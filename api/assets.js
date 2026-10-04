// GET /api/assets?id=: the patient groups, registries, research models and
// studies linked to a disease, and those of its connected diseases, each
// marked in detail.neighbour as belonging to the neighbour. Answers
// AssetsResponse.

import { answer, diseaseId, queryOf } from './_lib/http.js';
import { getBuild, getDisease, requireDisease } from './_lib/store.js';
import { assetsFor } from './_lib/graph.js';

export default async function handler(req, res) {
  return answer(req, res, ['GET'], async () => {
    const disease = await requireDisease(diseaseId(queryOf(req).id));
    return assetsFor(disease, getDisease, await getBuild());
  }, { cache: 'public, max-age=0, s-maxage=60' });
}

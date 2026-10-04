// GET /api/disease?id=: everything the atlas holds on one disease, each link
// with its sources. Answers DiseaseResponse.

import { answer, diseaseId, queryOf } from './_lib/http.js';
import { getBuild, requireDisease } from './_lib/store.js';
import { gap, sourcesLine } from './_lib/gap.js';

export default async function handler(req, res) {
  return answer(req, res, ['GET'], async () => {
    const disease = await requireDisease(diseaseId(queryOf(req).id));
    const response = { disease };
    // A record with a name and nothing else: say so, and where it came from.
    if (!disease.edges.length) {
      response.gap = gap({
        question: `What does the atlas hold on ${disease.name}?`,
        searched: [`Links from ${disease.name} to genes, symptoms and related diseases: none with a source`, sourcesLine(await getBuild())],
        missing: ['A source that links this disease to a gene, a symptom or a related disease.'],
        nextSteps: ['Search for a synonym or for the gene: the disease may be recorded under another name.'],
      });
    }
    return response;
  }, { cache: 'public, max-age=0, s-maxage=60' });
}

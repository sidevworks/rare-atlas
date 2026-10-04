// POST /api/brief { fromId, toId, language }: the one-page, sourced proposal.
// This is "the check": whatever writes the brief, every paragraph that
// reaches the reader cites edges that are in the graph. Answers BriefResponse.
//
// With OPENAI_API_KEY set, a text model writes it in the person's language
// from the supplied edges only. Without a key, the edge statements are
// assembled as they stand, in English, so the journey still completes.

import { answer, diseaseId, readJson, HttpError } from './_lib/http.js';
import { limit } from './_lib/rate-limit.js';
import { requireDisease } from './_lib/store.js';
import { gather, writeBrief } from './_lib/brief.js';
import { hasKey, languageCode } from './_lib/openai.js';

export default async function handler(req, res) {
  return answer(req, res, ['POST'], async () => {
    const body = await readJson(req);
    const fromId = diseaseId(body.fromId);
    const toId = diseaseId(body.toId);
    if (fromId === toId) throw new HttpError(400, 'A proposal needs two different diseases.');
    const language = languageCode(body.language) || 'en';

    const [from, to] = await Promise.all([requireDisease(fromId), requireDisease(toId)]);
    const material = gather(from, to);
    if (!material) {
      throw new HttpError(409, `The atlas holds no supported link between ${from.name} and ${to.name}, so there is nothing to build a proposal on.`);
    }

    if (hasKey()) {
      limit(req, res, {
        name: 'brief',
        max: 12,
        windowMs: 10 * 60 * 1000,
        message: 'Too many proposals were asked for from this address. Try again in a few minutes.',
      });
    }
    return writeBrief(material, language, hasKey());
  });
}

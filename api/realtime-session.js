// POST /api/realtime-session { language? }: mints a short-lived secret the
// browser uses to open a voice session straight to OpenAI. The real key
// stays on this server. Answers RealtimeSessionResponse.
//
// The session carries the agent's rules and its only tools, so a page cannot
// start a voice session that answers from anything but the atlas's lookups.
// Session fields follow OpenAI's Realtime reference (client_secrets, session
// type "realtime"), read on 2026-10-03.

import { TOOLS } from '../shared/tools.js';
import { answer, readJson, HttpError } from './_lib/http.js';
import { limit } from './_lib/rate-limit.js';
import { instructionsFor } from './_lib/instructions.js';
import { hasKey, languageCode, openai } from './_lib/openai.js';

const env = (name, fallback) => (process.env[name] || '').trim() || fallback;

export default async function handler(req, res) {
  return answer(req, res, ['POST'], async () => {
    if (!hasKey()) throw new HttpError(503, 'Voice is not set up on this server yet.');

    limit(req, res, {
      name: 'voice',
      max: 8,
      windowMs: 10 * 60 * 1000,
      message: 'Too many voice sessions were started from this address. Try again in a few minutes.',
    });

    const body = await readJson(req);
    const model = env('OPENAI_REALTIME_MODEL', 'gpt-realtime-2.1');
    const voice = env('OPENAI_REALTIME_VOICE', 'marin');
    const instructions = instructionsFor({ language: languageCode(body.language) });
    const tools = TOOLS.map(tool => ({ ...tool }));

    // The shape OpenAI's WebRTC guide shows, and nothing else.
    const core = { type: 'realtime', model, instructions, tools, audio: { output: { voice } } };

    // What the atlas adds: the person's words as text (the desk shows them),
    // turn-taking that waits for a thought to finish, and light reasoning so
    // answers stay quick.
    const noise = env('OPENAI_REALTIME_NOISE', '');
    const full = {
      ...core,
      tool_choice: 'auto',
      output_modalities: ['audio'],
      reasoning: { effort: env('OPENAI_REALTIME_EFFORT', 'low') },
      audio: {
        input: {
          transcription: { model: env('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe') },
          turn_detection: {
            type: 'semantic_vad',
            eagerness: env('OPENAI_REALTIME_EAGERNESS', 'auto'),
            create_response: true,
            interrupt_response: true,
          },
          ...(noise ? { noise_reduction: { type: noise } } : {}),
        },
        output: { voice },
      },
    };

    const mint = session =>
      openai('/realtime/client_secrets', { session }, { timeoutMs: 15000 })
        .catch(error => ({ ok: false, status: 0, data: null, message: error.message }));

    let result = await mint(full);
    // If a setting is refused (a model that takes no reasoning setting, a
    // transcription model this account lacks), voice still starts on the
    // core session rather than not at all.
    if (!result.ok && result.status === 400) {
      console.warn(`The full voice session was refused (${result.message}); starting the core session.`);
      result = await mint(core);
    }
    if (!result.ok || !result.data?.value) {
      console.error(`OpenAI did not mint a voice session: ${result.status} ${result.message}`);
      throw new HttpError(502, 'The voice service did not start a session. Try again in a moment.');
    }

    const expires = Number(result.data.expires_at);
    return {
      clientSecret: result.data.value,
      expiresAt: Number.isFinite(expires) ? new Date(expires * 1000).toISOString() : '',
      model,
    };
  });
}

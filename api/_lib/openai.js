// The one place this server talks to OpenAI. The key stays here: it is never
// sent to the browser or the apps.

const API = 'https://api.openai.com/v1';

export const hasKey = () => Boolean((process.env.OPENAI_API_KEY || '').trim());

export async function openai(pathname, body, { timeoutMs = 30000 } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data, message: data?.error?.message || '' };
}

// An ISO 639-1 code such as "es", or a tag such as "pt-BR". Anything else
// falls back to English.
export function languageCode(value) {
  const text = String(value ?? '').trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(text) ? text : '';
}

export function languageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

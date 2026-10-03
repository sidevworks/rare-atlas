// The atlas's only door to the server. Shapes are in shared/schema.js.
// VITE_API_BASE is empty on the web (same origin) and set to the deployed
// site in the phone apps, which are served from their own local origin.

const BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '');

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) {
    throw new Error(data?.error || `The atlas server answered ${response.status}.`);
  }
  return data;
}

const query = params => new URLSearchParams(params).toString();

export const api = {
  map: () => request('/api/map'),
  search: q => request(`/api/search?${query({ q })}`),
  disease: id => request(`/api/disease?${query({ id })}`),
  connections: (id, limit = 5) => request(`/api/connections?${query({ id, limit })}`),
  assets: id => request(`/api/assets?${query({ id })}`),
  brief: ({ fromId, toId, language }) => request('/api/brief', { method: 'POST', body: { fromId, toId, language } }),
  realtimeSession: (language = '') => request('/api/realtime-session', { method: 'POST', body: { language } }),
};

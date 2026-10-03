// One small event bus. The voice agent, the world and the desk never call
// each other: each says what happened here and the others react.

export const EVENT = Object.freeze({
  // Voice
  VOICE_STATE: 'voice:state',           // { state: 'idle'|'connecting'|'listening'|'thinking'|'speaking'|'error', message? }
  VOICE_LEVEL: 'voice:level',           // { level: 0..1 }
  VOICE_TRANSCRIPT: 'voice:transcript', // { role: 'person'|'agent', text, final }

  // Retrieval, from voice or from the typed search box
  RETRIEVAL_START: 'retrieval:start',   // { tool, args }
  RETRIEVAL_RESULT: 'retrieval:result', // { tool, args, result }
  RETRIEVAL_ERROR: 'retrieval:error',   // { tool, args, message }

  // What the world and the desk should show
  ATLAS_FOCUS: 'atlas:focus',           // { id }                   fly to one disease
  ATLAS_PATH: 'atlas:path',             // { fromId, toId, edge }   draw one link (dashed when inferred)
  ATLAS_RESET: 'atlas:reset',           // {}
  DESK_CARDS: 'desk:cards',             // { edges: Edge[] }        source cards land on the desk
  DESK_BRIEF: 'desk:brief',             // { brief: BriefResponse }
  DESK_GAP: 'desk:gap',                 // { gap: Gap }
  DESK_CLEAR: 'desk:clear',             // {}

  // The visitor
  VISITOR_APPROACH: 'visitor:approach', // {}   walked up to the desk
  VISITOR_LEAVE: 'visitor:leave',       // {}
  SEARCH_SUBMIT: 'search:submit',       // { q }
  NODE_SELECT: 'node:select',           // { id }   clicked a star
});

const target = new EventTarget();

export function emit(type, detail = {}) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  const listener = event => handler(event.detail);
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

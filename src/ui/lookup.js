// The lookups the interface asks for itself. Each goes through runTool, the
// same door the voice agent uses, so a typed or tapped request moves the
// librarian and the sky exactly as a spoken one does.

import { runTool } from '../retrieval.js';

let latest = 0;

// runTool has already announced a failure on the bus, and the status line
// shows it, so here a failure only needs to stop the steps that depend on it.
const settle = promise => promise.then(() => true, () => false);

// One disease, in the order a visitor reads it: what it is, what it is close
// to, and who is already working on it. A newer request overtakes an older
// one that is still running.
export async function lookUpDisease(id) {
  const mine = ++latest;
  if (!(await settle(runTool('get_disease', { id })))) return;
  if (mine !== latest) return;
  await settle(runTool('find_connections', { id }));
  if (mine !== latest) return;
  await settle(runTool('find_shared_assets', { id }));
}

export const findConnections = id => settle(runTool('find_connections', { id }));

export const findAssets = id => settle(runTool('find_shared_assets', { id }));

export const draftBrief = (fromId, toId, language) => settle(runTool('draft_brief', { fromId, toId, language }));

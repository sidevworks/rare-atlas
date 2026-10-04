// The 3D library is built separately and loaded as its own page. This stand-in
// keeps the plain interface working on its own until the two are joined.
export function createWorld() {
  return { dispose() {} };
}

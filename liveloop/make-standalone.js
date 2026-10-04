// Turns a downloaded LiveLoop state of the world into a lean, standalone page.
//
//   node liveloop/make-standalone.js <downloaded-state.html>
//
// A downloaded state carries the 3D runtime inlined twice and the base
// library as a base64 copy of itself, about 2.5 million characters, of which
// roughly 270,000 are the world. This keeps only the world: the base
// library's own scripts plus the extensions the state adds on top, and loads
// the public Three.js release from a CDN in place of the inlined runtime.
//
// Output: public/world/index.html

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js';

const source = process.argv[2];
if (!source) throw new Error('Give the path of the downloaded state.');
const state = readFileSync(source, 'utf8');

// The base library, as the state carries it.
const packed = state.match(/data:text\/html;base64,([A-Za-z0-9+\/=]+)/);
if (!packed) throw new Error('This state does not carry the base library.');
const base = Buffer.from(packed[1], 'base64').toString('utf8');

const runtimeBlock = /<script data-asksary-runtime="threejs-inline">[\s\S]*?<\/script>\s*/;

// A state built on top of an earlier standalone page carries that page (which
// already loads Three.js itself) and one script that extends it. Keep the
// script as it is and only swap the inlined runtime for the public release.
if (!runtimeBlock.test(base)) {
  const shim = `<script type="module">
import * as THREE from '${THREE_URL}';
window.THREE = THREE;
window.Atlas3D = { THREE };
for (const held of document.querySelectorAll('script[data-state]')) {
  const script = document.createElement('script');
  script.textContent = held.textContent;
  held.replaceWith(script);
}
</script>`;
  const layered = state
    .replace(runtimeBlock, '')
    .replace(/<meta name="asksary-[^>]*>\n?/g, '')
    .replace(/^<script>/gm, '<script type="text/plain" data-state>')
    .replace(/AskSary3D/g, 'Atlas3D')
    .replace(/<\/body\s*>/i, () => `${shim}\n</body>`);
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'world');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), layered);
  console.log(`public/world/index.html: ${layered.length.toLocaleString()} characters (from ${state.length.toLocaleString()}), layered on an earlier standalone page`);
  process.exit(0);
}

// The state's own script defines the extension functions, then builds the
// text it appends to the base. Run just that much here to get the text.
const stateScript = state.replace(runtimeBlock, '').match(/<script>\n(function installAtlasComputers[\s\S]*?)<\/script>/);
if (!stateScript) throw new Error('The state script was not where it was expected.');
const functions = stateScript[1].slice(0, stateScript[1].indexOf('(async()=>{'));
const template = stateScript[1].match(/const startup=(`[\s\S]*?`);\n\s*const addition=/);
if (!template) throw new Error('The startup text was not where it was expected.');
const startup = vm.runInNewContext(`${functions}\n${template[1]}`, {});

// Classic scripts must run in order and only once Three.js is there, so they
// wait as inert text and are started by the loader below.
const hold = text => text.replace(/<script>/g, '<script type="text/plain" data-world>');

const loader = `<script type="module">
import * as THREE from '${THREE_URL}';
window.THREE = THREE;
window.Atlas3D = { THREE };
for (const held of document.querySelectorAll('script[data-world]')) {
  const script = document.createElement('script');
  script.textContent = held.textContent;
  held.replaceWith(script);
}
</script>`;

let page = hold(base.replace(runtimeBlock, ''))
  .replace(/<meta name="asksary-[^>]*>\n?/g, '')
  .replace(/<\/body\s*>/i, () => `<script type="text/plain" data-world>${startup}</script>\n${loader}\n</body>`);
page = page.replace(/AskSary3D/g, "Atlas3D");

const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'world');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), page);
console.log(`public/world/index.html: ${page.length.toLocaleString()} characters (from ${state.length.toLocaleString()})`);

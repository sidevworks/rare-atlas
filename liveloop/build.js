// Builds the LiveLoop state for the Rare Atlas world with the Mondo floor.
//
//   node liveloop/build.js
//
// The output, liveloop/rare-atlas-mondo-floor.html, follows the pattern of
// the world's existing states: it fetches the unchanged base world from the
// LiveLoop library asset "liveloop-63", appends one script that installs the
// atlas extensions already in the world (computers, monitor output, print)
// and then the Mondo floor, and writes the result as the document. Save it
// as the next state of the LiveLoop project.
//
// The floor loads its data at runtime (see src/world/mondo-floor.js). A small
// sample built from data/build/mondo-floor.compact.json is embedded so the
// floor still shows something when no data source can be reached.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.join(here, '..');
const read = p => readFileSync(path.join(repo, p), 'utf8');

const extensions = read('liveloop/atlas-extensions.js');
const floor = read('src/world/mondo-floor.js').replace(/\nif\(typeof window[^\n]*\n?$/, '\n');

// Every SAMPLE_STEP-th record, so the sample spans every gallery.
const SAMPLE_STEP = 160;
let sample = null;
const compactPath = path.join(repo, 'data/build/mondo-floor.compact.json');
if (existsSync(compactPath)) {
  const full = JSON.parse(readFileSync(compactPath, 'utf8'));
  const bytes = s => Buffer.from(s, 'base64');
  const pick = (buffer, width, n) => {
    const out = Buffer.alloc(n * width);
    for (let i = 0; i < n; i++) buffer.copy(out, i * width, i * SAMPLE_STEP * width, i * SAMPLE_STEP * width + width);
    return out.toString('base64');
  };
  const names = full.names.split('\n').filter((_, i) => i % SAMPLE_STEP === 0);
  const n = names.length;
  sample = {
    format: 'mondo-floor-compact/1', builtAt: full.builtAt, source: { ...full.source, note: `sample of every ${SAMPLE_STEP}th record` },
    categories: full.categories, flagBits: full.flagBits, n, names: names.join('\n'),
    ids: pick(bytes(full.ids), 4, n), cat: pick(bytes(full.cat), 1, n), cats: pick(bytes(full.cats), 4, n), flags: pick(bytes(full.flags), 1, n),
    syn: pick(bytes(full.syn), 1, n), xref: pick(bytes(full.xref), 1, n), kids: pick(bytes(full.kids), 2, n), depth: pick(bytes(full.depth), 1, n),
  };
  // Category counts in the sample, so the panel is honest about what it shows.
  const cat = bytes(sample.cat);
  sample.categories = sample.categories.map((c, i) => ({ ...c, count: [...cat].filter(x => x === i).length }));
  console.log(`Embedded a sample of ${n} diseases.`);
} else {
  console.warn('No data/build/mondo-floor.compact.json: run `npm run load:mondo` first. Building without an embedded sample.');
}

const sampleScript = sample ? `window.MONDO_FLOOR_SAMPLE=${JSON.stringify(sample).replace(/<\//g, '<\\/')};\n` : '';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050a13">
<meta name="asksary-engine" content="threejs">
<meta name="asksary-three-version" content="0.185.1">
<title>Rare Atlas</title>
<style>
html,body{width:100%;height:100%;margin:0;background:#050a13;color:#dfebf2;font:14px system-ui}#startup{padding:24px}
</style>
<script data-asksary-runtime="threejs" src="/vendor/asksary3d/0.185.1/asksary-3d.min.js"></script>
</head>
<body>
<div id="startup">Opening Rare Atlas…</div>
<script>
${extensions}
${floor}
(async()=>{
 const notice=document.getElementById("startup");
 try{
  const response=await fetch("asksary-asset://liveloop-63");
  if(!response.ok)throw new Error("Could not open the supplied library asset.");
  const base=await response.text();
  if(!/<html[\\s>]/i.test(base))throw new Error("The library asset is not an HTML document.");
  const startup=\`
${sampleScript.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}
(function attachExtensions(){
 if(window.app&&window.app.world&&window.RareAtlasInteractive){
  try{
   (\${installAtlasComputers.toString()})();
   (\${moveAtlasComputers.toString()})();
   (\${installAtlasMonitorOutput.toString()})();
   (\${installAtlasPrint.toString()})();
   (\${installMondoFloor.toString()})();
  }catch(error){console.error("Atlas extensions:",error);}
 }else requestAnimationFrame(attachExtensions);
})();
\`;
  const addition="<script>"+startup+"<"+"/script>";
  const complete=/<\\/body\\s*>/i.test(base)?base.replace(/<\\/body\\s*>/i,()=>addition+"</body>"):base+addition;
  document.open();document.write(complete);document.close();
 }catch(error){
  notice.textContent="Rare Atlas could not open: "+error.message;console.error(error);
 }
})();
</script>
</body>
</html>
`;

mkdirSync(path.join(repo, 'liveloop'), { recursive: true });

// --base <export.html>: splice the Mondo floor into a self-contained LiveLoop
// export of the world (one that carries the runtime and the base document
// itself) instead of writing the asset-fetching wrapper. --out sets the
// output path; the default sits next to the export with ".mondo-floor.html".
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const base = option('--base');
if (base) {
  const source = readFileSync(base, 'utf8');
  const need = (text, what) => { if (!source.includes(text)) throw new Error(`The export does not look like the Rare Atlas world: ${what} not found.`); };
  need('(async()=>{\n const notice=document.getElementById("startup");', 'the startup block');
  need('   (${installAtlasPrint.toString()})();', 'the print extension');
  need('  const startup=`\n', 'the startup template');
  let merged = source;
  if (merged.includes('function installMondoFloor(')) {
    // Replace an earlier Mondo floor with this build of it.
    const start = merged.indexOf('// The Mondo floor:');
    const end = merged.indexOf('(async()=>{\n const notice');
    merged = merged.slice(0, start) + merged.slice(end);
    merged = merged.replace(/\n   \(\$\{installMondoFloor\.toString\(\)\}\)\(\);/, '');
    merged = merged.replace(/\nwindow\.MONDO_FLOOR_SAMPLE=[^\n]*\n/, '\n');
  }
  merged = merged.replace('(async()=>{\n const notice=document.getElementById("startup");', floor + '\n(async()=>{\n const notice=document.getElementById("startup");');
  merged = merged.replace('   (${installAtlasPrint.toString()})();', '   (${installAtlasPrint.toString()})();\n   (${installMondoFloor.toString()})();');
  merged = merged.replace('  const startup=`\n', '  const startup=`\n' + sampleScript.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'));
  const target = option('--out') || base.replace(/\.html?$/i, '') + '.mondo-floor.html';
  writeFileSync(target, merged);
  console.log(`Wrote ${target} (${(merged.length / 1024).toFixed(0)} KB) from ${base}`);
} else {
  const out = path.join(repo, 'liveloop/rare-atlas-mondo-floor.html');
  writeFileSync(out, html);
  console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}

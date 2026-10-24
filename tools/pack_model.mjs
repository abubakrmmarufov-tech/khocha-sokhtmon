// Pack the exported model for the web. Run after blender/export.sh:
//   node tools/pack_model.mjs [public/models/house.glb]
//
// 1. The UVs (metres, float32) are rounded to 1/64 m: the meshopt codec then compresses them about
//    a third smaller, with no visible change on tiles of 1-3 m.
// 2. The grounds (the `Site` node: lawns, roads, kerbs, benches, lamps...) go to a file of their own,
//    site.glb, loaded after the house (src/building.js): on a slow line the house shows in half the
//    time, the grounds fill in round it a few seconds later.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const STEP = 64; // UVs rounded to 1/64 m
const SITE = 'Site';
const file = process.argv[2] ?? 'public/models/house.glb';
const siteFile = join(dirname(file), 'site.glb');
const mb = (f) => `${(statSync(f).size / 1e6).toFixed(2)} MB`;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const before = mb(file);
const doc = await io.read(file);

let rounded = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const uv = prim.getAttribute('TEXCOORD_0');
    if (!uv || !(uv.getArray() instanceof Float32Array)) continue; // (0..1 panels are already 16-bit)
    const a = uv.getArray();
    for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * STEP) / STEP;
    uv.setArray(a);
    rounded++;
  }
}

// the grounds into their own document: the same file with everything but the Site node dropped,
// and the house with the Site node dropped
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const hasSite = scene.listChildren().some((n) => n.getName() === SITE);
let siteDoc = null;
if (hasSite) {
  siteDoc = cloneDocument(doc);
  const siteScene = siteDoc.getRoot().getDefaultScene() ?? siteDoc.getRoot().listScenes()[0];
  for (const n of siteScene.listChildren()) if (n.getName() !== SITE) siteScene.removeChild(n);
  for (const n of scene.listChildren()) if (n.getName() === SITE) scene.removeChild(n);
  await siteDoc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(siteFile, siteDoc);
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(file, doc);
console.log(`${rounded} UV sets rounded to 1/${STEP} m; ${file} ${before} -> ${mb(file)}${hasSite ? ` + ${siteFile} ${mb(siteFile)}` : ' (no Site node: one file)'}`);

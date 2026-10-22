// Screenshots inside a flat in walk mode from given spots, and what is under given pixels.
//   node tools/walk_views.mjs OUTDIR FLAT x,y,bearing[,pitch] ...   [--pick u,v]
// x, y: plan metres; bearing: compass degrees (0 = north = +y, 90 = east); pitch: degrees (down < 0).
// --pick u,v (pixels of the 1280 x 800 view): reports the mesh, material and plan point hit there,
// for every view.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args.splice(args.indexOf(`--${k}`), 2)[1] : null);
const picks = [];
for (let p; (p = opt('pick')); ) picks.push(p.split(',').map(Number));
const [out, flat, ...views] = args;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const [VW, VH] = (process.env.VIEW ?? '1280x800').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:5191/?still' + (process.env.QUERY ? '&' + process.env.QUERY : ''));
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
await page.evaluate(async (flat) => {
  const app = window.__app;
  const a = app.apartments.find((x) => x.id === flat);
  app.selectApt(a);
  app.enterWalk(a);
  for (let t = 0; t < 100 && !(app.interior && app.state.mode === 'walk'); t++) await new Promise((r) => setTimeout(r, 100));
  for (const id of ['walk-ui', 'eye']) document.getElementById(id).style.visibility = 'hidden';
}, flat);
if (process.env.ALL) await page.evaluate(() => (window.__ALLHITS = true));
await page.waitForTimeout(2500);
let i = 0;
for (const v of views) {
  const [x, y, bearing, pitch = -5] = v.split(',').map(Number);
  const hits = await page.evaluate(({ x, y, bearing, pitch, picks }) => {
    const app = window.__app, THREE = app.THREE, w = app.walk;
    const s = app.interior.frame.toScene(x, y);
    w.pos.set(s.x, s.z);
    w.yaw = (-bearing * Math.PI) / 180;
    w.pitch = (pitch * Math.PI) / 180;
    w.apply(0);
    app.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    return picks.map(([u, v]) => {
      ray.setFromCamera(new THREE.Vector2((u / innerWidth) * 2 - 1, -(v / innerHeight) * 2 + 1), app.camera);
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const all = ray.intersectObjects(app.scene.children, true).filter((q) => q.object.isMesh && shown(q.object));
      // (with ALL set: what is behind as well, past glass and screens)
      const h = all[0];
      if (!h) return { u, v, hit: null };
      if (window.__ALLHITS) return { u, v, hits: all.slice(0, 6).map((q) => { const m = Array.isArray(q.object.material) ? q.object.material[0] : q.object.material; const p = app.interior.frame.toPlan(q.point.x, q.point.z); return `${m?.color?.getHexString?.()}${m?.alphaMap ? '(alpha)' : ''}${m?.transparent ? '(transp)' : ''} @${p.x.toFixed(2)},${p.y.toFixed(2)},${(q.point.y - app.interior.baseY).toFixed(2)}`; }) };
      const p = app.interior.frame.toPlan(h.point.x, h.point.z);
      const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
      return { u, v, object: h.object.name, material: m?.name, color: m?.color?.getHexString?.(), plan: [+p.x.toFixed(2), +p.y.toFixed(2)], z: +(h.point.y - app.interior.baseY).toFixed(2), dist: +h.distance.toFixed(2) };
    });
  }, { x, y, bearing, pitch, picks });
  await page.waitForTimeout(700);
  const f = `${out}/view${i++}.png`;
  await page.screenshot({ path: f });
  console.log(f, v, hits.length ? JSON.stringify(hits) : '');
}
await browser.close();

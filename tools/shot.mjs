// One or more screenshots of the running site from given cameras (scene metres: x east, y up, z south).
//
//   npx vite --port 5191 &
//   node tools/shot.mjs build/shot.png --pos -22,6,80 --target 0,19,0 [--fov 30] [--size 1600x1000] [--ui] [--query quality=low]
//   node tools/shot.mjs build/shots --views front,aerial,back      (named views below)
//
// Drives the installed Google Chrome through playwright-core.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const VIEWS = {
  // the client's renders
  front: { pos: [-22, 6, 80], target: [0, 19, 0], fov: 30 },          // render 8
  front2: { pos: [20, 4, 75], target: [0, 17, 0], fov: 32 },          // render 5
  aerial: { pos: [70, 70, 95], target: [0, 16, 0], fov: 32 },          // render 1 (south-east, above)
  aerial2: { pos: [-70, 65, 90], target: [0, 14, 0], fov: 32 },        // render 2 (south-west, above)
  back: { pos: [-55, 55, -85], target: [0, 14, 0], fov: 32 },          // render 3 (north-west, above)
  back2: { pos: [60, 60, -80], target: [0, 12, 0], fov: 32 },          // render 7 (north-east, above)
  top: { pos: [0.1, 180, 0.1], target: [0, 0, 0], fov: 40 },
};

const args = process.argv.slice(2);
const out = args[0] ?? 'build/shot.png';
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const flag = (k) => args.includes(`--${k}`);
const url = opt('url', 'http://localhost:5191/');
const [W, H] = opt('size', '1600x1000').split('x').map(Number);
const query = opt('query', '');
const vec = (s) => s.split(',').map(Number);

// a client render's camera (tools/calib.py): plan x, plan y, yaw (deg, 0 = north), f (px), v0 (px), height (m)
// -> the same picture, at the render's size (pass --size W x H of the render)
const CAM = opt('cam') ? opt('cam').split(',').map(Number) : null;
let shots;
if (CAM) {
  mkdirSync(dirname(out), { recursive: true });
  shots = [{ file: out, cam: CAM }];
} else if (opt('views')) {
  mkdirSync(out, { recursive: true });
  shots = opt('views').split(',').map((n) => ({ file: join(out, `${n}.png`), ...VIEWS[n] }));
} else {
  mkdirSync(dirname(out), { recursive: true });
  shots = [{ file: out, pos: vec(opt('pos', '-22,6,80')), target: vec(opt('target', '0,19,0')), fov: +opt('fov', 30) }];
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`${url}?still${query ? `&${query}` : ''}`);
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
await page.waitForTimeout(+opt('wait', 3500));
if (opt('eval')) console.log('eval:', await page.evaluate(opt('eval')));
// --bare: only the house (and the ground): no trees, palms, cars, people, city; --nosite: no ground either
if (flag('bare') || flag('nosite')) {
  await page.evaluate((nosite) => {
    const app = window.__app;
    app.scene.traverse((o) => {
      const n = o.name || '';
      if (/^(trees|palms|city)/.test(n) || (o.isInstancedMesh && !app.building.group.getObjectById(o.id))) o.visible = false;
      if (nosite && (n === 'Site' || n.startsWith('Site'))) o.visible = false;
    });
    app.renderer.shadowMap.needsUpdate = true;
  }, flag('nosite'));
}
for (const s of shots) {
  await page.evaluate(({ s, ui }) => {
    const app = window.__app;
    for (const id of ['ext-ui', 'labels', 'places', 'tooltip', 'quality', 'eye', 'daytime']) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = ui ? '' : 'hidden';
    }
    app.controls.maxPolarAngle = Math.PI / 2 + 0.01;
    app.controls.minDistance = 0.1;
    app.controls.enableDamping = false;
    if (s.cam) {
      const [cx, cy, yaw, f, v0, h] = s.cam;
      const a = (yaw * Math.PI) / 180;
      const W = innerWidth, H = innerHeight;
      const full = 2 * Math.max(v0, H - v0);
      const cam = app.camera;
      cam.fov = (2 * Math.atan(full / 2 / f) * 180) / Math.PI;
      cam.aspect = W / full;
      cam.setViewOffset(W, full, 0, full / 2 - v0, W, H);
      cam.near = 0.5;
      cam.updateProjectionMatrix();
      app.setView([cx, h, -cy], [cx + Math.sin(a) * 100, h, -cy - Math.cos(a) * 100]);
      cam.updateProjectionMatrix();
    } else {
      if (!ui) app.camera.clearViewOffset();
      app.camera.fov = s.fov ?? 30;
      app.camera.updateProjectionMatrix();
      app.setView(s.pos, s.target);
    }
  }, { s, ui: flag('ui') });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: s.file });
  console.log('wrote', s.file);
}
await browser.close();

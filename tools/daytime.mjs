// The house at several hours of the day (src/night.js), from the named views of tools/shot.mjs.
//
//   node tools/daytime.mjs build/daytime --hours 7,15,18.5,20,22 --views aerial2,front [--ui] [--size 1280x800]
//   node tools/daytime.mjs build/daytime --hours 21 --walk A9-4      (inside a flat at that hour)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// (tools/shot.mjs's named views: importing it would run it)
const VIEWS = {
  front: { pos: [-22, 6, 80], target: [0, 19, 0], fov: 30 },
  front2: { pos: [20, 4, 75], target: [0, 17, 0], fov: 32 },
  aerial: { pos: [70, 70, 95], target: [0, 16, 0], fov: 32 },
  aerial2: { pos: [-70, 65, 90], target: [0, 14, 0], fov: 32 },
  back: { pos: [-55, 55, -85], target: [0, 14, 0], fov: 32 },
  back2: { pos: [60, 60, -80], target: [0, 12, 0], fov: 32 },
  home: { pos: [-58, 44, 86], target: [0, 17, 0], fov: 38 },
  low: { pos: [-30, 3, 60], target: [0, 22, 0], fov: 50 },
};

const args = process.argv.slice(2);
const out = args[0] ?? 'build/daytime';
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const flag = (k) => args.includes(`--${k}`);
const hours = opt('hours', '7,15,18.5,20,22').split(',').map(Number);
const views = opt('views', 'aerial2').split(',');
const [W, H] = opt('size', '1280x800').split('x').map(Number);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`${opt('url', 'http://localhost:5191/')}?still${opt('query') ? `&${opt('query')}` : ''}`);
await page.waitForFunction(() => window.__app?.daytime, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const walk = opt('walk');
if (walk) {
  await page.evaluate((id) => window.__app.enterWalk(window.__app.apartments.find((a) => a.id === id)), walk);
  await page.waitForTimeout(3000);
}
for (const v of walk ? ['walk'] : views) {
  if (!walk) {
    await page.evaluate(({ s, ui }) => {
      const app = window.__app;
      for (const id of ['ext-ui', 'labels', 'places', 'tooltip', 'quality', 'eye']) {
        const el = document.getElementById(id);
        if (el) el.style.visibility = ui ? '' : 'hidden';
      }
      app.controls.enableDamping = false;
      if (!ui) app.camera.clearViewOffset();
      app.camera.fov = s.fov ?? 30;
      app.camera.updateProjectionMatrix();
      app.setView(s.pos, s.target);
    }, { s: VIEWS[v], ui: flag('ui') });
    await page.waitForTimeout(1500);
  }
  for (const h of hours) {
    await page.evaluate((h) => window.__app.setHours(h), h);
    await page.waitForTimeout(1200);
    const file = join(out, `${v}_${String(h).replace('.', '_')}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
}
await browser.close();

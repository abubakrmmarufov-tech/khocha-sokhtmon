// A top-down picture of a furnished floor (the floor view's cut-away), centred on a flat.
//   node tools/floor_top.mjs OUT.png FLAT [--size 1400x1000] [--span 12]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const [out, flat] = args;
const [W, H] = opt('size', '1400x1000').split('x').map(Number);
const span = +opt('span', 12);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:5191/?still');
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
await page.evaluate(async ({ flat, span }) => {
  const app = window.__app, THREE = app.THREE;
  const a = app.apartments.find((x) => x.id === flat);
  app.selectFloor(a.tower, a.floor);
  await new Promise((r) => setTimeout(r, 2500));
  for (const id of ['ext-ui', 'labels', 'tooltip', 'quality', 'eye']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
  const c = app.building.units.get(a.id).center;
  const cam = app.camera;
  cam.clearViewOffset();
  cam.fov = 2 * Math.atan(span / 2 / 40) * 180 / Math.PI;
  cam.updateProjectionMatrix();
  app.controls.enableDamping = false;
  app.controls.maxPolarAngle = Math.PI;
  app.setView([c.x, c.y + 40, c.z + 0.001], [c.x, c.y, c.z]);
}, { flat, span });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log('wrote', out);
await browser.close();

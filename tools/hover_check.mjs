// Hover a floor of the house with the mouse and screenshot it (checks the amber floor highlight), then
// the same with the eye pressed (no panels), then a floor opened (nothing floating over the cut).
//   node tools/hover_check.mjs build/check [--floor 7]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args[0] ?? 'build/check';
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const floor = +opt('floor', 7);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:5191/');
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
await page.waitForTimeout(4000);
// a point on the front of the floor, on screen
const at = await page.evaluate((f) => {
  const app = window.__app, THREE = app.THREE;
  const fl = app.apartments.find((a) => a.floor === f);
  const p = new THREE.Vector3(-8, fl.baseY + 1.5, 10.7).project(app.camera);
  return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
}, floor);
await page.mouse.move(at[0], at[1], { steps: 4 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/hover.png` });
console.log('hover', await page.evaluate(() => JSON.stringify(window.__app.state.hoverFloor)));
await page.click('#eye');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/eye.png` });
await page.click('#eye');
await page.evaluate((f) => window.__app.selectFloor('A', f), floor);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/floor.png` });
await browser.close();

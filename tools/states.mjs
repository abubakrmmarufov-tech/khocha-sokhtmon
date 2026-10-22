// Screenshots of the site in its states, for a look over: overview, the top floor opened, a flat's
// card, the walk, and the same on a phone.
//   node tools/states.mjs build/states
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'build/states';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
for (const [tag, vp, mobile] of [['desk', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.log(tag, 'page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(tag, 'console:', m.text()));
  await page.goto('http://localhost:5191/');
  await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/${tag}_overview.png` });
  await page.evaluate(() => window.__app.selectFloor('A', 10));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${tag}_floor10.png` });
  await page.evaluate(() => window.__app.selectApt(window.__app.apartments.find((a) => a.floor === 10 && a.unit === 4)));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${tag}_apt.png` });
  await page.evaluate(() => window.__app.enterWalk(window.__app.state.apt));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/${tag}_walk.png` });
  await page.close();
}
await browser.close();

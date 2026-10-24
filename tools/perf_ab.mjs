// Frame rate of the high level at 1600 x 1000 with the effects switched by the site's own query
// parameters, to weigh what each costs on this computer's GPU:
//   npm run build && npx vite preview --port 4173 &
//   node tools/perf_ab.mjs [--url http://localhost:4173/] [query ...]
//   node tools/perf_ab.mjs "" "shadows=pcf" "bloom=0&vignette=0" "shadows=pcf&bloom=0&vignette=0"
// Three fixed views each: the start view, the house from the south-west, a pedestrian on the street.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args.splice(args.indexOf(`--${k}`), 2)[1] : d);
const url = opt('url', 'http://localhost:4173/');
const queries = args.length ? args : [''];
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
for (const extra of queries) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`${url}?still&quality=high${extra ? `&${extra}` : ''}`);
  await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
  await page.evaluate(() => Promise.all([window.__app.building.texturesReady, window.__app.world.ready, window.__app.pipeline.ready]));
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const app = window.__app;
    const measure = async (pos, target) => {
      app.setView(pos, target);
      await new Promise((r) => setTimeout(r, 1200));
      return new Promise((resolve) => {
        const t = [];
        let last = performance.now();
        const end = last + 4000;
        const tick = () => {
          const now = performance.now();
          t.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            t.sort((a, b) => a - b);
            resolve({ fps: Math.round((1000 * t.length) / t.reduce((s, x) => s + x, 0)), p95_ms: +t[Math.floor(t.length * 0.95)].toFixed(1) });
          }
        };
        requestAnimationFrame(tick);
      });
    };
    return {
      start: await measure([-58, 44, 86], [0, 17, 0]),
      aerial: await measure([-150, 165, 285], [5, 22, -5]),
      street: await measure([62, 1.7, 112], [25, 12, 40]),
      pixelRatio: app.renderer.getPixelRatio(),
    };
  });
  console.log(JSON.stringify({ query: extra || '(as shipped)', ...r }));
  await page.close();
}
await browser.close();

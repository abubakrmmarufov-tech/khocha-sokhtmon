// Interior audit of a floor: for every flat, the door leaves (none missing, none swinging through a
// drawn fitting, none crossing another), furniture standing in walls or pilasters, notes.
//   node tools/interior_audit.mjs [FLOOR]
import { chromium } from 'playwright-core';
const floor = +(process.argv[2] ?? 5);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:5191/?still');
await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
const res = await page.evaluate(async (floor) => {
  const app = window.__app;
  const { buildFloor } = await import('/src/floor.js');
  const { aptsOnFloor } = await import('/src/data.js');
  const apts = aptsOnFloor('A', floor);
  const out = [];
  for (const a of apts) {
    const it = buildFloor('A', floor, apts, a);
    const leaves = it.obstacles.filter((o) => o.what === 'door').map((o) => o.poly);
    const inFlat = (p) => {
      const poly = a.data.outline;
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const mine = leaves.filter((l) => inFlat(l[0]) || inFlat(l[1]));
    const doorways = it.doorways.filter((d) => d.apt === a.id);
    out.push({ id: a.id, area: a.area, notes: it.notes, leaves: mine.length, doorways: doorways.length,
      wet: doorways.filter((d) => ['bath', 'wc'].includes(d.room) || ['bath', 'wc'].includes(d.across)).length,
      gaps: it.gaps.filter((g) => g.apt === a.id).map((g) => `${g.room}->${g.other ?? g.across}:${g.done}`) });
    it.group.traverse((o) => o.geometry?.dispose?.());
  }
  return out;
}, floor);
for (const r of res) console.log(JSON.stringify(r));
await browser.close();

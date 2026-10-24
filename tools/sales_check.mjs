// The 3D site with the sales CRM's statuses: opens the CRM's demo (it fills the example and hands the
// statuses over in this browser), then the site, and checks that sold flats are red and reserved
// ones yellow on the building, the floor list, the open floor and the flat card; screenshots.
// Needs the built site with the CRM, served from one origin:
//   npm run build && npx vite preview --port 5192
//   node tools/sales_check.mjs [OUT=build/sales] [URL=http://localhost:5192/]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'build/sales';
const URL = process.argv[3] ?? 'http://localhost:5192/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
let failures = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const context = await browser.newContext();
const errors = [];

// the CRM's demo: a fresh example
const crm = await context.newPage();
await crm.setViewportSize({ width: 1280, height: 800 });
await crm.goto(`${URL}crm/`);
await crm.evaluate(() => ['khocha-crm:demo', 'khocha-crm:demo:user', 'khocha-crm:demo:status'].forEach((k) => localStorage.removeItem(k)));
await crm.reload();
await crm.click('button[type="submit"]');
await crm.waitForSelector('.board');
let statuses, sold, reserved;
const readStatuses = async () => {
  statuses = await crm.evaluate(() => JSON.parse(localStorage.getItem('khocha-crm:demo:status')));
  sold = statuses.filter((s) => s.status === 'sold').map((s) => s.id);
  reserved = statuses.filter((s) => s.status === 'reserved').map((s) => s.id);
};
await readStatuses();
ok(statuses.length === 72 && sold.length > 5 && reserved.length > 0, `the CRM hands over 72 statuses (${sold.length} sold, ${reserved.length} reserved)`);

for (const [tag, vp, mobile] of [['desk', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  await readStatuses();
  // the desk page shares the CRM's browser (a sale there shows here live); the phone gets its own,
  // with the CRM's statuses copied into it
  let page;
  if (!mobile) {
    page = await context.newPage();
    await page.setViewportSize(vp);
  } else {
    const phone = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phone.addInitScript((s) => localStorage.setItem('khocha-crm:demo:status', s), JSON.stringify(statuses));
    page = await phone.newPage();
  }
  page.on('pageerror', (e) => errors.push(`${tag} page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`));
  await page.goto(`${URL}?still`);
  await page.waitForFunction(() => window.__app?.building, null, { timeout: 120000 });
  await page.waitForTimeout(4500);
  const shown = await page.evaluate(() => {
    const a = window.__app;
    const out = {};
    for (const apt of a.apartments) {
      const u = a.building.units.get(apt.id);
      out[apt.id] = u.overlay.visible ? `#${u.overlay.material.color.getHexString()}` : null;
    }
    return out;
  });
  ok(sold.every((id) => shown[id] === '#e5392f'), `${tag} overview: every sold flat is red on the building`);
  ok(reserved.every((id) => shown[id] === '#f7b500'), `${tag} overview: every reserved flat is yellow`);
  ok(Object.entries(shown).filter(([id, c]) => c && !sold.includes(id) && !reserved.includes(id) && !statuses.find((s) => s.id === id && s.status === 'closed')).length === 0,
    `${tag} overview: free flats are not coloured`);
  if (!mobile) {
    const side = await page.innerText('#side');
    ok(/Продано\s+\d+/.test(side) && /Бронь\s+\d+/.test(side), 'overview panel: counts of free / reserved / sold');
    ok((await page.locator('#floors .dots i.s-sold').count()) === sold.length, 'floor list: a red dot per sold flat');
  }
  await page.screenshot({ path: `${OUT}/${tag}_overview.png` });

  // a floor with a sale opened
  const soldApt = await page.evaluate((id) => {
    const a = window.__app.apartments.find((x) => x.id === id);
    return { floor: a.floor, number: a.number };
  }, sold.at(-1));
  await page.evaluate((f) => window.__app.selectFloor('A', f), soldApt.floor);
  await page.waitForTimeout(3500);
  const tag1 = await page.locator('.tag.s-sold').first().innerText().catch(() => '');
  ok(/Продана/.test(tag1), `${tag} floor ${soldApt.floor}: the sold flat's tag says «Продана»`);
  const tint = await page.evaluate((id) => {
    const u = window.__app.building.units.get(id);
    return u.tint.visible && `#${u.tint.material.color.getHexString()}`;
  }, sold.at(-1));
  ok(tint === '#e5392f', `${tag} floor ${soldApt.floor}: the sold flat is tinted red on its floor`);
  await page.screenshot({ path: `${OUT}/${tag}_floor.png` });
  await page.evaluate((id) => window.__app.selectApt(window.__app.apartments.find((a) => a.id === id)), sold.at(-1));
  await page.waitForTimeout(3000);
  ok((await page.innerText('#side')).includes('Продана'), `${tag} card of № ${soldApt.number}: «Продана»`);
  await page.screenshot({ path: `${OUT}/${tag}_card.png` });

  // only the free ones
  if (!mobile) {
    await page.evaluate(() => window.__app.goOverview());
    await page.waitForTimeout(2500);
    await page.check('#side [data-act="free"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${tag}_only_free.png` });
    await page.uncheck('#side [data-act="free"]');
  }

  // a sale in the CRM shows on the open site without reloading it (the demo: another tab)
  if (!mobile) {
    const freeId = statuses.find((s) => s.status === 'free').id;
    await crm.bringToFront();
    await crm.click(`.cell[data-flat="${freeId}"]`);
    await crm.click('#drawer [data-act="sell"]');
    await crm.selectOption('.dialog [name="client_id"]', { index: 2 });
    await crm.click('.dialog [data-seg="plan"] [data-v="full"]');
    await crm.click('.dialog [type="submit"]');
    await crm.waitForSelector('.dialog', { state: 'detached' });
    await page.bringToFront();
    await page.waitForTimeout(1500);
    const c = await page.evaluate((id) => {
      const u = window.__app.building.units.get(id);
      return u.overlay.visible && `#${u.overlay.material.color.getHexString()}`;
    }, freeId);
    ok(c === '#e5392f', `a flat sold in the CRM turns red on the open 3D site (${freeId})`);
    await page.screenshot({ path: `${OUT}/${tag}_after_sale.png` });
  }
  await page.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 4).join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

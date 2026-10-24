// Checks the sales CRM (crm/) in headless Chrome, in its demo mode: every page in Russian and
// Tajik (no "undefined" / "NaN", no page errors), selling, paying, reserving, cancelling and the
// statuses it hands to the 3D site; saves screenshots.
//   npm run dev:crm  (or the built site: npx vite preview, URL .../crm/)
//   node tools/crm_check.mjs [OUT=build/crm] [URL=http://localhost:5194/]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'build/crm';
const URL = process.argv[3] ?? 'http://localhost:5194/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
let failures = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const settle = () => page.waitForTimeout(250);
const text = () => page.evaluate(() => document.body.innerText);
const bad = (t) => /undefined|NaN|\[object|Infinity/.test(t);
const status = (id) => page.evaluate((k) => JSON.parse(localStorage.getItem('khocha-crm:demo:status') || '[]').find((s) => s.id === k)?.status, id);

await page.goto(URL);
await page.evaluate(() => {
  localStorage.removeItem('khocha-crm:demo');
  localStorage.removeItem('khocha-crm:demo:user');
  localStorage.setItem('khocha.lang', 'ru');
});
await page.goto(URL);
await shot('00-login');
await page.click('button[type="submit"]');
await page.waitForSelector('.board');
await settle();

const VIEWS = ['board', 'dashboard', 'deals', 'payments', 'clients', 'prices', 'calculator', 'settings'];
for (const lang of ['ru', 'tj']) {
  if (lang === 'tj') await page.click('.side [data-lang="tj"]');
  for (const [i, v] of VIEWS.entries()) {
    await page.goto(`${URL}#/${v}`);
    await settle();
    const t = await text();
    ok(!bad(t), `${lang} ${v}: no undefined/NaN`);
    await shot(`${lang}-${i + 1}-${v}`);
  }
}
await page.click('.side [data-lang="ru"]');

// a sold flat's card and its deal
await page.goto(`${URL}#/board`);
await settle();
await page.click('.cell.st-sold >> nth=0');
await page.waitForSelector('#drawer:not([hidden]) canvas.plan');
await settle();
ok(!bad(await page.innerText('#drawer')), 'flat card: no undefined/NaN');
ok(await page.evaluate(() => {
  const c = document.querySelector('#drawer canvas.plan');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 200) ink++;
  return ink > 500;
}), 'flat card: the plan is drawn');
await shot('10-flat-sold');
await page.click('#drawer [data-act="deal"].btn');
await page.waitForSelector('#drawer .money-row');
await settle();
ok(!bad(await page.innerText('#drawer')), 'deal drawer: no undefined/NaN');
await shot('11-deal');
await page.keyboard.press('Escape');

// sell a free flat on instalments to a new client
const free = await page.getAttribute('.cell.st-free >> nth=0', 'data-flat');
const freeNo = await page.innerText(`.cell[data-flat="${free}"] .no`);
await page.click(`.cell[data-flat="${free}"]`);
await page.click('#drawer [data-act="sell"]');
await page.waitForSelector('.dialog');
await page.selectOption('.dialog [name="client_id"]', 'new');
await page.fill('.dialog [name="c_name"]', 'Тестов Тест Тестович');
await page.fill('.dialog [name="c_phone"]', '+992 00 000 00 99');
await page.fill('.dialog [name="contract_no"]', 'T-1');
await page.fill('.dialog [name="discount"]', '5');
await page.fill('.dialog [name="down_pct"]', '30');
await page.fill('.dialog [name="term"]', '24');
await page.fill('.dialog [name="rate"]', '18');
await settle();
const preview = await page.innerText('.dialog .preview');
ok(/24/.test(preview) && !bad(preview), 'sale form: the schedule preview has 24 months');
await shot('20-sale-form');
await page.click('.dialog [type="submit"]');
await page.waitForSelector('.dialog', { state: 'detached' });
await page.waitForSelector('#drawer .money-row');
await settle();
const dealText = await page.innerText('#drawer');
ok(dealText.includes('Тестов Тест Тестович') && !bad(dealText), 'sale saved; its drawer shows the buyer');
ok((await status(free)) === 'sold', `the 3D site is told flat ${free} is sold`);
const paidBefore = await page.innerText('#drawer .money-row div:nth-child(2) b');
await shot('21-deal-new');

// a payment
await page.click('#drawer [data-act="pay"]');
await page.waitForSelector('.dialog [name="amount"]');
ok(+(await page.inputValue('.dialog [name="amount"]')).replace(/\s/g, '').replace(',', '.') > 0, 'payment form suggests the next payment');
await page.click('.dialog [type="submit"]');
await page.waitForSelector('.dialog', { state: 'detached' });
await settle();
ok((await page.innerText('#drawer .money-row div:nth-child(2) b')) !== paidBefore, 'payment raises «Оплачено»');

// cancel it: the flat is free again
await page.click('#drawer [data-act="cancel"]');
await page.waitForSelector('.dialog [name="reason"]');
await page.fill('.dialog [name="reason"]', 'тест');
await page.click('.dialog [type="submit"]');
await page.waitForSelector('.dialog', { state: 'detached' });
await settle();
ok((await status(free)) === 'free', `cancelled: flat ${free} is free again`);

// reserve it
await page.keyboard.press('Escape');
await page.goto(`${URL}#/board`);
await settle();
await page.click(`.cell[data-flat="${free}"]`);
await page.click('#drawer [data-act="reserve"]');
await page.waitForSelector('.dialog');
await page.selectOption('.dialog [name="client_id"]', { index: 2 });
await page.fill('.dialog [name="deposit"]', '5000');
await shot('22-reserve-form');
await page.click('.dialog [type="submit"]');
await page.waitForSelector('.dialog', { state: 'detached' });
await settle();
ok((await status(free)) === 'reserved', `reserved: flat ${free} shows as reserved`);
ok(await page.isVisible(`.cell.st-reserved[data-flat="${free}"]`), `board: № ${freeNo} is yellow`);

// turn the reservation into a sale (full payment): the deposit counts
await page.click('#drawer [data-act="convert"]');
await page.waitForSelector('.dialog [data-seg="plan"]');
await page.click('.dialog [data-seg="plan"] [data-v="full"]');
await settle();
await page.click('.dialog [type="submit"]');
await page.waitForSelector('.dialog', { state: 'detached' });
await settle();
ok((await status(free)) === 'sold', `reservation turned into a sale: flat ${free} sold`);
// the deposit and the rest received at signing pay it off
ok((await page.innerText('#drawer .drawer-head .chip')) === 'Оплачена', 'converted with full payment: the deal is paid off');
await shot('23-converted');

// a price
await page.goto(`${URL}#/prices`);
await settle();
const input = `.prices-table input[data-id="${free}"][data-k="price"]`;
await page.fill(input, '777 000');
await page.press(input, 'Tab');
await settle();
ok((await page.evaluate(() => document.activeElement?.dataset?.k)) === 'price_m2', 'prices: Tab moves on to the next input after saving');
ok((await page.innerText(`.prices-table tr:has([data-id="${free}"][data-k="price"]) td:nth-child(7)`)).includes('777'), 'prices: own price saved');

// the calculator
await page.goto(`${URL}#/calculator`);
await settle();
await page.fill('[name="price"]', '1 000 000');
await page.fill('[name="down_payment"]', '300 000');
await page.fill('[name="term"]', '12');
await page.fill('[name="rate"]', '12');
await settle();
const calc = await page.innerText('.calc-out');
// 700 000 at 12% a year over 12 months: 62 193,26 a month
ok(/62\s194,15/.test(calc), 'calculator: annuity 700 000 / 12% / 12 months = 62 194,15 a month');
await shot('30-calculator');

// phone width
await page.setViewportSize({ width: 390, height: 844 });
for (const v of ['board', 'dashboard', 'deals']) {
  await page.goto(`${URL}#/${v}`);
  await settle();
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `phone ${v}: no sideways page scroll`);
  await shot(`40-phone-${v}`);
}
await page.goto(`${URL}#/board`);
await settle();
await page.click('.cell.st-sold >> nth=0');
await settle();
await shot('41-phone-flat');

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

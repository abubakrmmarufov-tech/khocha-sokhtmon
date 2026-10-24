// The summary: how much of the house is sold, the money in contracts, received and still to come,
// what is late; sales and receipts by month; the payments of the next 30 days, the late payers and
// the reservations.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { apartments } from '../../../src/data.js';
import { addDays, addMonths, compact, esc, fdate, money, moneyShort, monthKey, monthLabel, num, sum, today } from '../fmt.js';
import { stateChip } from '../ui.js';
import { clientShort, dealInfo, openDeal } from './deal.js';
import { flatState } from './board.js';

export const dashboard = {
  title: () => T().nav.dashboard,
  render(el) {
    const L = T();
    const day = today();
    const flats = apartments.map(flatState);
    const count = (s) => flats.filter((x) => x.status === s).length;
    const all = db.deals().map(dealInfo);
    const sales = all.filter((x) => x.d.status === 'active' && x.d.kind === 'sale');
    const reserves = all.filter((x) => x.d.status === 'active' && x.d.kind === 'reserve').sort((a, b) => (a.d.reserve_until ?? '9').localeCompare(b.d.reserve_until ?? '9'));
    const late = sales.filter((x) => x.s.overdue > 0).sort((a, b) => b.s.overdue - a.s.overdue);
    const soldArea = sum(sales, (x) => x.apt.area);
    const contracts = sum(sales, (x) => x.s.total);
    const received = sum([...db.data.payments.values()], (p) => p.amount);
    const thisMonth = sum([...db.data.payments.values()].filter((p) => monthKey(p.date) === monthKey(day)), (p) => p.amount);
    const debt = sum(sales, (x) => Math.max(0, x.s.balance));
    const overdue = sum(late, (x) => x.s.overdue);
    const avg = soldArea > 0 ? sum(sales, (x) => x.d.price) / soldArea : 0;
    const soon = [];
    for (const x of sales) for (const r of x.s.rows) if (r.rest > 0 && r.due >= day && r.due <= addDays(day, 30)) soon.push({ x, r });
    soon.sort((a, b) => a.r.due.localeCompare(b.r.due));

    // the last 12 months
    const months = Array.from({ length: 12 }, (_, i) => monthKey(addMonths(`${day.slice(0, 7)}-01`, i - 11)));
    const byMonth = (list, date, value) => months.map((m) => ({ key: m, value: sum(list.filter((x) => monthKey(date(x)) === m), value) }));
    const salesSeries = byMonth(sales, (x) => x.d.date, (x) => x.d.price);
    const receiptSeries = byMonth([...db.data.payments.values()], (p) => p.date, (p) => p.amount);

    const tile = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
    el.innerHTML = `
      <div class="page-head"><div><h1>${L.nav.dashboard}</h1><div class="sub">${L.dashSub(fdate(day))}</div></div></div>
      <div class="kpis">
        ${tile(L.kpiSold, `${count('sold')} <small>/ ${apartments.length}</small>`,
          `${L.statusMany.reserved} ${count('reserved')} · ${L.statusMany.free} ${count('free')}${count('closed') ? ` · ${L.statusMany.closed} ${count('closed')}` : ''}`)}
        ${tile(L.kpiSales, moneyShort(contracts), L.inDeals(sales.length))}
        ${tile(L.kpiReceived, moneyShort(received), `${L.periods.month}: ${moneyShort(thisMonth)}`)}
        ${tile(L.kpiDebt, moneyShort(debt), L.in30(moneyShort(sum(soon, (s) => s.r.rest))))}
        ${tile(L.kpiLate, moneyShort(overdue), L.ofDebt(late.length), overdue > 0 ? 'bad' : '')}
        ${tile(L.kpiAvg, avg ? money(Math.round(avg)) : L.dash, L.soldArea(num(soldArea, 1)))}
      </div>
      <div class="sold-bar" title="${esc(`${L.statusMany.sold} ${count('sold')} · ${L.statusMany.reserved} ${count('reserved')} · ${L.statusMany.free} ${count('free')}`)}">
        ${['sold', 'reserved', 'closed', 'free'].map((s) => `<i class="st-${s}" style="flex:${count(s)}"></i>`).join('')}
      </div>
      <div class="charts">
        <div class="card chart-card"><h3>${L.salesByMonth}</h3>${columns(salesSeries)}</div>
        <div class="card chart-card"><h3>${L.receiptsByMonth}</h3>${columns(receiptSeries)}</div>
      </div>
      <div class="dash-lists">
        <div class="card"><h3>${L.upcoming} <small>${money(sum(soon, (s) => s.r.rest))}</small></h3>
          ${soon.length ? `<div class="mini-list">${soon.slice(0, 12).map(({ x, r }) => `<button class="mini" data-deal="${x.d.id}">
            <span><b>${fdate(r.due)}</b> · ${L.flat(x.apt.number)} · ${esc(clientShort(x.client))}</span><b>${money(r.rest)}</b></button>`).join('')}</div>`
          : `<p class="hint">${L.noUpcoming}</p>`}</div>
        <div class="card"><h3>${L.lateList} <small class="${overdue ? 'bad' : ''}">${money(overdue)}</small></h3>
          ${late.length ? `<div class="mini-list">${late.map((x) => `<button class="mini" data-deal="${x.d.id}">
            <span>${L.flat(x.apt.number)} · ${esc(clientShort(x.client))} · ${L.since(fdate(x.s.lateSince))}</span><b class="bad">${money(x.s.overdue)}</b></button>`).join('')}</div>`
          : `<p class="hint">${L.noLate}</p>`}</div>
        <div class="card"><h3>${L.reservations} <small>${reserves.length}</small></h3>
          ${reserves.length ? `<div class="mini-list">${reserves.map((x) => `<button class="mini" data-deal="${x.d.id}">
            <span>${L.flat(x.apt.number)} · ${esc(clientShort(x.client))}${x.d.reserve_until ? ` · ${L.until(fdate(x.d.reserve_until))}` : ''}</span>${stateChip(x.state)}</button>`).join('')}</div>`
          : `<p class="hint">${L.noReservations}</p>`}</div>
      </div>`;
    el.querySelectorAll('[data-deal]').forEach((b) => (b.onclick = () => openDeal(b.dataset.deal)));
    wireCharts(el);
  },
};

// ---------- a column chart of one series by month (one colour: its title says what it is) ----------
const W = 560, H = 190, LEFT = 50, BOTTOM = 22, TOP = 18;
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), k = v / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
}
function columns(series) {
  const L = T();
  const max = niceMax(Math.max(...series.map((s) => s.value), 0));
  const band = (W - LEFT) / series.length, bw = Math.min(24, band * 0.62);
  const y = (v) => TOP + (H - TOP - BOTTOM) * (1 - Math.max(0, v) / max);
  const top = series.reduce((m, s, i) => (s.value > series[m].value ? i : m), 0);
  const grid = [0, 0.5, 1].map((k) => `<line x1="${LEFT}" x2="${W}" y1="${y(max * k)}" y2="${y(max * k)}" class="grid"/>
    <text x="${LEFT - 8}" y="${y(max * k) + 4}" class="tick" text-anchor="end">${compact(max * k)}</text>`).join('');
  const bars = series.map((s, i) => {
    const x = LEFT + band * i + (band - bw) / 2, y0 = H - BOTTOM, y1 = y(s.value), h = y0 - y1, r = Math.min(4, h);
    const path = h > 0 ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 + r}V${y0}Z` : '';
    return `${path ? `<path d="${path}" class="bar"/>` : ''}
      ${i === top && s.value > 0 ? `<text x="${x + bw / 2}" y="${y1 - 6}" class="val" text-anchor="middle">${compact(s.value)}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" class="tick" text-anchor="middle">${monthLabel(s.key).split(' ')[0]}</text>
      <rect x="${LEFT + band * i}" y="0" width="${band}" height="${H - BOTTOM}" class="hit" data-i="${i}" tabindex="0"
        data-label="${esc(monthLabel(s.key))}" data-value="${esc(money(s.value))}"/>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => `${monthLabel(s.key)}: ${money(s.value)}`).join('; '))}">
      ${grid}<line x1="${LEFT}" x2="${W}" y1="${H - BOTTOM}" y2="${H - BOTTOM}" class="axis"/>${bars}</svg>
      <div class="tip" hidden><b></b><span></span></div></div>
    <details class="chart-table"><summary>${L.tableView}</summary><table class="list">
      ${series.map((s) => `<tr><td>${monthLabel(s.key)}</td><td class="r">${money(s.value)}</td></tr>`).join('')}</table></details>`;
}
function wireCharts(el) {
  el.querySelectorAll('.chart').forEach((c) => {
    const tip = c.querySelector('.tip');
    const show = (hit) => {
      c.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on'));
      if (!hit) return (tip.hidden = true);
      hit.classList.add('on');
      tip.querySelector('b').textContent = hit.dataset.value;
      tip.querySelector('span').textContent = hit.dataset.label;
      tip.hidden = false;
      const box = c.getBoundingClientRect(), r = hit.getBoundingClientRect();
      const x = r.left - box.left + r.width / 2;
      tip.style.left = `${Math.min(Math.max(x, 60), box.width - 60)}px`;
    };
    c.addEventListener('pointermove', (e) => show(e.target.closest('.hit')));
    c.addEventListener('pointerleave', () => show(null));
    c.addEventListener('focusin', (e) => show(e.target.closest('.hit')));
    c.addEventListener('focusout', () => show(null));
  });
}

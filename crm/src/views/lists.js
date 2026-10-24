// The deals (sales and reservations, with what is paid and owed) and the journal of payments.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { addMonths, esc, fdate, money, sum, today } from '../fmt.js';
import { csv, seg, stateChip } from '../ui.js';
import { dealInfo, openDeal } from './deal.js';
import { match } from './clients.js';
import { termsLine } from './terms.js';

// keep the caret in the search box while the list redraws under it
function searchBox(el, get, set, redraw) {
  const s = el.querySelector('.search');
  s.oninput = () => {
    set(s.value);
    const pos = s.selectionStart;
    redraw();
    const n = el.querySelector('.search');
    n.focus();
    n.setSelectionRange(pos, pos);
  };
}
const onSeg = (el, name, fn) => {
  el.querySelector(`[data-seg="${name}"]`).onclick = (e) => {
    const b = e.target.closest('button');
    if (b) fn(b.dataset.v);
  };
};

// ---------- deals ----------
const dl = { filter: 'active', q: '' };
const PICK = {
  active: (x) => x.d.status === 'active' && x.d.kind === 'sale',
  late: (x) => x.state === 'late',
  paid: (x) => x.state === 'paid',
  reserve: (x) => x.d.status === 'active' && x.d.kind === 'reserve',
  cancelled: (x) => x.d.status === 'cancelled',
  all: () => true,
};
export const deals = {
  title: () => T().nav.deals,
  render(el) {
    const L = T();
    const all = db.deals().map(dealInfo);
    const q = dl.q.trim().toLowerCase();
    const rows = all.filter(PICK[dl.filter]).filter((x) => match(q, x.client?.name, x.client?.phone, x.d.contract_no, x.apt.number))
      .sort((a, b) => b.d.date.localeCompare(a.d.date));
    const n = (k) => all.filter(PICK[k]).length;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${L.nav.deals}</h1><div class="sub">${L.dealsSub(rows.length)} · ${L.dealPrice.toLowerCase()} ${money(sum(rows, (x) => (x.d.kind === 'sale' ? x.s.total : 0)))}</div></div>
        <div class="head-actions"><button class="btn" data-act="csv">${L.csv}</button></div>
      </div>
      <div class="toolbar">
        ${seg('filter', Object.keys(PICK).map((k) => [k, `${L.dealFilter[k]} ${n(k)}`]), dl.filter)}
        <input class="search" type="search" placeholder="${esc(L.searchPh)}" value="${esc(dl.q)}">
      </div>
      <div class="table-wrap"><table class="list rows">
        <thead><tr><th>${L.date}</th><th>${L.contractNo}</th><th>${L.flat('').replace('№ ', '№')}</th><th>${L.client}</th><th>${L.pay}</th>
          <th class="r">${L.dealPrice}</th><th class="r">${L.paid}</th><th class="r">${L.balance}</th><th>${L.next}</th><th></th></tr></thead>
        <tbody>${rows.map((x) => `<tr data-id="${x.d.id}">
          <td>${fdate(x.d.date)}</td><td>${esc(x.d.contract_no || '')}</td><td><b>${x.apt.number}</b></td><td>${esc(x.client?.name ?? '')}</td>
          <td class="muted small">${x.d.kind === 'reserve' ? `${L.kind.reserve}${x.d.reserve_until ? ` ${L.until(fdate(x.d.reserve_until))}` : ''}` : esc(L.plans[x.d.plan])}</td>
          <td class="r">${money(x.d.kind === 'sale' ? x.s.total : x.d.price)}</td><td class="r">${money(x.s.paid)}</td>
          <td class="r ${x.s.overdue > 0 ? 'bad' : ''}">${x.d.kind === 'sale' ? money(Math.max(0, x.s.balance)) : ''}</td>
          <td class="small ${x.s.next?.state === 'late' ? 'bad' : ''}">${x.d.kind === 'sale' && x.d.status === 'active' && x.s.next ? `${fdate(x.s.next.due)} · ${money(x.s.next.rest)}` : ''}</td>
          <td>${stateChip(x.state)}</td></tr>`).join('')}</tbody>
      </table>${rows.length ? '' : `<p class="empty">${L.nothing}</p>`}</div>`;
    onSeg(el, 'filter', (v) => {
      dl.filter = v;
      deals.render(el);
    });
    searchBox(el, () => dl.q, (v) => (dl.q = v), () => deals.render(el));
    el.querySelector('tbody').onclick = (e) => {
      const tr = e.target.closest('[data-id]');
      if (tr) openDeal(tr.dataset.id);
    };
    el.querySelector('[data-act="csv"]').onclick = () => exportDeals(rows);
  },
};
export function exportDeals(rows = db.deals().map(dealInfo)) {
  const L = T();
  csv('deals.csv',
    [L.date, L.contractNo, L.flatLong(''), L.floor, L.rooms, L.area, L.client, L.phone, L.deal, L.dealState.active, L.pay, L.listPrice, L.dealPrice,
      L.toPay, L.paid, L.balance, L.overdue, L.next, L.reserveUntil],
    rows.map((x) => [fdate(x.d.date), x.d.contract_no, x.apt.number, x.apt.floor, x.apt.rooms, x.apt.area, x.client?.name, x.client?.phone,
      L.kind[x.d.kind], L.dealState[x.state], x.d.kind === 'sale' ? termsLine(x.d) : '', x.d.list_price ?? '', x.d.price,
      x.s.total, x.s.paid, x.d.kind === 'sale' ? Math.max(0, x.s.balance) : '', x.s.overdue, x.s.next ? fdate(x.s.next.due) : '', fdate(x.d.reserve_until)]));
}

// ---------- payments ----------
const pl = { period: 'month', q: '' };
function range(p) {
  const day = today(), m0 = `${day.slice(0, 7)}-01`;
  if (p === 'month') return [m0, day];
  if (p === 'prev') return [addMonths(m0, -1), `${addMonths(m0, -1).slice(0, 7)}-31`];
  if (p === 'year') return [`${day.slice(0, 4)}-01-01`, `${day.slice(0, 4)}-12-31`];
  return ['0000-01-01', '9999-12-31'];
}
function paymentRows() {
  return [...db.data.payments.values()].map((p) => {
    const d = db.data.deals.get(p.deal_id);
    return { p, d, apt: d && db.aptById.get(d.flat_id), client: d && db.clientOf(d) };
  }).filter((x) => x.d);
}
export const payments = {
  title: () => T().nav.payments,
  render(el) {
    const L = T();
    const [a, b] = range(pl.period);
    const q = pl.q.trim().toLowerCase();
    const rows = paymentRows().filter((x) => x.p.date >= a && x.p.date <= b)
      .filter((x) => match(q, x.client?.name, x.client?.phone, x.apt?.number, x.p.receipt, x.d.contract_no))
      .sort((x, y) => y.p.date.localeCompare(x.p.date) || (y.p.created_at ?? '').localeCompare(x.p.created_at ?? ''));
    const total = sum(rows, (x) => x.p.amount);
    const byMethod = Object.keys(L.payMethods).map((m) => [m, sum(rows.filter((x) => x.p.method === m && x.p.amount > 0), (x) => x.p.amount)]).filter(([, s]) => s);
    const refunds = sum(rows.filter((x) => x.p.amount < 0), (x) => x.p.amount);
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${L.nav.payments}</h1><div class="sub">${L.paymentsSub(rows.length, money(total))}</div></div>
        <div class="head-actions"><button class="btn" data-act="csv">${L.csv}</button></div>
      </div>
      <div class="toolbar">
        ${seg('period', Object.entries(L.periods), pl.period)}
        <input class="search" type="search" placeholder="${esc(L.searchPh)}" value="${esc(pl.q)}">
      </div>
      <div class="tiles small-tiles">${byMethod.map(([m, s]) => `<div class="tile"><span>${L.payMethods[m]}</span><b>${money(s)}</b></div>`).join('')}
        ${refunds ? `<div class="tile"><span>${L.refund}</span><b class="bad">${money(refunds)}</b></div>` : ''}
        <div class="tile strong"><span>${L.total}</span><b>${money(total)}</b></div></div>
      <div class="table-wrap"><table class="list rows">
        <thead><tr><th>${L.date}</th><th class="r">${L.amount}</th><th>${L.payMethod}</th><th>№</th><th>${L.client}</th><th>${L.receipt}</th><th>${L.note}</th><th>${L.by}</th></tr></thead>
        <tbody>${rows.map((x) => `<tr data-id="${x.d.id}" class="${x.p.amount < 0 ? 'refund' : ''}">
          <td>${fdate(x.p.date)}</td><td class="r"><b>${money(x.p.amount)}</b></td><td>${x.p.amount < 0 ? L.refund : L.payMethods[x.p.method] ?? esc(x.p.method)}</td>
          <td><b>${x.apt?.number ?? ''}</b></td><td>${esc(x.client?.name ?? '')}</td><td>${esc(x.p.receipt ?? '')}</td><td class="muted">${esc(x.p.note ?? '')}</td>
          <td class="muted">${esc(staffName(x.p.created_by))}</td></tr>`).join('')}</tbody>
      </table>${rows.length ? '' : `<p class="empty">${L.nothing}</p>`}</div>`;
    onSeg(el, 'period', (v) => {
      pl.period = v;
      payments.render(el);
    });
    searchBox(el, () => pl.q, (v) => (pl.q = v), () => payments.render(el));
    el.querySelector('tbody').onclick = (e) => {
      const tr = e.target.closest('[data-id]');
      if (tr) openDeal(tr.dataset.id);
    };
    el.querySelector('[data-act="csv"]').onclick = () => exportPayments(rows);
  },
};
const staffName = (email) => (email ? (db.data.staff.get(email)?.name ?? email.split('@')[0]) : '');
export function exportPayments(rows = paymentRows()) {
  const L = T();
  csv('payments.csv', [L.date, L.amount, L.payMethod, L.flatLong(''), L.client, L.contractNo, L.receipt, L.note, L.by],
    rows.map((x) => [fdate(x.p.date), x.p.amount, x.p.amount < 0 ? L.refund : L.payMethods[x.p.method] ?? x.p.method, x.apt?.number, x.client?.name,
      x.d.contract_no, x.p.receipt, x.p.note, staffName(x.p.created_by)]));
}
// every payment still to come, by date (for the cash plan)
export function exportSchedule() {
  const L = T();
  const out = [];
  for (const d of db.deals()) {
    if (d.status !== 'active' || d.kind !== 'sale') continue;
    const x = dealInfo(d);
    for (const r of x.s.rows) if (r.rest > 0) out.push([r.due, x.apt.number, x.client?.name, x.client?.phone, d.contract_no, r.amount, r.paid, r.rest, L.rowState[r.state]]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]));
  csv('schedule.csv', [L.col.due, L.flatLong(''), L.client, L.phone, L.contractNo, L.col.amount, L.col.paid, L.balance, L.col.state],
    out.map((r) => [fdate(r[0]), ...r.slice(1)]));
}

// The «шахматка»: every flat of the house, floor by floor, coloured by its status (free, reserved,
// sold, not on sale), with its price or its buyer; a flat opens in the drawer: its plan, price, the
// deal on it, and the buttons that sell or reserve it.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { apartments } from '../../../src/data.js';
import { drawPlan } from '../../../src/plan.js';
import { flatStatus, listPrice } from '../calc.js';
import { esc, money, num, parseNum, r2 } from '../fmt.js';
import { attempt, confirmBox, dialog, fieldError, openDrawer, seg, stateChip, statusChip } from '../ui.js';
import { clientShort, dealForm, dealInfo, openDeal, paymentForm } from './deal.js';

const filter = { status: '', rooms: 0, prices: true };
const FLOORS = [...new Set(apartments.map((a) => a.floor))].sort((a, b) => b - a);
const UNITS = Math.max(...apartments.map((a) => a.unit)) + 1;
const at = new Map(apartments.map((a) => [`${a.floor}/${a.unit}`, a]));

export function flatState(a) {
  const deal = db.activeDeal(a.id);
  const status = flatStatus(db.flatRow(a.id), deal);
  const info = deal ? dealInfo(deal) : null;
  return { a, deal, info, status, expired: info?.state === 'expired', price: listPrice(db.flatRow(a.id), a) };
}

export const board = {
  title: () => T().nav.board,
  render(el) {
    const L = T();
    const states = apartments.map(flatState);
    const count = (s) => states.filter((x) => x.status === s).length;
    const shown = (x) => (!filter.status || x.status === filter.status) && (!filter.rooms || x.a.rooms === filter.rooms);
    const rooms = [...new Set(apartments.map((a) => a.rooms))].sort();
    const cell = (a) => {
      if (!a) return '<div class="cell none"></div>';
      const x = states.find((s) => s.a === a);
      const late = x.info?.state === 'late';
      const line = x.deal ? esc(clientShort(x.info.client)) : filter.prices && x.price ? num(Math.round(x.price), 0) : '';
      return `<button class="cell st-${x.status} ${shown(x) ? '' : 'dim'} ${x.expired ? 'expired' : ''}" data-flat="${a.id}"
        title="${esc(`${L.flat(a.number)} · ${L.status[x.status]} · ${L.roomsN(a.rooms)} · ${num(a.area)} ${L.m2}${x.price ? ` · ${money(x.price)}` : ''}`)}">
        <span class="no">${a.number}${late ? '<i class="late" aria-hidden="true">!</i>' : ''}</span><span class="rm">${L.roomsN(a.rooms)}</span>
        <span class="ar">${num(a.area)} ${L.m2}</span><span class="ln">${line}</span></button>`;
    };
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${L.nav.board}</h1><div class="sub">${L.boardSub(apartments.length, FLOORS.at(-1), FLOORS[0])}</div></div>
        <div class="head-actions"><a class="btn" href="../" target="_blank" rel="noopener">${L.onSite} ↗</a></div>
      </div>
      <div class="toolbar">
        <div class="legend">${['free', 'reserved', 'sold', 'closed'].map((s) => `<button class="leg st-${s} ${filter.status === s ? 'on' : ''}" data-status="${s}">
          <i></i>${L.statusMany[s]} <b>${count(s)}</b></button>`).join('')}</div>
        ${seg('rooms', [[0, L.all], ...rooms.map((r) => [r, L.roomsN(r)])], filter.rooms)}
        <label class="check"><input type="checkbox" data-prices ${filter.prices ? 'checked' : ''}> ${L.showPrices}</label>
      </div>
      <div class="board-wrap"><div class="board" style="--units:${UNITS}">
        ${FLOORS.map((f) => {
          const row = states.filter((x) => x.a.floor === f);
          return `<div class="fl"><b>${f}</b><span>${L.floor.toLowerCase()}</span></div>
            ${Array.from({ length: UNITS }, (_, u) => cell(at.get(`${f}/${u}`))).join('')}
            <div class="fl-sum"><b>${row.filter((x) => x.status === 'free').length}</b><span>${L.statusMany.free.toLowerCase()}</span></div>`;
        }).join('')}
      </div></div>`;
    el.querySelector('.legend').onclick = (e) => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      filter.status = filter.status === b.dataset.status ? '' : b.dataset.status;
      board.render(el);
    };
    el.querySelector('[data-seg="rooms"]').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      filter.rooms = +b.dataset.v;
      board.render(el);
    };
    el.querySelector('[data-prices]').onchange = (e) => {
      filter.prices = e.target.checked;
      board.render(el);
    };
    el.querySelector('.board').onclick = (e) => {
      const b = e.target.closest('[data-flat]');
      if (b) openFlat(b.dataset.flat);
    };
  },
};

// ---------- a flat in the drawer ----------
export function openFlat(id) {
  openDrawer({
    render(el) {
      const L = T();
      const a = db.aptById.get(id);
      const row = db.flatRow(id);
      const { deal, info, status, expired, price } = flatState(a);
      const past = db.deals().filter((d) => d.flat_id === id && d.status === 'cancelled').sort((p, q) => q.date.localeCompare(p.date));
      const loggia = a.loggia ? `${num(a.loggia)} ${L.m2}` : L.dash;
      el.innerHTML = `
        <div class="drawer-head">
          <div><div class="eyebrow">${L.floorN(a.floor)} · ${L.roomsLong(a.rooms)}</div><h2>${L.flatLong(a.number)}</h2></div>
          ${statusChip(status, expired)}
        </div>
        <canvas class="plan"></canvas>
        <div class="specs">
          <div><span>${L.area}</span><b>${num(a.area)} ${L.m2}</b></div>
          <div><span>${L.rooms}</span><b>${a.rooms}</b></div>
          <div><span>${L.loggia}</span><b>${loggia}</b></div>
          <div><span>${L.ceiling}</span><b>${num(a.ceiling)} ${L.m}</b></div>
          <div class="wide"><span>${L.windows}</span><b>${a.sides.map((s) => L.sides[s]).join(', ') || L.dash}</b></div>
        </div>
        <div class="price-box">
          <div><span>${L.listPrice}</span><b>${price ? money(price) : L.noPrice}</b>
            <small>${row?.price > 0 ? L.ownPrice : row?.price_m2 > 0 ? `${money(row.price_m2)} / ${L.m2}` : ''}</small></div>
          ${db.isAdmin() ? `<button class="btn small" data-act="price">${L.edit}</button>` : ''}
        </div>
        ${deal ? `<div class="card deal-card" data-act="deal" role="button">
            <div class="row-between"><b>${L.kind[deal.kind]} · ${esc(info.client?.name ?? '')}</b>${stateChip(info.state)}</div>
            ${deal.kind === 'sale' ? `<div class="progress"><i style="width:${(info.s.progress * 100).toFixed(1)}%"></i></div>
              <div class="row-between small"><span>${L.paid} ${money(info.s.paid)}</span><span>${L.balance} ${money(Math.max(0, info.s.balance))}</span></div>`
            : `<div class="small">${deal.reserve_until ? L.until(deal.reserve_until.split('-').reverse().join('.')) : ''} · ${L.depositPaid}: ${money(info.s.paid)}</div>`}
          </div>
          <div class="actions">
            <button class="btn primary" data-act="deal">${L.openDeal}</button>
            ${deal.kind === 'reserve' ? `<button class="btn" data-act="convert">${L.convert}</button>` : ''}
            <button class="btn" data-act="pay">${L.addPayment}</button>
          </div>`
        : status === 'closed'
          ? `<div class="actions">${db.isAdmin() ? `<button class="btn" data-act="on">${L.putOn}</button>` : ''}</div>`
          : `<div class="actions">
              <button class="btn primary" data-act="sell">${L.sell}</button>
              <button class="btn" data-act="reserve">${L.reserve}</button>
              ${db.isAdmin() ? `<button class="btn ghost" data-act="off">${L.takeOff}</button>` : ''}
            </div>`}
        ${past.length ? `<h3>${L.pastDeals}</h3><div class="mini-list">${past.map((d) => {
          const i = dealInfo(d);
          return `<button class="mini" data-act="old" data-id="${d.id}"><span>${L.kind[d.kind]} · ${esc(i.client?.name ?? '')}</span>${stateChip(i.state)}</button>`;
        }).join('')}</div>` : ''}`;
      const cv = el.querySelector('canvas.plan');
      drawPlan(cv, a, { pad: 12 });
    },
    async act(name, b) {
      const L = T();
      const a = db.aptById.get(id);
      const deal = db.activeDeal(id);
      if (name === 'sell') dealForm({ flatId: id, kind: 'sale' });
      else if (name === 'reserve') dealForm({ flatId: id, kind: 'reserve' });
      else if (name === 'deal' && deal) openDeal(deal.id);
      else if (name === 'convert' && deal) dealForm({ dealId: deal.id, kind: 'sale' });
      else if (name === 'pay' && deal) paymentForm(deal.id);
      else if (name === 'old') openDeal(b.dataset.id);
      else if (name === 'price') priceForm(a);
      else if (name === 'off') {
        if (await confirmBox(L.takeOffQ, { ok: L.takeOff, title: L.takeOff })) attempt(() => db.save('flats', { ...db.flatBase(a), ...db.flatRow(id), on_sale: false }), L.saved);
      } else if (name === 'on') attempt(() => db.save('flats', { ...db.flatBase(a), ...db.flatRow(id), on_sale: true }), L.saved);
    },
  });
}

// the flat's price: per m², or a price of its own
export function priceForm(a) {
  const L = T();
  const row = db.flatRow(a.id);
  return dialog({
    title: `${L.price} · ${L.flat(a.number)}`,
    body: `<p class="hint">${num(a.area)} ${L.m2} · ${L.pricesSub}</p>
      <div class="grid2">
        <label>${L.priceM2}<input name="price_m2" inputmode="decimal" value="${row?.price_m2 ? num(row.price_m2) : ''}"></label>
        <label>${L.ownPrice}<input name="price" inputmode="decimal" value="${row?.price ? num(row.price) : ''}"></label>
      </div>
      <p class="total-line">${L.listPrice}: <b class="calc"></b></p>`,
    mount(form) {
      const upd = () => {
        const own = parseNum(form.elements.price.value), m2 = parseNum(form.elements.price_m2.value);
        form.querySelector('.calc').textContent = own > 0 ? money(own) : m2 > 0 ? money(m2 * a.area) : L.noPrice;
      };
      form.addEventListener('input', upd);
      upd();
    },
    async submit(form) {
      const m2 = r2(parseNum(form.elements.price_m2.value)), own = r2(parseNum(form.elements.price.value));
      if (m2 < 0) throw fieldError('price_m2', L.positive);
      if (own < 0) throw fieldError('price', L.positive);
      await db.save('flats', { ...db.flatBase(a), ...row, price_m2: m2 || null, price: own || null });
    },
  });
}

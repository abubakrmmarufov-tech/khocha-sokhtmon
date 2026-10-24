// The price list: the price per m² (or a price of its own) of every flat, set one by one or for
// several floors and room counts at once; only the administrator changes it.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { apartments } from '../../../src/data.js';
import { money, num, parseNum, r2 } from '../fmt.js';
import { attempt, statusChip } from '../ui.js';
import { flatState, openFlat } from './board.js';

const FLOORS = [...new Set(apartments.map((a) => a.floor))].sort((a, b) => a - b);
const ROOMS = [...new Set(apartments.map((a) => a.rooms))].sort();
const pick = { floors: new Set(FLOORS), rooms: new Set(ROOMS), free: true };

export const prices = {
  title: () => T().nav.prices,
  render(el) {
    const L = T();
    const admin = db.isAdmin();
    const states = apartments.map(flatState);
    const withPrice = states.filter((x) => x.price > 0).length;
    const chosen = (x) => pick.floors.has(x.a.floor) && pick.rooms.has(x.a.rooms) && (!pick.free || x.status === 'free');
    const n = states.filter(chosen).length;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${L.nav.prices}</h1><div class="sub">${L.pricesSet(withPrice, apartments.length)} · ${L.pricesSub}</div></div>
      </div>
      ${admin ? `<div class="card bulk">
        <h3>${L.bulkTitle}</h3>
        <div class="bulk-row"><span class="label">${L.floors}</span>
          <div class="checks">${FLOORS.map((f) => `<label class="pill ${pick.floors.has(f) ? 'on' : ''}"><input type="checkbox" data-floor="${f}" ${pick.floors.has(f) ? 'checked' : ''}>${f}</label>`).join('')}</div></div>
        <div class="bulk-row"><span class="label">${L.roomsSel}</span>
          <div class="checks">${ROOMS.map((r) => `<label class="pill ${pick.rooms.has(r) ? 'on' : ''}"><input type="checkbox" data-rooms="${r}" ${pick.rooms.has(r) ? 'checked' : ''}>${L.roomsN(r)}</label>`).join('')}
          <label class="check"><input type="checkbox" data-free ${pick.free ? 'checked' : ''}> ${L.onlyFree}</label></div></div>
        <div class="bulk-row">
          <label class="inline">${L.setM2}<input name="m2" inputmode="decimal" placeholder="7 500"></label><button class="btn primary" data-act="set">${L.apply} (${n})</button>
          <label class="inline">${L.raise}<input name="pct" inputmode="decimal" placeholder="+5"></label><button class="btn" data-act="raise">${L.raiseBtn} (${n})</button>
        </div>
      </div>` : `<p class="hint">${L.adminOnly}</p>`}
      <div class="table-wrap"><table class="list prices-table">
        <thead><tr><th>№</th><th>${L.floor}</th><th>${L.rooms}</th><th class="r">${L.area}</th><th class="r">${L.priceM2}</th><th class="r">${L.ownPrice}</th><th class="r">${L.listPrice}</th><th></th></tr></thead>
        <tbody>${states.map((x) => {
          const row = db.flatRow(x.a.id);
          const inp = (k) => (admin ? `<input class="num" data-id="${x.a.id}" data-k="${k}" inputmode="decimal" value="${row?.[k] ? num(row[k]) : ''}">` : row?.[k] ? num(row[k]) : '');
          return `<tr class="${chosen(x) && admin ? 'chosen' : ''}"><td><button class="link" data-open="${x.a.id}" tabindex="-1"><b>${x.a.number}</b></button></td><td>${x.a.floor}</td><td>${x.a.rooms}</td>
            <td class="r">${num(x.a.area)}</td><td class="r">${inp('price_m2')}</td><td class="r">${inp('price')}</td>
            <td class="r"><b>${x.price ? money(x.price) : `<span class="muted">${L.noPrice}</span>`}</b></td><td>${statusChip(x.status, x.expired)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;

    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.floor) t.checked ? pick.floors.add(+t.dataset.floor) : pick.floors.delete(+t.dataset.floor);
      else if (t.dataset.rooms) t.checked ? pick.rooms.add(+t.dataset.rooms) : pick.rooms.delete(+t.dataset.rooms);
      else if (t.dataset.free !== undefined) pick.free = t.checked;
      else if (t.dataset.k) {
        const a = db.aptById.get(t.dataset.id);
        const v = r2(parseNum(t.value));
        attempt(() => db.save('flats', { ...db.flatBase(a), ...db.flatRow(a.id), [t.dataset.k]: v > 0 ? v : null }), L.saved);
        return;
      } else return;
      prices.render(el);
    };
    el.onclick = (e) => {
      const b = e.target.closest('[data-act], [data-open]');
      if (!b) return;
      if (b.dataset.open) return openFlat(b.dataset.open);
      const list = states.filter(chosen);
      if (b.dataset.act === 'set') {
        const m2 = r2(parseNum(el.querySelector('[name="m2"]').value));
        if (!(m2 > 0)) return el.querySelector('[name="m2"]').focus();
        attempt(() => db.saveMany('flats', list.map((x) => ({ ...db.flatBase(x.a), ...db.flatRow(x.a.id), price_m2: m2, price: null }))), L.applied(list.length));
      } else if (b.dataset.act === 'raise') {
        const k = 1 + parseNum(el.querySelector('[name="pct"]').value) / 100;
        if (k === 1) return el.querySelector('[name="pct"]').focus();
        const rows = list.filter((x) => x.price > 0).map((x) => {
          const row = db.flatRow(x.a.id) ?? {};
          return { ...db.flatBase(x.a), ...row, price_m2: row.price_m2 ? r2(row.price_m2 * k) : null, price: row.price ? r2(row.price * k) : null };
        });
        attempt(() => db.saveMany('flats', rows), L.applied(rows.length));
      }
    };
  },
};

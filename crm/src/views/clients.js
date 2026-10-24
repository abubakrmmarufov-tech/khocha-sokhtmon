// The buyers: a searchable list with what each has bought and still owes, a client's card with their
// deals, and the form for their details.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { esc, money, sum } from '../fmt.js';
import { attempt, closeDrawer, confirmBox, csv, dialog, fieldError, openDrawer, stateChip } from '../ui.js';
import { dealInfo, openDeal } from './deal.js';

let query = '';
export const match = (q, ...fields) => !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));

function clientRows() {
  const byClient = new Map();
  for (const d of db.deals()) (byClient.get(d.client_id) ?? byClient.set(d.client_id, []).get(d.client_id)).push(dealInfo(d));
  return [...db.data.clients.values()].map((c) => {
    const list = byClient.get(c.id) ?? [];
    const live = list.filter((x) => x.d.status === 'active');
    return {
      c, list, live,
      flats: live.map((x) => x.apt.number),
      total: sum(live.filter((x) => x.d.kind === 'sale'), (x) => x.s.total),
      paid: sum(live, (x) => x.s.paid),
      balance: sum(live.filter((x) => x.d.kind === 'sale'), (x) => Math.max(0, x.s.balance)),
      overdue: sum(live, (x) => x.s.overdue),
    };
  }).sort((a, b) => a.c.name.localeCompare(b.c.name, 'ru'));
}

export const clients = {
  title: () => T().nav.clients,
  render(el) {
    const L = T();
    const all = clientRows();
    const q = query.trim().toLowerCase();
    const rows = all.filter((r) => match(q, r.c.name, r.c.phone, r.c.phone2, r.c.passport, ...r.flats));
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${L.nav.clients}</h1><div class="sub">${L.clientsSub(all.length)}</div></div>
        <div class="head-actions">
          <button class="btn" data-act="csv">${L.csv}</button>
          <button class="btn primary" data-act="add">${L.addClient}</button>
        </div>
      </div>
      <div class="toolbar"><input class="search" type="search" placeholder="${esc(L.searchPh)}" value="${esc(query)}"></div>
      <div class="table-wrap"><table class="list rows">
        <thead><tr><th>${L.name}</th><th>${L.phone}</th><th>${L.passport}</th><th>${L.deal}</th><th class="r">${L.dealPrice}</th><th class="r">${L.paid}</th><th class="r">${L.balance}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-id="${r.c.id}" class="${r.overdue > 0 ? 'late' : ''}">
          <td><b>${esc(r.c.name)}</b></td><td>${esc(r.c.phone ?? '')}</td><td>${esc(r.c.passport ?? '')}</td>
          <td>${r.live.map((x) => `${L.flat(x.apt.number)} ${stateChip(x.state)}`).join(' ') || `<span class="muted">${L.noDeals}</span>`}</td>
          <td class="r">${r.total ? money(r.total) : ''}</td><td class="r">${r.paid ? money(r.paid) : ''}</td>
          <td class="r ${r.overdue > 0 ? 'bad' : ''}">${r.balance ? money(r.balance) : ''}</td></tr>`).join('')}
        </tbody></table>${rows.length ? '' : `<p class="empty">${L.nothing}</p>`}</div>`;
    const search = el.querySelector('.search');
    search.oninput = () => {
      query = search.value;
      const pos = search.selectionStart;
      clients.render(el);
      const s = el.querySelector('.search');
      s.focus();
      s.setSelectionRange(pos, pos);
    };
    el.querySelector('tbody').onclick = (e) => {
      const tr = e.target.closest('[data-id]');
      if (tr) openClient(tr.dataset.id);
    };
    el.querySelector('[data-act="add"]').onclick = () => clientForm(null);
    el.querySelector('[data-act="csv"]').onclick = () =>
      csv('clients.csv', [L.name, L.phone, L.phone2, L.passport, L.address, L.deal, L.dealPrice, L.paid, L.balance, L.overdue, L.note],
        rows.map((r) => [r.c.name, r.c.phone, r.c.phone2, r.c.passport, r.c.address, r.flats.map((n) => L.flat(n)).join(', '), r.total, r.paid, r.balance, r.overdue, r.c.note]));
  },
};

export function openClient(id) {
  openDrawer({
    render(el) {
      const L = T();
      const c = db.data.clients.get(id);
      if (!c) return closeDrawer();
      const list = db.deals().filter((d) => d.client_id === id).map(dealInfo).sort((a, b) => b.d.date.localeCompare(a.d.date));
      el.innerHTML = `
        <div class="drawer-head"><div><div class="eyebrow">${L.client}</div><h2>${esc(c.name)}</h2></div></div>
        <div class="specs">
          <div><span>${L.phone}</span><b>${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : L.dash}</b></div>
          <div><span>${L.phone2}</span><b>${esc(c.phone2 || L.dash)}</b></div>
          <div><span>${L.passport}</span><b>${esc(c.passport || L.dash)}</b></div>
          <div><span>${L.address}</span><b>${esc(c.address || L.dash)}</b></div>
          ${c.note ? `<div class="wide"><span>${L.note}</span><b>${esc(c.note)}</b></div>` : ''}
        </div>
        <div class="actions">
          <button class="btn" data-act="edit">${L.edit}</button>
          ${db.isAdmin() ? `<button class="btn ghost danger" data-act="delete">${L.del}</button>` : ''}
        </div>
        <h3>${L.clientDeals}</h3>
        ${list.length ? `<div class="mini-list">${list.map((x) => `<button class="mini" data-act="deal" data-id="${x.d.id}">
          <span><b>${L.flat(x.apt.number)}</b> · ${L.kind[x.d.kind]} · ${money(x.d.kind === 'sale' ? x.s.total : x.d.price)}</span>${stateChip(x.state)}</button>`).join('')}</div>`
        : `<p class="hint">${L.noDeals}</p>`}`;
    },
    async act(name, b) {
      const L = T();
      if (name === 'edit') clientForm(id);
      else if (name === 'deal') openDeal(b.dataset.id);
      else if (name === 'delete') {
        if (db.deals().some((d) => d.client_id === id)) return attempt(() => Promise.reject(new Error(L.clientHasDeals)));
        if (await confirmBox(L.deleteClientQ, { ok: L.del, danger: true })) if (await attempt(() => db.remove('clients', id), L.deleted)) closeDrawer();
      }
    },
  });
}

export function clientForm(id) {
  const L = T();
  const c = id ? db.data.clients.get(id) : {};
  const v = (k) => esc(c[k] ?? '');
  return dialog({
    title: id ? c.name : L.addClient,
    body: `<div class="grid2">
        <label>${L.name} *<input name="name" value="${v('name')}"></label>
        <label>${L.phone} *<input name="phone" type="tel" value="${v('phone')}" placeholder="+992"></label>
        <label>${L.phone2}<input name="phone2" type="tel" value="${v('phone2')}"></label>
        <label>${L.passport}<input name="passport" value="${v('passport')}"></label>
      </div>
      <label>${L.address}<input name="address" value="${v('address')}"></label>
      <label>${L.note}<textarea name="note" rows="2">${v('note')}</textarea></label>`,
    async submit(form) {
      const f = form.elements;
      if (!f.name.value.trim()) throw fieldError('name', L.required);
      if (!f.phone.value.trim()) throw fieldError('phone', L.required);
      const saved = await db.save('clients', {
        id: id ?? db.newId(), name: f.name.value.trim(), phone: f.phone.value.trim(), phone2: f.phone2.value.trim(),
        passport: f.passport.value.trim(), address: f.address.value.trim(), note: f.note.value.trim(),
      });
      if (!id) setTimeout(() => openClient(saved.id));
    },
  });
}

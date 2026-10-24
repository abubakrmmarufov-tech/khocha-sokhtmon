// A deal on a flat: the form that makes one (a sale or a reservation, with a new or a known client
// and the payment terms), its drawer (the money, the schedule, the payments), taking a payment,
// cancelling, and the printed payment schedule.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { dealState, listPrice, schedule, summarize } from '../calc.js';
import { addDays, addMonths, amt, esc, fdate, money, num, parseNum, r2, today } from '../fmt.js';
import { $, attempt, closeDrawer, confirmBox, dialog, fieldError, openDrawer, opts, segInput, stateChip, wireSegs } from '../ui.js';
import { previewHtml, readTerms, rowName, termsHtml, termsLine, wireTerms } from './terms.js';
import { openClient } from './clients.js';

// a deal with its money worked out, as of today
export function dealInfo(d) {
  const day = today();
  const s = summarize(d, db.paymentsOf(d.id), day);
  return { d, s, state: dealState(d, s, day), apt: db.aptById.get(d.flat_id), client: db.clientOf(d) };
}
const surname = (c) => (c?.name ?? '').split(/\s+/)[0];
export const clientShort = (c) => {
  const [a, b, c2] = (c?.name ?? '').split(/\s+/);
  return [a, b && `${b[0]}.`, c2 && `${c2[0]}.`].filter(Boolean).join(' ');
};

// ---------- the deal form ----------
// flatId: the flat; kind: 'sale' | 'reserve'; dealId: an existing deal (turning a reservation into a
// sale, changing the terms); terms: from the calculator
export async function dealForm({ flatId, kind = 'sale', dealId = null, terms = null }) {
  const L = T();
  const old = dealId ? db.data.deals.get(dealId) : null;
  const apt = db.aptById.get(flatId ?? old.flat_id);
  const list = old?.list_price || listPrice(db.flatRow(apt.id), apt);
  const day = today();
  const d = {
    kind, contract_no: '', date: day, reserve_until: addDays(day, 7), price: list, plan: 'installment', down_payment: r2(Math.round(list * 0.003) * 100),
    term: 12, rate: 0, method: 'annuity', first_due: addMonths(day, 1), ...(old ?? {}), ...(terms ?? {}),
  };
  if (old) d.kind = kind; // (a reservation being turned into a sale)
  if (old?.kind === 'reserve' && kind === 'sale') {
    Object.assign(d, { date: day, first_due: addMonths(day, 1), plan: 'installment', contract_no: '', term: 12, down_payment: r2(Math.round(d.price * 0.003) * 100) });
  }
  if (!d.first_due) d.first_due = d.plan === 'installment' ? addMonths(d.date, 1) : d.date;
  const paidBefore = old ? r2(db.paymentsOf(old.id).reduce((s, p) => s + p.amount, 0)) : 0;
  const clients = [...db.data.clients.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const discount = list > 0 && d.price < list ? r2(((list - d.price) / list) * 100) : '';
  const changing = old?.kind === 'sale';
  const title = changing ? `${L.editTerms} · ${L.flat(apt.number)}` : L.dealTitle(kind, apt.number);

  const body = `
    <div class="grid2">
      <div class="flat-line"><b>${L.flatLong(apt.number)}</b><span>${L.floorN(apt.floor)} · ${L.roomsLong(apt.rooms)} · ${num(apt.area)} ${L.m2}</span></div>
      ${old ? `<input type="hidden" name="kind" value="${kind}">` : segInput('kind', [['sale', L.kind.sale], ['reserve', L.kind.reserve]], kind)}
    </div>
    <fieldset><legend>${L.buyer}</legend>
      <label>${L.client}<select name="client_id">
        <option value="">${L.pickClient}</option><option value="new" ${clients.length ? '' : 'selected'}>${L.newClient}</option>
        ${opts(clients.map((c) => [c.id, `${c.name}${c.phone ? ` · ${c.phone}` : ''}`]), d.client_id)}
      </select></label>
      <div class="grid2 new-client">
        <label>${L.name} *<input name="c_name" autocomplete="off"></label>
        <label>${L.phone} *<input name="c_phone" type="tel" placeholder="+992"></label>
        <label>${L.passport}<input name="c_passport"></label>
        <label>${L.address}<input name="c_address"></label>
      </div>
    </fieldset>
    <fieldset><legend>${L.deal}</legend>
      <div class="grid3">
        <label class="k-sale">${L.contractNo}<input name="contract_no" value="${esc(d.contract_no ?? '')}"></label>
        <label><span class="date-label"></span><input type="date" name="date" value="${esc(d.date)}" required></label>
        <label class="k-reserve">${L.reserveUntil}<input type="date" name="reserve_until" value="${esc(d.reserve_until ?? '')}"></label>
        <label>${L.listPrice}<input name="list_price" value="${list ? num(list) : L.noPrice}" readonly tabindex="-1"></label>
        <label>${L.discount}, %<input name="discount" inputmode="decimal" value="${esc(discount)}" placeholder="0"></label>
        <label>${L.dealPrice} *<input name="price" inputmode="decimal" value="${d.price ? num(d.price) : ''}"></label>
      </div>
    </fieldset>
    <fieldset class="k-sale"><legend>${L.pay}</legend>${termsHtml(d, d.price)}</fieldset>
    <fieldset class="k-reserve"><legend>${L.deposit}</legend>
      <div class="grid3"><label>${L.deposit}<input name="deposit" inputmode="decimal" placeholder="0"></label></div>
    </fieldset>
    <div class="got-row" ${changing ? 'hidden' : ''}>
      <label class="check"><input type="checkbox" name="got" ${changing ? '' : 'checked'}> <span class="got-label"></span></label>
      <select name="got_method">${opts(Object.entries(L.payMethods), 'cash')}</select>
    </div>
    ${changing ? `<p class="hint warn">${L.termsChanged}</p>` : ''}
    <label>${L.note}<textarea name="note" rows="2">${esc(d.note ?? '')}</textarea></label>
    <div class="preview k-sale"></div>`;

  const priceOf = (form) => parseNum(form.elements.price.value);
  let firstDue = 0;
  const mount = (form) => {
    const f = form.elements;
    const update = () => {
      const k = f.kind.value;
      form.querySelectorAll('.k-sale').forEach((el) => (el.hidden = k !== 'sale'));
      form.querySelectorAll('.k-reserve').forEach((el) => (el.hidden = k !== 'reserve'));
      form.querySelector('.new-client').hidden = f.client_id.value !== 'new';
      form.querySelector('.date-label').textContent = k === 'reserve' ? L.reserveDate : L.contractDate;
      const t = readTerms(form, priceOf(form), f.date.value);
      const rows = k === 'sale' ? schedule(t) : [];
      firstDue = k === 'sale' ? Math.max(0, r2((rows[0]?.amount ?? 0) - paidBefore)) : parseNum(f.deposit.value);
      const what = k === 'reserve' ? L.gotDeposit : t.plan === 'full' ? L.gotFull : L.gotDown;
      form.querySelector('.got-label').textContent = firstDue > 0 ? `${what}: ${money(firstDue)}` : what;
      form.querySelector('.got-row').style.visibility = firstDue > 0 ? '' : 'hidden';
      if (k === 'sale') form.querySelector('.preview').innerHTML = `<h4>${L.schedule}</h4>${previewHtml(t, { limit: 14 })}`;
    };
    wireSegs(form, update);
    wireTerms(form, () => priceOf(form), update);
    form.addEventListener('input', (e) => {
      if (e.target.name === 'discount' && list > 0) {
        f.price.value = num(r2(list * (1 - parseNum(f.discount.value) / 100)));
        form.dispatchEvent(new Event('price-changed'));
      } else if (e.target.name === 'price' && list > 0) {
        const p = priceOf(form);
        f.discount.value = p > 0 && p < list ? num(((list - p) / list) * 100) : '';
        form.dispatchEvent(new Event('price-changed'));
      } else if (e.target.name === 'date' && f.plan.value === 'installment') {
        if (f.date.value) f.first_due.value = addMonths(f.date.value, 1);
      }
      update();
    });
    form.addEventListener('change', update);
    update();
  };

  const submit = async (form) => {
    const f = form.elements;
    const k = f.kind.value;
    const price = priceOf(form);
    if (f.client_id.value === '') throw fieldError('client_id', L.pickClient);
    if (f.client_id.value === 'new') {
      if (!f.c_name.value.trim()) throw fieldError('c_name', L.required);
      if (!f.c_phone.value.trim()) throw fieldError('c_phone', L.required);
    }
    if (!f.date.value) throw fieldError('date', L.required);
    if (k === 'sale' && !(price > 0)) throw fieldError('price', L.positive);
    const t = readTerms(form, price, f.date.value);
    if (k === 'sale' && t.plan !== 'full' && t.down_payment >= price) throw fieldError('down_payment', L.positive);
    const other = db.activeDeal(apt.id);
    if (other && other.id !== old?.id) throw new Error(L.flatTaken);

    let clientId = f.client_id.value;
    if (clientId === 'new') {
      const c = await db.save('clients', {
        id: db.newId(), name: f.c_name.value.trim(), phone: f.c_phone.value.trim(), phone2: '', passport: f.c_passport.value.trim(),
        address: f.c_address.value.trim(), note: '',
      });
      clientId = c.id;
    }
    await db.ensureFlat(apt);
    const row = {
      ...(old ?? {}), id: old?.id ?? db.newId(), flat_id: apt.id, client_id: clientId, kind: k, status: 'active',
      contract_no: k === 'sale' ? f.contract_no.value.trim() : old?.contract_no ?? '', date: f.date.value,
      reserve_until: k === 'reserve' ? f.reserve_until.value || null : null, list_price: list || null, price: r2(price),
      ...(k === 'sale' ? t : { plan: 'full', down_payment: 0, term: 0, rate: 0, method: 'annuity', first_due: null, bank: '', bank_rate: null, bank_term: null }),
      note: f.note.value.trim(),
    };
    row.schedule = k === 'sale' ? schedule(row) : [];
    const saved = await db.save('deals', row);
    if (!changing && f.got.checked && firstDue > 0) {
      await db.save('payments', { id: db.newId(), deal_id: saved.id, date: saved.date, amount: firstDue, method: f.got_method.value, receipt: '', note: '' });
    }
    setTimeout(() => openDeal(saved.id));
  };
  return dialog({ title, body, wide: true, mount, submit, submitText: L.save });
}

// ---------- the deal's drawer ----------
export function openDeal(id) {
  openDrawer({
    render(el) {
      const L = T();
      const deal = db.data.deals.get(id);
      if (!deal) return closeDrawer();
      const { d, s, state, apt, client } = dealInfo(deal);
      const pays = db.paymentsOf(d.id);
      const reserve = d.kind === 'reserve';
      const active = d.status === 'active';
      const head = reserve ? `${L.kind.reserve}${d.reserve_until ? ` · ${L.until(fdate(d.reserve_until))}` : ''}`
        : `${L.kind.sale}${d.contract_no ? ` · ${L.contractNo} ${esc(d.contract_no)}` : ''} · ${fdate(d.date)}`;
      const money4 = reserve
        ? [[L.dealPrice, money(d.price)], [L.depositPaid, money(s.paid)]]
        : [[L.toPay, money(s.total)], [L.paid, money(s.paid)], [s.balance < 0 ? L.overpaid : L.balance, money(Math.abs(s.balance))], [L.overdue, money(s.overdue)]];
      el.innerHTML = `
        <div class="drawer-head">
          <div><div class="eyebrow">${head}</div><h2>${L.flat(apt.number)} · ${esc(client?.name ?? '')}</h2>
          <div class="sub">${L.floorN(apt.floor)} · ${L.roomsLong(apt.rooms)} · ${num(apt.area)} ${L.m2}</div></div>
          ${stateChip(state)}
        </div>
        <div class="money-row">${money4.map(([k, x], i) => `<div class="${i === 3 && s.overdue > 0 ? 'bad' : ''}"><span>${k}</span><b>${x}</b></div>`).join('')}</div>
        ${reserve ? '' : `<div class="progress"><i style="width:${(s.progress * 100).toFixed(1)}%"></i></div>
          <p class="terms-line">${esc(termsLine(d))}</p>`}
        ${s.next && active && !reserve ? `<p class="next ${s.next.state === 'late' ? 'bad' : ''}">${L.next}: <b>${money(s.next.rest)}</b> · ${fdate(s.next.due)}</p>` : ''}
        ${d.status === 'cancelled' ? `<p class="hint warn">${L.cancelledOn(fdate(d.cancelled_at?.slice(0, 10)))}${d.cancel_reason ? ` · ${esc(d.cancel_reason)}` : ''}</p>` : ''}
        <div class="actions">
          ${active ? `<button class="btn primary" data-act="pay">${L.addPayment}</button>` : ''}
          ${active && reserve ? `<button class="btn primary" data-act="convert">${L.convert}</button>` : ''}
          ${!reserve ? `<button class="btn" data-act="print">${L.printSchedule}</button>` : ''}
          ${active && !reserve ? `<button class="btn" data-act="terms">${L.editTerms}</button>` : ''}
          ${active ? `<button class="btn" data-act="cancel">${reserve ? L.cancelReserve : L.cancelDeal}</button>` : ''}
          ${db.isAdmin() ? `<button class="btn ghost danger" data-act="delete">${L.deleteDeal}</button>` : ''}
        </div>
        <div class="card client-card" data-act="client" role="button">
          <b>${esc(client?.name ?? L.dash)}</b>
          <span>${[client?.phone, client?.phone2].filter(Boolean).map((p) => `<a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a>`).join(' · ')}</span>
          <span>${[client?.passport && `${L.passport} ${esc(client.passport)}`, client?.address && esc(client.address)].filter(Boolean).join(' · ')}</span>
        </div>
        ${reserve ? '' : `<h3>${L.schedule}</h3>
        <div class="table-wrap"><table class="sched states">
          <thead><tr><th>${L.col.n}</th><th>${L.col.due}</th><th class="r">${L.col.amount}</th><th class="r">${L.col.paid}</th><th>${L.col.state}</th></tr></thead>
          <tbody>${s.rows.map((x) => `<tr class="s-${x.state}"><td>${rowName(x)}</td><td>${fdate(x.due)}</td><td class="r">${amt(x.amount)}</td>
            <td class="r">${x.paid ? amt(x.paid) : ''}</td><td><span class="dot"></span>${L.rowState[x.state]}</td></tr>`).join('')}</tbody>
        </table></div>`}
        <h3>${L.payments} <small>${money(s.paid)}</small></h3>
        ${pays.length ? `<div class="table-wrap"><table class="list">
          <thead><tr><th>${L.date}</th><th class="r">${L.amount}</th><th>${L.payMethod}</th><th>${L.receipt}</th><th>${L.by}</th><th></th></tr></thead>
          <tbody>${pays.map((p) => `<tr class="${p.amount < 0 ? 'refund' : ''}"><td>${fdate(p.date)}</td><td class="r">${amt(p.amount)}</td>
            <td>${p.amount < 0 ? L.refund : L.payMethods[p.method] ?? esc(p.method)}</td><td>${esc(p.receipt ?? '')}</td><td class="muted">${esc(who(p.created_by))}</td>
            <td>${db.isAdmin() ? `<button class="icon-btn" data-act="del-pay" data-id="${p.id}" title="${L.del}">✕</button>` : ''}</td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="hint">${L.noPayments}</p>`}
        ${d.note ? `<h3>${L.note}</h3><p class="note">${esc(d.note)}</p>` : ''}`;
    },
    async act(a, b) {
      const L = T();
      const d = db.data.deals.get(id);
      if (!d) return;
      if (a === 'pay') paymentForm(id);
      else if (a === 'convert') dealForm({ dealId: id, kind: 'sale' });
      else if (a === 'terms') dealForm({ dealId: id, kind: 'sale' });
      else if (a === 'cancel') cancelForm(id);
      else if (a === 'print') printSchedule(id);
      else if (a === 'client') openClient(d.client_id);
      else if (a === 'delete') {
        if (await confirmBox(L.deleteDealQ, { ok: L.del, danger: true })) {
          if (await attempt(() => db.remove('deals', id), L.deleted)) closeDrawer();
        }
      } else if (a === 'del-pay') {
        if (await confirmBox(L.deletePaymentQ, { ok: L.del, danger: true })) attempt(() => db.remove('payments', b.dataset.id), L.deleted);
      }
    },
  });
}
const who = (email) => (email ? (db.data.staff.get(email)?.name ?? email.split('@')[0]) : '');

// ---------- a payment ----------
export function paymentForm(dealId) {
  const L = T();
  const { d, s, apt, client } = dealInfo(db.data.deals.get(dealId));
  const suggest = d.kind === 'sale' && s.next ? s.next.rest : '';
  return dialog({
    title: `${L.addPayment} · ${L.flat(apt.number)}`,
    body: `<p class="hint">${esc(client?.name ?? '')}${s.next && d.kind === 'sale' ? ` · ${L.next}: ${money(s.next.rest)} (${fdate(s.next.due)})` : ''}</p>
      <div class="grid2">
        <label>${L.amount} *<input name="amount" inputmode="decimal" value="${suggest ? num(suggest) : ''}"></label>
        <label>${L.date} *<input type="date" name="date" value="${today()}"></label>
        <label>${L.payMethod}<select name="method">${opts(Object.entries(L.payMethods), 'cash')}</select></label>
        <label>${L.receipt}<input name="receipt"></label>
      </div>
      <label>${L.note}<input name="note"></label>`,
    async submit(form) {
      const f = form.elements;
      const amount = r2(parseNum(f.amount.value));
      if (!(amount > 0)) throw fieldError('amount', L.positive);
      if (!f.date.value) throw fieldError('date', L.required);
      await db.save('payments', { id: db.newId(), deal_id: dealId, date: f.date.value, amount, method: f.method.value, receipt: f.receipt.value.trim(), note: f.note.value.trim() });
    },
  });
}

// ---------- cancelling ----------
function cancelForm(dealId) {
  const L = T();
  const { d, s } = dealInfo(db.data.deals.get(dealId));
  return dialog({
    title: L.cancelTitle(d.kind),
    danger: true,
    submitText: d.kind === 'reserve' ? L.cancelReserve : L.cancelDeal,
    body: `<p class="hint">${L.cancelNote} ${L.paid}: ${money(s.paid)}</p>
      <label>${L.cancelReason}<input name="reason"></label>
      <div class="grid3">
        <label>${L.refundAmount}<input name="refund" inputmode="decimal" placeholder="0"></label>
        <label>${L.refundDate}<input type="date" name="date" value="${today()}"></label>
        <label>${L.payMethod}<select name="method">${opts(Object.entries(L.payMethods), 'cash')}</select></label>
      </div>`,
    async submit(form) {
      const f = form.elements;
      const refund = r2(parseNum(f.refund.value));
      if (refund < 0 || refund > s.paid) throw fieldError('refund', `0 … ${money(s.paid)}`);
      await db.save('deals', { ...d, status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: f.reason.value.trim() });
      if (refund > 0) await db.save('payments', { id: db.newId(), deal_id: d.id, date: f.date.value || today(), amount: -refund, method: f.method.value, receipt: '', note: L.refund });
    },
  });
}

// ---------- the printed schedule (for the buyer, to sign) ----------
export function printSchedule(dealId) {
  const L = T();
  const { d, s, apt, client } = dealInfo(db.data.deals.get(dealId));
  const company = db.setting('company', '');
  $('#print').innerHTML = `
    <h1>${L.schedule}</h1>
    <p class="p-sub">${esc(company)}${d.contract_no ? ` · ${L.contractNo} ${esc(d.contract_no)}` : ''} · ${L.contractDate.toLowerCase()} ${fdate(d.date)}</p>
    <table class="p-facts">
      <tr><th>${L.flatLong(apt.number)}</th><td>${L.floorN(apt.floor)} · ${L.roomsLong(apt.rooms)} · ${num(apt.area)} ${L.m2}</td></tr>
      <tr><th>${L.buyer}</th><td>${esc(client?.name ?? '')}${client?.passport ? ` · ${L.passport} ${esc(client.passport)}` : ''}${client?.phone ? ` · ${esc(client.phone)}` : ''}</td></tr>
      <tr><th>${L.dealPrice}</th><td>${money(d.price)}${d.list_price > d.price ? ` (${L.listPrice.toLowerCase()} ${money(d.list_price)})` : ''}</td></tr>
      <tr><th>${L.pay}</th><td>${esc(termsLine(d, { price: false }))}</td></tr>
      <tr><th>${L.toPay}</th><td><b>${money(s.total)}</b> · ${L.paid.toLowerCase()} ${money(s.paid)} · ${L.balance.toLowerCase()} ${money(s.balance)}</td></tr>
    </table>
    <table class="p-sched">
      <thead><tr><th>${L.col.n}</th><th>${L.col.due}</th><th>${L.col.amount}</th><th>${L.col.principal}</th><th>${L.col.interest}</th><th>${L.col.paid}</th></tr></thead>
      <tbody>${s.rows.map((x) => `<tr><td>${rowName(x)}</td><td>${fdate(x.due)}</td><td>${amt(x.amount)}</td><td>${amt(x.principal)}</td><td>${amt(x.interest)}</td><td>${x.paid ? amt(x.paid) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">${L.total}</td><td>${amt(s.total)}</td><td>${amt(s.rows.reduce((a, x) => a + x.principal, 0))}</td><td>${amt(s.rows.reduce((a, x) => a + x.interest, 0))}</td><td>${amt(s.paid)}</td></tr></tfoot>
    </table>
    <div class="p-sign"><div>${L.seller}<i></i><small>${L.signature}</small></div><div>${L.buyer}<i></i><small>${L.signature}</small></div></div>
    <p class="p-date">${L.printedOn(fdate(today()))}</p>`;
  window.print();
}
export { surname };

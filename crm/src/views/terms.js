// The payment terms of a sale, edited in the deal form and in the calculator: how it is paid (in
// full, in instalments, with a bank's mortgage), the first payment, term, rate and how the interest
// is worked out; and what they come to (the schedule).
import { T } from '../i18n.js';
import { amt, esc, fdate, money, num, parseNum, pct, r2 } from '../fmt.js';
import { schedule, totals } from '../calc.js';
import { opts, segInput } from '../ui.js';

const v = (x) => (x == null || x === '' ? '' : esc(x));

// the inputs (inside a <form>); t: the terms to start from, price: the price they apply to
export function termsHtml(t, price) {
  const L = T();
  const downPct = price > 0 && t.down_payment > 0 ? r2((t.down_payment / price) * 100) : '';
  return `
    <div class="row">${segInput('plan', Object.entries(L.plans), t.plan ?? 'installment')}</div>
    <div class="grid3 terms">
      <label class="p-inst p-mort">${L.down}<span class="pair"><input name="down_payment" inputmode="decimal" value="${v(t.down_payment || '')}" placeholder="0">
        <input name="down_pct" inputmode="decimal" class="pct" value="${v(downPct)}" placeholder="%"></span></label>
      <label class="p-inst">${L.term}<input name="term" inputmode="numeric" value="${v(t.term || 12)}"></label>
      <label class="p-inst"><span class="rate-label">${t.method === 'markup' ? L.markup : L.rate}</span><input name="rate" inputmode="decimal" value="${v(t.rate ?? 0)}"></label>
      <label class="p-inst wide2">${L.method}<select name="method">${opts(Object.entries(L.methods), t.method ?? 'annuity')}</select></label>
      <label class="p-full p-inst p-mort"><span class="due-label"></span><input type="date" name="first_due" value="${v(t.first_due)}"></label>
      <label class="p-mort">${L.bank}<input name="bank" value="${v(t.bank)}"></label>
      <label class="p-mort">${L.bankRate}<input name="bank_rate" inputmode="decimal" value="${v(t.bank_rate)}"></label>
      <label class="p-mort">${L.bankTerm}<input name="bank_term" inputmode="numeric" value="${v(t.bank_term)}"></label>
    </div>
    <p class="hint method-note p-inst"></p>`;
}

// the terms as typed; date: the contract's (the first payment and the schedule start from it)
export function readTerms(form, price, date) {
  const f = form.elements;
  const plan = f.plan.value;
  const t = {
    plan,
    price: r2(price),
    date,
    down_payment: plan === 'full' ? 0 : r2(Math.min(parseNum(f.down_payment.value), price)),
    term: plan === 'installment' ? Math.max(1, Math.round(parseNum(f.term.value)) || 1) : 0,
    rate: plan === 'installment' ? Math.max(0, parseNum(f.rate.value)) : 0,
    method: plan === 'installment' ? f.method.value : 'annuity',
    first_due: f.first_due.value || null,
    bank: plan === 'mortgage' ? f.bank.value.trim() : '',
    bank_rate: plan === 'mortgage' && f.bank_rate.value !== '' ? parseNum(f.bank_rate.value) : null,
    bank_term: plan === 'mortgage' && f.bank_term.value !== '' ? Math.round(parseNum(f.bank_term.value)) : null,
  };
  return t;
}

// show the inputs of the chosen plan; keep the first payment's amount and its % in step
export function wireTerms(form, getPrice, onChange) {
  const f = form.elements;
  const show = () => {
    const plan = f.plan.value;
    form.querySelectorAll('.p-full, .p-inst, .p-mort').forEach((el) => {
      const on = (plan === 'full' && el.classList.contains('p-full')) || (plan === 'installment' && el.classList.contains('p-inst')) ||
        (plan === 'mortgage' && el.classList.contains('p-mort'));
      el.hidden = !on;
    });
    const L = T();
    form.querySelector('.due-label').textContent = plan === 'full' ? L.payDate : plan === 'mortgage' ? L.bankDate : L.firstDue;
    form.querySelector('.rate-label').textContent = f.method.value === 'markup' ? L.markup : L.rate;
    form.querySelector('.method-note').textContent = L.methodNote[f.method.value] ?? '';
  };
  form.addEventListener('input', (e) => {
    const price = getPrice();
    if (e.target.name === 'down_pct' && price > 0) f.down_payment.value = num(Math.round((price * parseNum(f.down_pct.value)) / 100)).replace(/\s/g, ' ');
    if (e.target.name === 'down_payment' && price > 0) f.down_pct.value = parseNum(f.down_payment.value) ? num((parseNum(f.down_payment.value) / price) * 100) : '';
    show();
    onChange?.();
  });
  form.addEventListener('change', () => {
    show();
    onChange?.();
  });
  // the price changed elsewhere in the form: the first payment keeps its share
  form.addEventListener('price-changed', () => {
    const price = getPrice();
    if (price > 0 && f.down_pct.value) f.down_payment.value = num(Math.round((price * parseNum(f.down_pct.value)) / 100)).replace(/\s/g, ' ');
  });
  show();
  return show;
}

// what the terms come to: the totals and the schedule
export function previewHtml(t, { limit = 0 } = {}) {
  const L = T();
  const rows = schedule(t);
  if (!rows.length) return `<p class="hint">${L.scheduleEmpty}</p>`;
  const s = totals(rows);
  const tiles = [];
  if (t.plan === 'installment') {
    tiles.push([L.down, money(t.down_payment)], [L.financed, money(s.financed)]);
    tiles.push([L.monthly, same(s) ? money(s.first) : `${money(s.first)} → ${money(s.last)}`]);
    tiles.push([L.interest, money(s.interest)]);
  } else if (t.plan === 'mortgage') {
    tiles.push([L.down, money(t.down_payment)], [L.bankPart, money(t.price - t.down_payment)]);
  }
  tiles.push([L.toPay, money(s.total)]);
  let bank = '';
  if (t.plan === 'mortgage' && t.bank_rate > 0 && t.bank_term > 0) {
    const m = schedule({ plan: 'installment', price: t.price - t.down_payment, date: t.date, term: t.bank_term, rate: t.bank_rate, method: 'annuity' })[0];
    if (m) bank = `<p class="hint">${esc(L.bankInfo(money(m.amount), num(t.bank_rate), L.months(t.bank_term)))}</p>`;
  }
  const shown = limit && rows.length > limit + 2 ? [...rows.slice(0, limit), null, rows.at(-1)] : rows;
  return `
    <div class="tiles">${tiles.map(([k, x], i) => `<div class="tile ${i === tiles.length - 1 ? 'strong' : ''}"><span>${k}</span><b>${x}</b></div>`).join('')}</div>
    ${bank}
    <table class="sched">
      <thead><tr><th>${L.col.n}</th><th>${L.col.due}</th><th class="r">${L.col.amount}</th><th class="r">${L.col.principal}</th><th class="r">${L.col.interest}</th><th class="r">${L.col.left}</th></tr></thead>
      <tbody>${shown.map((x) => (x ? `<tr><td>${rowName(x)}</td><td>${fdate(x.due)}</td><td class="r">${amt(x.amount)}</td><td class="r">${amt(x.principal)}</td><td class="r">${amt(x.interest)}</td><td class="r">${amt(x.left ?? 0)}</td></tr>`
        : `<tr class="gap"><td colspan="6">…</td></tr>`)).join('')}</tbody>
    </table>`;
}
// equal payments, the last one off by the rounding
const same = (s) => Math.abs(s.first - s.last) < 1;
export const rowName = (x) => (x.kind === 'month' ? String(x.n) : T().rowKind[x.kind]);
export const termsLine = (d, { price: withPrice = true } = {}) => {
  const L = T();
  const price = withPrice ? `${L.dealPrice} ${money(d.price)}` : '';
  if (d.plan === 'full') return [price, L.plans.full].filter(Boolean).join(' · ');
  if (d.plan === 'mortgage') return [price, L.plans.mortgage, d.bank, `${L.down} ${money(d.down_payment)}`].filter(Boolean).join(' · ');
  const s = totals(d.schedule ?? []);
  const rate = !d.rate ? '0%' : d.method === 'markup' ? `${L.markup.replace(', %', '').toLowerCase()} ${pct(d.rate)}` : `${pct(d.rate)} ${L.perYear}`;
  return [price, L.plans.installment, L.months(d.term), rate, `${L.down} ${money(d.down_payment)}`,
    `${L.monthly.toLowerCase()} ${same(s) ? money(s.first) : `${amt(s.first)} → ${money(s.last)}`}`].filter(Boolean).join(' · ');
};

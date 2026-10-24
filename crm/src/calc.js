// The money of a deal: the payments its terms ask for (the schedule), what has been paid against
// them, and what that makes of the flat (free, reserved, sold).
import { addMonths, r2, sum } from './fmt.js';

// A deal's terms -> its schedule: [{ n, due, kind, principal, interest, amount, left }]
//   kind: 'full' (everything at once), 'down' (the first payment), 'month' (an instalment),
//   'bank' (a mortgage: the bank pays the rest to the seller)
// plan 'installment': the rest after the first payment in `term` monthly payments from `first_due`,
//   with `rate`: 'annuity' (equal payments, rate % a year on the debt left), 'diff' (equal parts of the
//   debt plus the interest on what is left: falling payments), 'markup' (rate % added once to the rest)
export function schedule(t) {
  const price = r2(t.price);
  if (!(price > 0) || !t.date) return [];
  if (t.plan === 'full') return [{ n: 0, due: t.first_due || t.date, kind: 'full', principal: price, interest: 0, amount: price, left: 0 }];
  const down = r2(Math.min(Math.max(+t.down_payment || 0, 0), price));
  const rest = r2(price - down);
  const out = [];
  if (down > 0) out.push({ n: 0, due: t.date, kind: 'down', principal: down, interest: 0, amount: down, left: rest });
  if (!(rest > 0)) return out;
  if (t.plan === 'mortgage') {
    out.push({ n: 1, due: t.first_due || t.date, kind: 'bank', principal: rest, interest: 0, amount: rest, left: 0 });
    return out;
  }
  const n = Math.max(1, Math.round(+t.term || 1));
  const first = t.first_due || addMonths(t.date, 1);
  const rate = Math.max(0, +t.rate || 0);
  let debt = rest;
  if (t.method === 'markup') {
    let extra = r2((rest * rate) / 100);
    const part = r2(rest / n), cut = r2(extra / n);
    for (let k = 1; k <= n; k++) {
      const p = k === n ? debt : part, i = k === n ? extra : cut;
      debt = r2(debt - p);
      extra = r2(extra - i);
      out.push({ n: k, due: addMonths(first, k - 1), kind: 'month', principal: p, interest: i, amount: r2(p + i), left: debt });
    }
    return out;
  }
  const r = rate / 1200;
  const annuity = r > 0 ? r2((rest * r) / (1 - (1 + r) ** -n)) : r2(rest / n);
  for (let k = 1; k <= n; k++) {
    const i = r2(debt * r);
    let p = t.method === 'diff' ? r2(rest / n) : r2(annuity - i);
    if (k === n || p > debt) p = debt;
    debt = r2(debt - p);
    out.push({ n: k, due: addMonths(first, k - 1), kind: 'month', principal: p, interest: i, amount: r2(p + i), left: debt });
  }
  return out;
}

// what a schedule comes to: everything to pay, of it interest, the monthly payment (first and last
// for falling payments)
export function totals(rows) {
  const months = rows.filter((x) => x.kind === 'month');
  return {
    total: sum(rows, (x) => x.amount),
    interest: sum(rows, (x) => x.interest),
    financed: sum(months, (x) => x.principal),
    first: months[0]?.amount ?? 0,
    last: months.at(-1)?.amount ?? 0,
    months: months.length,
  };
}

// Payments against the schedule, oldest first: each row's paid part and state
// ('paid', 'part' (partly paid, not yet due), 'late' (due and not fully paid), 'due')
export function summarize(deal, payments, day) {
  const rows = (deal.schedule ?? []).map((x) => ({ ...x }));
  const total = sum(rows, (x) => x.amount);
  const paid = sum(payments, (p) => p.amount);
  let left = paid;
  for (const x of rows) {
    x.paid = r2(Math.max(0, Math.min(left, x.amount)));
    left = r2(left - x.paid);
    x.rest = r2(x.amount - x.paid);
    x.state = x.rest <= 0 ? 'paid' : x.due < day ? 'late' : x.paid > 0 ? 'part' : 'due';
  }
  const late = rows.filter((x) => x.state === 'late');
  return {
    rows,
    total,
    paid,
    balance: r2(total - paid),
    overdue: sum(late, (x) => x.rest),
    lateSince: late[0]?.due ?? null,
    next: rows.find((x) => x.rest > 0) ?? null,
    progress: total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0,
  };
}

// The state a deal is in, for its badge: reserve | expired | active | late | paid | cancelled | unreserved
export function dealState(deal, s, day) {
  if (deal.status === 'cancelled') return deal.kind === 'reserve' ? 'unreserved' : 'cancelled';
  if (deal.kind === 'reserve') return deal.reserve_until && deal.reserve_until < day ? 'expired' : 'reserve';
  if (s.total > 0 && s.balance <= 0) return 'paid';
  return s.overdue > 0 ? 'late' : 'active';
}

// A flat: free | reserved | sold | closed (taken off sale), from its deal on it and its row
export function flatStatus(flat, deal) {
  if (deal?.kind === 'sale') return 'sold';
  if (deal?.kind === 'reserve') return 'reserved';
  return flat?.on_sale === false ? 'closed' : 'free';
}
// what the 3D site is told (the same rule as the database's flat_status()): a reservation past its
// date shows as free there; the CRM keeps showing it, marked as expired, until someone acts on it
export function publicStatus(flat, deal, day) {
  const s = flatStatus(flat, deal);
  if (s === 'reserved' && deal.reserve_until && deal.reserve_until < day) return flat?.on_sale === false ? 'closed' : 'free';
  return s;
}

// the price list: the flat's own price, or price per m² x area
export function listPrice(flat, apt) {
  if (flat?.price > 0) return r2(flat.price);
  if (flat?.price_m2 > 0) return r2(flat.price_m2 * apt.area);
  return 0;
}

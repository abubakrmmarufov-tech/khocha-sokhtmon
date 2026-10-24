// The demo's example: a price on every flat, a dozen and a half sales on different terms over the
// last year, a few reservations, payments up to today with some of them late. The people are made up
// (their phone numbers start with +992 00, which no operator uses).
import { apartments } from '../../src/data.js';
import { schedule } from './calc.js';
import { addDays, addMonths, r2, today, uuid } from './fmt.js';

const NAMES = [
  'Рахимов Фаррух Саидович', 'Назарова Мадина Алиевна', 'Каримов Бахтиёр Шарифович', 'Шарипова Нигина Рустамовна',
  'Юсупов Далер Абдуллоевич', 'Ахмедова Зарина Насимовна', 'Саидов Комрон Джамшедович', 'Расулова Шахноза Икромовна',
  'Мирзоев Фирдавс Бахромович', 'Хасанова Манижа Сафаровна', 'Набиев Сухроб Олимович', 'Одинаева Парвина Хуршедовна',
  'Исмоилов Рустам Зафарович', 'Гафурова Дилноза Абдулхаковна', 'Холов Джамшед Неъматович', 'Сафарова Мехрангез Фаридуновна',
  'Давлатов Шахром Иброхимович', 'Курбонова Фарзона Музаффаровна', 'Валиев Акмал Тохирович', 'Эргашева Сабина Анваровна',
];
const PRICE_M2 = { 3: 7000, 4: 7100, 5: 7300, 6: 7400, 7: 7500, 8: 7600, 9: 7700, 10: 8200 };

// [flat №, months ago, terms, payments missed at the end, discount %]
const SALES = [
  [5, 11, { plan: 'full' }, 0, 3],
  [13, 10, { plan: 'installment', down: 0.3, term: 36, rate: 18, method: 'annuity' }, 0, 0],
  [21, 10, { plan: 'installment', down: 0.5, term: 12, rate: 0, method: 'annuity' }, 0, 2],
  [29, 9, { plan: 'mortgage', down: 0.2, bank: 'Ориёнбонк', bank_rate: 21, bank_term: 120 }, 0, 0],
  [30, 8, { plan: 'installment', down: 0.4, term: 24, rate: 10, method: 'markup' }, 2, 0],
  [38, 8, { plan: 'installment', down: 0.3, term: 24, rate: 16, method: 'diff' }, 0, 0],
  [40, 7, { plan: 'full' }, 0, 5],
  [47, 6, { plan: 'installment', down: 0.3, term: 36, rate: 18, method: 'annuity' }, 1, 0],
  [52, 5, { plan: 'installment', down: 0.5, term: 18, rate: 0, method: 'annuity' }, 0, 0],
  [55, 4, { plan: 'mortgage', down: 0.3, bank: 'Амонатбонк', bank_rate: 19, bank_term: 180 }, 0, 0],
  [58, 3, { plan: 'installment', down: 0.35, term: 24, rate: 12, method: 'annuity' }, 0, 0],
  [61, 3, { plan: 'full' }, 0, 0],
  [65, 2, { plan: 'installment', down: 0.3, term: 30, rate: 15, method: 'diff' }, 0, 0],
  [68, 1, { plan: 'installment', down: 0.5, term: 12, rate: 0, method: 'annuity' }, 0, 3],
  [33, 0, { plan: 'installment', down: 0.3, term: 24, rate: 18, method: 'annuity' }, 0, 0],
];
// [flat №, days ago, days held, deposit]
const RESERVED = [
  [9, 3, 10, 5000],
  [26, 6, 14, 10000],
  [44, 12, 7, 0], // its date has passed: the CRM flags it, the 3D site shows the flat free again
  [70, 1, 7, 20000],
];
const CLOSED = [71, 72]; // kept by the developer

export function example() {
  const day = today();
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const byNo = new Map(apartments.map((a) => [a.number, a]));
  const flats = apartments.map((a) => ({
    id: a.id, number: a.number, floor: a.floor, rooms: a.rooms, area: a.area,
    price_m2: PRICE_M2[a.floor] ?? 7000, price: null, on_sale: !CLOSED.includes(a.number), note: '',
  }));
  const clients = [], deals = [], payments = [];
  let person = 0, contract = 0;
  const stamp = (d) => `${d}T10:00:00.000Z`;
  const client = () => {
    const i = person++;
    const c = {
      id: uuid(), name: NAMES[i % NAMES.length], phone: `+992 00 ${String(100 + i * 7).slice(-3)} ${String(1000 + i * 113).slice(-4)}`,
      phone2: '', passport: `A${String(4000000 + i * 7919).slice(-7)}`, address: 'г. Душанбе', note: '',
      created_at: stamp(day), created_by: 'demo', updated_at: stamp(day), updated_by: 'demo',
    };
    clients.push(c);
    return c;
  };
  const pay = (deal, date, amount, method) => {
    if (date > day) date = day;
    payments.push({
      id: uuid(), deal_id: deal.id, date, amount: r2(amount), method,
      receipt: String(1000 + payments.length), note: '', created_at: stamp(date), created_by: 'demo',
    });
  };

  for (const [no, ago, t, missed, off] of SALES) {
    const a = byNo.get(no);
    if (!a) continue;
    const list = r2(a.area * (PRICE_M2[a.floor] ?? 7000));
    const price = r2(Math.round((list * (1 - off / 100)) / 100) * 100);
    const date = addDays(addMonths(day, -ago), -Math.round(rnd() * 20));
    const d = {
      id: uuid(), flat_id: a.id, client_id: client().id, kind: 'sale', status: 'active',
      contract_no: `${++contract}/${date.slice(0, 4)}`, date, reserve_until: null, list_price: list, price,
      plan: t.plan, down_payment: t.down ? r2(Math.round((price * t.down) / 1000) * 1000) : 0,
      term: t.term ?? 0, rate: t.rate ?? 0, method: t.method ?? 'annuity',
      first_due: t.plan === 'mortgage' ? addDays(date, 21) : t.plan === 'installment' ? addMonths(date, 1) : date,
      bank: t.bank ?? '', bank_rate: t.bank_rate ?? null, bank_term: t.bank_term ?? null, note: '',
      cancelled_at: null, cancel_reason: null, created_at: stamp(date), created_by: 'demo', updated_at: stamp(date), updated_by: 'demo',
    };
    d.schedule = schedule(d);
    deals.push(d);
    // pay what fell due, a few days either side; leave out the last `missed`; the bank pays late
    const due = d.schedule.filter((x) => x.due <= day);
    due.forEach((x, i) => {
      if (i >= due.length - missed) return;
      const late = x.kind === 'bank' ? 9 : x.n === 0 ? 0 : Math.round(rnd() * 6) - 2;
      const method = x.kind === 'bank' ? 'bank' : rnd() < 0.55 ? 'cash' : rnd() < 0.7 ? 'bank' : 'card';
      pay(d, addDays(x.due, late), x.amount, method);
    });
  }
  for (const [no, ago, held, deposit] of RESERVED) {
    const a = byNo.get(no);
    if (!a) continue;
    const date = addDays(day, -ago);
    const list = r2(a.area * (PRICE_M2[a.floor] ?? 7000));
    const d = {
      id: uuid(), flat_id: a.id, client_id: client().id, kind: 'reserve', status: 'active',
      contract_no: '', date, reserve_until: addDays(date, held), list_price: list, price: list,
      plan: 'full', down_payment: 0, term: 0, rate: 0, method: 'annuity', first_due: null, bank: '', bank_rate: null, bank_term: null,
      schedule: [], note: '', cancelled_at: null, cancel_reason: null,
      created_at: stamp(date), created_by: 'demo', updated_at: stamp(date), updated_by: 'demo',
    };
    deals.push(d);
    if (deposit) pay(d, date, deposit, 'cash');
  }
  const settings = [
    { key: 'currency', value: 'TJS' },
    { key: 'company', value: 'ЧДММ «Хоча сохтмон»' },
  ];
  const staff = [{ email: 'demo', name: 'Демо', role: 'admin' }];
  return { flats, clients, deals, payments, staff, settings };
}

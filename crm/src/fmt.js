// Numbers, money and dates as the sales office writes them (1 234 567,50 смн, 23.10.2026), and
// escaping for anything a person typed; record ids.
import { T } from './i18n.js';

// a new record's id (a v4 UUID); crypto.randomUUID needs https or localhost, a page opened over plain
// http on the office network has only getRandomValues
export const uuid = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// money is kept to the diram / cent
export const r2 = (x) => Math.round((+x || 0) * 100 + (x >= 0 ? 1e-7 : -1e-7)) / 100;
export const sum = (list, f = (x) => x) => r2(list.reduce((s, x) => s + (+f(x) || 0), 0));

export const num = (x, digits = 2) => (+x || 0).toLocaleString('ru-RU', { maximumFractionDigits: digits });
export const area = (x) => `${num(x, 1)} ${T().m2}`;
export const pct = (x) => `${num(x, 2)}%`;

const CURRENCY = { TJS: 'смн', USD: '$' };
let currency = 'TJS';
export const setCurrency = (c) => (currency = CURRENCY[c] ? c : 'TJS');
export const currencySign = () => CURRENCY[currency];
// an amount of money: whole sums without decimals, the others with two (5 890,60)
export function amt(x) {
  const v = r2(x);
  return v.toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}
export const money = (x) => `${amt(x)} ${CURRENCY[currency]}`;
// big sums on the summary tiles and chart axes: 4,63 млн, 850 тыс.
export function compact(x) {
  const a = Math.abs(x);
  if (a >= 1e6) return `${num(x / 1e6, a >= 1e7 ? 1 : 2)} ${T().million}`;
  if (a >= 1e4) return `${num(x / 1e3, 0)} ${T().thousand}`;
  return num(x, 0);
}
export const moneyShort = (x) => (Math.abs(x) >= 1e4 ? `${compact(x)} ${CURRENCY[currency]}` : money(x));

// dates are ISO days ('2026-10-23'), local to the sales office
export function today() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const fdate = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : T().dash);
export function addMonths(s, k) {
  const [y, m, d] = s.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + k, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, days));
}
export function addDays(s, k) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export const monthKey = (s) => s.slice(0, 7);
export const monthLabel = (key) => `${T().monthNames[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;

// a typed amount: '1 234 567,5' -> 1234567.5
export const parseNum = (s) => {
  const v = parseFloat(String(s ?? '').replace(/\s| /g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

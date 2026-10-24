// The CRM's records: flats (prices), clients, deals, payments, staff, settings. With the sales
// database set up (src/config.js SALES: Supabase) they are shared by the sales team and the 3D site
// reads the flats' statuses from it; until then the CRM is a demo kept in this browser (local
// storage), filled with an example the first time. Everything is held in memory (one house: a few
// hundred rows), saved row by row; the views redraw on every change.
import { SALES } from '../../src/config.js';
import { apartments } from '../../src/data.js';
import { publicStatus } from './calc.js';
import { today, uuid } from './fmt.js';
import { T } from './i18n.js';
import { example } from './example.js';

export const TABLES = ['flats', 'clients', 'deals', 'payments', 'staff', 'settings'];
// the columns the views may write (the database fills created_* / updated_* itself)
const COLUMNS = {
  flats: ['id', 'number', 'floor', 'rooms', 'area', 'price_m2', 'price', 'on_sale', 'note'],
  clients: ['id', 'name', 'phone', 'phone2', 'passport', 'address', 'note'],
  deals: ['id', 'flat_id', 'client_id', 'kind', 'status', 'contract_no', 'date', 'reserve_until', 'list_price', 'price', 'plan',
    'down_payment', 'term', 'rate', 'method', 'first_due', 'bank', 'bank_rate', 'bank_term', 'schedule', 'note', 'cancelled_at', 'cancel_reason'],
  payments: ['id', 'deal_id', 'date', 'amount', 'method', 'receipt', 'note'],
  staff: ['email', 'name', 'role'],
  settings: ['key', 'value'],
};
const NUMERIC = ['area', 'price_m2', 'price', 'list_price', 'down_payment', 'rate', 'bank_rate', 'amount'];
export const keyOf = (t) => (t === 'staff' ? 'email' : t === 'settings' ? 'key' : 'id');
export const newId = uuid;

export const data = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
export const session = { mode: SALES.url && SALES.key ? 'cloud' : 'demo', url: SALES.url, user: null };

let version = 0;
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
function changed() {
  version++;
  if (session.mode === 'demo') demoWrite();
  for (const fn of listeners) fn();
}
// a value worked out from the records, kept until they change
const memo = (fn) => {
  let v = -1, val;
  return () => (v === version ? val : ((v = version), (val = fn())));
};

function clean(table, row) {
  const out = {};
  for (const c of COLUMNS[table]) if (row[c] !== undefined) out[c] = row[c];
  return out;
}
function norm(table, row) {
  for (const c of NUMERIC) if (row[c] != null) row[c] = +row[c];
  if (table === 'deals' && typeof row.schedule === 'string') row.schedule = JSON.parse(row.schedule);
  if (table === 'staff') row.email = row.email.toLowerCase();
  return row;
}

// ---------- the demo: local storage ----------
const DEMO = 'khocha-crm:demo';
const DEMO_USER = 'khocha-crm:demo:user';
// the flats' statuses for the 3D site (src/sales.js) while it runs on the same site as the demo
export const STATUS_KEY = 'khocha-crm:demo:status';
const demoUser = () => ({ email: 'demo', name: T().demoUser, role: 'admin' });

function demoRead() {
  try {
    return JSON.parse(localStorage.getItem(DEMO) || 'null');
  } catch {
    return null;
  }
}
function demoWrite() {
  const out = { v: 1 };
  for (const t of TABLES) out[t] = [...data[t].values()];
  try {
    localStorage.setItem(DEMO, JSON.stringify(out));
    localStorage.setItem(STATUS_KEY, JSON.stringify(publicStatuses()));
  } catch (e) {
    console.warn('demo not saved', e);
  }
}
function fill(saved) {
  for (const t of TABLES) {
    data[t].clear();
    for (const r of saved[t] ?? []) data[t].set(r[keyOf(t)], norm(t, r));
  }
}
function loadDemo() {
  fill(demoRead() ?? example());
  changed();
}
// start the demo again: with the example, or empty (the flats and their prices stay)
export function demoReset(withExample) {
  if (withExample) fill(example());
  else for (const t of ['clients', 'deals', 'payments']) data[t].clear();
  changed();
}

// ---------- the database: Supabase ----------
let sb = null;
async function supa() {
  if (!sb) {
    const { createClient } = await import('@supabase/supabase-js');
    sb = createClient(SALES.url, SALES.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'khocha-crm-auth' } });
  }
  return sb;
}
function check({ data: d, error }) {
  if (!error) return d;
  // a rule of the database said no (row-level security), or the row is not there for this user
  if (error.code === '42501' || error.code === 'PGRST116') throw new Error(T().adminOnly);
  throw new Error(error.message);
}
async function fetchAll(c, table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await c.from(table).select('*').range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function loadCloud() {
  const c = await supa();
  const lists = await Promise.all(TABLES.map((t) => fetchAll(c, t)));
  fill(Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])));
  changed();
}
let channel = null;
async function subscribe() {
  if (channel) return;
  const c = await supa();
  channel = c.channel('crm');
  for (const t of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (e) => {
      const k = keyOf(t);
      if (e.eventType === 'DELETE') data[t].delete(e.old[k]);
      else data[t].set(e.new[k], norm(t, e.new));
      changed();
    });
  }
  channel.subscribe();
}
async function enter(email) {
  await loadCloud();
  const me = data.staff.get(email.toLowerCase());
  session.user = { email: email.toLowerCase(), name: me?.name || email, role: me?.role ?? null };
  if (me) subscribe();
}

// ---------- signing in ----------
export async function start() {
  if (session.mode === 'demo') {
    if (localStorage.getItem(DEMO_USER)) {
      session.user = demoUser();
      loadDemo();
    }
    return session.user;
  }
  const c = await supa();
  const { data: d } = await c.auth.getSession();
  if (d.session) await enter(d.session.user.email);
  return session.user;
}
export async function signIn(email, password) {
  if (session.mode === 'demo') {
    localStorage.setItem(DEMO_USER, '1');
    session.user = demoUser();
    loadDemo();
    return session.user;
  }
  const c = await supa();
  const { data: d, error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  // a wrong address or password; anything else (no connection...) as it is
  if (error) throw new Error(error.status === 400 || /invalid/i.test(error.message) ? T().loginFailed : T().failed(error.message));
  await enter(d.user.email);
  return session.user;
}
export async function signOut() {
  if (session.mode === 'demo') localStorage.removeItem(DEMO_USER);
  else {
    await channel?.unsubscribe();
    channel = null;
    await (await supa()).auth.signOut();
  }
  session.user = null;
  for (const t of TABLES) data[t].clear();
}
export const isAdmin = () => session.user?.role === 'admin';

// ---------- writing ----------
export async function save(table, row) {
  const k = keyOf(table);
  const values = clean(table, row);
  const old = data[table].get(values[k]);
  let saved;
  if (session.mode === 'demo') {
    const stamp = new Date().toISOString(), by = session.user?.email;
    saved = { ...(old ?? { created_at: stamp, created_by: by }), ...values, updated_at: stamp, updated_by: by };
  } else {
    const c = await supa();
    const q = old ? c.from(table).update(values).eq(k, values[k]) : c.from(table).insert(values);
    saved = norm(table, check(await q.select().single()));
  }
  data[table].set(saved[k], saved);
  changed();
  return saved;
}
export async function remove(table, id) {
  if (session.mode === 'cloud') {
    const gone = check(await (await supa()).from(table).delete().eq(keyOf(table), id).select());
    if (!gone.length) throw new Error(T().adminOnly);
  }
  data[table].delete(id);
  if (table === 'deals') for (const [pid, p] of data.payments) if (p.deal_id === id) data.payments.delete(pid); // (cascade)
  changed();
}
// many rows at once (prices, a backup): one request per table in the database
export async function saveMany(table, rows) {
  if (!rows.length) return;
  const k = keyOf(table);
  const values = rows.map((r) => clean(table, r));
  if (session.mode === 'cloud') {
    const c = await supa();
    const out = check(await c.from(table).upsert(values, { onConflict: k }).select());
    for (const r of out) data[table].set(r[k], norm(table, r));
  } else {
    const stamp = new Date().toISOString(), by = session.user?.email;
    for (const v of values) data[table].set(v[k], { ...(data[table].get(v[k]) ?? { created_at: stamp, created_by: by }), ...v, updated_at: stamp, updated_by: by });
  }
  changed();
}

// ---------- reading ----------
export const aptById = new Map(apartments.map((a) => [a.id, a]));
export const flatRow = (id) => data.flats.get(id) ?? null;
// the flat's row as the database wants it (it is seeded with every flat; a demo starts the same way)
export const flatBase = (a) => ({ id: a.id, number: a.number, floor: a.floor, rooms: a.rooms, area: a.area, on_sale: true });
export async function ensureFlat(a) {
  if (!data.flats.has(a.id)) await save('flats', flatBase(a));
}
export const activeDeals = memo(() => {
  const m = new Map();
  for (const d of data.deals.values()) if (d.status === 'active') m.set(d.flat_id, d);
  return m;
});
export const activeDeal = (flatId) => activeDeals().get(flatId) ?? null;
export const paymentsByDeal = memo(() => {
  const m = new Map();
  for (const p of data.payments.values()) (m.get(p.deal_id) ?? m.set(p.deal_id, []).get(p.deal_id)).push(p);
  for (const list of m.values()) list.sort((a, b) => (a.date === b.date ? (a.created_at ?? '').localeCompare(b.created_at ?? '') : a.date.localeCompare(b.date)));
  return m;
});
export const paymentsOf = (dealId) => paymentsByDeal().get(dealId) ?? [];
export const deals = () => [...data.deals.values()];
export const clientOf = (deal) => data.clients.get(deal.client_id) ?? null;
export const setting = (key, fallback) => data.settings.get(key)?.value ?? fallback;
export const setSetting = (key, value) => save('settings', { key, value });

// what the 3D site shows for every flat (the same rule as the database's flat_status())
export function publicStatuses() {
  const day = today();
  return apartments.map((a) => ({ id: a.id, status: publicStatus(flatRow(a.id), activeDeal(a.id), day) }));
}

// a whole copy (a backup file) and loading one back
export function dump() {
  const out = { app: 'khocha-crm', v: 1, saved: new Date().toISOString() };
  for (const t of TABLES) out[t] = [...data[t].values()];
  return out;
}
export async function restore(copy) {
  if (copy?.app !== 'khocha-crm') throw new Error(T().badFile);
  let n = 0;
  // parents first: flats and clients before the deals, deals before their payments
  for (const t of ['settings', 'flats', 'clients', 'deals', 'payments', 'staff']) {
    const rows = copy[t] ?? [];
    await saveMany(t, rows);
    n += rows.length;
  }
  return n;
}

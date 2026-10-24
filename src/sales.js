// Which flats are sold, reserved or taken off sale: from the sales CRM (crm/). With its database set
// up (config.js SALES) the list comes from there — flat_status(): the statuses only, no prices or
// names — and is read again every minute while the page is open; until then, from the CRM's demo
// when it runs in this browser on the same site. A flat not on the list is free.
import { SALES } from './config.js';

const DEMO = 'khocha-crm:demo:status';
const EVERY = 60_000;
const status = new Map(); // flat id -> 'reserved' | 'sold' | 'closed'
let changed = () => {};

export const statusOf = (a) => status.get(a.id) ?? 'free';
export const isFree = (a) => !status.has(a.id);
export const hasStatuses = () => status.size > 0;

async function fetchList() {
  if (SALES.url && SALES.key) {
    const headers = { apikey: SALES.key };
    if (SALES.key.startsWith('eyJ')) headers.Authorization = `Bearer ${SALES.key}`; // (a legacy anon key)
    const r = await fetch(`${SALES.url.replace(/\/+$/, '')}/rest/v1/rpc/flat_status`, { headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`flat statuses: HTTP ${r.status}`);
    return r.json();
  }
  try {
    return JSON.parse(localStorage.getItem(DEMO) || '[]');
  } catch {
    return [];
  }
}

async function load() {
  let list;
  try {
    list = await fetchList();
  } catch (e) {
    console.warn(e);
    return; // (keep what was shown)
  }
  const next = new Map();
  for (const { id, status: s } of Array.isArray(list) ? list : []) if (s && s !== 'free') next.set(id, s);
  if (next.size === status.size && [...next].every(([k, v]) => status.get(k) === v)) return;
  status.clear();
  for (const [k, v] of next) status.set(k, v);
  changed();
}

// fn: called whenever the statuses change (the first time once they are in)
export function watchSales(fn) {
  changed = fn;
  load();
  setInterval(() => document.visibilityState === 'visible' && load(), EVERY);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
  // the demo, changed in another tab of this browser
  addEventListener('storage', (e) => e.key === DEMO && load());
}

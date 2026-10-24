// Runs schema.sql in an in-memory Postgres (PGlite) with Supabase's roles and auth.jwt() stubbed,
// then checks the access rules and flat_status() as anon / a stranger / a manager / the admin.
//   npm install --no-save @electric-sql/pglite && node crm/supabase/test.mjs
import { readFileSync } from 'node:fs';

const schemaPath = new URL('schema.sql', import.meta.url);
const { PGlite } = await import('@electric-sql/pglite').catch(() => {
  console.error('needs PGlite: npm install --no-save @electric-sql/pglite');
  process.exit(2);
});
const pg = new PGlite();
let failures = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
async function as(who, sql, params = []) {
  // who: null (postgres), 'anon', or an email (authenticated)
  await pg.exec('reset role');
  if (who === 'anon') await pg.exec(`select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`);
  else if (who) await pg.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ role: 'authenticated', email: who })}', false); set role authenticated;`);
  else await pg.exec(`select set_config('request.jwt.claims', '', false);`);
  try {
    return await pg.query(sql, params);
  } finally {
    await pg.exec('reset role');
  }
}
async function fails(who, sql, what, params = []) {
  try {
    await as(who, sql, params);
    ok(false, `${what} (should have failed)`);
  } catch (e) {
    ok(true, `${what} -> refused: ${e.message.split('\n')[0]}`);
  }
}

// Supabase's pieces the schema relies on
await pg.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`);
const schema = readFileSync(schemaPath, 'utf8').replace("lower('admin@example.com')", "lower('Boss@Test.tj')");
await pg.exec(schema);
await pg.exec(schema); // a second run must not break anything
ok(true, 'schema runs twice');

const count = async (who, table) => (await as(who, `select count(*)::int as n from public.${table}`)).rows[0].n;
ok((await as(null, 'select count(*)::int n from public.flats')).rows[0].n === 72, '72 flats seeded');
ok((await as(null, "select role from public.staff where email = 'boss@test.tj'")).rows[0]?.role === 'admin', 'first admin from the file (lower-cased)');

// anon: only flat_status()
const st = await as('anon', 'select * from public.flat_status()');
ok(st.rows.length === 72 && st.rows.every((r) => r.status === 'free'), 'anon: flat_status() lists 72 free flats');
await fails('anon', 'select * from public.flats', 'anon: read flats');
await fails('anon', 'select * from public.clients', 'anon: read clients');
await fails('anon', "insert into public.clients (name) values ('x')", 'anon: add a client');
await fails('anon', 'select public.crm_role()', 'anon: crm_role()');

// a signed-in stranger (not on the staff list) sees nothing and can change nothing
ok((await count('stranger@x.tj', 'flats')) === 0, 'stranger: sees no flats');
await fails('stranger@x.tj', "insert into public.clients (name) values ('x')", 'stranger: add a client');
await fails('stranger@x.tj', "insert into public.staff (email, role) values ('stranger@x.tj', 'admin')", 'stranger: make themselves admin');

// the admin adds a manager
await as('boss@test.tj', "insert into public.staff (email, name, role) values ('sales@test.tj', 'Менеджер', 'manager')");
ok((await count('sales@test.tj', 'staff')) === 2, 'admin added a manager; the manager sees the staff list');
const promoted = await as('sales@test.tj', "update public.staff set role = 'admin' where email = 'sales@test.tj' returning email").catch(() => ({ rows: [] }));
ok(promoted.rows.length === 0, 'manager: promoting themselves changes nothing');

// a manager sells a flat on instalments
const c = await as('sales@test.tj', "insert into public.clients (name, phone) values ('Рахимов Фаррух', '+992 00 000 00 01') returning id, created_by");
ok(c.rows[0].created_by === 'sales@test.tj', 'created_by is stamped by the database');
const clientId = c.rows[0].id;
const d = await as('sales@test.tj', `insert into public.deals (flat_id, client_id, kind, price, plan, down_payment, term, rate, schedule)
  values ('A5-3', $1, 'sale', 450000, 'installment', 135000, 24, 18, '[{"n":0,"amount":135000}]') returning id`, [clientId]);
const dealId = d.rows[0].id;
ok(!!dealId, 'manager: sale saved');
await fails('sales@test.tj', "insert into public.deals (flat_id, client_id, kind, price) values ('A5-3', $1, 'reserve', 0)", 'second live deal on the same flat', [clientId]);
const st2 = await as('anon', "select status from public.flat_status() where id = 'A5-3'");
ok(st2.rows[0].status === 'sold', 'anon: the sold flat shows as sold');

await as('sales@test.tj', "insert into public.payments (deal_id, amount, method) values ($1, 135000, 'cash')", [dealId]);
const pays = await as('sales@test.tj', 'select amount::float8 a, created_by from public.payments');
ok(pays.rows.length === 1 && pays.rows[0].a === 135000, 'manager: payment saved');
const u1 = await as('sales@test.tj', 'update public.payments set amount = 1 returning id');
ok(u1.rows.length === 0, 'manager: cannot change a payment');
const del1 = await as('sales@test.tj', 'delete from public.payments returning id');
ok(del1.rows.length === 0, 'manager: cannot delete a payment');
const pr = await as('sales@test.tj', "update public.flats set price_m2 = 1 where id = 'A3-0' returning id");
ok(pr.rows.length === 0, 'manager: cannot change prices');
const dd = await as('sales@test.tj', 'delete from public.deals returning id');
ok(dd.rows.length === 0, 'manager: cannot delete a deal');
await fails('sales@test.tj', "insert into public.payments (deal_id, amount) values ($1, 0)", 'a zero payment', [dealId]);

// the admin
const pr2 = await as('boss@test.tj', "update public.flats set price_m2 = 7400 where floor = 5 returning id, updated_by");
ok(pr2.rows.length === 9 && pr2.rows[0].updated_by === 'boss@test.tj', 'admin: sets prices of a floor');
const del2 = await as('boss@test.tj', 'delete from public.payments returning id');
ok(del2.rows.length === 1, 'admin: deletes a payment');

// reservations and flats off sale
await as('sales@test.tj', `insert into public.deals (flat_id, client_id, kind, reserve_until) values
  ('A3-0', $1, 'reserve', current_date + 3), ('A3-1', $1, 'reserve', current_date - 2), ('A3-2', $1, 'reserve', null)`, [clientId]);
await as('boss@test.tj', "update public.flats set on_sale = false where id in ('A10-8', 'A3-1')");
const st3 = Object.fromEntries((await as('anon', 'select * from public.flat_status()')).rows.map((r) => [r.id, r.status]));
ok(st3['A3-0'] === 'reserved', 'reservation until a future date: reserved');
ok(st3['A3-1'] === 'closed', 'expired reservation of a flat off sale: closed');
ok(st3['A3-2'] === 'reserved', 'reservation without an end date: reserved');
ok(st3['A10-8'] === 'closed', 'flat taken off sale: closed');
await as('boss@test.tj', "update public.flats set on_sale = true where id = 'A3-1'");
ok((await as('anon', "select status from public.flat_status() where id = 'A3-1'")).rows[0].status === 'free', 'expired reservation: free on the site');

// cancelling frees the flat; a new deal can then be made
await as('sales@test.tj', "update public.deals set status = 'cancelled', cancelled_at = now() where id = $1", [dealId]);
ok((await as('anon', "select status from public.flat_status() where id = 'A5-3'")).rows[0].status === 'free', 'cancelled sale: the flat is free again');
await as('sales@test.tj', "insert into public.deals (flat_id, client_id, kind, price) values ('A5-3', $1, 'sale', 1)", [clientId]);
ok(true, 'a new deal on the freed flat');

// jsonb settings round-trip as the CRM writes them
await as('boss@test.tj', "update public.settings set value = '\"USD\"' where key = 'currency'");
ok((await as('sales@test.tj', "select value from public.settings where key = 'currency'")).rows[0].value === 'USD', 'settings: currency');
await fails('sales@test.tj', "insert into public.settings (key, value) values ('x', '1')", 'manager: change settings');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

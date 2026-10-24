-- CRM продаж «Хоча сохтмон»: база данных (Supabase, Postgres).
--
-- Установка: Supabase → SQL Editor → New query → вставьте весь этот файл → в самом конце впишите
-- свою почту администратора вместо admin@example.com → Run. Запускать повторно можно: таблицы и
-- данные останутся, обновятся только правила.
--
-- Что здесь: квартиры с ценами (flats), клиенты (clients), сделки — продажи и брони (deals),
-- платежи (payments), сотрудники с ролями (staff), настройки (settings).
-- Доступ: читать и менять данные могут только сотрудники из staff (вошедшие в CRM); цены,
-- удаление записей, исправление платежей и список сотрудников — только администратор.
-- 3D-сайт без входа получает только статус квартир: функция flat_status() (свободна / бронь /
-- продана / не в продаже), без цен и без имён.

-- ---------- tables ----------
create table if not exists public.flats (
  id text primary key,                     -- как на 3D-сайте: 'A5-3' = 5 этаж, 4-я квартира плана этажа
  number int not null unique,              -- № квартиры
  floor int not null,
  rooms int not null,
  area numeric(8, 2) not null,             -- м²
  price_m2 numeric(14, 2) check (price_m2 is null or price_m2 >= 0),
  price numeric(14, 2) check (price is null or price >= 0), -- своя цена; пусто = price_m2 × area
  on_sale boolean not null default true,   -- false: снята с продажи
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone2 text,
  passport text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  flat_id text not null references public.flats (id),
  client_id uuid not null references public.clients (id),
  kind text not null default 'sale' check (kind in ('sale', 'reserve')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  contract_no text,
  date date not null default current_date, -- дата договора (брони)
  reserve_until date,                      -- бронь до
  list_price numeric(14, 2),               -- цена по прайсу на день сделки
  price numeric(14, 2) not null default 0 check (price >= 0), -- цена договора
  plan text not null default 'full' check (plan in ('full', 'installment', 'mortgage')),
  down_payment numeric(14, 2) not null default 0 check (down_payment >= 0),
  term int not null default 0 check (term >= 0),            -- месяцев рассрочки
  rate numeric(7, 3) not null default 0 check (rate >= 0),  -- % годовых (или наценка, %)
  method text not null default 'annuity' check (method in ('annuity', 'diff', 'markup')),
  first_due date,                          -- первый ежемесячный платёж / выплата банка / дата оплаты
  bank text,
  bank_rate numeric(7, 3),
  bank_term int,
  schedule jsonb not null default '[]'::jsonb, -- график: [{n, due, kind, principal, interest, amount, left}]
  note text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
-- одна действующая сделка на квартиру
create unique index if not exists deals_one_live_per_flat on public.deals (flat_id) where status = 'active';
create index if not exists deals_client on public.deals (client_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  date date not null default current_date,
  amount numeric(14, 2) not null check (amount <> 0), -- меньше нуля: возврат клиенту
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'other')),
  receipt text,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists payments_deal on public.payments (deal_id);

create table if not exists public.staff (
  email text primary key check (email = lower(email)),
  name text,
  role text not null default 'manager' check (role in ('admin', 'manager')),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.settings (
  key text primary key,
  value jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- who and when (filled by the database, not by the browser) ----------
create or replace function public.crm_stamp() returns trigger
language plpgsql set search_path = public as $$
declare
  who text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := who;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := who;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['flats', 'clients', 'deals', 'payments', 'staff', 'settings'] loop
    execute format('drop trigger if exists crm_stamp on public.%I', t);
    execute format('create trigger crm_stamp before insert or update on public.%I for each row execute function public.crm_stamp()', t);
  end loop;
end $$;

-- ---------- access ----------
-- the role of whoever is signed in: 'admin', 'manager', or null (not on the staff list)
create or replace function public.crm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
revoke all on function public.crm_role() from public;
grant execute on function public.crm_role() to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.flats, public.clients, public.deals, public.payments, public.staff, public.settings to authenticated;
revoke all on public.flats, public.clients, public.deals, public.payments, public.staff, public.settings from anon;

do $$
declare
  t text;
  -- table: who may read, add, change, delete ('staff' = any employee, 'admin')
  rules jsonb := '{
    "flats":    ["staff", "staff", "admin", "admin"],
    "clients":  ["staff", "staff", "staff", "admin"],
    "deals":    ["staff", "staff", "staff", "admin"],
    "payments": ["staff", "staff", "admin", "admin"],
    "staff":    ["staff", "admin", "admin", "admin"],
    "settings": ["staff", "admin", "admin", "admin"]
  }';
  who text;
  cond text;
  ops text[] := array['select', 'insert', 'update', 'delete'];
  i int;
begin
  for t in select jsonb_object_keys(rules) loop
    execute format('alter table public.%I enable row level security', t);
    for i in 1..4 loop
      who := rules -> t ->> (i - 1);
      cond := case who when 'admin' then 'public.crm_role() = ''admin''' else 'public.crm_role() is not null' end;
      execute format('drop policy if exists %I on public.%I', t || '_' || ops[i], t);
      execute format(
        case ops[i]
          when 'select' then 'create policy %I on public.%I for select to authenticated using (%s)'
          when 'insert' then 'create policy %I on public.%I for insert to authenticated with check (%s)'
          when 'update' then 'create policy %I on public.%I for update to authenticated using (%3$s) with check (%3$s)'
          else 'create policy %I on public.%I for delete to authenticated using (%s)'
        end, t || '_' || ops[i], t, cond);
    end loop;
  end loop;
end $$;

-- ---------- what the 3D site may see: each flat's status, nothing else ----------
-- sold: a live sale; reserved: a live reservation not past its date; closed: taken off sale;
-- free: everything else (the CRM uses the same rule: crm/src/calc.js publicStatus)
create or replace function public.flat_status()
returns table (id text, status text)
language sql stable security definer set search_path = public as $$
  select f.id,
    case
      when d.kind = 'sale' then 'sold'
      when d.kind = 'reserve' and (d.reserve_until is null or d.reserve_until >= (now() at time zone 'Asia/Dushanbe')::date) then 'reserved'
      when not f.on_sale then 'closed'
      else 'free'
    end
  from public.flats f
  left join public.deals d on d.flat_id = f.id and d.status = 'active'
  order by f.number
$$;
revoke all on function public.flat_status() from public;
grant execute on function public.flat_status() to anon, authenticated;

-- ---------- live updates in the CRM (several people at once) ----------
do $$
declare t text;
begin
  foreach t in array array['flats', 'clients', 'deals', 'payments', 'staff', 'settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;

-- ---------- the house's 72 flats (from the site's model: crm/supabase/flats.mjs) ----------
-- flats: begin
insert into public.flats (id, number, floor, rooms, area) values
  ('A3-0', 1, 3, 2, 65.9),
  ('A3-1', 2, 3, 1, 56.4),
  ('A3-2', 3, 3, 3, 88.6),
  ('A3-3', 4, 3, 2, 65.9),
  ('A3-4', 5, 3, 2, 64.3),
  ('A3-5', 6, 3, 1, 54.4),
  ('A3-6', 7, 3, 1, 53.6),
  ('A3-7', 8, 3, 1, 54.4),
  ('A3-8', 9, 3, 2, 64.3),
  ('A4-0', 10, 4, 2, 65.9),
  ('A4-1', 11, 4, 1, 56.4),
  ('A4-2', 12, 4, 3, 88.6),
  ('A4-3', 13, 4, 2, 65.9),
  ('A4-4', 14, 4, 2, 64.3),
  ('A4-5', 15, 4, 1, 54.4),
  ('A4-6', 16, 4, 1, 53.6),
  ('A4-7', 17, 4, 1, 54.4),
  ('A4-8', 18, 4, 2, 64.3),
  ('A5-0', 19, 5, 2, 65.9),
  ('A5-1', 20, 5, 1, 56.4),
  ('A5-2', 21, 5, 3, 88.6),
  ('A5-3', 22, 5, 2, 65.9),
  ('A5-4', 23, 5, 2, 64.3),
  ('A5-5', 24, 5, 1, 54.4),
  ('A5-6', 25, 5, 1, 53.6),
  ('A5-7', 26, 5, 1, 54.4),
  ('A5-8', 27, 5, 2, 64.3),
  ('A6-0', 28, 6, 2, 65.9),
  ('A6-1', 29, 6, 1, 56.4),
  ('A6-2', 30, 6, 3, 88.6),
  ('A6-3', 31, 6, 2, 65.9),
  ('A6-4', 32, 6, 2, 64.3),
  ('A6-5', 33, 6, 1, 54.4),
  ('A6-6', 34, 6, 1, 53.6),
  ('A6-7', 35, 6, 1, 54.4),
  ('A6-8', 36, 6, 2, 64.3),
  ('A7-0', 37, 7, 2, 65.9),
  ('A7-1', 38, 7, 1, 56.4),
  ('A7-2', 39, 7, 3, 88.6),
  ('A7-3', 40, 7, 2, 65.9),
  ('A7-4', 41, 7, 2, 64.3),
  ('A7-5', 42, 7, 1, 54.4),
  ('A7-6', 43, 7, 1, 53.6),
  ('A7-7', 44, 7, 1, 54.4),
  ('A7-8', 45, 7, 2, 64.3),
  ('A8-0', 46, 8, 2, 65.9),
  ('A8-1', 47, 8, 1, 56.4),
  ('A8-2', 48, 8, 3, 88.6),
  ('A8-3', 49, 8, 2, 65.9),
  ('A8-4', 50, 8, 2, 64.3),
  ('A8-5', 51, 8, 1, 54.4),
  ('A8-6', 52, 8, 1, 53.6),
  ('A8-7', 53, 8, 1, 54.4),
  ('A8-8', 54, 8, 2, 64.3),
  ('A9-0', 55, 9, 2, 65.9),
  ('A9-1', 56, 9, 1, 56.4),
  ('A9-2', 57, 9, 3, 88.6),
  ('A9-3', 58, 9, 2, 65.9),
  ('A9-4', 59, 9, 2, 64.3),
  ('A9-5', 60, 9, 1, 54.4),
  ('A9-6', 61, 9, 1, 53.6),
  ('A9-7', 62, 9, 1, 54.4),
  ('A9-8', 63, 9, 2, 64.3),
  ('A10-0', 64, 10, 2, 65.9),
  ('A10-1', 65, 10, 1, 56.4),
  ('A10-2', 66, 10, 3, 88.6),
  ('A10-3', 67, 10, 2, 65.9),
  ('A10-4', 68, 10, 2, 64.3),
  ('A10-5', 69, 10, 1, 54.4),
  ('A10-6', 70, 10, 1, 53.6),
  ('A10-7', 71, 10, 1, 54.4),
  ('A10-8', 72, 10, 2, 64.3)
on conflict (id) do update set number = excluded.number, floor = excluded.floor, rooms = excluded.rooms, area = excluded.area;
-- flats: end

insert into public.settings (key, value) values
  ('currency', '"TJS"'),
  ('company', '"ЧДММ «Хоча сохтмон»"')
on conflict (key) do nothing;

-- ---------- the first administrator: ВПИШИТЕ СВОЮ ПОЧТУ (с ней вы войдёте в CRM) ----------
insert into public.staff (email, name, role) values (lower('admin@example.com'), 'Администратор', 'admin')
on conflict (email) do update set role = 'admin';

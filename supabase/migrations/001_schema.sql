-- =====================================================================
-- PASTEL TREATS — database schema (Supabase / PostgreSQL)
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Then run 002_seed.sql for the starter menu & settings.
-- =====================================================================

-- (no extensions needed: gen_random_uuid() is built into Postgres)

-- ---------------------------------------------------------------------
-- 1. Business settings (one row, edited from Admin → Settings)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.setting(key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select data -> key from public.settings where id = 1
$$;

-- ---------------------------------------------------------------------
-- 2. Admin users & roles
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key,
  email text,
  role text not null default 'owner' check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now()
);

-- Only ONE e-mail may ever use the baker's dashboard. Change it here if the bakery e-mail changes.
create or replace function public.admin_email()
returns text language sql immutable as $$ select 'pasteltreatsdgl@gmail.com'::text $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and lower(coalesce(auth.jwt() ->> 'email', '')) = public.admin_email()
$$;

create or replace function public.admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.admins
   where user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = public.admin_email()
$$;

-- Only the bakery e-mail can claim the owner role (and only if it isn't already set up).
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> public.admin_email() then return false; end if;
  if exists (select 1 from public.admins where lower(email) = public.admin_email()) then return false; end if;
  insert into public.admins(user_id, email, role) values (auth.uid(), public.admin_email(), 'owner')
    on conflict (user_id) do update set role = 'owner', email = excluded.email;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  sort int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- Option lists are stored as JSON arrays of {name, price} (price = extra charge in ₹)
-- weights: [{label:'500 g', price:800}, {label:'1 kg', price:1500}] (price = full price at that size)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  images text[] not null default '{}',
  base_price int not null default 0 check (base_price >= 0),
  unit_label text default 'cake',
  weights jsonb not null default '[]'::jsonb,
  flavours jsonb not null default '[]'::jsonb,
  fillings jsonb not null default '[]'::jsonb,
  frostings jsonb not null default '[]'::jsonb,
  designs jsonb not null default '[]'::jsonb,
  egg_options jsonb not null default '[]'::jsonb,
  allergens text,
  dietary text,
  occasions text[] not null default '{}',
  lead_time_hours int,                 -- null = use business default (48)
  max_per_day int,                     -- null = no product-specific limit
  min_qty int not null default 1,           -- e.g. choux: minimum 4 pieces
  max_qty int not null default 50,
  pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed','per_kg')), -- per_kg: flavour price = rate per kg, size has a kg value
  courier_ok boolean not null default false, -- can be sent by courier
  cost_percent numeric,                      -- estimated ingredient+packing cost as % of price (for profit insights)
  is_available boolean not null default true,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  customizable boolean not null default true,
  allow_message boolean not null default true,
  seasonal_note text,
  available_from date,
  available_to date,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price int not null default 0 check (price >= 0),
  active boolean not null default true,
  sort int not null default 0
);

-- ---------------------------------------------------------------------
-- 4. Scheduling
-- ---------------------------------------------------------------------
create table if not exists public.time_slots (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_time time not null,
  end_time time not null,
  capacity int not null default 3 check (capacity >= 0),
  for_pickup boolean not null default true,
  for_delivery boolean not null default true,
  active boolean not null default true,
  weekdays int[], -- null = every day; else 0=Sun … 6=Sat
  sort int not null default 0
);
alter table public.time_slots add column if not exists weekdays int[];

create table if not exists public.order_counters (yr int primary key, last_no int not null default 0);
alter table public.order_counters enable row level security; -- no policies: only the order function can touch it

create table if not exists public.blackout_dates (
  day date primary key,
  reason text
);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pincodes text[] not null default '{}',
  charge int not null default 0 check (charge >= 0),
  free_above int,
  active boolean not null default true,
  sort int not null default 0
);

-- ---------------------------------------------------------------------
-- 5. Customers
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9+]', '', 'g');
  if d like '+%' then return '+' || regexp_replace(d, '[^0-9]', '', 'g'); end if;
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if length(d) = 10 then return '+91' || d; end if;
  if length(d) = 11 and d like '0%' then return '+91' || substr(d, 2); end if;
  if length(d) = 12 and d like '91%' then return '+' || d; end if;
  if length(d) between 8 and 15 then return '+' || d; end if;
  return null;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,            -- normalised, e.g. +919876543210
  phone_verified boolean not null default false,
  whatsapp text,
  email text,
  auth_user_id uuid unique,
  birthday date,
  anniversary date,
  notes text,
  preferred_reminder text default 'whatsapp',
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_email_idx on public.customers (lower(email));
-- where the customer orders from (state + district/city), filled at checkout and editable
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists city text;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text default 'Home',
  line text not null,
  area text,
  city text,
  pincode text,
  landmark text,
  created_at timestamptz not null default now()
);

create table if not exists public.occasions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null default 'Birthday',     -- Birthday, Anniversary, Spouse birthday, Child birthday, Other
  person_name text,
  occasion_date date not null,               -- the year part is ignored when repeats = true
  repeats boolean not null default true,
  preferred_flavour text,
  preferred_design text,
  budget int,
  notes text,
  last_order_id uuid,
  source text default 'admin',               -- admin | checkout | customer
  created_at timestamptz not null default now()
);
create index if not exists occasions_md_idx on public.occasions ((extract(month from occasion_date)), (extract(day from occasion_date)));

-- ---------------------------------------------------------------------
-- 6. Orders, payments, history
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  idempotency_key text unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  phone text not null,
  whatsapp text,
  email text,
  status text not null default 'submitted' check (status in (
    'draft','submitted','awaiting_payment','payment_verification','advance_received',
    'confirmed','in_preparation','ready','out_for_delivery','completed',
    'cancelled','refund_pending','refunded')),
  payment_status text not null default 'not_paid' check (payment_status in (
    'not_paid','proof_uploaded','verification_pending','part_paid','advance_received',
    'fully_paid','payment_failed','refund_pending','refunded')),
  payment_method text not null default 'upi' check (payment_method in ('upi','cash','gateway')),
  items jsonb not null,                 -- frozen snapshot of the cakes, options & agreed prices
  subtotal int not null default 0,
  delivery_charge int not null default 0,
  discount int not null default 0,
  total int not null default 0,
  advance_due int not null default 0,
  amount_paid int not null default 0,
  is_custom boolean not null default false,
  quote_status text not null default 'n/a' check (quote_status in ('n/a','pending','quoted','approved','rejected')),
  quote_note text,
  fulfilment text not null check (fulfilment in ('pickup','delivery','courier')),
  address jsonb,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  needs_delivery_approval boolean not null default false,
  requested_date date not null,
  slot_id uuid references public.time_slots(id) on delete set null,
  slot_label text,
  alt_date date,
  alt_slot_label text,
  confirmed_date date,
  confirmed_slot_label text,
  actual_handover_at timestamptz,
  occasion text,
  occasion_date date,
  notes text,
  admin_notes text,
  reference_images text[] not null default '{}',
  gateway_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_state text;
alter table public.orders add column if not exists customer_city text;
-- products that are ordered by messaging the baker (hampers, seasonal, price on request)
alter table public.products add column if not exists enquiry_only boolean not null default false;

-- private link token: lets the customer open their order by tapping a link (no typing)
alter table public.orders add column if not exists access_token text default substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
update public.orders set access_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 14) where access_token is null;
create unique index if not exists orders_access_token_idx on public.orders (access_token);
create index if not exists orders_phone_idx on public.orders (phone);
create index if not exists orders_date_idx on public.orders (coalesce(confirmed_date, requested_date));
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at);

create table if not exists public.order_status_history (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists osh_order_idx on public.order_status_history (order_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null default 'advance' check (kind in ('advance','balance','refund')),
  method text not null default 'upi' check (method in ('upi','cash','gateway','bank','other')),
  amount int not null check (amount >= 0),
  reference text,                 -- UPI transaction ID / gateway payment id
  status text not null default 'pending' check (status in ('pending','verified','rejected','failed')),
  proof_path text,
  note text,
  recorded_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments (order_id);
create unique index if not exists payments_reference_uq on public.payments (method, reference) where reference is not null and reference <> '' and status <> 'rejected';

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  occasion_id uuid references public.occasions(id) on delete cascade,
  channel text not null default 'whatsapp',
  template text not null,
  message text,
  status text not null default 'sent_manually',
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Customer reviews: only someone holding a real order's private link can write one (one per order).
-- They stay hidden until the baker approves them in the dashboard.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null check (length(body) between 3 and 600),
  display_name text,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reviews_approved_idx on public.reviews (approved, created_at desc);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Triggers: timestamps, status history, audit trail, payment roll-up
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers for each row execute function public.touch_updated_at();

create or replace function public.log_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history(order_id, from_status, to_status, note, actor)
    values (new.id, null, new.status, 'Order placed', auth.uid());
  elsif new.status is distinct from old.status then
    insert into order_status_history(order_id, from_status, to_status, note, actor)
    values (new.id, old.status, new.status, nullif(current_setting('app.status_note', true), ''), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_status on public.orders;
create trigger trg_orders_status after insert or update of status on public.orders for each row execute function public.log_status_change();

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare diff jsonb := '{}'::jsonb; k text; o jsonb; n jsonb;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
    insert into audit_logs(actor, action, entity, entity_id, details)
    values (auth.uid(), 'update', tg_table_name, coalesce(n ->> 'id', n ->> 'day'), diff);
    return new;
  elsif tg_op = 'INSERT' then
    insert into audit_logs(actor, action, entity, entity_id, details)
    values (auth.uid(), 'insert', tg_table_name, coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'day'), null);
    return new;
  else
    insert into audit_logs(actor, action, entity, entity_id, details)
    values (auth.uid(), 'delete', tg_table_name, coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'day'), to_jsonb(old));
    return old;
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['orders','products','categories','addons','settings','time_slots','delivery_zones','blackout_dates','payments','customers','admins'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Recalculate amount paid & payment status whenever a payment changes
create or replace function public.recalc_order_payment(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; paid int; refunded int; refund_pending int; proofs int; ps text; new_status text;
begin
  select * into o from orders where id = p_order for update;
  if not found then return; end if;
  select coalesce(sum(amount) filter (where kind <> 'refund' and status = 'verified'), 0),
         coalesce(sum(amount) filter (where kind = 'refund' and status = 'verified'), 0),
         count(*) filter (where kind = 'refund' and status = 'pending'),
         count(*) filter (where kind <> 'refund' and status = 'pending')
    into paid, refunded, refund_pending, proofs
    from payments where order_id = p_order;

  if refund_pending > 0 then ps := 'refund_pending';
  elsif refunded > 0 then ps := 'refunded';
  elsif paid >= o.total and o.total > 0 then ps := 'fully_paid';
  elsif paid >= o.advance_due and paid > 0 then ps := 'advance_received';
  elsif proofs > 0 then ps := 'verification_pending';
  elsif paid > 0 then ps := 'part_paid';
  else ps := 'not_paid';
  end if;

  new_status := o.status;
  if o.status in ('awaiting_payment','payment_verification','submitted') and ps in ('advance_received','fully_paid') and o.quote_status in ('n/a','approved') then
    new_status := 'advance_received';
  elsif o.status = 'awaiting_payment' and ps = 'verification_pending' then
    new_status := 'payment_verification';
  elsif o.status = 'payment_verification' and ps in ('not_paid','part_paid') then
    new_status := 'awaiting_payment';
  end if;
  if ps = 'refund_pending' and o.status = 'cancelled' then new_status := 'refund_pending'; end if;
  if ps = 'refunded' and o.status in ('cancelled','refund_pending') then new_status := 'refunded'; end if;

  update orders set amount_paid = paid - refunded, payment_status = ps, status = new_status where id = p_order;
end $$;

create or replace function public.payments_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.status = 'verified' and new.verified_at is null then
    new.verified_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_payments_before on public.payments;
create trigger trg_payments_before before insert or update on public.payments for each row execute function public.payments_changed();

create or replace function public.payments_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalc_order_payment(coalesce(new.order_id, old.order_id));
  return null;
end $$;
drop trigger if exists trg_payments_after on public.payments;
create trigger trg_payments_after after insert or update or delete on public.payments for each row execute function public.payments_after();

-- Re-roll payment status if the admin changes total / advance (e.g. after a custom quote)
create or replace function public.orders_amount_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.total is distinct from old.total) or (new.advance_due is distinct from old.advance_due) then
    perform recalc_order_payment(new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_orders_amount on public.orders;
create trigger trg_orders_amount after update of total, advance_due on public.orders for each row execute function public.orders_amount_changed();

-- ---------------------------------------------------------------------
-- 8. Scheduling helpers (server clock, bakery timezone)
-- ---------------------------------------------------------------------
create or replace function public.bakery_tz() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select data ->> 'timezone' from settings where id = 1), 'Asia/Kolkata')
$$;

-- Orders that occupy capacity on a day
create or replace function public.active_status(s text) returns boolean language sql immutable as $$
  select s not in ('draft','cancelled','refund_pending','refunded')
$$;

create or replace function public.slot_load(p_day date, p_slot uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from orders
   where active_status(status)
     and coalesce(confirmed_date, requested_date) = p_day
     and slot_id = p_slot
$$;

-- Availability calendar for the storefront
-- p_products: product ids in the cart (their lead times apply); p_mode: 'pickup' | 'delivery'
create or replace function public.get_availability(p_from date, p_to date, p_products uuid[] default '{}', p_mode text default 'pickup')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz text := bakery_tz();
  now_local timestamp := (now() at time zone tz);
  lead int;
  earliest timestamp;
  closed int[];
  max_day int; max_deliv int;
  d date; result jsonb := '[]'::jsonb; slots jsonb; s record;
  day_load int; deliv_load int; reason text; rem int; elig boolean; prod_full boolean;
begin
  if p_to - p_from > 92 then p_to := p_from + 92; end if;
  select greatest(coalesce((data ->> 'lead_time_hours')::int, 48),
                  coalesce((select max(coalesce(lead_time_hours, 0)) from products where id = any(p_products)), 0)),
         coalesce(array(select jsonb_array_elements_text(data -> 'closed_weekdays')::int), '{}'),
         nullif(data ->> 'max_orders_per_day', '')::int,
         nullif(data ->> 'max_deliveries_per_day', '')::int
    into lead, closed, max_day, max_deliv
    from settings where id = 1;
  lead := coalesce(lead, 48);
  earliest := now_local + make_interval(hours => lead);

  d := p_from;
  while d <= p_to loop
    reason := null;
    if extract(dow from d)::int = any(closed) then reason := 'Closed';
    elsif exists (select 1 from blackout_dates b where b.day = d) then
      reason := coalesce((select b.reason from blackout_dates b where b.day = d), 'Unavailable');
    end if;
    select count(*) filter (where true), count(*) filter (where fulfilment = 'delivery')
      into day_load, deliv_load
      from orders where active_status(status) and coalesce(confirmed_date, requested_date) = d;
    if reason is null and max_day is not null and day_load >= max_day then reason := 'Fully booked'; end if;
    if reason is null and p_mode = 'delivery' and max_deliv is not null and deliv_load >= max_deliv then reason := 'Deliveries full'; end if;

    prod_full := false;
    if reason is null and array_length(p_products, 1) > 0 then
      select exists (
        select 1 from products p
         where p.id = any(p_products) and p.max_per_day is not null
           and (select coalesce(sum((it ->> 'qty')::int), 0) from orders o, jsonb_array_elements(o.items) it
                 where active_status(o.status) and coalesce(o.confirmed_date, o.requested_date) = d
                   and (it ->> 'product_id')::uuid = p.id) >= p.max_per_day
      ) into prod_full;
      if prod_full then reason := 'Sold out for this day'; end if;
    end if;

    slots := '[]'::jsonb;
    for s in select * from time_slots where active
               and ((p_mode in ('pickup','courier') and for_pickup) or (p_mode = 'delivery' and for_delivery))
               and (weekdays is null or cardinality(weekdays) = 0 or extract(dow from d)::int = any(weekdays))
             order by sort, start_time loop
      rem := greatest(s.capacity - slot_load(d, s.id), 0);
      elig := reason is null and (d + s.start_time) >= earliest and rem > 0;
      slots := slots || jsonb_build_object('id', s.id, 'label', s.label, 'start', s.start_time, 'remaining', rem,
                         'eligible', elig,
                         'why', case when reason is not null then reason
                                     when (d + s.start_time) < earliest then 'Order ' || lead || ' hrs (' || (lead / 24) || ' days) prior'
                                     when rem = 0 then 'Full' else null end);
    end loop;

    result := result || jsonb_build_object('date', d, 'reason', reason,
      'available', exists (select 1 from jsonb_array_elements(slots) x where (x ->> 'eligible')::boolean),
      'slots', slots);
    d := d + 1;
  end loop;

  return jsonb_build_object('now', now_local, 'earliest', earliest, 'lead_hours', lead, 'timezone', tz, 'days', result);
end $$;

-- ---------------------------------------------------------------------
-- 9. Pricing (server is the source of truth)
-- ---------------------------------------------------------------------
create or replace function public.option_price(opts jsonb, pick text) returns int language sql immutable as $$
  select coalesce((select (o ->> 'price')::int from jsonb_array_elements(coalesce(opts, '[]'::jsonb)) o
                    where o ->> 'name' = pick limit 1), 0)
$$;

create or replace function public.option_exists(opts jsonb, pick text) returns boolean language sql immutable as $$
  select pick is null or pick = '' or jsonb_array_length(coalesce(opts, '[]'::jsonb)) = 0
      or exists (select 1 from jsonb_array_elements(opts) o where o ->> 'name' = pick)
$$;

-- Price one cart line. Returns the frozen line snapshot (raises on invalid input).
create or replace function public.price_item(it jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p products; qty int; w jsonb; unit int; addon_total int := 0; a jsonb; ad addons; addons_out jsonb := '[]'::jsonb;
  extras jsonb := '[]'::jsonb; weight_label text; weight_price int; flav_extra int;
  f text := it ->> 'flavour'; fi text := it ->> 'filling'; fr text := it ->> 'frosting';
  de text := it ->> 'design'; eg text := it ->> 'egg';
begin
  select * into p from products where id = (it ->> 'product_id')::uuid;
  if not found or not p.is_active then raise exception 'ITEM_UNAVAILABLE: a selected item is no longer on the menu'; end if;
  if not p.is_available then raise exception 'ITEM_UNAVAILABLE: % is currently unavailable', p.name; end if;
  if p.enquiry_only then raise exception 'INVALID: please message us on WhatsApp to order %', p.name; end if;
  qty := greatest(coalesce((it ->> 'qty')::int, 1), 1);
  if qty > p.max_qty then raise exception 'INVALID: maximum quantity for % is %', p.name, p.max_qty; end if;
  if qty < p.min_qty then raise exception 'INVALID: minimum order for % is %', p.name, p.min_qty; end if;

  weight_label := it ->> 'weight';
  if jsonb_array_length(p.weights) > 0 then
    select x into w from jsonb_array_elements(p.weights) x where x ->> 'label' = weight_label limit 1;
    if w is null then raise exception 'INVALID: please choose a size for %', p.name; end if;
    if p.pricing_mode = 'per_kg' then
      -- cakes: flavour rate per kg x size in kg (e.g. vanilla 1600/kg x 0.5 kg = 800)
      weight_price := round(option_price(p.flavours, f) * coalesce((w ->> 'kg')::numeric, 1))::int;
    else
      weight_price := (w ->> 'price')::int;
    end if;
  else
    weight_price := p.base_price; weight_label := null;
  end if;

  if not option_exists(p.flavours, f) or not option_exists(p.fillings, fi) or not option_exists(p.frostings, fr)
     or not option_exists(p.designs, de) or not option_exists(p.egg_options, eg) then
    raise exception 'INVALID: one of the options for % is no longer offered', p.name;
  end if;

  flav_extra := case when p.pricing_mode = 'per_kg' then 0 else option_price(p.flavours, f) end;
  unit := weight_price + flav_extra + option_price(p.fillings, fi) + option_price(p.frostings, fr)
        + option_price(p.designs, de) + option_price(p.egg_options, eg);

  for a in select * from jsonb_array_elements(coalesce(it -> 'addons', '[]'::jsonb)) loop
    select * into ad from addons where id = (a ->> 'id')::uuid and active;
    if found then
      addon_total := addon_total + ad.price * greatest(coalesce((a ->> 'qty')::int, 1), 1);
      addons_out := addons_out || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', greatest(coalesce((a ->> 'qty')::int, 1), 1));
    end if;
  end loop;

  return jsonb_build_object(
    'product_id', p.id, 'name', p.name, 'image', p.images[1], 'unit_label', p.unit_label,
    'qty', qty, 'weight', weight_label, 'weight_price', weight_price,
    'flavour', f, 'filling', fi, 'frosting', fr, 'design', de, 'egg', eg,
    'option_charges', unit - weight_price,
    'unit_price', unit, 'addons', addons_out, 'addon_total', addon_total,
    'line_total', unit * qty + addon_total,
    'message', left(it ->> 'message', 120), 'name_on_cake', left(it ->> 'name_on_cake', 60),
    'age', left(it ->> 'age', 20), 'colours', left(it ->> 'colours', 120), 'theme', left(it ->> 'theme', 300),
    'instructions', left(it ->> 'instructions', 600),
    'custom_request', coalesce((it ->> 'custom_request')::boolean, false),
    'custom_description', left(it ->> 'custom_description', 1500),
    'reference_images', coalesce(it -> 'reference_images', '[]'::jsonb)
  );
end $$;

create or replace function public.calc_advance(total int) returns int
language plpgsql stable security definer set search_path = public as $$
declare mode text; val numeric;
begin
  select coalesce(data ->> 'advance_mode', 'percent'), coalesce((data ->> 'advance_value')::numeric, 50)
    into mode, val from settings where id = 1;
  if mode = 'fixed' then return least(total, val::int); end if;
  return ceil(total * val / 100.0)::int;
end $$;

-- Quote endpoint for the checkout page (same maths as place_order)
create or replace function public.quote_order(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare items jsonb := '[]'::jsonb; it jsonb; sub int := 0; z delivery_zones; dc int := 0; total int; pin text; zone_found boolean := false;
begin
  for it in select * from jsonb_array_elements(p -> 'items') loop
    it := price_item(it); items := items || it; sub := sub + (it ->> 'line_total')::int;
  end loop;
  if p ->> 'fulfilment' = 'delivery' then
    pin := regexp_replace(coalesce(p #>> '{address,pincode}', ''), '\s', '', 'g');
    select * into z from delivery_zones where active and pin = any(pincodes) order by sort limit 1;
    if found then
      zone_found := true;
      dc := case when z.free_above is not null and sub >= z.free_above then 0 else z.charge end;
    end if;
  end if;
  total := sub + dc;
  return jsonb_build_object('items', items, 'subtotal', sub, 'delivery_charge', dc, 'zone_found', zone_found,
                            'zone', case when zone_found then z.name end,
                            'total', total, 'advance_due', calc_advance(total), 'balance', total - calc_advance(total));
end $$;

-- ---------------------------------------------------------------------
-- 10. Place order (public). Re-validates price, lead time, capacity.
-- ---------------------------------------------------------------------
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  q jsonb; tz text := bakery_tz(); now_local timestamp; lead int; d date; slot time_slots; cust customers;
  v_phone text := normalize_phone(p ->> 'phone'); v_wa text := normalize_phone(coalesce(nullif(p ->> 'whatsapp', ''), p ->> 'phone'));
  v_custom boolean; needs_zone boolean := false; o orders; num text; v_method text := coalesce(p ->> 'payment_method', 'upi');
  s jsonb; avail jsonb; slot_ok boolean; prod_ids uuid[]; v_status text; refs text[];
begin
  -- duplicate submission protection
  if p ->> 'idempotency_key' is not null then
    select * into o from orders where idempotency_key = p ->> 'idempotency_key';
    if found then
      return jsonb_build_object('order_number', o.order_number, 'duplicate', true, 'total', o.total, 'advance_due', o.advance_due, 'status', o.status, 'link_token', o.access_token);
    end if;
  end if;

  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'INVALID: please enter your name'; end if;
  if v_phone is null then raise exception 'INVALID: please enter a valid mobile number'; end if;
  -- flood protection: max 3 new orders per mobile per hour, 40 per hour for the whole shop
  if (select count(*) from orders where phone = v_phone and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'RATE_LIMIT: you have placed several orders just now — please wait a little or message us on WhatsApp';
  end if;
  if (select count(*) from orders where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'RATE_LIMIT: we are receiving a lot of orders right now — please try again shortly or message us on WhatsApp';
  end if;
  if coalesce(jsonb_array_length(p -> 'items'), 0) = 0 then raise exception 'INVALID: your cart is empty'; end if;
  if jsonb_array_length(p -> 'items') > 10 then raise exception 'INVALID: too many items in one order'; end if;
  if coalesce(p ->> 'fulfilment', '') not in ('pickup','delivery','courier') then raise exception 'INVALID: choose pickup or courier'; end if;
  if not coalesce((p ->> 'accepted_policies')::boolean, false) then raise exception 'INVALID: please accept the ordering policy'; end if;

  s := (select data from settings where id = 1);
  if coalesce((s ->> 'orders_paused')::boolean, false) then
    raise exception 'PAUSED: %', coalesce(nullif(s ->> 'orders_paused_message', ''), 'We are not taking new orders right now.');
  end if;
  if p ->> 'fulfilment' = 'delivery' and not coalesce((s ->> 'home_delivery_enabled')::boolean, false) then
    raise exception 'INVALID: home delivery is not available — please choose self pickup';
  end if;
  if v_method = 'cash' and coalesce(s ->> 'cash_for', 'both') = 'balance' then
    raise exception 'INVALID: the advance must be paid online/UPI; cash is accepted for the balance only';
  end if;
  if v_method = 'cash' and p ->> 'fulfilment' = 'courier' then
    raise exception 'INVALID: courier orders are paid by UPI';
  end if;
  if v_method = 'cash' then
    if p ->> 'fulfilment' = 'pickup' and not coalesce((s ->> 'cash_pickup')::boolean, false) then raise exception 'INVALID: cash is not available for pickup orders'; end if;
    if p ->> 'fulfilment' = 'delivery' and not coalesce((s ->> 'cash_delivery')::boolean, false) then raise exception 'INVALID: cash is not available for delivery orders'; end if;
  elsif v_method = 'gateway' and not coalesce((s ->> 'gateway_enabled')::boolean, false) then
    raise exception 'INVALID: online payment is not enabled';
  end if;

  q := quote_order(p);
  if p ->> 'fulfilment' = 'courier' then
    if not coalesce((s ->> 'courier_enabled')::boolean, false) then raise exception 'INVALID: courier is not available right now'; end if;
    if exists (select 1 from jsonb_array_elements(q -> 'items') x join products pr on pr.id = (x ->> 'product_id')::uuid where not pr.courier_ok) then
      raise exception 'INVALID: some items in your cart cannot be couriered — please choose self pickup';
    end if;
    if coalesce(trim(p #>> '{address,line}'), '') = '' or coalesce(trim(p #>> '{address,pincode}'), '') = '' then
      raise exception 'INVALID: please enter the full courier address and PIN code';
    end if;
    needs_zone := true;   -- baker confirms the courier charge before payment
  end if;
  if p ->> 'fulfilment' = 'delivery' then
    if coalesce(trim(p #>> '{address,line}'), '') = '' or coalesce(trim(p #>> '{address,pincode}'), '') = '' then
      raise exception 'INVALID: please enter the full delivery address and PIN code';
    end if;
    if not (q ->> 'zone_found')::boolean then
      if coalesce((p ->> 'request_out_of_zone')::boolean, false) then needs_zone := true;
      else raise exception 'OUT_OF_ZONE: sorry, we do not deliver to this PIN code yet'; end if;
    end if;
  end if;

  -- date & slot validation on the SERVER clock (device clock is never trusted)
  d := (p ->> 'date')::date;
  -- courier orders only need a dispatch date; pickup/delivery need a time slot
  if p ->> 'fulfilment' = 'courier' and nullif(p ->> 'slot_id', '') is null then
    slot := null;
  else
    select * into slot from time_slots where id = (p ->> 'slot_id')::uuid and active;
    if not found then raise exception 'SLOT_UNAVAILABLE: please choose a time slot'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('pt-day-' || d::text));   -- serialise bookings for the day

  select array_agg((x ->> 'product_id')::uuid) into prod_ids from jsonb_array_elements(q -> 'items') x;
  avail := get_availability(d, d, prod_ids, p ->> 'fulfilment');
  if slot.id is null then
    slot_ok := coalesce((avail #>> '{days,0,available}')::boolean, false);
  else
    select (x ->> 'eligible')::boolean into slot_ok
      from jsonb_array_elements(avail #> '{days,0,slots}') x where (x ->> 'id')::uuid = slot.id;
  end if;
  if not coalesce(slot_ok, false) then
    raise exception 'SLOT_UNAVAILABLE: that date/time is no longer available (please order % hrs prior). Please pick another slot.', avail ->> 'lead_hours';
  end if;

  -- customer: match on normalised mobile number only; never overwrite existing details
  select * into cust from customers where customers.phone = v_phone;
  if not found then
    insert into customers(name, phone, whatsapp, email, state, city, marketing_consent, consent_at)
    values (upper(trim(p ->> 'name')), v_phone, v_wa, nullif(trim(p ->> 'email'), ''),
            nullif(left(trim(coalesce(p ->> 'state', '')), 60), ''), nullif(left(trim(coalesce(p ->> 'city', '')), 60), ''),
            coalesce((p ->> 'marketing_consent')::boolean, false),
            case when coalesce((p ->> 'marketing_consent')::boolean, false) then now() end)
    returning * into cust;
  else
    update customers set
      whatsapp = coalesce(customers.whatsapp, v_wa),
      email = coalesce(customers.email, nullif(trim(p ->> 'email'), '')),
      state = coalesce(nullif(left(trim(coalesce(p ->> 'state', '')), 60), ''), customers.state),
      city = coalesce(nullif(left(trim(coalesce(p ->> 'city', '')), 60), ''), customers.city),
      marketing_consent = case when coalesce((p ->> 'marketing_consent')::boolean, false) then true else customers.marketing_consent end,
      consent_at = case when coalesce((p ->> 'marketing_consent')::boolean, false) and not customers.marketing_consent then now() else customers.consent_at end
    where id = cust.id returning * into cust;
  end if;

  if p ->> 'fulfilment' in ('delivery','courier') and coalesce((p ->> 'save_address')::boolean, true)
     and not exists (select 1 from customer_addresses ca where ca.customer_id = cust.id and lower(ca.line) = lower(trim(p #>> '{address,line}'))) then
    insert into customer_addresses(customer_id, line, area, city, pincode, landmark)
    values (cust.id, trim(p #>> '{address,line}'), p #>> '{address,area}', p #>> '{address,city}', p #>> '{address,pincode}', p #>> '{address,landmark}');
  end if;

  v_custom := exists (select 1 from jsonb_array_elements(q -> 'items') x where (x ->> 'custom_request')::boolean);
  select coalesce(array_agg(r), '{}') into refs from (
    select jsonb_array_elements_text(x -> 'reference_images') r from jsonb_array_elements(q -> 'items') x) z;

  v_status := case when v_custom or needs_zone then 'submitted'
                 when v_method = 'cash' then 'submitted'
                 else 'awaiting_payment' end;

  -- Order ID = PT-<order no. this year>-<YY>, e.g. PT-1-26, PT-2-26 … restarts at 1 every new year
  loop
    insert into order_counters(yr, last_no) values (to_char(now() at time zone tz, 'YY')::int, 1)
      on conflict (yr) do update set last_no = order_counters.last_no + 1
      returning 'PT-' || last_no || '-' || lpad(yr::text, 2, '0') into num;
    exit when not exists (select 1 from orders where order_number = num);
  end loop;

  insert into orders(order_number, idempotency_key, customer_id, customer_name, phone, whatsapp, email, status,
    payment_method, items, subtotal, delivery_charge, total, advance_due, is_custom, quote_status,
    fulfilment, address, zone_id, needs_delivery_approval, requested_date, slot_id, slot_label,
    alt_date, alt_slot_label, occasion, occasion_date, notes, reference_images)
  values (num, p ->> 'idempotency_key', cust.id, upper(trim(p ->> 'name')), v_phone, v_wa, nullif(trim(p ->> 'email'), ''), v_status,
    v_method, q -> 'items', (q ->> 'subtotal')::int, (q ->> 'delivery_charge')::int, (q ->> 'total')::int, (q ->> 'advance_due')::int,
    v_custom, case when v_custom then 'pending' else 'n/a' end,
    p ->> 'fulfilment', case when p ->> 'fulfilment' in ('delivery','courier') then p -> 'address' end,
    (select id from delivery_zones where active and regexp_replace(coalesce(p #>> '{address,pincode}', ''), '\s', '', 'g') = any(pincodes) limit 1),
    needs_zone, d, slot.id, coalesce(slot.label, case when p ->> 'fulfilment' = 'courier' then 'Courier dispatch' end),
    nullif(p ->> 'alt_date', '')::date, nullif(p ->> 'alt_slot_label', ''),
    nullif(p ->> 'occasion', ''), nullif(p ->> 'occasion_date', '')::date, left(p ->> 'notes', 1000), refs)
  returning * into o;
  update orders set customer_state = cust.state, customer_city = cust.city where id = o.id returning * into o;

  -- optional: remember the occasion for yearly reminders (only if the customer opted in)
  if coalesce((p ->> 'remember_occasion')::boolean, false) and nullif(p ->> 'occasion_date', '') is not null then
    insert into occasions(customer_id, kind, person_name, occasion_date, repeats, preferred_flavour, last_order_id, source)
    values (cust.id, coalesce(nullif(p ->> 'occasion', ''), 'Other'), nullif(p ->> 'occasion_person', ''),
            (p ->> 'occasion_date')::date, true, q #>> '{items,0,flavour}', o.id, 'checkout');
  end if;

  return jsonb_build_object('order_number', o.order_number, 'status', o.status, 'total', o.total,
    'advance_due', o.advance_due, 'subtotal', o.subtotal, 'delivery_charge', o.delivery_charge,
    'is_custom', o.is_custom, 'needs_delivery_approval', o.needs_delivery_approval, 'duplicate', false, 'link_token', o.access_token);
end $$;

-- ---------------------------------------------------------------------
-- 11. Customer self-service (needs order number + the same mobile number)
-- ---------------------------------------------------------------------
create table if not exists public.lookup_attempts (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create or replace function public.rate_limit(p_key text, p_max int, p_window interval) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from lookup_attempts where created_at < now() - interval '1 day';
  if (select count(*) from lookup_attempts where key = p_key and created_at > now() - p_window) >= p_max then
    raise exception 'RATE_LIMIT: too many attempts, please wait a few minutes';
  end if;
  insert into lookup_attempts(key) values (p_key);
end $$;

create or replace function public.order_public_view(o orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
    'payment_method', o.payment_method, 'customer_name', o.customer_name,
    'items', o.items, 'subtotal', o.subtotal, 'delivery_charge', o.delivery_charge, 'discount', o.discount,
    'total', o.total, 'advance_due', o.advance_due, 'amount_paid', o.amount_paid,
    'balance', o.total - o.amount_paid, 'is_custom', o.is_custom, 'quote_status', o.quote_status, 'quote_note', o.quote_note,
    'fulfilment', o.fulfilment, 'address', o.address, 'requested_date', o.requested_date, 'slot_label', o.slot_label,
    'confirmed_date', o.confirmed_date, 'confirmed_slot_label', o.confirmed_slot_label,
    'needs_delivery_approval', o.needs_delivery_approval, 'created_at', o.created_at, 'link_token', o.access_token,
    'review', (select jsonb_build_object('rating', r.rating, 'body', r.body, 'approved', r.approved, 'at', r.created_at) from reviews r where r.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('to', h.to_status, 'at', h.created_at) order by h.created_at), '[]')
                  from order_status_history h where h.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('kind', y.kind, 'method', y.method, 'amount', y.amount, 'status', y.status, 'at', y.created_at) order by y.created_at), '[]')
                  from payments y where y.order_id = o.id)
  )
$$;

create or replace function public.get_order(p_number text, p_phone text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  perform rate_limit('lookup:' || coalesce(normalize_phone(p_phone), p_phone), 10, interval '10 minutes');
  -- also limit guesses per Order ID, so nobody can try one ID against many mobile numbers
  perform rate_limit('lookup-id:' || upper(trim(coalesce(p_number, ''))), 10, interval '10 minutes');
  select * into o from orders where order_number = upper(trim(p_number)) and phone = normalize_phone(p_phone);
  -- return (not raise) so the attempt counter above is kept for rate limiting
  if not found then return jsonb_build_object('error', 'NOT_FOUND: we could not find an order with that number and mobile'); end if;
  return order_public_view(o);
end $$;

-- Track by mobile number only: list that number's orders (no address shown)
-- Open an order from its private link (the token is long and random, so it can't be guessed)
create or replace function public.get_order_by_link(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders;
begin
  if coalesce(length(trim(p_token)), 0) < 12 then return jsonb_build_object('error', 'NOT_FOUND: this order link is not valid'); end if;
  select * into o from orders where access_token = trim(p_token);
  if not found then return jsonb_build_object('error', 'NOT_FOUND: this order link is not valid'); end if;
  return order_public_view(o) || jsonb_build_object('phone', o.phone);
end $$;
grant execute on function public.get_order_by_link(text) to anon, authenticated;

-- Reviews: written from the order's private link, shown only after the baker approves
create or replace function public.submit_review(p_token text, p_rating int, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders; d date;
begin
  perform rate_limit('review:' || coalesce(trim(p_token), ''), 5, interval '10 minutes');
  if coalesce(length(trim(p_token)), 0) < 12 then return jsonb_build_object('error', 'NOT_FOUND: this order link is not valid'); end if;
  select * into o from orders where access_token = trim(p_token);
  if not found then return jsonb_build_object('error', 'NOT_FOUND: this order link is not valid'); end if;
  d := coalesce(o.confirmed_date, o.requested_date);
  if o.status not in ('advance_received','confirmed','in_preparation','ready','out_for_delivery','completed')
     or (o.status <> 'completed' and d > (now() at time zone 'Asia/Kolkata')::date) then
    raise exception 'INVALID: you can review once your order has been handed over';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'INVALID: please choose 1 to 5 stars'; end if;
  if length(trim(coalesce(p_body, ''))) < 3 then raise exception 'INVALID: please write a few words'; end if;
  if exists (select 1 from reviews where order_id = o.id) then raise exception 'INVALID: you have already reviewed this order — thank you!'; end if;
  insert into reviews(order_id, rating, body, display_name)
  values (o.id, p_rating, left(trim(p_body), 600), initcap(split_part(trim(o.customer_name), ' ', 1)));
  return order_public_view(o);
end $$;

-- Approved reviews for the home page: first name, stars, words, date and order number
create or replace function public.get_public_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
    select jsonb_build_object('name', r.display_name, 'rating', r.rating, 'body', r.body, 'at', r.created_at, 'order_number', o.order_number) x
    from reviews r join orders o on o.id = r.order_id where r.approved order by r.created_at desc limit 30) t
$$;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;
grant execute on function public.get_public_reviews() to anon, authenticated;

-- (Privacy) There is deliberately NO way to list orders by mobile number alone.
drop function if exists public.get_orders_by_phone(text);

-- Customer reports a UPI payment (stays UNVERIFIED until the baker checks it)
create or replace function public.submit_payment_proof(p_number text, p_phone text, p_reference text, p_proof_path text, p_amount int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  perform rate_limit('proof:' || coalesce(normalize_phone(p_phone), p_phone), 6, interval '10 minutes');
  select * into o from orders where order_number = upper(trim(p_number)) and phone = normalize_phone(p_phone);
  if not found then return jsonb_build_object('error', 'NOT_FOUND: order not found'); end if;
  if o.status in ('cancelled','refunded','refund_pending','completed') then raise exception 'INVALID: this order is closed'; end if;
  if coalesce(trim(p_reference), '') = '' and coalesce(p_proof_path, '') = '' then
    raise exception 'INVALID: please enter the UPI transaction ID or upload a screenshot';
  end if;
  if p_proof_path is not null and p_proof_path <> '' and p_proof_path not like 'proof/%' then raise exception 'INVALID: bad file path'; end if;
  insert into payments(order_id, kind, method, amount, reference, status, proof_path, note)
  values (o.id, case when o.amount_paid >= o.advance_due then 'balance' else 'advance' end, 'upi',
          greatest(coalesce(p_amount, o.advance_due - o.amount_paid), 0), nullif(trim(p_reference), ''), 'pending', nullif(p_proof_path, ''),
          'Reported by customer');
  select * into o from orders where id = o.id;
  return order_public_view(o);
end $$;

-- Signed-in customers (OTP) — see their own profile, orders & special dates
create or replace function public.my_customer() returns customers
language plpgsql volatile security definer set search_path = public as $$
declare c customers; jphone text := normalize_phone(auth.jwt() ->> 'phone'); jemail text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then raise exception 'AUTH: please sign in'; end if;
  select * into c from customers where auth_user_id = auth.uid();
  if found then return c; end if;
  if jphone is not null then
    select * into c from customers where phone = jphone and auth_user_id is null;
  end if;
  if not found and jemail is not null and jemail <> '' then
    -- link by verified e-mail only when exactly one customer has it (never guess)
    if (select count(*) from customers where lower(email) = jemail and auth_user_id is null) = 1 then
      select * into c from customers where lower(email) = jemail and auth_user_id is null;
    end if;
  end if;
  if c.id is not null then
    update customers set auth_user_id = auth.uid(), phone_verified = phone_verified or (jphone is not null) where id = c.id returning * into c;
  end if;
  return c;
end $$;

create or replace function public.my_profile() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c customers;
begin
  c := my_customer();
  if c.id is null then return jsonb_build_object('customer', null); end if;
  return jsonb_build_object(
    'customer', jsonb_build_object('name', c.name, 'phone', c.phone, 'whatsapp', c.whatsapp, 'email', c.email,
                                   'marketing_consent', c.marketing_consent),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a) - 'customer_id'), '[]') from customer_addresses a where a.customer_id = c.id),
    'occasions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'person_name', x.person_name, 'occasion_date', x.occasion_date, 'repeats', x.repeats) order by extract(month from x.occasion_date), extract(day from x.occasion_date)), '[]') from occasions x where x.customer_id = c.id),
    'orders', (select coalesce(jsonb_agg(order_public_view(o) order by o.created_at desc), '[]') from orders o where o.customer_id = c.id)
  );
end $$;

create or replace function public.my_save_occasion(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c customers;
begin
  c := my_customer();
  if c.id is null then raise exception 'NOT_FOUND: place your first order to create a profile'; end if;
  if p ->> 'id' is not null then
    if p ->> 'delete' = 'true' then
      delete from occasions where id = (p ->> 'id')::uuid and customer_id = c.id;
    else
      update occasions set kind = p ->> 'kind', person_name = p ->> 'person_name', occasion_date = (p ->> 'occasion_date')::date
       where id = (p ->> 'id')::uuid and customer_id = c.id;
    end if;
  else
    insert into occasions(customer_id, kind, person_name, occasion_date, repeats, source)
    values (c.id, coalesce(p ->> 'kind', 'Birthday'), p ->> 'person_name', (p ->> 'occasion_date')::date, true, 'customer');
  end if;
  return my_profile();
end $$;

create or replace function public.my_update_profile(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c customers;
begin
  c := my_customer();
  if c.id is null then raise exception 'NOT_FOUND: place your first order to create a profile'; end if;
  update customers set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    email = coalesce(nullif(trim(p ->> 'email'), ''), email),
    whatsapp = coalesce(normalize_phone(p ->> 'whatsapp'), whatsapp),
    marketing_consent = coalesce((p ->> 'marketing_consent')::boolean, marketing_consent),
    consent_at = case when (p ->> 'marketing_consent')::boolean and not marketing_consent then now() else consent_at end,
    opted_out_at = case when (p ->> 'marketing_consent') = 'false' and marketing_consent then now() else opted_out_at end
  where id = c.id;
  return my_profile();
end $$;

-- Admin: change an order's status with a note (kept in the status history)
create or replace function public.admin_set_status(p_order uuid, p_status text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'AUTH: admins only'; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update orders set status = p_status where id = p_order;
end $$;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Row-level security: public can READ the menu only. Everything
--     else is admin-only; customers go through the functions above.
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['settings','admins','categories','products','addons','time_slots','blackout_dates','delivery_zones',
                           'customers','customer_addresses','occasions','orders','order_status_history','payments',
                           'notification_log','audit_logs','lookup_attempts','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['settings','categories','products','addons','time_slots','blackout_dates','delivery_zones'] loop
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Customer data can't be deleted directly: only through admin_delete_customer(),
-- which needs a code e-mailed to the bakery account in the last 10 minutes.
drop policy if exists no_direct_customer_delete on public.customers;
create policy no_direct_customer_delete on public.customers as restrictive for delete to authenticated using (false);

create or replace function public.fresh_email_code()
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink')
      and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 600)
$$;

create or replace function public.admin_delete_customer(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c customers;
begin
  if not public.is_admin() then raise exception 'AUTH: only the baker can delete customer data'; end if;
  if not public.fresh_email_code() then
    raise exception 'CONFIRM: please confirm with the code sent to the bakery e-mail (valid for 10 minutes)';
  end if;
  delete from public.customers where id = p_id returning * into c;
  if not found then raise exception 'NOT_FOUND: customer not found'; end if;
  return jsonb_build_object('deleted', true, 'name', c.name);
end $$;
revoke all on function public.admin_delete_customer(uuid) from public, anon;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

-- only owners may manage other admins
drop policy if exists admin_all on public.admins;
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated using (public.is_admin());
drop policy if exists admins_write on public.admins;
create policy admins_write on public.admins for all to authenticated using (public.admin_role() = 'owner') with check (public.admin_role() = 'owner');

revoke all on function public.recalc_order_payment(uuid) from public, anon, authenticated;
revoke all on function public.rate_limit(text, int, interval) from public, anon, authenticated;

grant execute on function public.get_availability(date, date, uuid[], text) to anon, authenticated;
grant execute on function public.quote_order(jsonb) to anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.get_order(text, text) to anon, authenticated;
grant execute on function public.submit_payment_proof(text, text, text, text, int) to anon, authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.my_save_occasion(jsonb) to authenticated;
grant execute on function public.my_update_profile(jsonb) to authenticated;
grant execute on function public.claim_first_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 13. File storage
--   product-images  : public photos of cakes (admins upload)
--   order-uploads   : private (customer reference designs & payment screenshots)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
       ('order-uploads', 'order-uploads', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

drop policy if exists "pt public read product images" on storage.objects;
create policy "pt public read product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
drop policy if exists "pt admin manage product images" on storage.objects;
create policy "pt admin manage product images" on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and public.is_admin()) with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "pt customers upload order files" on storage.objects;
create policy "pt customers upload order files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'order-uploads' and (name like 'ref/%' or name like 'proof/%'));
drop policy if exists "pt admin read order files" on storage.objects;
create policy "pt admin read order files" on storage.objects for select to authenticated
  using (bucket_id = 'order-uploads' and public.is_admin());

-- Only the bakery e-mail can create a login (see 006_bakery_only_signup.sql)
create or replace function public.only_bakery_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) <> public.admin_email() then
    raise exception 'Sign-ups are closed for Pastel Treats';
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists pt_only_bakery_signup on auth.users;
    create trigger pt_only_bakery_signup before insert on auth.users for each row execute function public.only_bakery_signup();
  end if;
end $$;

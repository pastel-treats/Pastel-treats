-- Pastel Treats update (1 Nov 2026): hamper & seasonal enquiries ("Request a quote") with their own numbers
-- (HP-1-26 hampers, SE-1-26 seasonal) and a "Hampers & enquiries" tab in the dashboard.
-- Run AFTER the 31 Oct launch update. Paste ALL of this → Supabase → SQL Editor → Run. Safe to run more than once.

-- Hamper & seasonal enquiries ("Request a quote"): tracked separately from cake orders, with their own numbers
-- HP-1-26 (gift hampers), SE-1-26 (seasonal), EQ-1-26 (anything else).
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  enquiry_number text unique not null,
  kind text not null default 'hamper' check (kind in ('hamper','seasonal','other')),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  customer_name text not null,
  phone text not null,
  quantity text,
  budget int check (budget is null or budget >= 0),
  needed_by date,
  fulfilment text,
  city text,
  notes text,
  status text not null default 'new' check (status in ('new','quoted','confirmed','completed','cancelled')),
  quote_amount int check (quote_amount is null or quote_amount >= 0),
  amount_paid int not null default 0 check (amount_paid >= 0),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);
create table if not exists public.enquiry_counters (prefix text not null, yr int not null, last_no int not null default 0, primary key (prefix, yr));
alter table public.enquiry_counters enable row level security; -- no policies: only submit_enquiry() touches it

alter table public.enquiries enable row level security;
drop policy if exists admin_all on public.enquiries;
create policy admin_all on public.enquiries for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customer sends a hamper / seasonal enquiry ("Request a quote")
create or replace function public.submit_enquiry(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_phone text := normalize_phone(p ->> 'phone'); prod products; cat text; v_kind text := 'other'; v_prefix text := 'EQ';
        yy int := to_char(now() at time zone bakery_tz(), 'YY')::int; n int; num text; e enquiries; d date;
begin
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'INVALID: please enter your name'; end if;
  if v_phone is null then raise exception 'INVALID: please enter a valid mobile number'; end if;
  if (select count(*) from enquiries where phone = v_phone and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'RATE_LIMIT: you have sent a few requests already — we will message you soon on WhatsApp';
  end if;
  if (select count(*) from enquiries where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'RATE_LIMIT: we are receiving a lot of requests right now — please message us on WhatsApp';
  end if;
  if nullif(p ->> 'product_id', '') is not null then
    select * into prod from products where id = (p ->> 'product_id')::uuid;
    select slug into cat from categories where id = prod.category_id;
  end if;
  if cat = 'hampers' then v_kind := 'hamper'; v_prefix := 'HP';
  elsif cat = 'seasonal' then v_kind := 'seasonal'; v_prefix := 'SE'; end if;
  d := nullif(p ->> 'needed_by', '')::date;
  if d is not null and d < (now() at time zone bakery_tz())::date then raise exception 'INVALID: please choose a date from today onwards'; end if;
  insert into enquiry_counters(prefix, yr, last_no) values (v_prefix, yy, 1)
    on conflict (prefix, yr) do update set last_no = enquiry_counters.last_no + 1 returning last_no into n;
  num := v_prefix || '-' || n || '-' || lpad(yy::text, 2, '0');
  insert into enquiries(enquiry_number, kind, product_id, product_name, customer_name, phone, quantity, budget, needed_by, fulfilment, city, notes)
  values (num, v_kind, prod.id, coalesce(prod.name, left(p ->> 'product_name', 120)), upper(left(trim(p ->> 'name'), 80)), v_phone,
          left(nullif(trim(p ->> 'quantity'), ''), 80), nullif(p ->> 'budget', '')::int, d,
          case when p ->> 'fulfilment' in ('pickup','courier','delivery') then p ->> 'fulfilment' end,
          left(nullif(trim(p ->> 'city'), ''), 80), left(nullif(trim(p ->> 'notes'), ''), 1000))
  returning * into e;
  perform send_phone_alert('🎁 New ' || case v_kind when 'hamper' then 'hamper enquiry ' when 'seasonal' then 'seasonal enquiry ' else 'enquiry ' end || num,
    split_part(initcap(e.customer_name), ' ', 1) || ' · ' || coalesce(e.product_name, '') || coalesce(' · ' || e.quantity, '') ||
    coalesce(' · budget ₹' || e.budget, '') || coalesce(' · by ' || to_char(e.needed_by, 'DD Mon'), ''), null);
  return jsonb_build_object('enquiry_number', num, 'kind', v_kind);
end $$;
grant execute on function public.submit_enquiry(jsonb) to anon, authenticated;


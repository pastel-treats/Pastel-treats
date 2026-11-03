-- ============================================================================
-- 013 · Orders entered by the baker + repeat alerts for orders nobody has opened
--  • admin_create_order(): the baker records an order taken on WhatsApp / phone / Instagram / in person.
--    Same PT- numbers, same lists, calendar, payments and customer records as online orders.
--  • Phone alerts ring again (every 3 minutes, up to 3 more times) until the order is opened
--    in the dashboard — like a delivery-app restaurant tablet.
-- Safe to run more than once.
-- ============================================================================

alter table public.orders add column if not exists channel text not null default 'online';
alter table public.orders add column if not exists admin_seen_at timestamptz;
alter table public.orders add column if not exists alert_reminders int not null default 0;
alter table public.orders add column if not exists last_alert_at timestamptz;
-- orders that existed before this update count as already seen
update public.orders set admin_seen_at = coalesce(admin_seen_at, updated_at, created_at) where admin_seen_at is null and created_at < now() - interval '10 minutes';

-- online orders ring the phone; orders the baker typed in herself don't
create or replace function public.alert_new_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.channel, 'online') <> 'online' then return new; end if;
  perform send_phone_alert(
    '🎂 New order ' || new.order_number || ' · ₹' || to_char(new.total, 'FM99,99,999'),
    split_part(initcap(new.customer_name), ' ', 1) || ' · ' ||
      case new.fulfilment when 'courier' then 'Courier' when 'delivery' then 'Delivery' else 'Pickup' end || ' ' ||
      to_char(new.requested_date, 'Dy DD Mon') || coalesce(', ' || new.slot_label, '') || E'\n' ||
      coalesce((select string_agg((i ->> 'qty') || ' × ' || (i ->> 'name'), ', ') from jsonb_array_elements(new.items) i), '') ||
      case when new.is_custom then E'\nCustom design — needs your quote' else '' end,
    coalesce((select site_url from admin_alerts where id = 1), 'https://pasteltreats.in') || '/#/admin/orders?open=' || new.id);
  return new;
end $$;

-- Ring again for new online orders that haven't been opened yet (run every minute by the scheduler)
create or replace function public.remind_unseen_orders() returns int
language plpgsql volatile security definer set search_path = public as $$
declare o orders; n int := 0;
begin
  for o in
    select * from orders
     where channel = 'online' and admin_seen_at is null and alert_reminders < 3
       and status in ('submitted', 'awaiting_payment', 'payment_verification')
       and created_at > now() - interval '2 hours'
       and coalesce(last_alert_at, created_at) + interval '3 minutes' <= now()
     order by created_at
     limit 20
  loop
    perform send_phone_alert('⏰ Still waiting · order ' || o.order_number || ' · ₹' || to_char(o.total, 'FM99,99,999'),
      split_part(initcap(o.customer_name), ' ', 1) || ' placed this ' || round(extract(epoch from now() - o.created_at) / 60) || ' minutes ago. Tap to open it.',
      coalesce((select site_url from admin_alerts where id = 1), 'https://pasteltreats.in') || '/#/admin/orders?open=' || o.id);
    update orders set alert_reminders = alert_reminders + 1, last_alert_at = now() where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.remind_unseen_orders() from public, anon, authenticated;

-- every minute (needs the free pg_cron extension, which Supabase includes)
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'pt-order-reminders';
  perform cron.schedule('pt-order-reminders', '* * * * *', 'select public.remind_unseen_orders()');
exception when others then
  raise notice 'Repeat alerts not scheduled (pg_cron unavailable): %', sqlerrm;
end $$;

-- The baker records an order taken outside the website
create or replace function public.admin_create_order(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  tz text := bakery_tz();
  v_phone text := normalize_phone(p ->> 'phone');
  v_wa text := coalesce(normalize_phone(p ->> 'whatsapp'), normalize_phone(p ->> 'phone'));
  v_channel text := coalesce(nullif(p ->> 'channel', ''), 'whatsapp');
  v_status text := coalesce(nullif(p ->> 'status', ''), 'confirmed');
  v_fulfil text := coalesce(nullif(p ->> 'fulfilment', ''), 'pickup');
  d date := nullif(p ->> 'date', '')::date;
  cust customers; o orders; num text; items jsonb := '[]'; it jsonb;
  sub int := 0; v_qty int; v_price int; v_total int; v_adv int; disc int; dch int;
  pay_amt int := coalesce(nullif(p #>> '{payment,amount}', '')::int, 0);
  slot time_slots;
begin
  if not is_admin() then raise exception 'AUTH: admins only'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'INVALID: please enter the customer name'; end if;
  if v_phone is null then raise exception 'INVALID: please enter a valid mobile number'; end if;
  if d is null then raise exception 'INVALID: please choose the date'; end if;
  if v_channel not in ('whatsapp', 'phone', 'instagram', 'walk_in', 'other') then v_channel := 'other'; end if;
  if v_status not in ('confirmed', 'awaiting_payment', 'submitted') then v_status := 'confirmed'; end if;
  if v_fulfil not in ('pickup', 'delivery', 'courier') then v_fulfil := 'pickup'; end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then raise exception 'INVALID: please add at least one item'; end if;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    if coalesce(trim(it ->> 'name'), '') = '' then raise exception 'INVALID: every item needs a name'; end if;
    v_qty := greatest(coalesce(nullif(it ->> 'qty', '')::int, 1), 1);
    v_price := coalesce(nullif(it ->> 'line_total', '')::int, 0);
    if v_price < 0 then raise exception 'INVALID: prices can''t be negative'; end if;
    sub := sub + v_price;
    items := items || jsonb_build_object(
      'product_id', case when coalesce(it ->> 'product_id', '') ~ '^[0-9a-fA-F-]{36}$' and exists (select 1 from products where id = (it ->> 'product_id')::uuid) then it ->> 'product_id' end,
      'name', left(trim(it ->> 'name'), 120), 'qty', v_qty,
      'unit_price', round(v_price::numeric / v_qty), 'line_total', v_price,
      'details', nullif(left(trim(coalesce(it ->> 'details', '')), 300), ''),
      'message', nullif(left(trim(coalesce(it ->> 'message', '')), 120), ''), 'manual', true);
  end loop;
  dch := greatest(coalesce(nullif(p ->> 'delivery_charge', '')::int, 0), 0);
  disc := greatest(coalesce(nullif(p ->> 'discount', '')::int, 0), 0);
  v_total := greatest(sub + dch - disc, 0);
  v_adv := least(coalesce(nullif(p ->> 'advance_due', '')::int, calc_advance(v_total)), v_total);
  if pay_amt < 0 then raise exception 'INVALID: payment can''t be negative'; end if;

  select * into cust from customers where customers.phone = v_phone;
  if not found then
    insert into customers(name, phone, whatsapp, city) values (upper(trim(p ->> 'name')), v_phone, v_wa, nullif(left(trim(coalesce(p ->> 'city', '')), 60), ''))
    returning * into cust;
  else
    update customers set whatsapp = coalesce(customers.whatsapp, v_wa), city = coalesce(customers.city, nullif(left(trim(coalesce(p ->> 'city', '')), 60), ''))
     where id = cust.id returning * into cust;
  end if;

  if nullif(p ->> 'slot_id', '') is not null then select * into slot from time_slots where id = (p ->> 'slot_id')::uuid; end if;

  loop
    insert into order_counters(yr, last_no) values (to_char(now() at time zone tz, 'YY')::int, 1)
      on conflict (yr) do update set last_no = order_counters.last_no + 1
      returning 'PT-' || last_no || '-' || lpad(yr::text, 2, '0') into num;
    exit when not exists (select 1 from orders where order_number = num);
  end loop;

  insert into orders(order_number, customer_id, customer_name, phone, whatsapp, status, payment_method, items,
    subtotal, delivery_charge, discount, total, advance_due, fulfilment, address, requested_date, slot_id, slot_label,
    confirmed_date, confirmed_slot_label, occasion, notes, admin_notes, channel, admin_seen_at, customer_city)
  values (num, cust.id, upper(trim(p ->> 'name')), v_phone, v_wa, v_status,
    case when p #>> '{payment,method}' = 'cash' then 'cash' else 'upi' end, items,
    sub, dch, disc, v_total, v_adv, v_fulfil,
    case when v_fulfil in ('delivery', 'courier') and coalesce(trim(p #>> '{address,line}'), '') <> '' then p -> 'address' end,
    d, slot.id, coalesce(slot.label, nullif(left(p ->> 'slot_label', 60), ''), case when v_fulfil = 'courier' then 'Courier dispatch' end),
    case when v_status = 'confirmed' then d end,
    case when v_status = 'confirmed' then coalesce(slot.label, nullif(left(p ->> 'slot_label', 60), '')) end,
    nullif(p ->> 'occasion', ''), left(nullif(trim(coalesce(p ->> 'notes', '')), ''), 1000),
    '[' || to_char(now() at time zone tz, 'DD Mon HH12:MI AM') || '] Entered by baker · ' ||
      case v_channel when 'whatsapp' then 'WhatsApp' when 'phone' then 'Phone call' when 'instagram' then 'Instagram' when 'walk_in' then 'In person' else 'Other' end,
    v_channel, now(), cust.city)
  returning * into o;
  update order_status_history set note = 'Order entered by baker' where order_id = o.id and from_status is null;

  if pay_amt > 0 then
    insert into payments(order_id, kind, method, amount, reference, status, proof_path, note)
    values (o.id, 'advance',
      case when p #>> '{payment,method}' in ('upi', 'cash', 'bank', 'other') then p #>> '{payment,method}' else 'upi' end,
      pay_amt, nullif(trim(coalesce(p #>> '{payment,reference}', '')), ''), 'verified',
      case when coalesce(p #>> '{payment,proof_path}', '') like 'proof/%' then p #>> '{payment,proof_path}' end,
      'Recorded by baker');
  end if;

  select * into o from orders where id = o.id;
  return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total,
    'amount_paid', o.amount_paid, 'link_token', o.access_token);
end $$;
revoke all on function public.admin_create_order(jsonb) from public, anon;
grant execute on function public.admin_create_order(jsonb) to authenticated;

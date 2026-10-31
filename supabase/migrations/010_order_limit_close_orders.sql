-- Pastel Treats update (29 Oct 2026): fairer order limit + "Open / close orders" with an automatic reopen date.
-- • A mobile number can place up to 5 orders an hour (was 3); cancelled orders don't count; the message says how long to wait.
-- • Whole shop: up to 60 orders an hour (was 40) — only there to stop spam/bots.
-- • When orders are closed with a reopen date, orders open again by themselves on that date.
-- • Optional different advance for bigger orders (e.g. above ₹1,000), set in Business settings → Payments.
-- • Payment screenshots: the same payment sent twice is recorded once.
-- • Phone alerts for every new order (ntfy app), even when the dashboard is closed.
-- • Small orders paid in full: below ₹1,000 = 100%, ₹1,000 and above = 50% advance (change any time in Settings → Payments).
-- • Orders open from a chosen date & time (set to Sun 1 Nov, 11:11 AM).
-- Paste ALL of this → Supabase → SQL Editor → Run. Safe to run more than once.

-- Phone alerts
do $x$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net is not available — phone alerts stay off'; end $x$;
-- Phone alerts for the baker (works even when the app is closed): every new order sends a loud
-- notification through the free "ntfy" app. Only the baker can read or change these settings.
create table if not exists public.admin_alerts (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  ntfy_topic text,
  site_url text default 'https://pasteltreats.in',
  updated_at timestamptz not null default now()
);

alter table public.admin_alerts enable row level security;
drop policy if exists admin_all on public.admin_alerts;
create policy admin_all on public.admin_alerts for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.admin_alerts(id) values (1) on conflict (id) do nothing;

-- Send the phone alert (needs the pg_net extension, which Supabase provides). Never blocks an order.
create or replace function public.send_phone_alert(p_title text, p_message text, p_click text default null) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare a admin_alerts;
begin
  select * into a from admin_alerts where id = 1;
  if not found or not a.enabled or coalesce(trim(a.ntfy_topic), '') = '' then return false; end if;
  begin
    perform net.http_post(
      url := 'https://ntfy.sh/',
      body := jsonb_build_object('topic', a.ntfy_topic, 'title', p_title, 'message', p_message, 'priority', 5,
                                 'tags', jsonb_build_array('cake', 'bell'),
                                 'click', coalesce(p_click, coalesce(a.site_url, 'https://pasteltreats.in') || '/#/admin/orders')),
      headers := '{"Content-Type": "application/json"}'::jsonb);
    return true;
  exception when others then
    return false; -- alerts are a convenience: an order must never fail because of them
  end;
end $$;
revoke all on function public.send_phone_alert(text, text, text) from public, anon, authenticated;

create or replace function public.alert_new_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform send_phone_alert(
    '🎂 New order ' || new.order_number || ' · ₹' || to_char(new.total, 'FM99,99,999'),
    split_part(initcap(new.customer_name), ' ', 1) || ' · ' ||
      case new.fulfilment when 'courier' then 'Courier' when 'delivery' then 'Delivery' else 'Pickup' end || ' ' ||
      to_char(new.requested_date, 'Dy DD Mon') || coalesce(', ' || new.slot_label, '') || E'\n' ||
      coalesce((select string_agg((i ->> 'qty') || ' × ' || (i ->> 'name'), ', ') from jsonb_array_elements(new.items) i), '') ||
      case when new.is_custom then E'\nCustom design — needs your quote' else '' end,
    null);
  return new;
end $$;
drop trigger if exists orders_phone_alert on public.orders;
create trigger orders_phone_alert after insert on public.orders for each row execute function public.alert_new_order();

-- "Send test alert" button in the dashboard
create or replace function public.admin_test_alert() returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'AUTH: not allowed'; end if;
  return send_phone_alert('🔔 Test alert from Pastel Treats', 'If you can hear this, new-order alerts are working — even when the app is closed.', null);
end $$;
grant execute on function public.admin_test_alert() to authenticated;


create or replace function public.calc_advance(total int) returns int
language plpgsql stable security definer set search_path = public as $$
declare mode text; val numeric; d jsonb;
begin
  select data into d from settings where id = 1;
  -- bigger orders (above the chosen amount) can have their own advance rule
  if coalesce((d ->> 'advance_tier_enabled')::boolean, false) and total >= coalesce((d ->> 'advance_tier_above')::numeric, 0) then
    mode := coalesce(d ->> 'advance_tier_mode', 'percent'); val := coalesce((d ->> 'advance_tier_value')::numeric, 50);
  else
    mode := coalesce(d ->> 'advance_mode', 'percent'); val := coalesce((d ->> 'advance_value')::numeric, 50);
  end if;
  if mode = 'fixed' then return least(total, val::int); end if;
  return least(total, ceil(total * val / 100.0)::int);
end $$;

drop function if exists public.submit_payment_proof(text, text, text, text, int);
create or replace function public.submit_payment_proof(p_number text, p_phone text, p_reference text, p_proof_path text, p_amount int, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  perform rate_limit('proof:' || coalesce(normalize_phone(p_phone), p_phone), 6, interval '10 minutes');
  select * into o from orders where order_number = upper(trim(p_number)) and phone = normalize_phone(p_phone);
  if not found then return jsonb_build_object('error', 'NOT_FOUND: order not found'); end if;
  if o.status in ('cancelled','refunded','refund_pending','completed') then raise exception 'INVALID: this order is closed'; end if;
  if coalesce(trim(p_reference), '') = '' and coalesce(p_proof_path, '') = '' then
    raise exception 'INVALID: please upload the payment screenshot';
  end if;
  if p_proof_path is not null and p_proof_path <> '' and p_proof_path not like 'proof/%' then raise exception 'INVALID: bad file path'; end if;
  -- the same payment sent twice (retry / double tap) is recorded once
  if nullif(trim(p_reference), '') is not null and exists (select 1 from payments where order_id = o.id and reference = trim(p_reference) and status <> 'rejected') then
    return order_public_view(o);
  end if;
  insert into payments(order_id, kind, method, amount, reference, status, proof_path, note)
  values (o.id, case when o.amount_paid >= o.advance_due then 'balance' else 'advance' end, 'upi',
          greatest(coalesce(p_amount, o.advance_due - o.amount_paid), 0), nullif(trim(p_reference), ''), 'pending', nullif(p_proof_path, ''),
          'Reported by customer' || coalesce(' · ' || left(nullif(trim(p_note), ''), 300), ''));
  select * into o from orders where id = o.id;
  return order_public_view(o);
end $$;
grant execute on function public.submit_payment_proof(text, text, text, text, int, text) to anon, authenticated;

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  q jsonb; tz text := bakery_tz(); now_local timestamp; lead int; d date; slot time_slots; cust customers;
  v_phone text := normalize_phone(p ->> 'phone'); v_wa text := normalize_phone(coalesce(nullif(p ->> 'whatsapp', ''), p ->> 'phone'));
  v_custom boolean; needs_zone boolean := false; o orders; num text; v_method text := coalesce(p ->> 'payment_method', 'upi');
  s jsonb; avail jsonb; slot_ok boolean; prod_ids uuid[]; v_status text; refs text[];
begin
  -- duplicate submission protection (double taps / network retries arriving at the same moment wait for each other)
  if p ->> 'idempotency_key' is not null then
    perform pg_advisory_xact_lock(hashtext('pt-idem-' || (p ->> 'idempotency_key')));
    select * into o from orders where idempotency_key = p ->> 'idempotency_key';
    if found then
      return jsonb_build_object('order_number', o.order_number, 'duplicate', true, 'total', o.total, 'advance_due', o.advance_due, 'status', o.status, 'link_token', o.access_token);
    end if;
  end if;

  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'INVALID: please enter your name'; end if;
  if v_phone is null then raise exception 'INVALID: please enter a valid mobile number'; end if;
  -- flood protection (stops spam / bots): max 5 new orders per mobile per hour (cancelled ones don't count),
  -- 60 per hour for the whole shop. A customer can put up to 10 items in ONE order, so 5 orders an hour is plenty.
  if (select count(*) from orders where phone = v_phone and created_at > now() - interval '1 hour'
        and status not in ('cancelled','refunded','refund_pending')) >= 5 then
    raise exception 'RATE_LIMIT: you have already placed 5 orders from this mobile number in the last hour. Please try again in about % minutes, or message us on WhatsApp and we will add it for you',
      greatest(1, ceil(extract(epoch from (
        (select min(created_at) from (select created_at from orders where phone = v_phone and created_at > now() - interval '1 hour'
           and status not in ('cancelled','refunded','refund_pending') order by created_at desc limit 5) t) + interval '1 hour' - now())) / 60)::int);
  end if;
  if (select count(*) from orders where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'RATE_LIMIT: we are receiving a lot of orders right now — please try again shortly or message us on WhatsApp';
  end if;
  if coalesce(jsonb_array_length(p -> 'items'), 0) = 0 then raise exception 'INVALID: your cart is empty'; end if;
  if jsonb_array_length(p -> 'items') > 10 then raise exception 'INVALID: too many items in one order'; end if;
  if coalesce(p ->> 'fulfilment', '') not in ('pickup','delivery','courier') then raise exception 'INVALID: choose pickup or courier'; end if;
  if not coalesce((p ->> 'accepted_policies')::boolean, false) then raise exception 'INVALID: please accept the ordering policy'; end if;

  s := (select data from settings where id = 1);
  -- orders can be scheduled to open at a date & time (bakery time), e.g. the launch
  if nullif(s ->> 'orders_open_at', '') is not null and (now() at time zone tz) < (s ->> 'orders_open_at')::timestamp then
    raise exception 'PAUSED: Online orders open on %. See you then!', trim(to_char((s ->> 'orders_open_at')::timestamp, 'Dy FMDD Mon "at" FMHH12:MI AM'));
  end if;
  -- closed for orders (optionally until a reopen date, in bakery time)
  if coalesce((s ->> 'orders_paused')::boolean, false)
     and (nullif(s ->> 'orders_paused_until', '') is null or (now() at time zone tz)::date < (s ->> 'orders_paused_until')::date) then
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

-- Launch settings (all can be changed later in the dashboard):
--   below ₹1,000 = paid in full, ₹1,000 and above = 50% advance; online orders open Sun 1 Nov 2026 at 11:11 AM
update public.settings set data = data || jsonb_build_object(
  'advance_mode', 'percent', 'advance_value', 100,
  'advance_tier_enabled', true, 'advance_tier_above', 1000, 'advance_tier_mode', 'percent', 'advance_tier_value', 50,
  'orders_open_at', '2026-11-01T11:11') where id = 1;
update public.settings set data = jsonb_set(data, '{policies,advance}',
  to_jsonb('Orders below ₹1,000 are paid in full when you order. For orders of ₹1,000 and above, a 50% advance confirms your order and the balance is paid at pickup (or before courier dispatch).'::text))
  where id = 1 and data ? 'policies';

-- Pastel Treats update (Oct 2026): private "My orders", customer place, code-confirmed delete, order flood limit.
-- Run this ONLY together with publishing the matching website update. Paste ALL of it → Supabase → SQL Editor → Run.

-- 1. Privacy: no listing of orders by mobile number alone
drop function if exists public.get_orders_by_phone(text);
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
grant execute on function public.get_order(text, text) to anon, authenticated;

-- 2. Where customers order from
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists city text;
alter table public.orders add column if not exists customer_state text;
alter table public.orders add column if not exists customer_city text;

-- 3. Orders: saves the place + flood protection (3 per mobile per hour, 40 per hour in total)
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
      return jsonb_build_object('order_number', o.order_number, 'duplicate', true, 'total', o.total, 'advance_due', o.advance_due, 'status', o.status);
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
  select * into slot from time_slots where id = (p ->> 'slot_id')::uuid and active;
  if not found then raise exception 'SLOT_UNAVAILABLE: please choose a time slot'; end if;

  perform pg_advisory_xact_lock(hashtext('pt-day-' || d::text));   -- serialise bookings for the day

  select array_agg((x ->> 'product_id')::uuid) into prod_ids from jsonb_array_elements(q -> 'items') x;
  avail := get_availability(d, d, prod_ids, p ->> 'fulfilment');
  select (x ->> 'eligible')::boolean into slot_ok
    from jsonb_array_elements(avail #> '{days,0,slots}') x where (x ->> 'id')::uuid = slot.id;
  if not coalesce(slot_ok, false) then
    raise exception 'SLOT_UNAVAILABLE: that date/time is no longer available (please order % hrs prior). Please pick another slot.', avail ->> 'lead_hours';
  end if;

  -- customer: match on normalised mobile number only; never overwrite existing details
  select * into cust from customers where customers.phone = v_phone;
  if not found then
    insert into customers(name, phone, whatsapp, email, state, city, marketing_consent, consent_at)
    values (trim(p ->> 'name'), v_phone, v_wa, nullif(trim(p ->> 'email'), ''),
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
  values (num, p ->> 'idempotency_key', cust.id, trim(p ->> 'name'), v_phone, v_wa, nullif(trim(p ->> 'email'), ''), v_status,
    v_method, q -> 'items', (q ->> 'subtotal')::int, (q ->> 'delivery_charge')::int, (q ->> 'total')::int, (q ->> 'advance_due')::int,
    v_custom, case when v_custom then 'pending' else 'n/a' end,
    p ->> 'fulfilment', case when p ->> 'fulfilment' in ('delivery','courier') then p -> 'address' end,
    (select id from delivery_zones where active and regexp_replace(coalesce(p #>> '{address,pincode}', ''), '\s', '', 'g') = any(pincodes) limit 1),
    needs_zone, d, slot.id, slot.label,
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
    'is_custom', o.is_custom, 'needs_delivery_approval', o.needs_delivery_approval, 'duplicate', false);
end $$;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- 4. Deleting customer data needs a code e-mailed to the bakery
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

select 'Update applied' as result;

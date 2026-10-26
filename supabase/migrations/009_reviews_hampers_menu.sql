-- Pastel Treats update (Oct 2026, part 2): reviews, gift hampers & seasonal treats, new menu descriptions,
-- courier orders without a time slot (UPI only), customer names in CAPITALS, "message to order" items.
-- Run this ONLY together with publishing the matching website update. Paste ALL of it → Supabase → SQL Editor → Run.
-- Safe to run more than once.

-- 1. "Message to order" items (hampers, seasonal, price on request)
alter table public.products add column if not exists enquiry_only boolean not null default false;

-- 2. Reviews (only from a real order's private link; shown after the baker approves)
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

alter table public.reviews enable row level security;
drop policy if exists admin_all on public.reviews;
create policy admin_all on public.reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());

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

create or replace function public.get_public_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
    select jsonb_build_object('name', r.display_name, 'rating', r.rating, 'body', r.body, 'at', r.created_at, 'order_number', o.order_number) x
    from reviews r join orders o on o.id = r.order_id where r.approved order by r.created_at desc limit 30) t
$$;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;
grant execute on function public.get_public_reviews() to anon, authenticated;

-- 3. Ordering rules: courier = no time slot + UPI only; enquiry items can't be added to the cart; names in CAPITALS
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

-- 4. Customer names in CAPITALS
update public.customers set name = upper(trim(name)) where name <> upper(trim(name));
update public.orders set customer_name = upper(trim(customer_name)) where customer_name <> upper(trim(customer_name));

-- 5. New menu sections: Seasonal treats & Gift hampers
insert into public.categories(slug, name, description, sort) values ('seasonal', 'Seasonal treats', 'Here for a season — ice creams, mango sticky rice & more', 8) on conflict (slug) do nothing;
insert into public.categories(slug, name, description, sort) values ('hampers', 'Gift hampers', 'Festive, corporate, store-opening & brand-launch hampers', 9) on conflict (slug) do nothing;
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Ice Cream', 'Small-batch, homemade ice cream — rich, creamy and made with real ingredients. Seasonal flavours change often, so message us to see what''s churning now.', array['images/ai-ice-cream.svg']::text[], 0, 'tub', array[]::text[], false, false, true, 'Seasonal', (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'seasonal' and not exists (select 1 from public.products where trim(name) = 'Ice Cream');
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Mango Sticky Rice', 'The Thai favourite — warm coconut sticky rice with sweet, ripe mango, salted coconut cream and a sprinkle of toasted sesame. Only while mangoes are in season.', array['images/ai-mango-sticky-rice.svg']::text[], 0, 'bowl', array[]::text[], false, false, true, 'Mango season', (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'seasonal' and not exists (select 1 from public.products where trim(name) = 'Mango Sticky Rice');
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Festival Hamper (Diwali & more)', 'Light up the festival with a hamper of handmade brownies, cookies and treats in beautiful gift packing — for family, friends and clients. Tell us your budget and quantity and we''ll put it together.', array['images/ai-hamper-festival.svg']::text[], 0, 'hamper', array['Festival']::text[], true, false, true, 'Diwali', (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'hampers' and not exists (select 1 from public.products where trim(name) = 'Festival Hamper (Diwali & more)');
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Corporate Gift Hamper', 'Premium, handmade treat hampers for your team, clients and events — with your logo or a personal note. Bulk orders welcome; message us for options and pricing.', array['images/ai-hamper-corporate.svg']::text[], 0, 'hamper', array['Corporate']::text[], false, false, true, null, (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'hampers' and not exists (select 1 from public.products where trim(name) = 'Corporate Gift Hamper');
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Store Opening Hamper', 'Make your opening day sweeter. Treat boxes and dessert tables for your guests, customised to your store''s colours. Message us with the date and number of guests.', array['images/ai-hamper-store-opening.svg']::text[], 0, 'hamper', array['Corporate']::text[], false, false, true, null, (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'hampers' and not exists (select 1 from public.products where trim(name) = 'Store Opening Hamper');
insert into public.products(category_id, name, description, images, base_price, unit_label, occasions, is_featured, allow_message, enquiry_only, seasonal_note, sort)
select id, 'Brand Launch Hamper', 'Launching something new? We create custom treat boxes and dessert hampers in your brand colours, with your logo and message — the perfect PR package.', array['images/ai-hamper-brand-launch.svg']::text[], 0, 'hamper', array['Corporate']::text[], false, false, true, null, (select coalesce(max(sort), 0) + 1 from public.products)
from public.categories where slug = 'hampers' and not exists (select 1 from public.products where trim(name) = 'Brand Launch Hamper');

-- 6. Tidy names, New York cookies like brownies (₹150 each, min 4, no cake options), protein = no flour
update public.products set name = trim(name) where name <> trim(name);
update public.products set unit_label = 'each', min_qty = greatest(min_qty, 4), allow_message = false, customizable = true
 where name ilike 'new%york%chunky%';

-- 7. Fresh descriptions for every dish (matched by name)
update public.products set description = 'Our signature celebration cake — soft, moist sponge layered with fresh buttercream and hand-finished in the colours of your party. Pick a flavour and size; prices are per kg. Custom designs are quoted by us.' where trim(name) ilike 'Celebration Cake';
update public.products set description = 'Dream it, we bake it. Share your theme or a reference picture and Vaishnavi designs a one-of-a-kind cake around it — from dreamy pastels to bold characters. The flavour price is the starting rate; we quote the design before you pay.' where trim(name) ilike 'Custom Design Cake';
update public.products set description = 'Dense, fudgy brownies with that shiny crackle top, made with Callebaut chocolate. Pick a flavour or go assorted — perfect for gifting, and sturdy enough to courier.' where trim(name) ilike 'Brownie Box';
update public.products set description = 'The golden cousin of the brownie — buttery, chewy blondies with deep caramel notes and a melt-in-the-mouth centre. Gift-ready, and can be couriered.' where trim(name) ilike 'Blondie Box';
update public.products set description = 'Eight crisp-edged, buttery cookies baked fresh to order. Choose one flavour or ask for an assorted box — a little box of happiness that travels well by courier.' where trim(name) ilike 'Cookie Box';
update public.products set description = 'Crunchy finger-millet puffs coated in real cocoa — the snack you can feel good about. Light, crispy and loved by kids and grown-ups alike.' where trim(name) ilike 'Ragi Cocoa Puff';
update public.products set description = 'Light-as-air French choux with a crackly craquelin top, piped full of chilled, silky cream. Bite-sized elegance for your dessert table. Minimum 4.' where trim(name) ilike 'Choux Pastry';
update public.products set description = 'Crisp, buttery shortcrust filled with fresh fruit and crème pâtissière, silky chocolate ganache or gooey salted caramel. Mix flavours with an assorted box. Minimum 4.' where trim(name) ilike 'Sweet Tart';
update public.products set description = 'Flaky, golden tart shells with a rich, savoury filling — the perfect tea-time bite and party starter. Minimum 4.' where trim(name) ilike 'Savoury Tart';
update public.products set description = 'A patisserie-style mousse cake for one — layers of mousse, crunch and sponge under a glossy mirror glaze. Nine flavours, from triple chocolate to tender coconut lychee. Minimum 4.' where trim(name) ilike 'Entremet (single serve)';
update public.products set description = 'Thick, bakery-style New York cookies — crisp golden edges, a gooey molten middle and generous chunks in every bite. ₹150 each, minimum 4 pieces.' where trim(name) ilike 'New York Chunky Cookie';
update public.products set description = 'Thick, bakery-style New York cookies — crisp golden edges, a gooey molten middle and generous chunks in every bite. ₹150 each, minimum 4 pieces.' where trim(name) ilike 'Newyork Chunky Cookies';
update public.products set description = 'Everything you love about Ferrero Rocher in a cake bite — hazelnut-chocolate cake, Nutella centre and a crunchy chocolate-nut shell. Minimum 4.' where trim(name) ilike 'Rocher Bomb';
update public.products set description = 'Three layers of pure indulgence — buttery shortbread, thick golden caramel and a snap of smooth chocolate on top. Minimum 8.' where trim(name) ilike 'Millionaire Shortbread';
update public.products set description = 'A feather-light sponge soaked in three milks until it melts on your spoon, crowned with clouds of whipped cream. Cool, creamy and dangerously good.' where trim(name) ilike 'Tres Leches';
update public.products set description = 'The Italian classic — ladyfingers soaked in strong espresso, layered with velvety mascarpone cream and dusted with cocoa. Rich, light and perfectly balanced.' where trim(name) ilike 'Tiramisu';
update public.products set description = 'For serious chocolate lovers — a crunchy chocolate base, a deep, fudgy filling and a silky ganache finish. Half a kilo of pure joy to share.' where trim(name) ilike 'Chocolate Mud Pie';
update public.products set description = 'A comforting bowl of creamy pudding layered with soft fruit and buttery crumble. Choose classic banana pudding or a fruity crumble.' where trim(name) ilike 'Banana Pudding & Crumble Bowl';
update public.products set description = 'Soft, pillowy rice-dough mochi with a luscious creamy filling — chewy outside, dreamy inside. Flavours from Lotus Biscoff to Ferrero Rocher. Minimum 4.' where trim(name) ilike 'Mochi';
update public.products set description = 'The viral Korean garlic bun — a soft bun stuffed with sweet cream cheese and soaked in golden garlic butter. Savoury, sweet and irresistible. Minimum 4.' where trim(name) ilike 'Korean Cream Cheese Bun';
update public.products set description = 'A tall, tender ring cake with a glossy glaze — carrot, lemon blueberry, red velvet or chocolate. Just right for tea time or a small celebration.' where trim(name) ilike 'Bundt Cake';
update public.products set description = 'Pillowy, swirled cinnamon rolls with a buttery brown-sugar filling and a soft cream-cheese glaze, best enjoyed warm.' where trim(name) ilike 'Cinnamon Rolls';
update public.products set description = 'Guilt-free and gym-friendly — made with NO flour at all, just whey protein. Fudgy brownies and chewy cookies packed with protein, so you can treat yourself after a workout. Minimum 4.' where trim(name) ilike 'Protein Brownie / Cookie';
update public.products set description = 'Crunchy, golden clusters of oats, nuts and seeds, slow-baked in small batches with honey. Perfect with milk, yoghurt or straight from the jar.' where trim(name) ilike 'Granola';
update public.products set description = 'Light, airy sponge soaked in cold milk and topped with a layer of caramelised sugar — Turkey''s famous trileçe. Creamy, cool and melt-in-the-mouth, in 250 g tubs.' where trim(name) ilike 'Turkish Milk Cake';
update public.products set description = 'Small-batch, homemade ice cream — rich, creamy and made with real ingredients. Seasonal flavours change often, so message us to see what''s churning now.' where trim(name) ilike 'Ice Cream';
update public.products set description = 'The Thai favourite — warm coconut sticky rice with sweet, ripe mango, salted coconut cream and a sprinkle of toasted sesame. Only while mangoes are in season.' where trim(name) ilike 'Mango Sticky Rice';
update public.products set description = 'Light up the festival with a hamper of handmade brownies, cookies and treats in beautiful gift packing — for family, friends and clients. Tell us your budget and quantity and we''ll put it together.' where trim(name) ilike 'Festival Hamper (Diwali & more)';
update public.products set description = 'Premium, handmade treat hampers for your team, clients and events — with your logo or a personal note. Bulk orders welcome; message us for options and pricing.' where trim(name) ilike 'Corporate Gift Hamper';
update public.products set description = 'Make your opening day sweeter. Treat boxes and dessert tables for your guests, customised to your store''s colours. Message us with the date and number of guests.' where trim(name) ilike 'Store Opening Hamper';
update public.products set description = 'Launching something new? We create custom treat boxes and dessert hampers in your brand colours, with your logo and message — the perfect PR package.' where trim(name) ilike 'Brand Launch Hamper';

-- quick check: every active dish should now have a description
select name, left(description, 60) as description from public.products where is_active order by sort;

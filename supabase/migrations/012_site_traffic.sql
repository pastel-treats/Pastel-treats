-- ============================================================================
-- 012 · Site traffic — the bakery's own private visitor statistics
-- What it records: an anonymous random visitor id kept on the phone, the page,
-- where the visit came from (Instagram / WhatsApp / Google …) and the kind of device.
-- No names, phone numbers, IP addresses or cookies. Only the baker can read it.
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor text not null,
  session text not null,
  kind text not null check (kind in ('view', 'product', 'cart', 'checkout', 'order')),
  path text,
  source text,
  ref text,
  device text,
  os text,
  browser text,
  app boolean not null default false,
  product_id uuid
);
create index if not exists site_events_at on public.site_events (at);
create index if not exists site_events_session on public.site_events (session, at);
create index if not exists site_events_visitor on public.site_events (visitor, at);

alter table public.site_events enable row level security;
drop policy if exists admin_read on public.site_events;
create policy admin_read on public.site_events for select to authenticated using (public.is_admin());
drop policy if exists admin_delete on public.site_events;
create policy admin_delete on public.site_events for delete to authenticated using (public.is_admin());

-- The website calls this for each page visit. It never fails loudly — a visit must never break the shop.
create or replace function public.track(p jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v text := lower(left(coalesce(p ->> 'visitor', ''), 40));
  s text := lower(left(coalesce(p ->> 'session', ''), 40));
  k text := p ->> 'kind';
  pid uuid;
begin
  if v !~ '^[a-z0-9-]{8,40}$' or s !~ '^[a-z0-9-]{8,40}$' then return; end if;
  if k is null or k not in ('view', 'product', 'cart', 'checkout', 'order') then return; end if;
  -- spam guards: one visit can't flood the table, and nor can a storm of fake visitors
  if (select count(*) from site_events where session = s and at > now() - interval '1 hour') >= 300 then return; end if;
  if (select count(*) from site_events where at > now() - interval '1 hour') >= 30000 then return; end if;
  if coalesce(p ->> 'product_id', '') ~ '^[0-9a-fA-F-]{36}$' then pid := (p ->> 'product_id')::uuid; end if;
  insert into site_events (visitor, session, kind, path, source, ref, device, os, browser, app, product_id)
  values (v, s, k,
    left(nullif(split_part(coalesce(p ->> 'path', ''), '?', 1), ''), 120),
    case when p ->> 'source' in ('instagram', 'whatsapp', 'facebook', 'google', 'search', 'qr', 'direct', 'other') then p ->> 'source' else 'other' end,
    left(nullif(p ->> 'ref', ''), 80),
    case when p ->> 'device' in ('mobile', 'tablet', 'desktop') then p ->> 'device' else 'mobile' end,
    left(nullif(p ->> 'os', ''), 20),
    left(nullif(p ->> 'browser', ''), 20),
    coalesce(p ->> 'app', '') = 'true',
    pid);
  -- housekeeping: keep about 13 months
  if random() < 0.002 then delete from site_events where at < now() - interval '400 days'; end if;
exception when others then
  return;
end $$;
revoke all on function public.track(jsonb) from public;
grant execute on function public.track(jsonb) to anon, authenticated;

-- Everything the "Site traffic" page shows, worked out in the database (baker only).
-- p_days = 1 means "today so far", 7 = last 7 days incl. today, etc.
create or replace function public.admin_traffic(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public set work_mem = '64MB' as $$
declare
  tz text := bakery_tz();
  d0 date;
  t0 timestamptz; t1 timestamptz := now();
  pt0 timestamptz; pt1 timestamptz;
  res jsonb;
begin
  if not is_admin() then raise exception 'AUTH: admins only'; end if;
  p_days := least(greatest(coalesce(p_days, 7), 1), 400);
  d0 := (now() at time zone tz)::date - (p_days - 1);
  t0 := d0::timestamp at time zone tz;
  pt0 := t0 - make_interval(days => p_days);
  pt1 := t1 - make_interval(days => p_days);

  with e as (
    select *, case
        when path is null or path = '/' then '/'
        when path like '/cake/%' then '/cake'
        when path like '/menu/%' then '/menu'
        when path like '/order/%' or path like '/o/%' then '/order'
        else path end as page
      from site_events where at >= t0 and at <= t1
  ),
  ses as (
    select session, min(visitor) as visitor,
           (array_agg(source order by at))[1] as source,
           (array_agg(device order by at))[1] as device,
           bool_or(app) as app,
           count(*) filter (where kind = 'view') as views,
           count(*) as events,
           bool_or(kind = 'product') as saw_product, bool_or(kind = 'cart') as carted,
           bool_or(kind = 'checkout') as checkout, bool_or(kind = 'order') as ordered,
           extract(epoch from max(at) - min(at)) as secs
      from e group by session
  ),
  vis0 as (
    select visitor, (array_agg(device order by at))[1] as device, (array_agg(os order by at))[1] as os,
           (array_agg(browser order by at))[1] as browser
      from e group by visitor
  ),
  vis as (  -- "new" = never seen before this period (one pass, fast even with a year of visits)
    select v.*, o.visitor is null as is_new
      from vis0 v left join (select distinct visitor from site_events where at < t0) o on o.visitor = v.visitor
  ),
  prev as (
    select count(distinct visitor) as visitors, count(distinct session) as sessions,
           count(*) filter (where kind = 'view') as views,
           count(distinct session) filter (where kind = 'order') as order_sessions
      from site_events where at >= pt0 and at <= pt1
  )
  select jsonb_build_object(
    'days', p_days,
    'from', d0,
    'live', (select count(distinct visitor) from site_events where at > now() - interval '5 minutes'),
    'totals', jsonb_build_object(
      'visitors', (select count(*) from vis),
      'new_visitors', (select count(*) from vis where is_new),
      'sessions', (select count(*) from ses),
      'views', (select coalesce(sum(views), 0) from ses),
      'order_sessions', (select count(*) from ses where ordered),
      'bounce', (select count(*) from ses where events <= 1),
      'avg_secs', (select coalesce(round(avg(secs))::int, 0) from ses where events > 1),
      'app_sessions', (select count(*) from ses where app),
      'orders', (select count(*) from orders where created_at >= t0 and created_at <= t1 and status <> 'draft')
    ),
    'previous', (select to_jsonb(prev) from prev),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0), 'orders', coalesce(x.orders, 0)) order by g.day), '[]')
                from (select generate_series(d0, (now() at time zone tz)::date, interval '1 day')::date as day) g
                left join (select (at at time zone tz)::date as day, count(distinct visitor) as visitors,
                                  count(*) filter (where kind = 'view') as views, count(distinct session) filter (where kind = 'order') as orders
                             from e group by 1) x on x.day = g.day),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', g.h, 'views', coalesce(x.views, 0)) order by g.h), '[]')
                from generate_series(0, 23) g(h)
                left join (select extract(hour from at at time zone tz)::int as h, count(*) as views from e where kind = 'view' group by 1) x on x.h = g.h),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'sessions', n, 'orders', o) order by n desc), '[]')
                  from (select coalesce(source, 'direct') as source, count(*) as n, count(*) filter (where ordered) as o from ses group by 1) s),
    'referrers', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'visits', n) order by n desc), '[]')
                    from (select ref, count(distinct session) as n from e where ref is not null group by ref order by n desc limit 8) r),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'visitors', n) order by n desc), '[]')
                  from (select coalesce(device, 'mobile') as device, count(*) as n from vis group by 1) d),
    'os', (select coalesce(jsonb_agg(jsonb_build_object('os', os, 'visitors', n) order by n desc), '[]')
             from (select coalesce(os, 'Other') as os, count(*) as n from vis group by 1) d),
    'browsers', (select coalesce(jsonb_agg(jsonb_build_object('browser', browser, 'visitors', n) order by n desc), '[]')
                   from (select coalesce(browser, 'Other') as browser, count(*) as n from vis group by 1) d),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', n, 'visitors', v) order by n desc), '[]')
                from (select page, count(*) as n, count(distinct visitor) as v from e where kind = 'view' group by page order by n desc limit 12) pg),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('id', x.product_id, 'name', coalesce(pr.name, 'Removed item'), 'views', x.views, 'carts', x.carts) order by x.views desc, x.carts desc), '[]')
                   from (select product_id, count(*) filter (where kind = 'product') as views, count(*) filter (where kind = 'cart') as carts
                           from e where product_id is not null group by product_id order by 2 desc, 3 desc limit 10) x
                   left join products pr on pr.id = x.product_id),
    'funnel', jsonb_build_object(
      'visits', (select count(*) from ses),
      'product', (select count(*) from ses where saw_product or carted or checkout or ordered),
      'cart', (select count(*) from ses where carted or checkout or ordered),
      'checkout', (select count(*) from ses where checkout or ordered),
      'order', (select count(*) from ses where ordered))
  ) into res;
  return res;
end $$;
revoke all on function public.admin_traffic(int) from public;
grant execute on function public.admin_traffic(int) to authenticated;

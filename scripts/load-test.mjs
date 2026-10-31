// Run: start a local PostgreSQL on /var/tmp:5433, then `node scripts/load-test.mjs`
// Load test against a real local PostgreSQL 16 running the bakery's exact database code.
import pg from 'pg'
import { readFileSync } from 'node:fs'
const cfg = { host: '/var/tmp', port: 5433, user: 'postgres', database: 'postgres' }
const admin = new pg.Client(cfg); await admin.connect()
await admin.query(`drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  create function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
  create table auth.users(id uuid primary key, email text);
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated; grant all on storage.objects to anon, authenticated;`)
for (const f of ['001_schema', '002_seed', '009_reviews_hampers_menu', '010_order_limit_close_orders']) await admin.query(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))
await admin.query(`grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to anon, authenticated;`)
const prod = (await admin.query(`select id from products where name = 'Choux Pastry'`)).rows[0].id
const slots = (await admin.query(`select id, label, capacity from time_slots order by sort`)).rows
const days = (await admin.query(`select to_char(d, 'YYYY-MM-DD') d from generate_series((now() at time zone 'Asia/Kolkata')::date + 3, (now() at time zone 'Asia/Kolkata')::date + 40, interval '1 day') d where extract(dow from d) <> 0`)).rows.map((r) => r.d)

const pool = new pg.Pool({ ...cfg, max: 60 })
pool.on('connect', (c) => c.query('set role anon'))
const order = (i, extra = {}) => ({ name: 'Load Test ' + i, phone: String(9000000000 + i), fulfilment: 'pickup', accepted_policies: true, payment_method: 'upi',
  items: [{ product_id: prod, qty: 4 }], idempotency_key: 'k' + i + '-' + Math.random(), ...extra })
async function place(p) {
  const t = Date.now()
  try { const r = await pool.query('select place_order($1) r', [p]); return { ok: true, ms: Date.now() - t, num: r.rows[0].r.order_number, dup: r.rows[0].r.duplicate } }
  catch (e) { return { ok: false, ms: Date.now() - t, err: e.message.split(':')[0] } }
}
const stats = (rs) => { const ms = rs.map((r) => r.ms).sort((a, b) => a - b); const errs = {}; rs.filter((r) => !r.ok).forEach((r) => (errs[r.err] = (errs[r.err] || 0) + 1))
  return { total: rs.length, placed: rs.filter((r) => r.ok && !r.dup).length, errors: errs, median_ms: ms[Math.floor(ms.length / 2)], p95_ms: ms[Math.floor(ms.length * 0.95)], max_ms: ms.at(-1) } }

// A: 100 people grab the SAME slot at the same moment
let rs = await Promise.all(Array.from({ length: 100 }, (_, i) => place(order(i, { date: days[0], slot_id: slots[1].id }))))
const a = stats(rs)
const inSlot = (await admin.query(`select count(*)::int n from orders where requested_date = $1 and slot_id = $2`, [days[0], slots[1].id])).rows[0].n
console.log('A same slot, 100 at once:', JSON.stringify(a), '| orders in that slot:', inSlot, '(capacity', slots[1].capacity + ')')

// B: same order submitted 10 times at once (double-tap / bad network retries)
const same = order(5000, { date: days[1], slot_id: slots[2].id, idempotency_key: 'double-tap' })
rs = await Promise.all(Array.from({ length: 10 }, () => place(same)))
const nB = (await admin.query(`select count(*)::int n from orders where idempotency_key = 'double-tap'`)).rows[0].n
console.log('B 10 identical submits:', JSON.stringify(stats(rs)), '| orders created:', nB)

// C: busy launch — 300 orders spread over many days, 60 at a time (shop limits lifted to measure raw speed)
await admin.query(`update settings set data = data || '{"max_orders_per_day": 1000}'::jsonb where id = 1; update time_slots set capacity = 1000;`)
await admin.query(`create or replace function public._nolimit() returns void language sql as $$ select 1 $$`)
// lift the 60/hour shop cap only for this throughput run
const src = (await admin.query(`select pg_get_functiondef('public.place_order(jsonb)'::regprocedure) d`)).rows[0].d
await admin.query(src.replace(/>= 60 then/, '>= 100000 then'))
const t0 = Date.now()
rs = await Promise.all(Array.from({ length: 300 }, (_, i) => place(order(10000 + i, { date: days[2 + (i % 20)], slot_id: slots[i % slots.length].id }))))
const c = stats(rs), secs = (Date.now() - t0) / 1000
const nums = (await admin.query(`select order_number from orders`)).rows.map((r) => r.order_number)
console.log('C 300 orders burst:', JSON.stringify(c), '| took', secs.toFixed(1) + 's', '→', Math.round(c.placed / secs), 'orders/sec | duplicate order numbers:', nums.length - new Set(nums).size)

// D: menu reads under load (what every visitor does)
const t1 = Date.now(); let ok = 0
await Promise.all(Array.from({ length: 1000 }, async () => { await pool.query('select * from products'); await pool.query(`select get_availability((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + 30) r`); ok++ }))
console.log('D 1000 visitors loading menu + calendar:', ok, 'ok in', ((Date.now() - t1) / 1000).toFixed(1) + 's')
await pool.end(); await admin.end()

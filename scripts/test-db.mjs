// Runs the real Supabase SQL inside an in-memory Postgres (PGlite) with stubbed
// Supabase roles/auth/storage, then exercises the business rules.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); }

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
`)
let schema = readFileSync('supabase/migrations/001_schema.sql', 'utf8')
await db.exec(schema)
await db.exec(readFileSync('supabase/migrations/002_seed.sql', 'utf8'))
await db.exec(`grant all on all tables in schema public to anon, authenticated;
               grant all on all sequences in schema public to anon, authenticated;`)

const asAnon = async (sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false); set role anon;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const asUser = async (uid, claims, sql, params, pre = '') => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); ${pre} set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

// ---------- dates ----------
const tz = 'Asia/Kolkata'
const today = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const openDay = (min) => { for (let i = min; i < min + 10; i++) { const d = addDays(i); if (d.getDay() !== 0) return iso(d) } }
const D4 = openDay(4), D5 = openDay(D4 === openDay(5) ? 6 : 5)

const prod = (await db.query(`select id, name from products where name = 'Celebration Cake'`)).rows[0]
const cookie = (await db.query(`select id from products where name = 'New York Chunky Cookie'`)).rows[0]
const brownieP = (await db.query(`select id from products where name = 'Brownie Box'`)).rows[0]
const chouxP = (await db.query(`select id from products where name = 'Choux Pastry'`)).rows[0]
const slots = (await db.query(`select id, label, capacity from time_slots order by sort`)).rows

// 1. public can browse menu, not private data
ok('1 anon can browse menu', (await asAnon('select count(*)::int n from products')).rows[0].n === 29)
ok('20 anon cannot read orders/customers', (await asAnon('select count(*)::int n from customers')).rows[0].n === 0)

// 2. pricing (cakes priced per kg by flavour)
const item = { product_id: prod.id, qty: 1, weight: '1 kg', flavour: 'Red velvet' }
const q = (await asAnon('select quote_order($1) r', [{ items: [item], fulfilment: 'pickup' }])).rows[0].r
ok('2 red velvet 1 kg = 1700, advance 850', q.subtotal === 1700 && q.advance_due === 850, JSON.stringify({ sub: q.subtotal, adv: q.advance_due }))
const qh = (await asAnon('select quote_order($1) r', [{ items: [{ product_id: prod.id, qty: 1, weight: '1 kg', flavour: 'Vanilla' }, { product_id: prod.id, qty: 1, weight: '1.5 kg', flavour: 'Pecan' }], fulfilment: 'pickup' }])).rows[0].r
ok('2b vanilla 1 kg = 1600, pecan 1.5 kg = 3300', qh.items[0].line_total === 1600 && qh.items[1].line_total === 3300, qh.items.map((i) => i.line_total).join(','))
const qc = (await asAnon('select quote_order($1) r', [{ items: [{ product_id: chouxP.id, qty: 4 }, { product_id: brownieP.id, qty: 1, weight: '16 pieces', flavour: 'Classic' }], fulfilment: 'pickup' }])).rows[0].r
ok('2c choux 4 x 100 = 400, brownies 16 pcs = 850', qc.items[0].line_total === 400 && qc.items[1].line_total === 850)
const eMin = await err(() => asAnon('select quote_order($1)', [{ items: [{ product_id: chouxP.id, qty: 2 }], fulfilment: 'pickup' }]))
ok('2d minimum quantity enforced (choux min 4)', /minimum order/.test(eMin || ''), eMin)

// 3/4. 48-hour rule
const av = (await asAnon('select get_availability(current_date, current_date + 3) r')).rows[0].r
const tomorrow = av.days[1]
ok('3 tomorrow not bookable', tomorrow.slots.every((s) => !s.eligible))
ok('4 lead time 48h reported', av.lead_hours === 48)
const base = { name: 'Priya', phone: '98765 43210', fulfilment: 'pickup', accepted_policies: true, payment_method: 'upi', items: [item] }
const e48 = await err(() => asAnon('select place_order($1)', [{ ...base, date: iso(addDays(1)), slot_id: slots[0].id }]))
ok('4 place_order rejects < 48h', /SLOT_UNAVAILABLE/.test(e48 || ''), e48)
const custom72 = (await db.query(`select id from products where name='Custom Design Cake'`)).rows[0]

// place good order
const o1 = (await asAnon('select place_order($1) r', [{ ...base, date: D4, slot_id: slots[1].id, idempotency_key: 'k1', occasion: 'Birthday', occasion_date: '2026-10-20', remember_occasion: true, occasion_person: 'Anu' }])).rows[0].r
ok('11 order reference generated', /^PT-\d+-\d{2}$/.test(o1.order_number), o1.order_number)
ok('9 new UPI order awaits payment', o1.status === 'awaiting_payment')

// 23. duplicate submission
const o1b = (await asAnon('select place_order($1) r', [{ ...base, date: D4, slot_id: slots[1].id, idempotency_key: 'k1' }])).rows[0].r
ok('23 duplicate submit returns same order', o1b.duplicate && o1b.order_number === o1.order_number)

// 24. capacity (slot 2 capacity = 2)
await asAnon('select place_order($1)', [{ ...base, phone: '9000000001', date: D4, slot_id: slots[1].id, idempotency_key: 'k2' }])
await asAnon('select place_order($1)', [{ ...base, phone: '9000000003', date: D4, slot_id: slots[1].id, idempotency_key: 'k2b' }])
const eFull = await err(() => asAnon('select place_order($1)', [{ ...base, phone: '9000000002', date: D4, slot_id: slots[1].id, idempotency_key: 'k3' }]))
ok('24 slot cannot be overbooked', /SLOT_UNAVAILABLE/.test(eFull || ''), eFull)

// 5/6. self pickup only; courier only for courier items
const addr = { line: '12 Main Rd', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' }
const eHome = await err(() => asAnon('select place_order($1)', [{ ...base, fulfilment: 'delivery', date: D5, slot_id: slots[3].id, idempotency_key: 'h1', address: addr }]))
ok('5 home delivery refused', /home delivery/.test(eHome || ''), eHome)
const eCourCake = await err(() => asAnon('select place_order($1)', [{ ...base, fulfilment: 'courier', date: D5, slot_id: slots[3].id, idempotency_key: 'z1', address: addr }]))
ok('5b cake cannot be couriered', /cannot be couriered/.test(eCourCake || ''), eCourCake)
const oz = (await asAnon('select place_order($1) r', [{ ...base, fulfilment: 'courier', items: [{ product_id: brownieP.id, qty: 1, weight: '8 pieces', flavour: 'Classic' }], date: D5, slot_id: slots[3].id, idempotency_key: 'z2', address: addr }])).rows[0].r
ok('6 brownie courier order waits for courier charge', oz.needs_delivery_approval && oz.status === 'submitted' && oz.total === 600)

// 8. cash rules (advance by UPI; cash only for the balance by default)
const eCashAdv = await err(() => asAnon('select place_order($1)', [{ ...base, date: D5, slot_id: slots[0].id, idempotency_key: 'c1', payment_method: 'cash' }]))
ok('8 cash advance blocked by default', /cash/.test(eCashAdv || ''), eCashAdv)
await db.exec(`update settings set data = data || '{"cash_for":"both"}'`)
const oc = (await asAnon('select place_order($1) r', [{ ...base, phone: '9111111111', date: D5, slot_id: slots[0].id, idempotency_key: 'c2', payment_method: 'cash' }])).rows[0].r
ok('8b cash allowed for pickup when enabled', oc.status === 'submitted')

// pause orders (announcement board)
await db.exec(`update settings set data = data || '{"orders_paused":true,"orders_paused_message":"On leave till Monday"}'`)
const ePause = await err(() => asAnon('select place_order($1)', [{ ...base, phone: '9222222222', date: D5, slot_id: slots[2].id, idempotency_key: 'p1' }]))
ok('orders refused while paused', /On leave till Monday/.test(ePause || ''), ePause)
await db.exec(`update settings set data = data || '{"orders_paused":false}'`)

// track by mobile only
const noList = await err(() => asAnon('select get_orders_by_phone($1) r', ['98765 43210']))
ok('a mobile number alone cannot list orders (privacy)', /does not exist/.test(noList || ''), noList)
{
  // one Order ID tried against many different mobiles gets blocked
  let blocked = false
  for (let i = 0; i < 12; i++) { const r = await err(() => asAnon('select get_order($1,$2) r', ['PT-99-26', '90000001' + String(i).padStart(2, '0')])); if (/RATE_LIMIT/.test(r || '')) blocked = true }
  ok('guessing one Order ID with many mobiles is blocked', blocked)
}

// 20. order lookup needs matching phone
const eLook = (await asAnon('select get_order($1,$2) r', [o1.order_number, '9000000009'])).rows[0].r
ok('20 wrong phone cannot view order', /NOT_FOUND/.test(eLook.error || '') && !eLook.items)
const view = (await asAnon('select get_order($1,$2) r', [o1.order_number, '+91 98765-43210'])).rows[0].r
ok('20b right phone can view order', view.order_number === o1.order_number)

// 9. manual UPI stays unverified
const pv = (await asAnon('select submit_payment_proof($1,$2,$3,$4,$5) r', [o1.order_number, '9876543210', 'UPI123456', null, 1050])).rows[0].r
ok('9 proof does not mark paid', pv.payment_status === 'verification_pending' && pv.amount_paid === 0 && pv.status === 'payment_verification', pv.payment_status + '/' + pv.status)

// anon cannot write directly
const eW = await err(() => asAnon(`update orders set status='confirmed' returning id`))
const still = (await db.query('select status from orders where order_number=$1', [o1.order_number])).rows[0].status
ok('20c anon cannot change orders', still === 'payment_verification', eW || '')

// admin flow
const ADMIN = '11111111-1111-1111-1111-111111111111'
const AC = { email: 'pasteltreatsdgl@gmail.com' }
const claimedEvil = (await asUser('22222222-2222-2222-2222-222222222222', { email: 'evil@x.com' }, 'select claim_first_admin() r')).rows[0].r
const claimed = (await asUser(ADMIN, AC, 'select claim_first_admin() r')).rows[0].r
const claimed2 = (await asUser(ADMIN, AC, 'select claim_first_admin() r')).rows[0].r
ok('admin bootstrap only once, only the bakery e-mail', claimed === true && claimed2 === false && claimedEvil === false)
{
  // even if someone else is put in the admins table, a different e-mail gets no access
  await db.exec(`insert into admins(user_id, email, role) values ('33333333-3333-3333-3333-333333333333', 'other@x.com', 'owner')`)
  const seen = (await asUser('33333333-3333-3333-3333-333333333333', { email: 'other@x.com' }, 'select count(*)::int n from orders')).rows[0].n
  const isAdm = (await asUser('33333333-3333-3333-3333-333333333333', { email: 'other@x.com' }, 'select is_admin() r')).rows[0].r
  const bakerSees = (await asUser(ADMIN, AC, 'select count(*)::int n from orders')).rows[0].n
  ok('only pasteltreatsdgl@gmail.com can see orders', seen === 0 && isAdm === false && bakerSees > 0, `other=${seen}, baker=${bakerSees}`)
  await db.exec(`delete from admins where user_id = '33333333-3333-3333-3333-333333333333'`)
}
const evilRead = (await asUser('22222222-2222-2222-2222-222222222222', {}, 'select count(*)::int n from orders')).rows[0].n
ok('20d non-admin signed-in user sees no orders', evilRead === 0)

const oid = (await db.query('select id from orders where order_number=$1', [o1.order_number])).rows[0].id
await asUser(ADMIN, AC, `update payments set status='verified' where order_id=$1`, [oid])
let ord = (await db.query('select * from orders where id=$1', [oid])).rows[0]
ok('15 verified advance updates balance', ord.amount_paid === 1050 && ord.payment_status === 'advance_received' && ord.status === 'advance_received', `${ord.amount_paid} ${ord.payment_status} ${ord.status}`)
await asUser(ADMIN, AC, `update orders set status='confirmed' where id=$1`, [oid], `select set_config('app.status_note','Confirmed by baker',false);`)
const hist = (await db.query('select to_status, note, actor from order_status_history where order_id=$1 order by id', [oid])).rows
ok('status history recorded with actor', hist.at(-1).to_status === 'confirmed' && hist.at(-1).actor === ADMIN)
await asUser(ADMIN, AC, `insert into payments(order_id, kind, method, amount, status) values ($1,'balance','cash',1050,'verified')`, [oid])
ord = (await db.query('select * from orders where id=$1', [oid])).rows[0]
ok('15b cash balance → fully paid', ord.payment_status === 'fully_paid' && ord.amount_paid === 2100)

// 13/14. price change preserves history
await asUser(ADMIN, AC, `update products set flavours = '[{"name":"Red velvet","price":1900}]' where id=$1`, [prod.id])
ord = (await db.query('select items from orders where id=$1', [oid])).rows[0]
ok('14 historic order keeps agreed price', ord.items[0].weight_price === 1700)
const audit = (await db.query(`select count(*)::int n from audit_logs where entity='products' and actor=$1`, [ADMIN])).rows[0].n
ok('audit log captures price change', audit >= 1)

// 16/17. customer matching
const cust = (await db.query(`select c.id, count(o.*)::int n from customers c join orders o on o.customer_id=c.id where c.phone='+919876543210' group by c.id`)).rows[0]
ok('17 orders linked to same customer', cust.n === 2, `orders=${cust.n}`)

// 18/19. occasions
const occ = (await db.query(`select * from occasions where customer_id=$1`, [cust.id])).rows
ok('18 occasion saved from checkout', occ.length === 1 && occ[0].kind === 'Birthday')

// 12. custom request
const ci = { product_id: custom72.id, qty: 1, weight: '1 kg', design: 'Designer cake', custom_request: true, custom_description: 'Unicorn theme' }
const oCustom = (await asAnon('select place_order($1) r', [{ ...base, items: [ci], date: openDay(5), slot_id: slots[4].id, idempotency_key: 'cu1' }])).rows[0].r
ok('12 custom design awaits review', oCustom.is_custom && oCustom.status === 'submitted')

// customer OTP profile by email
await db.exec(`update customers set email='priya@example.com' where phone='+919876543210'`)
const prof = (await asUser('33333333-3333-3333-3333-333333333333', { email: 'priya@example.com' }, 'select my_profile() r')).rows[0].r
ok('16 verified customer sees own orders', prof.customer && prof.orders.length === 3, `orders=${prof.orders?.length}`)
const prof2 = (await asUser('44444444-4444-4444-4444-444444444444', { email: 'nobody@example.com' }, 'select my_profile() r')).rows[0].r
ok('16b unknown login sees nothing', prof2.customer === null)

// rate limit
let rl = null
for (let i = 0; i < 12; i++) rl = await err(() => asAnon('select get_order($1,$2)', ['PTX', '9333333333']))

ok('rate limit on lookups', /RATE_LIMIT/.test(rl || ''))

// Sunday opens at 11 AM: the 9–11 slot is offered Mon–Sat only
{
  const nextSun = "current_date + ((7 - extract(dow from current_date)::int) % 7 + 7)"
  const r = (await asAnon(`select get_availability(${nextSun}, ${nextSun} + 1) r`)).rows[0].r
  const sun = r.days[0].slots.map((x) => x.label), mon = r.days[1].slots.map((x) => x.label)
  ok('Sunday has no 9 AM slot, Monday does', !sun.some((l) => l.startsWith('9:00')) && mon.some((l) => l.startsWith('9:00')), `Sun ${sun.length} slots, Mon ${mon.length}`)
}

// short IDs count up: PT-1-YY, PT-2-YY …
{
  const nums = (await db.query("select order_number from orders where order_number like 'PT-%' order by split_part(order_number, '-', 2)::int")).rows.map((r) => r.order_number)
  const n = nums.map((x) => +x.split('-')[1])
  ok('order numbers run 1, 2, 3 … without gaps or repeats', n.length > 1 && n.every((v, i) => v === i + 1), nums.slice(0, 4).join(', '))
}

// only the bakery e-mail can be created as a login
{
  await db.exec(`create table if not exists auth.users(id uuid primary key, email text)`)
  await db.exec(readFileSync('supabase/migrations/006_bakery_only_signup.sql', 'utf8'))
  const bad = await err(() => db.exec(`insert into auth.users(id, email) values (gen_random_uuid(), 'stranger@gmail.com')`))
  let good = true; try { await db.exec(`insert into auth.users(id, email) values (gen_random_uuid(), 'PastelTreatsDgl@gmail.com')`) } catch { good = false }
  ok('sign-up allowed only for pasteltreatsdgl@gmail.com', /closed/.test(bad || '') && good, bad)
}

// flood protection: a 4th order from the same mobile within an hour is refused
{
  const flood = { ...base, phone: '91234 56780', name: 'Spammer' }
  const msgs = []
  for (let i = 0; i < 4; i++) {
    const r = await err(() => asAnon('select place_order($1) r', [{ ...flood, idempotency_key: 'flood-' + i, date: openDay(4 + i), slot_id: slots[2].id }]))
    msgs.push(r)
  }
  ok('max 3 orders per mobile per hour', msgs.slice(0, 3).every((m) => m === null || !/RATE_LIMIT/.test(m)) && /RATE_LIMIT/.test(msgs[3] || ''), msgs[3])
}

// deleting a customer needs a fresh e-mail code (OTP) — not possible directly
{
  const cid = (await db.query(`insert into customers(name, phone) values ('Delete Me', '+919000077777') returning id`)).rows[0].id
  await asUser(ADMIN, AC, `delete from customers where id = $1`, [cid])
  const still = (await db.query(`select count(*)::int n from customers where id = $1`, [cid])).rows[0].n
  const noCode = await err(() => asUser(ADMIN, AC, 'select admin_delete_customer($1)', [cid]))
  const oldCode = await err(() => asUser(ADMIN, { ...AC, amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 3600 }] }, 'select admin_delete_customer($1)', [cid]))
  const notBaker = await err(() => asUser('44444444-4444-4444-4444-444444444444', { email: 'x@y.com', amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }] }, 'select admin_delete_customer($1)', [cid]))
  const okDel = await err(() => asUser(ADMIN, { ...AC, amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }] }, 'select admin_delete_customer($1)', [cid]))
  const gone = (await db.query(`select count(*)::int n from customers where id = $1`, [cid])).rows[0].n
  ok('customer delete needs a fresh e-mail code', still === 1 && /CONFIRM/.test(noCode || '') && /CONFIRM/.test(oldCode || '') && /AUTH/.test(notBaker || '') && okDel === null && gone === 0, [noCode, okDel].join(' | '))
}

// customer place: saved on first order, updated when changed
{
  const ph = '93000 11122'
  await asAnon('select place_order($1) r', [{ ...base, phone: ph, name: 'Place Test', state: 'Tamil Nadu', city: 'Madurai', idempotency_key: 'pl1', date: openDay(6), slot_id: slots[3].id }])
  const c1 = (await db.query(`select state, city from customers where phone = '+919300011122'`)).rows[0]
  await asAnon('select place_order($1) r', [{ ...base, phone: ph, name: 'Place Test', state: 'Karnataka', city: 'Bengaluru', idempotency_key: 'pl2', date: openDay(7), slot_id: slots[3].id }])
  const c2 = (await db.query(`select state, city from customers where phone = '+919300011122'`)).rows[0]
  const o2 = (await db.query(`select customer_city from orders where idempotency_key = 'pl2'`)).rows[0]
  ok('customer place saved and updated', c1.city === 'Madurai' && c2.city === 'Bengaluru' && c2.state === 'Karnataka' && o2.customer_city === 'Bengaluru', JSON.stringify([c1, c2]))
}

// private order link: opens the order without typing; a made-up link opens nothing
{
  const r = (await asAnon('select place_order($1) r', [{ ...base, phone: '93000 22233', name: 'Link Test', idempotency_key: 'lk1', date: openDay(8), slot_id: slots[3].id }])).rows[0].r
  const viaLink = (await asAnon('select get_order_by_link($1) r', [r.link_token])).rows[0].r
  const fake = (await asAnon('select get_order_by_link($1) r', ['abcdef1234567890'])).rows[0].r
  const short = (await asAnon('select get_order_by_link($1) r', ['ab'])).rows[0].r
  ok('private order link works, fake links don\'t', r.link_token?.length === 14 && viaLink.order_number === r.order_number && viaLink.phone === '+919300022233' && /NOT_FOUND/.test(fake.error) && /NOT_FOUND/.test(short.error), r.link_token)
}


// courier: no time slot needed, UPI only
{
  const addr = { line: '1 Test St', city: 'Chennai', pincode: '600001' }
  const bItem = { product_id: brownieP.id, qty: 1, weight: '8 pieces', flavour: 'Classic' }
  const r = (await asAnon('select place_order($1) r', [{ ...base, phone: '93000 33344', fulfilment: 'courier', items: [bItem], date: openDay(5), slot_id: null, idempotency_key: 'cn1', address: addr }])).rows[0].r
  const row = (await db.query(`select slot_id, slot_label from orders where order_number = $1`, [r.order_number])).rows[0]
  const cash = await err(() => asAnon('select place_order($1) r', [{ ...base, phone: '93000 33355', fulfilment: 'courier', payment_method: 'cash', items: [bItem], date: openDay(5), idempotency_key: 'cn2', address: addr }]))
  ok('courier order needs no time slot; cash refused for courier', !!r.order_number && row.slot_id === null && row.slot_label === 'Courier dispatch' && /UPI/.test(cash || ''), cash)
}

// names saved in CAPITALS
{
  const r = (await asAnon('select place_order($1) r', [{ ...base, phone: '93000 44455', name: '  priya Ramesh ', idempotency_key: 'cap1', date: openDay(9), slot_id: slots[3].id }])).rows[0].r
  const o = (await db.query(`select customer_name from orders where order_number = $1`, [r.order_number])).rows[0]
  const c = (await db.query(`select name from customers where phone = '+919300044455'`)).rows[0]
  ok('customer names stored in CAPITALS', o.customer_name === 'PRIYA RAMESH' && c.name === 'PRIYA RAMESH', o.customer_name)
}

// hampers / seasonal are "message to order" — can't be placed through the cart
{
  const h = (await db.query(`select id from products where name = 'Corporate Gift Hamper'`)).rows[0]
  const e = await err(() => asAnon('select quote_order($1) r', [{ items: [{ product_id: h.id, qty: 1 }], fulfilment: 'pickup' }]))
  ok('hamper is message-to-order only', /WhatsApp/.test(e || ''), e)
}

// reviews: only a real, handed-over order can be reviewed, once; hidden until approved
{
  const r = (await asAnon('select place_order($1) r', [{ ...base, phone: '93000 55566', name: 'Kavya S', idempotency_key: 'rv1', date: openDay(10), slot_id: slots[3].id }])).rows[0].r
  const early = await err(() => asAnon('select submit_review($1, 5, $2)', [r.link_token, 'Lovely cake']))
  const fake = (await asAnon('select submit_review($1, 5, $2) r', ['ffffffffffffffff', 'Fake review'])).rows[0].r
  await db.query(`update orders set status = 'completed' where order_number = $1`, [r.order_number])
  const v = (await asAnon('select submit_review($1, 5, $2) r', [r.link_token, 'Lovely cake, everyone loved it!'])).rows[0].r
  const twice = await err(() => asAnon('select submit_review($1, 4, $2)', [r.link_token, 'Again']))
  const before = (await asAnon('select get_public_reviews() r')).rows[0].r
  const anonRead = (await asAnon('select count(*)::int n from reviews')).rows[0].n
  const anonApprove = await asAnon(`update reviews set approved = true returning id`)
  await asUser(ADMIN, AC, `update reviews set approved = true`)
  const after = (await asAnon('select get_public_reviews() r')).rows[0].r
  ok('reviews: only after hand-over, once, hidden until baker approves',
    /handed over/.test(early || '') && /NOT_FOUND/.test(fake.error) && v.review?.rating === 5 && /already/.test(twice || '') &&
    before.length === 0 && anonRead === 0 && anonApprove.rows.length === 0 && after.length === 1 && after[0].name === 'Kavya' && after[0].order_number === r.order_number,
    JSON.stringify(after[0] || {}))
}

// the 009 update runs cleanly on the existing database (twice)
{
  const e1 = await err(() => db.exec(readFileSync('supabase/migrations/009_reviews_hampers_menu.sql', 'utf8')))
  const e2 = await err(() => db.exec(readFileSync('supabase/migrations/009_reviews_hampers_menu.sql', 'utf8')))
  const n = (await db.query(`select count(*)::int n from products where name ilike '%hamper%'`)).rows[0].n
  const prot = (await db.query(`select description from products where name = 'Protein Brownie / Cookie'`)).rows[0].description
  ok('009 update is safe to run (twice)', e1 === null && e2 === null && n === 4 && /NO flour/.test(prot), e1 || e2)
}

for (const r of results) console.log(r[0], r[1], r[2] ? `  (${r[2]})` : '')
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

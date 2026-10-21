// Generates supabase/migrations/002_seed.sql from src/data/seed.js
import { writeFileSync } from 'node:fs'
import { SEED_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_ADDONS, SEED_SLOTS, SEED_ZONES } from '../src/data/seed.js'

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const j = (v) => `${q(JSON.stringify(v ?? []))}::jsonb`
const arr = (a) => `array[${(a || []).map(q).join(',')}]::text[]`

let sql = `-- Starter data for Pastel Treats (generated from src/data/seed.js). Safe to run once.
-- Prices are SAMPLE values: edit them in the app under Admin → Menu & Pricing.

insert into public.settings(id, data) values (1, ${j(SEED_SETTINGS)})
on conflict (id) do nothing;

`
for (const c of SEED_CATEGORIES)
  sql += `insert into public.categories(slug, name, description, sort) values (${q(c.slug)}, ${q(c.name)}, ${q(c.description)}, ${c.sort}) on conflict (slug) do nothing;\n`
sql += '\n'
SEED_PRODUCTS.forEach((p, i) => {
  sql += `insert into public.products(category_id, name, description, images, base_price, unit_label, weights, flavours, fillings, frostings, designs, egg_options, allergens, dietary, occasions, lead_time_hours, is_featured, allow_message, sort, min_qty, pricing_mode, courier_ok)
select id, ${q(p.name)}, ${q(p.description)}, ${arr(p.images)}, ${p.base_price}, ${q(p.unit || 'cake')}, ${j(p.weights)}, ${j(p.flavours)}, ${j(p.fillings)}, ${j(p.frostings)}, ${j(p.designs)}, ${j(p.egg_options)}, ${q(p.allergens)}, ${q(p.dietary)}, ${arr(p.occasions)}, ${p.lead_time_hours ?? 'null'}, ${!!p.featured}, ${p.allow_message !== false}, ${i + 1}, ${p.min_qty || 1}, ${q(p.pricing_mode || 'fixed')}, ${!!p.courier_ok}
from public.categories where slug = ${q(p.cat)} and not exists (select 1 from public.products where name = ${q(p.name)});\n`
})
sql += '\n'
SEED_ADDONS.forEach((a, i) => (sql += `insert into public.addons(name, price, sort) select ${q(a.name)}, ${a.price}, ${i + 1} where not exists (select 1 from public.addons where name = ${q(a.name)});\n`))
sql += '\n'
SEED_SLOTS.forEach((s, i) => (sql += `insert into public.time_slots(label, start_time, end_time, capacity, weekdays, sort) select ${q(s.label)}, ${q(s.start_time)}, ${q(s.end_time)}, ${s.capacity}, ${s.weekdays ? `'{${s.weekdays.join(',')}}'::int[]` : 'null'}, ${i + 1} where not exists (select 1 from public.time_slots where label = ${q(s.label)});\n`))
sql += '\n'
SEED_ZONES.forEach((z, i) => (sql += `insert into public.delivery_zones(name, pincodes, charge, free_above, sort) select ${q(z.name)}, ${arr(z.pincodes)}, ${z.charge}, ${z.free_above ?? 'null'}, ${i + 1} where not exists (select 1 from public.delivery_zones where name = ${q(z.name)});\n`))

writeFileSync(new URL('../supabase/migrations/002_seed.sql', import.meta.url), sql)
console.log('wrote 002_seed.sql')

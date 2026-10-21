-- Pastel Treats update: Vaishnavi's name, title and intro. Paste into Supabase → SQL Editor → New query → Run.
update public.settings
set data = data || jsonb_build_object(
  'baker_name', 'Vaishnavi',
  'baker_title', 'Certified pastry chef',
  'baker_intro', 'Hi, I am Vaishnavi, a certified, passionate baker from Lavonne Academy of Baking Science & Pastry Arts. Every Pastel Treats order is baked by me in small batches, fresh for your celebration.'
), updated_at = now()
where id = 1;

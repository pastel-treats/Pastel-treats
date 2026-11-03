-- ============================================================================
-- 015 · "Meet the baker" introduction: engineer turned passionate baker
-- Only replaces the original standard text — if the baker already wrote her own, it is left alone.
-- ============================================================================
update public.settings
   set data = jsonb_set(data, '{baker_intro}', to_jsonb('Hi, I’m Vaishnavi — an engineer turned passionate baker, trained and certified at Lavonne Academy of Baking Science & Pastry Arts. Every Pastel Treats order is baked by me, fresh and in small batches, for your celebration.'::text))
 where id = 1 and coalesce(data ->> 'baker_intro', '') like 'Hi, I am Vaishnavi, a certified, passionate baker%';

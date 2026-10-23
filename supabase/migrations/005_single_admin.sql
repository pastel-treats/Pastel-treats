-- Pastel Treats update: ONLY pasteltreatsdgl@gmail.com can use the baker's dashboard.
-- Before running: make sure that e-mail exists in Authentication → Users (Add user → Auto Confirm).
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- Only ONE e-mail may ever use the baker's dashboard. Change it here if the bakery e-mail changes.
create or replace function public.admin_email()
returns text language sql immutable as $$ select 'pasteltreatsdgl@gmail.com'::text $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and lower(coalesce(auth.jwt() ->> 'email', '')) = public.admin_email()
$$;

create or replace function public.admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.admins
   where user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = public.admin_email()
$$;

-- Only the bakery e-mail can claim the owner role (and only if it isn't already set up).
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> public.admin_email() then return false; end if;
  if exists (select 1 from public.admins where lower(email) = public.admin_email()) then return false; end if;
  insert into public.admins(user_id, email, role) values (auth.uid(), public.admin_email(), 'owner')
    on conflict (user_id) do update set role = 'owner', email = excluded.email;
  return true;
end $$;

-- Make the bakery e-mail the owner and remove every other dashboard login
insert into public.admins(user_id, email, role)
  select id, lower(email), 'owner' from auth.users where lower(email) = public.admin_email()
  on conflict (user_id) do update set role = 'owner', email = excluded.email;
delete from public.admins where lower(coalesce(email, '')) <> public.admin_email();

-- Result: should show exactly one row, pasteltreatsdgl@gmail.com · owner
select email, role from public.admins;

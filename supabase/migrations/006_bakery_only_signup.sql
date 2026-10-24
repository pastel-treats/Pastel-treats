-- Pastel Treats update: only pasteltreatsdgl@gmail.com can ever create a login.
-- Any other e-mail trying to sign up is refused by the database itself.
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.
create or replace function public.only_bakery_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) <> public.admin_email() then
    raise exception 'Sign-ups are closed for Pastel Treats';
  end if;
  return new;
end $$;

drop trigger if exists pt_only_bakery_signup on auth.users;
create trigger pt_only_bakery_signup before insert on auth.users
  for each row execute function public.only_bakery_signup();

select 'Only pasteltreatsdgl@gmail.com can sign up now' as result;

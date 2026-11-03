-- ============================================================================
-- 014 · Named addresses (Home / Work / "Amma's house")
--  • the name a customer gives an address at checkout is kept with their saved addresses,
--    so the baker sees it in Customers and when entering an order for them.
-- (Voice notes go straight to the baker's WhatsApp — nothing is stored on the website.)
-- Safe to run more than once.
-- ============================================================================

-- keep the address name the customer chose ("Home", "Work", "Amma's house") on their saved address
create or replace function public.order_address_label() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and coalesce(trim(new.address ->> 'label'), '') <> '' and coalesce(trim(new.address ->> 'line'), '') <> '' then
    update customer_addresses set label = left(trim(new.address ->> 'label'), 30)
     where customer_id = new.customer_id and lower(line) = lower(trim(new.address ->> 'line'));
  end if;
  return new;
end $$;
drop trigger if exists orders_address_label on public.orders;
create trigger orders_address_label after insert on public.orders for each row execute function public.order_address_label();

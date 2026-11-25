-- Update 32: Desk sends bills out with an employee; the employee sees their own bills. Run ONCE in the Supabase SQL Editor
-- AFTER 9-migration-31-cash-slips.sql. Safe to run again. For SKMA.
--
-- Desk login sees every recent bill with the customer name and the PRODUCTS (names and quantities only: no rates,
-- no amounts, no profit) and marks it "out for delivery by <employee>".
-- An employee sees the bills assigned to them (customer, city, products, no amounts). If the Desk assigned a bill,
-- the employee cannot remove that assignment (only the Desk or an owner can); a bill the employee tagged themselves can still be removed the same day.

alter table bill_tags add column if not exists assigned_by text;      -- 'desk' or 'owner' when someone else assigned it; empty when the employee tagged it

drop policy if exists "tag staff delete" on bill_tags;
create policy "tag staff delete" on bill_tags for delete to authenticated
  using (is_staff() and emp_id = my_emp() and assigned_by is null and created_at > now() - interval '1 day');

-- Products on each bill: names and quantities only. One row per bill. (The raw view is used inside the two views below and is not readable by anyone directly.)
create or replace view bill_items_raw as
select left(s.fy, 4) as fy, translate(upper(regexp_replace(s.bill_no, '\s+', '', 'g')), 'O', '0') as key,
       string_agg(s.product || ' x ' || regexp_replace(coalesce(s.qty, 0)::text, '\.0+$', '')
                  || case when coalesce(s.free, 0) > 0 then ' +' || regexp_replace(s.free::text, '\.0+$', '') || ' free' else '' end,
                  ', ' order by s.id) as items
from sales_lines s
where s.kind = 'S' and s.bill_no is not null
group by 1, 2;
revoke all on bill_items_raw from anon, authenticated, public;

create or replace view desk_bill_items as select fy, key, items from bill_items_raw where is_desk() or is_owner();
revoke all on desk_bill_items from anon, public;  grant select on desk_bill_items to authenticated;

-- An employee's own assigned bills with customer and products (no amounts)
create or replace view my_delivery_bills as
select t.id, t.bill_no, t.fy, t.d, t.assigned_by, t.created_at, h.party, h.city, i.items
from bill_tags t
left join lateral (select party, city from bill_heads h
                   where left(h.fy, 4) = t.fy and translate(upper(regexp_replace(h.feed_no, '\s+', '', 'g')), 'O', '0') = t.bill_no limit 1) h on true
left join bill_items_raw i on i.fy = t.fy and i.key = t.bill_no
where t.emp_id = my_emp() and is_staff();
revoke all on my_delivery_bills from anon, public;  grant select on my_delivery_bills to authenticated;

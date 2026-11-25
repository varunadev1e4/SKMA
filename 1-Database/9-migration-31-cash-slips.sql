-- Update 31: the DESK login can make a temporary cash bill slip, which an owner must approve before it can be shared.
-- Run ONCE in the Supabase SQL Editor AFTER 8-migration-30-roles.sql. Safe to run again. For SKMA.
--
-- Desk login can: see the full stock screen (names, batches, expiry, qty, MRP, selling rate; NO cost price, NO margin),
--   save a cash slip as a DRAFT, see and delete only their own drafts, share the PDF only after an owner approves it.
-- Desk login cannot: see other people's slips, the parties list, anyone's dues, cost price or profit.
-- Owners: approve or reject from Temporary bill > To approve.

alter table temp_bills add column if not exists emp_id bigint;
alter table temp_bills add column if not exists approval text not null default 'approved';   -- 'draft' (waiting) or 'approved'
alter table temp_bills add column if not exists approved_by text;
alter table temp_bills add column if not exists approved_at timestamptz;
alter table temp_bills add column if not exists reject_reason text;

-- temp_bills now has its own rules (owner everything; a Desk login only its own slips)
drop policy if exists "owner only" on temp_bills;
drop policy if exists "app all" on temp_bills;
drop policy if exists "tb owner" on temp_bills;      create policy "tb owner" on temp_bills for all to authenticated using (is_owner()) with check (is_owner());
drop policy if exists "tb desk read" on temp_bills;  create policy "tb desk read" on temp_bills for select to authenticated using (is_desk() and emp_id = my_emp());
drop policy if exists "tb desk add" on temp_bills;   create policy "tb desk add" on temp_bills for insert to authenticated
  with check (is_desk() and emp_id = my_emp() and approval = 'draft' and status = 'pending');
drop policy if exists "tb desk del" on temp_bills;   create policy "tb desk del" on temp_bills for delete to authenticated
  using (is_desk() and emp_id = my_emp() and approval = 'draft' and status = 'pending');

-- Stock for the Desk: no cost price, no reorder level, no last purchase
create or replace view desk_stock as
select p.id, p.code, p.name, p.packing, p.mrp, p.gst, c.name as company,
  coalesce(sum(b.qty), 0) as total_qty,
  min(b.exp_year * 100 + b.exp_month) filter (where b.qty > 0) as nearest_expiry,
  p.rack_no, p.last_sale
from products p
left join companies c on c.id = p.company_id
left join batches b on b.product_id = p.id
where coalesce(p.deleted, false) = false and (is_desk() or is_owner())
group by p.id, c.name;

create or replace view desk_batches as
select id, product_id, batch_no, exp_month, exp_year, qty, mrp, bill_price from batches where is_desk() or is_owner();

-- Quantity already held on open slips (product + batch), so two slips cannot use the same stock. No names, no parties.
create or replace view desk_held as
select (l->>'pid')::bigint as pid, l->>'batch' as batch,
       sum(coalesce((l->>'qty')::numeric, 0) + coalesce((l->>'free')::numeric, 0)) as qty
from temp_bills t, jsonb_array_elements(t.lines) l
where t.status = 'pending' and (is_desk() or is_owner())
group by 1, 2;

revoke all on desk_stock from anon, public;    grant select on desk_stock to authenticated;
revoke all on desk_batches from anon, public;  grant select on desk_batches to authenticated;
revoke all on desk_held from anon, public;     grant select on desk_held to authenticated;

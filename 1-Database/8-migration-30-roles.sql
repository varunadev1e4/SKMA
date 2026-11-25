-- Update 30: two extra kinds of employee login. Run ONCE in the Supabase SQL Editor. Safe to run again. For SKMA.
--
-- DESK login = an employee login that can ALSO mark attendance for everyone, assign and tag bill deliveries, handle reports, return
--   notes and tasks, and VIEW (read only) all expenses, the shop fund and a limited activity log.
--   Cannot see: profit and reports, stock and cost prices, parties and dues, salaries and advances, money requests.
-- ACCOUNTANT login = an employee login that can ALSO see receivables only (who owes how much, pending bills, party statements) and share them as PDF.
--   Cannot see anything else (no sales, profit, stock, payables, expenses of others, staff data).
-- Both are switches on an ordinary employee login (Staff > employee > Desk login / Accountant login).
-- This is enforced inside the database (not only by hiding screens).

alter table app_roles add column if not exists desk boolean not null default false;
alter table app_roles add column if not exists acct boolean not null default false;

create or replace function is_desk() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_roles where email = my_email() and role = 'staff' and desk) $$;

create or replace function is_acct() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_roles where email = my_email() and role = 'staff' and acct) $$;

-- Names for the activity log (who is an owner, who is which employee)
create or replace view desk_logins as
  select id, email, role, emp_id from app_roles where is_desk() or is_owner();
revoke all on desk_logins from anon, public;  grant select on desk_logins to authenticated;

-- Only the safe columns, only for owners and Desk logins (no salary, no advances)
create or replace view desk_employees as
  select id, name, phone, role, active, join_date, leave_date, no_attendance from employees where is_desk() or is_owner();
-- Bills for delivery follow-up: who, where, how much. No items, no profit, no dues.
create or replace view desk_bills as
  select fy, feed_no, inv_no, d, typ, party, city, net from bill_heads where is_desk() or is_owner();
revoke all on desk_employees from anon, public;  revoke all on desk_bills from anon, public;
grant select on desk_employees to authenticated;  grant select on desk_bills to authenticated;

-- Attendance for everyone (only the attendance kinds; advances and salary entries stay owner-only)
drop policy if exists "ent desk" on emp_entries;
create policy "ent desk" on emp_entries for all to authenticated
  using (is_desk() and kind in ('absent','half','paidleave')) with check (is_desk() and kind in ('absent','half','paidleave'));

-- Delivery follow-up
drop policy if exists "tag desk" on bill_tags;
create policy "tag desk" on bill_tags for all to authenticated using (is_desk()) with check (is_desk());
drop policy if exists "skip desk" on delivery_skip;
create policy "skip desk" on delivery_skip for all to authenticated using (is_desk()) with check (is_desk());

-- Tasks, reports and return notes
drop policy if exists "task desk" on emp_tasks;
create policy "task desk" on emp_tasks for all to authenticated using (is_desk()) with check (is_desk());
drop policy if exists "rep desk read" on staff_reports;   drop policy if exists "rep desk update" on staff_reports;
create policy "rep desk read" on staff_reports for select to authenticated using (is_desk());
create policy "rep desk update" on staff_reports for update to authenticated using (is_desk()) with check (is_desk());
drop policy if exists "ret desk read" on field_returns;   drop policy if exists "ret desk update" on field_returns;
create policy "ret desk read" on field_returns for select to authenticated using (is_desk());
create policy "ret desk update" on field_returns for update to authenticated using (is_desk()) with check (is_desk());

-- Desk: read-only view of expenses (all people), the shop fund, and a limited activity log (no salaries, no logins)
drop policy if exists "exp desk read" on expenses;
create policy "exp desk read" on expenses for select to authenticated using (is_desk());
drop policy if exists "fund desk read" on shop_fund;
create policy "fund desk read" on shop_fund for select to authenticated using (is_desk());
drop policy if exists "act desk read" on activity_log;
create policy "act desk read" on activity_log for select to authenticated using (
  is_desk() and (tbl in ('expenses','shop_fund','bill_tags','counts','fund_requests')
                 or (tbl = 'emp_entries' and coalesce(new_data->>'kind', old_data->>'kind') in ('absent','half','paidleave'))));

-- Accountant: receivables only. Four limited views; nothing else is opened.
create or replace view acct_parties as
  select id, code, name, city, phone, phone2, receivable, last_sale, age_30, age_60, age_90, age_90p, area, deleted
  from parties where (is_acct() or is_owner()) and coalesce(deleted, false) = false and receivable > 0.5;
create or replace view acct_pending_bills as
  select id, party_id, kind, bill_no, ref_no, bill_date, total, paid, balance
  from pending_bills where (is_acct() or is_owner()) and kind = 'R';
create or replace view acct_ledger as
  select id, fy, acc_id, d, kind, vno, ref, amount
  from ledger_entries where (is_acct() or is_owner()) and acc_id in (select id from parties where receivable > 0.5 and coalesce(deleted, false) = false);
create or replace view acct_opening as
  select id, fy, acc_id, op
  from party_opening where (is_acct() or is_owner()) and acc_id in (select id from parties where receivable > 0.5 and coalesce(deleted, false) = false);
revoke all on acct_parties, acct_pending_bills, acct_ledger, acct_opening from anon, public;
grant select on acct_parties, acct_pending_bills, acct_ledger, acct_opening to authenticated;
-- Done. You should see "Success. No rows returned".

-- Update 28: bill numbers typed with the letter O instead of zero (ABO1924 instead of AB01924) now count as the same bill.
-- Run ONCE in Supabase > SQL Editor. Safe to run again. For BOTH shops.
create or replace function tag_bill(p_bill text, p_force boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_b text := replace(upper(regexp_replace(coalesce(p_bill, ''), '\s', '', 'g')), 'O', '0'); v_y int := extract(year from current_date)::int; v_fy text; v_start date; v_who text; v_seen boolean;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if v_b is null or v_b = '' then raise exception 'enter the bill number'; end if;
  if extract(month from current_date) < 4 then v_y := v_y - 1; end if;
  v_fy := v_y::text; v_start := make_date(v_y, 4, 1);
  select e.name into v_who from bill_tags t join employees e on e.id = t.emp_id where t.bill_no = v_b and t.fy = v_fy;
  if v_who is not null then return 'taken:' || v_who; end if;
  select exists (select 1 from sales_lines s where s.kind = 'S' and replace(upper(regexp_replace(s.bill_no, '\s', '', 'g')), 'O', '0') = v_b and s.d >= v_start)
      or exists (select 1 from bill_heads h where replace(upper(regexp_replace(h.feed_no, '\s', '', 'g')), 'O', '0') = v_b and h.d >= v_start)
      or exists (select 1 from pending_bills p where p.kind = 'R' and replace(upper(regexp_replace(p.bill_no, '\s', '', 'g')), 'O', '0') = v_b and p.bill_date >= v_start)
    into v_seen;
  if not v_seen and not coalesce(p_force, false) then return 'unknown'; end if;
  insert into bill_tags (emp_id, bill_no, fy) values (my_emp(), v_b, v_fy);
  return 'ok';
end $$;
revoke execute on function tag_bill(text, boolean) from public, anon;
grant execute on function tag_bill(text, boolean) to authenticated;

-- Correct tags already saved with the letter O (skips any that would clash with an existing correct tag)
update bill_tags t set bill_no = replace(t.bill_no, 'O', '0')
 where t.bill_no like '%O%'
   and not exists (select 1 from bill_tags x where x.fy = t.fy and x.bill_no = replace(t.bill_no, 'O', '0'));
-- Done. You should see "Success. No rows returned".

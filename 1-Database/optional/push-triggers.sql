-- Push notification triggers. Run ONCE in Supabase > SQL Editor, AFTER you have deployed the "notify" function
-- (see Push-Notifications-Setup.md). You do NOT need the Webhooks screen: this uses the pg_net extension instead.
-- Before running: Find & Replace  YOUR-PROJECT-REF  and  YOUR-SECRET  (each appears once below).
-- YOUR-PROJECT-REF is the part of your Supabase address before .supabase.co. YOUR-SECRET is the WEBHOOK_SECRET you chose.

create extension if not exists pg_net;

create or replace function push_notify() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","x-webhook-secret":"YOUR-SECRET"}'::jsonb,
    body := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW),
                               'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) end),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  return null;      -- a notification problem must never stop an employee's save
end $$;
revoke execute on function push_notify() from public, anon, authenticated;

drop trigger if exists push_fund_requests on fund_requests;
create trigger push_fund_requests after insert or update on fund_requests for each row execute function push_notify();
drop trigger if exists push_staff_reports on staff_reports;
create trigger push_staff_reports after insert on staff_reports for each row execute function push_notify();
drop trigger if exists push_field_returns on field_returns;
create trigger push_field_returns after insert on field_returns for each row execute function push_notify();
drop trigger if exists push_emp_tasks on emp_tasks;
create trigger push_emp_tasks after insert or update on emp_tasks for each row execute function push_notify();
drop trigger if exists push_expenses on expenses;
create trigger push_expenses after insert on expenses for each row execute function push_notify();
drop trigger if exists push_temp_bills on temp_bills;
create trigger push_temp_bills after insert or update on temp_bills for each row execute function push_notify();
drop trigger if exists push_bill_tags on bill_tags;
create trigger push_bill_tags after insert on bill_tags for each row execute function push_notify();

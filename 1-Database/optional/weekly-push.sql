-- OPTIONAL: Monday 8 am (India) push to the owner with last week's sales and waiting items.
-- Needs the push setup (Push-Notifications-Setup.md) done first. Replace the two placeholders, run once in SQL Editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('weekly-owner-push') where exists (select 1 from cron.job where jobname = 'weekly-owner-push');
select cron.schedule('weekly-owner-push', '30 2 * * 1',   -- 02:30 UTC = 08:00 India, every Monday
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
       headers := '{"Content-Type":"application/json","x-webhook-secret":"YOUR-SECRET"}'::jsonb,
       body := '{"weekly":true}'::jsonb) $$);

-- Update 26: owners / partners listed under Staff who do not need attendance. Run ONCE. Safe to run again. For BOTH shops.
alter table employees add column if not exists no_attendance boolean default false;
-- Done. You should see "Success. No rows returned".

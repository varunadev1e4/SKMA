-- Table permissions for NEW Supabase projects. Run ONCE, LAST (after 10-migration-32-deliveries.sql). Safe to run again. For SKMA.
--
-- Newer Supabase projects no longer give logged-in users permission on tables created in the SQL Editor, so the app shows
-- "permission denied for table parties". This gives the logged-in role the permissions the app needs. WHO may see WHAT is still
-- decided by the row rules (owner / employee / Desk / Accountant) in files 1 to 10: this only opens the door that those rules guard.
-- The public (not logged in) role gets nothing.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- keep these tighter than the general grant above
revoke all on all tables in schema public from anon;
revoke all on bill_items_raw from authenticated;                                  -- internal view
revoke insert, update, delete, truncate on activity_log from authenticated;       -- the activity log is written only by the database itself
revoke execute on function reset_sequences() from public, anon, authenticated;
grant execute on function reset_sequences() to service_role;
revoke execute on function log_activity() from public, anon, authenticated;

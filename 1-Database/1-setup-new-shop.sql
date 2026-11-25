-- =====================================================================
--  SHOP APP  -  COMPLETE DATABASE SETUP  (final version, release 1)
--  Run this ONE file ONCE in a NEW Supabase project:
--     Supabase  >  SQL Editor  >  New query  >  paste everything  >  Run
--  It is safe to run again: it never deletes your data.
--  Nothing here touches Profit Maker. It only creates the app's own cloud tables.
-- =====================================================================

-- ---------- 1. Stock and parties (filled from Profit Maker every 30 minutes) ----------
create table if not exists companies (
  id bigint primary key, name text, short_name text, deleted boolean default false, sync_id text
);
create table if not exists products (
  id bigint primary key, code text, name text not null, packing text, mrp numeric, gst numeric,
  company_id bigint, deleted boolean default false, sync_id text,
  rack_no text, ord_level numeric, last_sale date, cost_price numeric, last_purchase date
);
create table if not exists batches (
  id bigint primary key, product_id bigint not null, batch_no text, exp_month int, exp_year int,
  qty numeric, mrp numeric, bill_price numeric, sync_id text,
  cost_price numeric, supplier text, pur_inv text, pur_date date
);
create index if not exists batches_product_idx on batches(product_id);
create index if not exists products_name_idx on products(lower(name));

create table if not exists parties (
  id bigint primary key, code text, name text, city text, phone text, phone2 text,
  cur_bal numeric, group_id bigint, deleted boolean default false, sync_id text,
  receivable numeric, payable numeric, last_sale date,
  age_30 numeric, age_60 numeric, age_90 numeric, age_90p numeric, area text
);
create table if not exists sync_log (
  id bigserial primary key, ran_at timestamptz default now(), source text, products int, batches int
);
create table if not exists pending_bills (
  id bigint generated always as identity primary key,
  party_id bigint not null, kind text not null,          -- R = to receive (sale bill), P = to pay (purchase bill)
  bill_no text, ref_no text, bill_date date, total numeric, paid numeric, balance numeric
);
create index if not exists pending_bills_party on pending_bills(party_id);
create table if not exists daily_summary (
  id bigint generated always as identity primary key, day date not null, kind text not null, bills int, amount numeric
);

-- ---------- 2. Yearly history (filled by history.ps1) ----------
create table if not exists fy_monthly (
  id bigint generated always as identity primary key, fy text not null, ym int not null, kind text not null, bills int, amount numeric
);
create table if not exists fy_product_monthly (
  id bigint generated always as identity primary key, fy text not null, ym int not null, product text not null, company text,
  qty numeric, amount numeric, cost numeric, amount_ex numeric
);
create table if not exists fy_party_monthly (
  id bigint generated always as identity primary key, fy text not null, ym int not null, party text not null, amount numeric
);
create table if not exists sales_lines (
  id bigint generated always as identity primary key,
  fy text not null, kind text not null,                   -- S = sale, P = purchase
  d date not null, bill_no text, party text, city text, company text, product text,
  qty numeric, free numeric, amount numeric, gst numeric, terms int,
  pack text, batch text, rate numeric, dis numeric, party_code text,
  hsn text, mrp numeric, exp text, mfg text
);
create table if not exists gst_bills (
  id bigint generated always as identity primary key,
  fy text not null, kind text not null, typ text, feed_no text, feed_date date, inv_no text, inv_date date,
  code text, name text, gstin text,
  v0 numeric, v5 numeric, g5 numeric, v12 numeric, g12 numeric, v18 numeric, g18 numeric, v28 numeric, g28 numeric,
  sum_gst numeric, net numeric, inter boolean default false
);
create table if not exists hsn_monthly (
  id bigint generated always as identity primary key,
  fy text not null, kind text not null, ym int not null, hsn text, gst numeric, inter boolean default false,
  qty numeric, taxable numeric, tax numeric
);
create table if not exists ledger_entries (
  id bigint generated always as identity primary key,
  fy text not null, acc_id bigint not null, d date not null, kind text not null, vno text, ref text, amount numeric
);
create table if not exists party_opening (
  id bigint generated always as identity primary key, fy text not null, acc_id bigint not null, op numeric
);
create table if not exists fy_margin_monthly (
  id bigint generated always as identity primary key, fy text not null, ym int not null,
  bills int, net numeric, margin numeric, sales_ex numeric, gst_in numeric
);
create table if not exists fy_margin_daily (
  id bigint generated always as identity primary key, fy text not null, d date not null,
  bills int, net numeric, margin numeric, sales_ex numeric, gst_in numeric
);
create table if not exists bill_payments (
  id bigint generated always as identity primary key,
  fy text not null, acc_id bigint not null, bill_no text, bill_date date, paid_date date not null, amount numeric not null
);
create table if not exists bill_heads (
  id bigint generated always as identity primary key,
  fy text not null, feed_no text not null, inv_no text, d date, typ text,
  party text, party_code text, add1 text, add2 text, add3 text, add4 text, city text, pin text, phone text, gstin text, dl1 text, dl2 text,
  gv0 numeric, gv1 numeric, g1 numeric, gv2 numeric, g2 numeric, gv3 numeric, g3 numeric, gv4 numeric, g4 numeric,
  sub_total numeric, less_disc numeric, adjust numeric, cr_note numeric, rounding numeric, sum_gst numeric, net numeric, inter boolean default false
);
create index if not exists fy_monthly_fy on fy_monthly(fy);
create index if not exists fy_product_fy on fy_product_monthly(fy);
create index if not exists fy_party_fy on fy_party_monthly(fy);
create index if not exists sales_lines_kind_d on sales_lines(kind, d);
create index if not exists sales_lines_fy on sales_lines(fy);
create index if not exists gst_bills_d on gst_bills(kind, feed_date);
create index if not exists gst_bills_fy on gst_bills(fy);
create index if not exists hsn_monthly_ym on hsn_monthly(ym);
create index if not exists hsn_monthly_fy on hsn_monthly(fy);
create index if not exists ledger_entries_acc on ledger_entries(acc_id, d);
create index if not exists ledger_entries_fy on ledger_entries(fy);
create index if not exists party_opening_acc on party_opening(acc_id);
create index if not exists party_opening_fy on party_opening(fy);
create index if not exists fy_margin_monthly_fy on fy_margin_monthly(fy);
create index if not exists fy_margin_daily_fy on fy_margin_daily(fy);
create index if not exists fy_margin_daily_d on fy_margin_daily(d);
create index if not exists bill_payments_fy on bill_payments(fy);
create index if not exists bill_payments_paid on bill_payments(paid_date);
create index if not exists bill_heads_fy on bill_heads(fy);
create index if not exists bill_heads_feed on bill_heads(feed_no);
create index if not exists bill_heads_inv on bill_heads(inv_no);

-- ---------- 3. The app's OWN records (never in Profit Maker) ----------
create table if not exists employees (
  id bigint generated by default as identity primary key,
  name text not null, phone text, role text, salary numeric default 0, join_date date, active boolean default true, note text,
  created_at timestamptz default now()
);
create table if not exists emp_entries (
  id bigint generated by default as identity primary key,
  emp_id bigint not null references employees(id) on delete cascade, d date not null,
  kind text not null, amount numeric default 0, note text, created_at timestamptz default now()
);
create index if not exists emp_entries_emp on emp_entries(emp_id, d);
create table if not exists expenses (
  id bigint generated by default as identity primary key,
  d date not null, category text not null, amount numeric not null, note text, created_at timestamptz default now()
);
create index if not exists expenses_d on expenses(d);
create table if not exists directory (
  id bigint generated by default as identity primary key,
  kind text not null default 'company', name text not null,
  address text, city text, phone text, phone2 text, email text, gstin text, dl_no text, notes text,
  party_id bigint, created_at timestamptz default now()
);
create table if not exists directory_people (
  id bigint generated by default as identity primary key,
  dir_id bigint not null references directory(id) on delete cascade,
  name text not null, role text, phone text, phone2 text, email text, notes text, created_at timestamptz default now()
);
create index if not exists directory_people_dir on directory_people(dir_id);
create table if not exists temp_bills (
  id bigint generated by default as identity primary key,
  bill_no text not null, created_at timestamptz default now(),
  party_id bigint, party_name text not null, note text, lines jsonb not null default '[]',
  taxable numeric, gst_amt numeric, total numeric,
  status text not null default 'pending', pm_bill_no text, billed_at timestamptz
);
create table if not exists temp_returns (
  id bigint generated by default as identity primary key,
  ret_no text not null, created_at timestamptz default now(), d date not null default current_date,
  party_id bigint, party_name text not null, note text, lines jsonb not null default '[]',
  status text not null default 'pending', pm_ref text, entered_at timestamptz
);
create table if not exists temp_collections (
  id bigint generated by default as identity primary key,
  created_at timestamptz default now(), d date not null default current_date,
  party_id bigint, party_name text not null, amount numeric not null, mode text not null default 'Cash',
  ref text, note text, status text not null default 'pending', pm_ref text, entered_at timestamptz,
  rec_no text, bills jsonb not null default '[]'
);
create index if not exists temp_collections_status_d on temp_collections(status, d);

-- ---------- 4. Security: only logged-in users can read; the app's own records can also be changed ----------
do $$
declare t text;
begin
  -- read-only tables (filled only by the sync, which uses the secret key)
  foreach t in array array['companies','products','batches','parties','sync_log','pending_bills','daily_summary',
      'fy_monthly','fy_product_monthly','fy_party_monthly','sales_lines','gst_bills','hsn_monthly','ledger_entries',
      'party_opening','fy_margin_monthly','fy_margin_daily','bill_payments','bill_heads'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "logged in can read" on %I', t);
    execute format('create policy "logged in can read" on %I for select to authenticated using (true)', t);
  end loop;
  -- tables the app itself reads and writes
  foreach t in array array['employees','emp_entries','expenses','directory','directory_people','temp_bills','temp_returns','temp_collections'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "app all" on %I', t);
    execute format('create policy "app all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 5. The stock list the app reads ----------
create or replace view stock_summary with (security_invoker = true) as
select
  p.id, p.code, p.name, p.packing, p.mrp, p.gst,
  c.name as company,
  coalesce(sum(b.qty), 0) as total_qty,
  min(b.exp_year * 100 + b.exp_month) filter (where b.qty > 0) as nearest_expiry,
  p.rack_no, p.last_sale, p.ord_level, p.cost_price, p.last_purchase
from products p
left join companies c on c.id = p.company_id
left join batches b on b.product_id = p.id
where coalesce(p.deleted, false) = false
group by p.id, c.name;

-- ---------- 6. Used only by the golden-backup restore (keeps number counters right) ----------
create or replace function reset_sequences() returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['temp_bills','employees','emp_entries','expenses','directory','directory_people','temp_returns','temp_collections'] loop
    execute format('select setval(pg_get_serial_sequence(%L, ''id''), greatest(coalesce((select max(id) from %I), 0), 1), (select count(*) > 0 from %I))', t, t, t);
  end loop;
end $$;
revoke execute on function reset_sequences() from public, anon, authenticated;
grant execute on function reset_sequences() to service_role;

-- Done. You should see "Success. No rows returned".

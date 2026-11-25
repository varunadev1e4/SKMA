// Sends push notifications when employees or the owner do something important.
// Called by Supabase Database Webhooks (see push-triggers.sql). Setup steps are in Push-Notifications-Setup.md.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("WEBHOOK_SECRET") || "";
const LOW = Number(Deno.env.get("FUND_LOW") || 1000);
const rs = (n: number) => "Rs " + Math.round(Number(n) || 0).toLocaleString("en-IN");
const KIND: Record<string, string> = { low: "Low stock", new: "New product", issue: "Shop problem" };

type Msg = { title: string; body: string; tag?: string; to: "owner" | { emp: number | null } };

async function empName(id: number | null) {
  if (!id) return "Someone";
  const { data } = await db.from("employees").select("name").eq("id", id).limit(1);
  return data && data[0] ? data[0].name : "Someone";
}
async function fundBalance(): Promise<number> {
  const top = await db.from("shop_fund").select("amount,d");
  const rows = top.data || [];
  if (!rows.length) return Infinity;
  const first = rows.map((r) => r.d).sort()[0];
  const ex = await db.from("expenses").select("amount").not("emp_id", "is", null).gte("d", first);
  return rows.reduce((s, r) => s + Number(r.amount), 0) - (ex.data || []).reduce((s, r) => s + Number(r.amount), 0);
}

async function weekly(): Promise<Msg[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const t = new Date(); const mon = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 864e5); const from = iso(new Date(mon.getTime() - 7 * 864e5)), to = iso(new Date(mon.getTime() - 864e5));
  const s = await db.from("fy_margin_daily").select("net,margin,bills").gte("d", from).lte("d", to);
  const sum = (k: string) => (s.data || []).reduce((a: number, r: any) => a + Number(r[k] || 0), 0);
  const c = async (tb: string, col: string, v: string) => (await db.from(tb).select("id", { count: "exact", head: true }).eq(col, v)).count || 0;
  const open = (await c("fund_requests", "status", "open")) + (await c("staff_reports", "status", "open")) + (await c("field_returns", "status", "new"));
  return [{ title: "Last week", body: "Sales " + rs(sum("net")) + " (" + sum("bills") + " bills), margin " + rs(sum("margin")) + ". " + open + " item(s) waiting in the inbox.", tag: "weekly", to: "owner" }];
}

async function build(p: any): Promise<Msg[]> {
  if (p.weekly) return await weekly();
  const r = p.record || {}, o = p.old_record || {}, out: Msg[] = [];
  if (p.table === "fund_requests") {
    if (p.type === "INSERT") out.push({ title: "Money request", body: (await empName(r.emp_id)) + " needs " + rs(r.amount) + (r.note ? " | " + r.note : ""), tag: "req", to: "owner" });
    if (p.type === "UPDATE" && o.status === "open" && r.status !== "open")
      out.push({ title: "Your money request", body: r.status === "done" ? rs(r.amount) + " was added to the shop fund" : "Your request for " + rs(r.amount) + " was not approved", to: { emp: r.emp_id } });
  }
  if (p.table === "staff_reports" && p.type === "INSERT")
    out.push({ title: KIND[r.kind] || "Report", body: (await empName(r.emp_id)) + ": " + r.title, tag: "rep", to: "owner" });
  if (p.table === "field_returns" && p.type === "INSERT")
    out.push({ title: "Sales return note", body: r.product + " x " + Number(r.qty) + " from " + r.shop_name + " (" + (await empName(r.emp_id)) + ")", tag: "ret", to: "owner" });
  if (p.table === "emp_tasks") {
    if (p.type === "INSERT") out.push({ title: "New task", body: r.title, to: { emp: r.emp_id } });
    if (p.type === "UPDATE" && !o.done && r.done) out.push({ title: "Task done", body: r.title + " (" + (await empName(r.done_by)) + ")", to: "owner" });
  }
  if (p.table === "bill_tags" && p.type === "INSERT" && r.assigned_by && r.emp_id)
    out.push({ title: "Bill sent out with you", body: "Bill " + r.bill_no + " is out for delivery with you", tag: "tag" + r.bill_no, to: { emp: r.emp_id } });
  if (p.table === "temp_bills" && r.emp_id) {
    const n = Array.isArray(r.lines) ? r.lines.length : 0;
    if (p.type === "INSERT" && r.approval === "draft")
      out.push({ title: "Cash slip to approve", body: (await empName(r.emp_id)) + ": " + r.party_name + " (" + n + " item" + (n === 1 ? "" : "s") + ")", tag: "slip", to: "owner" });
    if (p.type === "UPDATE" && o.approval === "draft" && r.approval === "approved")
      out.push({ title: "Slip approved", body: r.bill_no + " for " + r.party_name + " is approved. You can share it now.", to: { emp: r.emp_id } });
    if (p.type === "UPDATE" && o.status === "pending" && r.status === "rejected")
      out.push({ title: "Slip rejected", body: r.bill_no + (r.reject_reason ? ": " + r.reject_reason : ""), to: { emp: r.emp_id } });
  }
  if (p.table === "expenses" && p.type === "INSERT" && r.emp_id) {
    const b = await fundBalance();
    if (b <= LOW) out.push({ title: "Shop fund is low", body: "Balance is " + rs(b) + " after " + (await empName(r.emp_id)) + "'s " + r.category + " " + rs(r.amount), tag: "fundlow", to: "owner" });
  }
  return out;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  // One-time helper: open  .../notify?generate=YOUR_WEBHOOK_SECRET  in a browser to get a VAPID key pair
  if (req.method === "GET" && SECRET && u.searchParams.get("generate") === SECRET) return Response.json(webpush.generateVAPIDKeys());
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) return new Response("not allowed", { status: 401 });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return new Response("VAPID keys are not set", { status: 500 });
  webpush.setVapidDetails("mailto:" + (Deno.env.get("VAPID_EMAIL") || "owner@example.com"), pub, priv);

  const payload = await req.json();
  const msgs = await build(payload);
  let sent = 0;
  for (const m of msgs) {
    let q = db.from("push_subs").select("*");
    q = m.to === "owner" ? q.eq("role", "owner") : m.to.emp ? q.eq("role", "staff").eq("emp_id", m.to.emp) : q.eq("role", "staff");
    const { data } = await q;
    for (const s of data || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: "/" }));
        sent++;
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.from("push_subs").delete().eq("id", s.id);
      }
    }
  }
  return Response.json({ sent });
});

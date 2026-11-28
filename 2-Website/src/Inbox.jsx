import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs, fetchAll, fetchPaged, waLink, SHOP } from './util'
import ExportBar from './Export'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm, askPrompt, showMsg } from './dialog'
import { iso, dm, span, money } from './expcommon'
import { pushSupported, pushOn, enablePush, disablePush } from './push'
import CompanyPick from './CompanyPick'

// Owner's inbox for everything employees send: fund requests, reports and suggestions, return notes,
// tasks, blind stock counts and delivered-bill tags. Saved only in this app, never in Profit Maker.
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
const when = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const KIND = { low: 'Low stock', new: 'New product', issue: 'Shop problem' }

// A Desk login reads employees and bills through two limited views (no salaries, no profit, no dues)
let EMP_TABLE = 'employees', BILL_TABLE = 'bill_heads', DESK_MODE = false

export function useInboxCount(tick = 0) {
  const [n, setN] = useState(0)
  useEffect(() => {
    Promise.all([
      supabase.from('fund_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('staff_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('field_returns').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]).then((r) => setN(r.reduce((s, x) => s + (x.error ? 0 : x.count || 0), 0))).catch(() => {})
  }, [tick])
  return n
}

function useRows(table, order = 'id', asc = false, limit = 300) {
  const [rows, setRows] = useState(null)
  const [emps, setEmps] = useState([])
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from(table).select('*').order(order, { ascending: asc }).limit(limit), supabase.from(EMP_TABLE).select('id,name,phone')])
    if (a.error) { showMsg(a.error.message + ' (run migration-25.sql in Supabase)'); setRows([]); return }
    setRows(a.data); if (b.data) setEmps(b.data)
  }, [table, order, asc, limit])
  useEffect(() => { load() }, [load])
  return { rows, emps, load, name: (id) => (emps.find((e) => e.id === id) || {}).name || '?' }
}

// ---------- fund requests ----------
function Requests() {
  const { rows, load, name } = useRows('fund_requests')
  const give = async (r) => {
    if (!await askConfirm('Add ' + rs(r.amount) + ' to the shop fund for ' + name(r.emp_id) + '\'s request?')) return
    const a = await supabase.from('shop_fund').insert({ d: iso(new Date()), amount: r.amount, note: 'Request by ' + name(r.emp_id) })
    if (a.error) return showMsg('Could not add: ' + a.error.message + ' (run migration-24.sql)')
    await supabase.from('fund_requests').update({ status: 'done' }).eq('id', r.id); load()
  }
  const no = async (r) => { await supabase.from('fund_requests').update({ status: 'rejected' }).eq('id', r.id); load() }
  const addDirect = async () => {
    const v = await askPrompt('Money to add to the shop fund (Rs)', '')
    const amount = Number(v)
    if (!(amount > 0)) return
    const { error } = await supabase.from('shop_fund').insert({ d: iso(new Date()), amount })
    if (error) return showMsg('Could not add: ' + error.message + ' (run migration-24.sql)')
    showMsg(rs(amount) + ' added to the shop fund.')
  }
  if (!rows) return <p className="muted pad">Loading...</p>
  const open = rows.filter((r) => r.status === 'open')
  return (
    <>
      <button className="ghost" style={{ marginTop: 0 }} onClick={addDirect}>+ Add money to fund (no request needed)</button>
      {!open.length && <div className="empty"><b>No requests waiting</b></div>}
      {open.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{name(r.emp_id)}</b><b>{rs(r.amount)}</b></div>
          <span className="muted small">{when(r.created_at)}{r.note ? ' | ' + r.note : ''}</span>
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="primary" style={{ flex: 1 }} onClick={() => give(r)}>Add to fund</button><button className="ghost" style={{ margin: 0 }} onClick={() => no(r)}>Not now</button></div>
        </div>))}
      {rows.filter((r) => r.status !== 'open').length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Earlier</h2>}
      {rows.filter((r) => r.status !== 'open').slice(0, 15).map((r) => <div key={r.id} className="muted small" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>{when(r.created_at)} {name(r.emp_id)}</span><span>{rs(r.amount)} | {r.status === 'done' ? 'added' : 'not approved'}</span></div>)}
    </>)
}

// ---------- suggestions and problem reports ----------
function Reports() {
  const { rows, load, name } = useRows('staff_reports')
  const done = async (r) => {
    const note = await askPrompt('Note for ' + name(r.emp_id) + ' (optional)', '')
    if (note === null || note === undefined) return
    await supabase.from('staff_reports').update({ status: 'done', owner_note: note || null }).eq('id', r.id); load()
  }
  if (!rows) return <p className="muted pad">Loading...</p>
  const open = rows.filter((r) => r.status === 'open'), low = open.filter((r) => r.kind === 'low' || r.kind === 'new')
  const build = () => ({ title: 'Stock suggestions from staff', subtitle: SHOP + ' | ' + dm(iso(new Date())), filename: 'staff-stock-suggestions', columns: ['Type', 'Product', 'Details', 'By', 'Date'],
    rows: low.map((r) => [KIND[r.kind], r.title, r.details || '', name(r.emp_id), when(r.created_at)]), numCols: [] })
  return (
    <>
      {!open.length && <div className="empty"><b>Nothing waiting</b></div>}
      {low.length > 0 && <ExportBar build={build} />}
      {open.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{r.title}</b><span className="muted small">{KIND[r.kind]}</span></div>
          {r.details && <span className="small">{r.details}</span>}
          <span className="muted small">{name(r.emp_id)} | {when(r.created_at)}</span>
          <button className="ghost sm" onClick={() => done(r)}>Mark done</button>
        </div>))}
      {rows.filter((r) => r.status === 'done').length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Done</h2>}
      {rows.filter((r) => r.status === 'done').slice(0, 20).map((r) => <div key={r.id} className="muted small" style={{ marginBottom: 4 }}>{when(r.created_at)} | {KIND[r.kind]} | {r.title} | {name(r.emp_id)}{r.owner_note ? ' | ' + r.owner_note : ''}</div>)}
    </>)
}

// ---------- sales return notes ----------
function Returns() {
  const { rows, load, name } = useRows('field_returns')
  const done = async (r) => {
    const note = await askPrompt('Note (optional), for example "credit note made"', '')
    if (note === null || note === undefined) return
    await supabase.from('field_returns').update({ status: 'done', owner_note: note || null }).eq('id', r.id); load()
  }
  const text = (r) => SHOP + '\nReturn note\nShop: ' + r.shop_name + '\nProduct: ' + r.product + '\nBatch: ' + (r.batch || '-') + '\nQty: ' + Number(r.qty) + '\nExpiry: ' + (r.exp || '-') + (r.reason ? '\nReason: ' + r.reason : '')
  if (!rows) return <p className="muted pad">Loading...</p>
  const open = rows.filter((r) => r.status === 'new')
  const build = () => ({ title: 'Sales return notes (to do)', subtitle: SHOP + ' | ' + dm(iso(new Date())), filename: 'return-notes', columns: ['Date', 'Shop', 'Product', 'Batch', 'Qty', 'Expiry', 'Reason', 'By'],
    rows: open.map((r) => [dm(r.d), r.shop_name, r.product, r.batch || '', Number(r.qty), r.exp || '', r.reason || '', name(r.emp_id)]), numCols: [4] })
  return (
    <>
      {!open.length && <div className="empty"><b>No return notes waiting</b></div>}
      {open.length > 0 && <ExportBar build={build} />}
      {open.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{r.product}</b><b>x {Number(r.qty)}</b></div>
          <span className="small">{r.shop_name} | batch {r.batch || '-'} | exp {r.exp || '-'}{r.reason ? ' | ' + r.reason : ''}</span>
          {r.note && <span className="muted small">{r.note}</span>}
          <span className="muted small">{name(r.emp_id)} | {when(r.created_at)}</span>
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="ghost sm" onClick={() => window.open(waLink('', text(r)), '_blank')}>Share on WhatsApp</button><button className="primary" style={{ flex: 1 }} onClick={() => done(r)}>Mark done</button></div>
        </div>))}
      {rows.filter((r) => r.status === 'done').length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Done</h2>}
      {rows.filter((r) => r.status === 'done').slice(0, 20).map((r) => <div key={r.id} className="muted small" style={{ marginBottom: 4 }}>{when(r.created_at)} | {r.shop_name} | {r.product} x {Number(r.qty)}{r.owner_note ? ' | ' + r.owner_note : ''}</div>)}
    </>)
}

// ---------- tasks ----------
function Tasks() {
  const { rows, emps, load, name } = useRows('emp_tasks')
  const [f, setF] = useState({ emp: '', title: '', details: '', due: '' })
  const add = async () => {
    if (!f.title.trim()) return showMsg('Write the task.')
    const { error } = await supabase.from('emp_tasks').insert({ emp_id: f.emp ? Number(f.emp) : null, title: f.title.trim(), details: f.details.trim() || null, due_d: f.due || null })
    if (error) return showMsg('Could not save: ' + error.message)
    setF({ ...f, title: '', details: '', due: '' }); load()
  }
  const del = async (t) => { if (await askConfirm('Delete the task "' + t.title + '"?')) { await supabase.from('emp_tasks').delete().eq('id', t.id); load() } }
  if (!rows) return <p className="muted pad">Loading...</p>
  const open = rows.filter((t) => !t.done), done = rows.filter((t) => t.done)
  return (
    <>
      <div className="chartcard" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <select {...inp} value={f.emp} onChange={(e) => setF({ ...f, emp: e.target.value })}><option value="">For everyone</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <input {...inp} placeholder="Task" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input {...inp} placeholder="Details (optional)" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
        <label className="muted small">Due date (optional)<input {...inp} type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        <button className="primary" onClick={add}>Give task</button>
      </div>
      <h2 className="h2">Pending ({open.length})</h2>
      {open.map((t) => (
        <div key={t.id} className="chartcard" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><b>{t.title}</b><br /><span className="muted small">{t.emp_id ? name(t.emp_id) : 'Everyone'}{t.due_d ? ' | due ' + dm(t.due_d) : ''}{t.due_d && t.due_d < iso(new Date()) ? ' | overdue' : ''}</span></span>
          <button className="ghost sm" onClick={() => del(t)}>x</button>
        </div>))}
      {done.length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Done</h2>}
      {done.slice(0, 25).map((t) => (
        <div key={t.id} className="chartcard" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.75 }}>
          <span>{t.title}<br /><span className="muted small">done by {t.done_by ? name(t.done_by) : '?'} | {t.done_at ? when(t.done_at) : ''}</span></span>
          <button className="ghost sm" onClick={() => del(t)}>x</button>
        </div>))}
    </>)
}

// ---------- blind stock count ----------
function NewCount({ back, created }) {
  const [stock, setStock] = useState(null)
  const [batches, setBatches] = useState([])
  const [company, setCompany] = useState('')
  const [rack, setRack] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    Promise.all([fetchAll('stock_summary', 'id,name,packing,company,rack_no,total_qty'), fetchAll('batches', 'id,product_id,batch_no,exp_month,exp_year,qty')])
      .then(([s, b]) => { setStock(s); setBatches(b) }).catch((e) => showMsg(e.message))
  }, [])
  const companies = useMemo(() => [...new Set((stock || []).map((s) => s.company).filter(Boolean))].sort(), [stock])
  const lines = useMemo(() => {
    if (!stock) return []
    const byP = new Map(stock.map((s) => [s.id, s]))
    return batches.filter((b) => Number(b.qty) > 0 && byP.has(b.product_id)).map((b) => ({ p: byP.get(b.product_id), b }))
      .filter(({ p }) => (!company || p.company === company) && (!rack || String(p.rack_no || '').toLowerCase().startsWith(rack.toLowerCase())) && (!text || p.name.toLowerCase().includes(text.toLowerCase())))
      .sort((a, b) => a.p.name.localeCompare(b.p.name))
  }, [stock, batches, company, rack, text])
  const create = async () => {
    if (!title.trim()) return showMsg('Give the count sheet a name, for example "Rack 3".')
    if (!lines.length) return showMsg('No stock matches these filters.')
    if (lines.length > 400 && !await askConfirm(lines.length + ' lines is a lot for one sheet. Create it anyway?')) return
    setBusy(true)
    const c = await supabase.from('counts').insert({ title: title.trim() }).select('id')
    if (c.error) { setBusy(false); return showMsg('Could not create: ' + c.error.message + ' (run migration-25.sql)') }
    const cid = c.data[0].id
    for (let i = 0; i < lines.length; i += 150) {
      const part = lines.slice(i, i + 150)
      const ins = await supabase.from('count_items').insert(part.map(({ p, b }) => ({ count_id: cid, product: p.name, company: p.company || null, pack: p.packing || null, batch: b.batch_no || null, exp: b.exp_year ? String(b.exp_month).padStart(2, '0') + '/' + String(b.exp_year).slice(-2) : null, rack: p.rack_no || null }))).select('id')
      if (ins.error) { setBusy(false); return showMsg('Could not save lines: ' + ins.error.message) }
      const ex = await supabase.from('count_expected').insert(ins.data.map((r, k) => ({ item_id: r.id, qty: Number(part[k].b.qty) })))
      if (ex.error) { setBusy(false); return showMsg('Could not save system quantities: ' + ex.error.message) }
    }
    setBusy(false); created()
  }
  return (
    <>
      <button className="ghost sm" onClick={back}>Back</button>
      <div className="chartcard" style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <input {...inp} placeholder="Sheet name (e.g. Rack 3)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <CompanyPick value={company} onChange={setCompany} companies={companies} />
        <input {...inp} placeholder="Rack starts with (optional)" value={rack} onChange={(e) => setRack(e.target.value)} />
        <input {...inp} placeholder="Product name contains (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        <span className="muted small">{stock ? lines.length + ' batches match. Employees will see product, batch and expiry, not the system quantity.' : 'Loading stock...'}</span>
        <button className="primary" disabled={busy || !stock} onClick={create}>{busy ? 'Creating...' : 'Create count sheet'}</button>
      </div>
    </>)
}
function CountResult({ count, back, reload }) {
  const [items, setItems] = useState(null)
  const [exp, setExp] = useState({})
  const [names, setNames] = useState({})
  useEffect(() => {
    (async () => {
      const [a, b, c] = await Promise.all([fetchPaged('count_items', '*', (q) => q.eq('count_id', count.id)).then((data) => ({ data: data.sort((x, y) => String(x.product).localeCompare(String(y.product))) })).catch((error) => ({ error })), fetchPaged('count_expected', 'item_id,qty').then((data) => ({ data })).catch(() => ({ data: [] })), supabase.from('employees').select('id,name')])
      if (a.error) return showMsg(a.error.message)
      setItems(a.data); setExp(Object.fromEntries((b.data || []).map((x) => [x.item_id, Number(x.qty)]))); setNames(Object.fromEntries((c.data || []).map((x) => [x.id, x.name])))
    })()
  }, [count.id])
  const counted = (items || []).filter((i) => i.counted_qty != null)
  const diff = (i) => Number(i.counted_qty) - (exp[i.id] ?? 0)
  const off = counted.filter((i) => diff(i) !== 0), left = (items || []).length - counted.length
  const build = () => ({ title: 'Stock count: ' + count.title, subtitle: counted.length + ' counted, ' + off.length + ' different, ' + left + ' not counted', filename: 'stock-count-' + count.id,
    columns: ['Product', 'Batch', 'Exp', 'System', 'Counted', 'Difference', 'Counted by'], numCols: [3, 4, 5],
    rows: [...off, ...(items || []).filter((i) => i.counted_qty == null)].map((i) => [i.product, i.batch || '', i.exp || '', exp[i.id] ?? 0, i.counted_qty == null ? 'not counted' : Number(i.counted_qty), i.counted_qty == null ? '' : money(diff(i)), names[i.counted_by] || '']) })
  const setStatus = async (s) => { await supabase.from('counts').update({ status: s }).eq('id', count.id); reload(); back() }
  const del = async () => { if (await askConfirm('Delete the count sheet "' + count.title + '" and its results?')) { await supabase.from('counts').delete().eq('id', count.id); reload(); back() } }
  return (
    <>
      <button className="ghost sm" onClick={back}>Back</button>
      <h2 className="h2" style={{ marginTop: 8 }}>{count.title} <span className="muted small">{count.status === 'open' ? 'open' : 'closed'}</span></h2>
      {!items && <p className="muted pad">Loading...</p>}
      {items && (
        <>
          <div className="minis" style={{ marginBottom: 10 }}>
            <div className="mini"><span>Counted</span><b>{counted.length}</b><small className="muted">of {items.length}</small></div>
            <div className="mini"><span>Different</span><b style={{ color: off.length ? 'var(--bad)' : undefined }}>{off.length}</b></div>
            <div className="mini"><span>Not counted</span><b>{left}</b></div>
          </div>
          <ExportBar build={build} />
          {off.map((i) => (
            <div key={i.id} className="chartcard" style={{ marginBottom: 6, display: 'grid', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{i.product}</b><b style={{ color: diff(i) < 0 ? 'var(--bad)' : 'var(--warn)' }}>{diff(i) > 0 ? '+' : ''}{money(diff(i))}</b></div>
              <span className="muted small">Batch {i.batch || '-'} | exp {i.exp || '-'} | system {exp[i.id] ?? 0}, counted {Number(i.counted_qty)} | {names[i.counted_by] || ''}</span>
            </div>))}
          {!off.length && counted.length > 0 && <p className="muted small">Everything counted so far matches the system.</p>}
          <div className="btnrow" style={{ marginTop: 10 }}>
            <button className="ghost sm" onClick={() => setStatus(count.status === 'open' ? 'closed' : 'open')}>{count.status === 'open' ? 'Close sheet' : 'Reopen'}</button>
            <button className="ghost sm" style={{ color: 'var(--bad)' }} onClick={del}>Delete</button>
          </div>
        </>)}
    </>)
}
function Counts() {
  const { rows, load } = useRows('counts')
  const [mode, setMode] = useState('')
  const [cur, setCur] = useState(null)
  if (mode === 'new') return <NewCount back={() => setMode('')} created={() => { setMode(''); load() }} />
  if (cur) return <CountResult count={cur} back={() => setCur(null)} reload={load} />
  if (!rows) return <p className="muted pad">Loading...</p>
  return (
    <>
      <button className="primary" onClick={() => setMode('new')}>+ New count sheet</button>
      <p className="muted small">Employees count without seeing the system quantity. You see only the differences.</p>
      {!rows.length && <div className="empty"><b>No count sheets yet</b></div>}
      {rows.map((c) => <button key={c.id} className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 8 }} onClick={() => setCur(c)}><b>{c.title}</b><br /><span className="muted small">{when(c.created_at)} | {c.status === 'open' ? 'open for counting' : 'closed'}</span></button>)}
    </>)
}

// ---------- bills with no delivery tag yet ----------
const fyOf = (d) => String(Number(d.slice(0, 4)) - (Number(d.slice(5, 7)) < 4 ? 1 : 0))
const addMonths = (s, n) => { const x = new Date(s + 'T00:00:00'); x.setMonth(x.getMonth() + n); return iso(x) }
const norm = (no) => String(no || '').replace(/\s+/g, '').toUpperCase().replace(/O/g, '0')
function FollowUp({ emps, onChange }) {
  const [days, setDays] = useState('today')   // today | yest | week
  const [creditOnly, setCreditOnly] = useState(false)
  const [rows, setRows] = useState(null)
  const [pick, setPick] = useState({})
  const [typed, setTyped] = useState('')   // Desk: a bill number typed by hand (a bill the sync has not brought in yet)
  const [typedEmp, setTypedEmp] = useState('')
  const [items, setItems] = useState({})   // bill number -> products on the bill (names and quantities only)
  const load = useCallback(async () => {
    setRows(null)
    const now = new Date(), day = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
    const from = days === 'today' ? day(0) : days === 'yest' ? day(1) : day((now.getDay() + 6) % 7)   // this week starts on Monday
    const to = days === 'yest' ? day(1) : day(0)
    const h = await supabase.from(BILL_TABLE).select('feed_no,party,net,d,typ,city').gte('d', from).lte('d', to).order('d', { ascending: false }).limit(1000)
    if (h.error) { showMsg(h.error.message); return setRows([]) }
    // Ask only about the bills on screen (the server returns at most 1000 rows per request, so a plain "all tags" query would miss most of them)
    const nos = [...new Set(h.data.filter((x) => x.feed_no).flatMap((x) => [norm(x.feed_no), String(x.feed_no).trim().toUpperCase()]))]
    const done = new Set()
    for (let i = 0; i < nos.length; i += 100) {
      const part = nos.slice(i, i + 100)
      const [t, k] = await Promise.all([supabase.from('bill_tags').select('bill_no').in('bill_no', part), supabase.from('delivery_skip').select('bill_no').in('bill_no', part)])
      if (t.error) showMsg('Could not read delivery tags: ' + t.error.message)
      if (k.error) showMsg(k.error.message + ' (run migration-27.sql in Supabase)')
      ;[...(t.data || []), ...(k.data || [])].forEach((x) => done.add(norm(x.bill_no)))
    }
    const left = h.data.filter((x) => x.feed_no && !done.has(norm(x.feed_no)))
    setRows(left)
    // products on each bill (a view that exposes names and quantities only; if it is missing the list still works without products)
    const keys = [...new Set(left.map((x) => norm(x.feed_no)))], m = {}
    for (let i = 0; i < keys.length; i += 100) {
      const r = await supabase.from('desk_bill_items').select('key,items').in('key', keys.slice(i, i + 100))
      ;(r.data || []).forEach((x) => { m[x.key] = x.items })
    }
    setItems(m)
  }, [days])
  useEffect(() => { load() }, [load])
  const list = (rows || []).filter((r) => !creditOnly || r.typ === 'Credit')
  const assign = async (r) => {
    const emp = pick[r.feed_no]; if (!emp) return showMsg(DESK_MODE ? 'Choose who is taking it out.' : 'Choose who delivered it.')
    const { error } = await supabase.from('bill_tags').insert({ emp_id: Number(emp), bill_no: norm(r.feed_no), fy: fyOf(r.d), d: iso(new Date()), assigned_by: DESK_MODE ? 'desk' : 'owner' })
    if (error) return showMsg(error.message)
    load(); onChange && onChange()
  }
  const assignTyped = async () => {
    const b = norm(typed)
    if (!b) return showMsg('Type the bill number.')
    if (!typedEmp) return showMsg('Choose who is taking it out.')
    const fy = fyOf(iso(new Date()))
    const ex = await supabase.from('bill_tags').select('emp_id').eq('bill_no', b).eq('fy', fy).limit(1)
    if (ex.error) return showMsg(ex.error.message)
    if (ex.data && ex.data.length) { const w = emps.find((e) => e.id === ex.data[0].emp_id); return showMsg('Bill ' + b + ' is already out with ' + (w ? w.name : 'someone else') + '.') }
    const seen = await supabase.from(BILL_TABLE).select('feed_no').in('feed_no', [b, typed.trim().toUpperCase()]).limit(1)
    if (!(seen.data && seen.data.length) && !(await askConfirm('Bill ' + b + ' is not in the app yet (new bills arrive within about 30 minutes). Check the number. Send it out anyway?'))) return
    const { error } = await supabase.from('bill_tags').insert({ emp_id: Number(typedEmp), bill_no: b, fy, d: iso(new Date()), assigned_by: 'desk' })
    if (error) return showMsg(error.message)
    setTyped(''); load(); onChange && onChange()
  }
  // One tap: every bill before today that is not tagged yet is marked "no delivery needed", so only new bills show from now on.
  const clearOld = async () => {
    if (!(await askConfirm('Mark ALL bills before today as delivered? Bills already tagged to a person keep their tag. This cannot be undone from here.'))) return
    setRows(null)
    try {
      const today = iso(new Date()), heads = [], tagged = new Set()
      for (let o = 0; ; o += 1000) {
        const h = await supabase.from(BILL_TABLE).select('feed_no,d').lt('d', today).order('d').range(o, o + 999)
        if (h.error) throw h.error
        heads.push(...h.data); if (h.data.length < 1000) break
      }
      for (let o = 0; ; o += 1000) {
        const t = await supabase.from('bill_tags').select('bill_no').order('id').range(o, o + 999)
        if (t.error) throw t.error
        t.data.forEach((x) => tagged.add(norm(x.bill_no))); if (t.data.length < 1000) break
      }
      const seen = new Set(), add = []
      heads.forEach((x) => { if (!x.feed_no) return; const n = norm(x.feed_no), k = n + '|' + fyOf(x.d); if (tagged.has(n) || seen.has(k)) return; seen.add(k); add.push({ bill_no: n, fy: fyOf(x.d), note: 'cleared before ' + today }) })
      for (let i = 0; i < add.length; i += 500) {
        const { error } = await supabase.from('delivery_skip').upsert(add.slice(i, i + 500), { onConflict: 'bill_no,fy', ignoreDuplicates: true })
        if (error) throw error
      }
      showMsg(add.length + ' older bills marked as delivered.')
    } catch (e) { showMsg('Could not finish: ' + (e.message || e)) }
    load()
  }
  const skip = async (r) => {
    const { error } = await supabase.from('delivery_skip').insert({ bill_no: norm(r.feed_no), fy: fyOf(r.d) })
    if (error) return showMsg(error.message + ' (run migration-27.sql)')
    load()
  }
  const build = () => ({ title: 'Bills not yet marked delivered', subtitle: ({ today: 'Today', yest: 'Yesterday', week: 'This week' })[days] + (creditOnly ? ' | credit only' : ''), filename: 'undelivered-bills', columns: ['Date', 'Bill', 'Customer', 'Type', 'Amount'],
    rows: list.map((r) => [dm(r.d), r.feed_no, r.party || '', r.typ || '', DESK_MODE ? '' : money(r.net)]), numCols: [4] })
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 className="h2">{DESK_MODE ? 'Bills to send out' : 'Not yet delivered'}</h2>
      {DESK_MODE && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input {...inp} style={{ flex: 1, minWidth: 0 }} placeholder="Type bill number" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <select {...inp} style={{ flex: 1, minWidth: 0 }} value={typedEmp} onChange={(e) => setTypedEmp(e.target.value)}><option value="">Out with...</option>{emps.filter((e) => e.active !== false).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <button className="ghost sm" onClick={assignTyped}>Send out</button>
        </div>)}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {[['today', 'Today'], ['yest', 'Yesterday'], ['week', 'This week']].map(([k, l]) => <button key={k} className={'qc' + (days === k ? ' on' : '')} onClick={() => setDays(k)}>{l}</button>)}
        <button className={'qc' + (creditOnly ? ' on' : '')} onClick={() => setCreditOnly(!creditOnly)}>Credit only</button>
      </div>
      <button className="ghost sm" style={{ marginBottom: 8 }} onClick={clearOld}>Mark all bills before today as delivered</button>
      {!rows && <p className="muted small">Loading...</p>}
      {rows && !list.length && <div className="empty"><b>Every bill is tagged or marked "no delivery needed"</b></div>}
      {list.length > 0 && <p className="muted small">{list.length} bills{DESK_MODE ? '' : ', ' + rs(list.reduce((s, r) => s + Number(r.net || 0), 0))}. Bills appear here after the sync brings them in.</p>}
      {list.length > 0 && <ExportBar build={build} />}
      {list.slice(0, 150).map((r) => (
        <div key={r.feed_no + r.d} className="chartcard" style={{ marginBottom: 6, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><b>{r.feed_no}</b> <span className="muted small">{dm(r.d)} | {r.typ || ''}</span><br /><span className="muted small">{r.party}{r.city ? ', ' + r.city : ''}</span>{items[norm(r.feed_no)] && <><br /><span className="small">{items[norm(r.feed_no)]}</span></>}</span>{!DESK_MODE && <b>{rs(r.net)}</b>}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select {...inp} style={{ flex: 1 }} value={pick[r.feed_no] || ''} onChange={(e) => setPick({ ...pick, [r.feed_no]: e.target.value })}><option value="">{DESK_MODE ? 'Out for delivery with...' : 'Delivered by...'}</option>{emps.filter((e) => e.active !== false).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <button className="ghost sm" onClick={() => assign(r)}>{DESK_MODE ? 'Send out' : 'Assign'}</button>
            <button className="ghost sm" onClick={() => skip(r)}>No delivery</button>
          </div>
        </div>))}
    </div>)
}

// ---------- delivered bills ----------
function Deliveries() {
  const [ym, setYm] = useState(curYm())
  const [tags, setTags] = useState(null)
  const [heads, setHeads] = useState({})
  const [emps, setEmps] = useState([])
  const [who, setWho] = useState('')
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState(null)   // { id, emp } while changing who took a bill
  useEffect(() => {
    setTags(null)
    ;(async () => {
      const s = span(ym)
      const [a, e] = await Promise.all([fetchPaged('bill_tags', '*', (q) => q.gte('d', s.from).lte('d', s.to)).then((data) => ({ data: data.sort((x, y) => String(y.d).localeCompare(String(x.d)) || y.id - x.id) })).catch((error) => ({ error })), supabase.from(EMP_TABLE).select('id,name,active')])
      if (a.error) { showMsg(a.error.message + ' (run migration-25.sql)'); return setTags([]) }
      setTags(a.data); setEmps(e.data || [])
      const nos = [...new Set(a.data.map((t) => t.bill_no))], h = {}
      for (let i = 0; i < nos.length; i += 100) {
        const r = await supabase.from(BILL_TABLE).select('feed_no,party,net,d').in('feed_no', nos.slice(i, i + 100)).gte('d', s.from.slice(0, 4) + '-01-01')
        ;(r.data || []).forEach((x) => { h[String(x.feed_no).trim().toUpperCase()] = x })
      }
      setHeads(h)
    })()
  }, [ym, tick])
  const name = (id) => (emps.find((e) => e.id === id) || {}).name || '?'
  const change = async (t) => {
    if (!edit || !edit.emp) return showMsg('Choose the correct person.')
    const { error } = await supabase.from('bill_tags').update({ emp_id: Number(edit.emp), assigned_by: DESK_MODE ? 'desk' : 'owner' }).eq('id', t.id)
    if (error) return showMsg(error.message)
    setEdit(null); setTick((v) => v + 1)
  }
  const remove = async (t) => {
    if (!(await askConfirm('Remove ' + t.bill_no + ' from ' + name(t.emp_id) + '? The bill goes back to Bills to send out.'))) return
    const { error } = await supabase.from('bill_tags').delete().eq('id', t.id)
    if (error) return showMsg(error.message)
    setTick((v) => v + 1)
  }
  const list = (tags || []).filter((t) => !who || String(t.emp_id) === who)
  const per = useMemo(() => { const m = new Map(); (tags || []).forEach((t) => m.set(t.emp_id, (m.get(t.emp_id) || 0) + 1)); return [...m] }, [tags])
  const build = () => ({ title: 'Delivered bills: ' + ymName(ym) + (who ? ' | ' + name(Number(who)) : ''), subtitle: list.length + ' bills', filename: 'deliveries-' + ym, columns: ['Date', 'Bill', 'Customer', 'Amount', 'Delivered by'],
    rows: list.map((t) => { const h = heads[t.bill_no]; return [dm(t.d), t.bill_no, h ? h.party : '', h && !DESK_MODE ? money(h.net) : '', name(t.emp_id)] }), numCols: [3] })
  return (
    <>
      <FollowUp emps={emps} onChange={() => setTick((v) => v + 1)} />
      <h2 className="h2">Delivered</h2>
      <MonthPick ym={ym} onChange={setYm} />
      {!tags && <p className="muted pad">Loading...</p>}
      {tags && !tags.length && <div className="empty"><b>No bills tagged in {ymName(ym)}</b></div>}
      {per.length > 0 && <div className="chartcard" style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        {per.map(([id, n]) => <button key={id} onClick={() => setWho(who === String(id) ? '' : String(id))} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontWeight: who === String(id) ? 700 : 400 }}><span>{name(id)}</span><span>{n} bills</span></button>)}
      </div>}
      {list.length > 0 && <ExportBar build={build} />}
      {list.map((t) => { const h = heads[t.bill_no]; return (
        <div key={t.id} className="chartcard" style={{ marginBottom: 6, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><b>{t.bill_no}</b> <span className="muted small">{dm(t.d)} | {name(t.emp_id)}</span><br /><span className="muted small">{h ? h.party : 'not in the app yet'}</span></span><b>{h && !DESK_MODE ? rs(h.net) : ''}</b>
          </div>
          {edit && edit.id === t.id ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <select {...inp} style={{ flex: 1 }} value={edit.emp} onChange={(e) => setEdit({ ...edit, emp: e.target.value })}><option value="">Correct person...</option>{emps.filter((e) => e.active !== false || e.id === t.emp_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <button className="sm" onClick={() => change(t)}>Save</button><button className="ghost sm" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}><button className="ghost sm" onClick={() => setEdit({ id: t.id, emp: '' })}>Change person</button><button className="ghost sm" onClick={() => remove(t)}>Remove</button></div>
          )}
        </div>) })}
    </>)
}

const TABS = [['req', 'Requests', Requests], ['rep', 'Reports', Reports], ['ret', 'Returns', Returns], ['task', 'Tasks', Tasks], ['cnt', 'Stock count', Counts], ['del', 'Deliveries', Deliveries]]
export default function Inbox({ back, start, desk }) {
  EMP_TABLE = desk ? 'desk_employees' : 'employees'; BILL_TABLE = desk ? 'desk_bills' : 'bill_heads'; DESK_MODE = !!desk
  const [tab, setTab] = useState(start || (desk ? 'rep' : 'req'))
  const [push, setPush] = useState(pushSupported() ? 'ask' : 'none')
  useEffect(() => { pushOn().then((on) => on && setPush('on')) }, [])
  const toggle = async () => {
    if (push === 'on') { await disablePush(); return setPush('ask') }
    const r = await enablePush('owner', null); if (r === true) setPush('on'); else showMsg(r)
  }
  const CHIPS = desk ? [['rep', 'Reports & returns', ['rep', 'ret']], ['task', 'Tasks', ['task']], ['del', 'Deliveries', ['del']]]
    : [['req', 'Requests', ['req']], ['rep', 'Reports & returns', ['rep', 'ret']], ['task', 'Tasks & counts', ['task', 'cnt']], ['del', 'Deliveries', ['del']]]
  const chipOf = (t) => (CHIPS.find((c) => c[2].includes(t)) || CHIPS[0])[0]
  const parts = (CHIPS.find((c) => c[0] === chipOf(tab)) || CHIPS[0])[2]
  const title = { rep: ['Reports and suggestions', 'Sales return notes'], task: desk ? ['Tasks'] : ['Tasks', 'Stock counts'] }
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>{desk ? 'Desk' : 'Staff inbox'}</h1></div>
        {!desk && push !== 'none' && <button className="ghost sm" onClick={toggle}>{push === 'on' ? 'Notifications on' : 'Turn on notifications'}</button>}</header>
      <div className="tabscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
        {CHIPS.map(([k, l]) => <button key={k} className={'qc' + (chipOf(tab) === k ? ' on' : '')} style={{ whiteSpace: 'nowrap' }} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {parts.map((k, i) => { const V = TABS.find((t) => t[0] === k)[2]; const tt = title[chipOf(tab)]; return <div key={k}>{parts.length > 1 && <h2 className="h2" style={{ marginTop: i ? 18 : 0 }}>{tt[i]}</h2>}<V /></div> })}
    </div>
  )
}
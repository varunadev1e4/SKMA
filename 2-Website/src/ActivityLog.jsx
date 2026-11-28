import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import ExportBar from './Export'
import { showMsg } from './dialog'

// Owner-only history of who changed what. Written by database triggers, so it cannot be skipped or edited from the app.
const TBL = {
  shop_fund: 'Shop fund', expenses: 'Expenses', emp_entries: 'Staff entries', employees: 'Employees',
  app_roles: 'Logins', fund_requests: 'Fund requests', bill_tags: 'Delivery tags', counts: 'Stock counts', att_punches: 'Arrival / leaving times',
}
const ACT = { INSERT: 'added', UPDATE: 'changed', DELETE: 'deleted' }
const FIELD = { amount: 'amount', category: 'category', note: 'note', d: 'date', salary: 'salary', name: 'name', role: 'role', status: 'status', kind: 'type', adv_cut: 'advance cut', leave_date: 'last day', leave_quota: 'leave quota', active: 'active', email: 'login email', bill_no: 'bill', t_in: 'came in', t_out: 'left', fixed_by: 'fixed by' }
const val = (k, v) => (['t_in', 't_out', 'orig_in', 'orig_out'].includes(k) && v ? new Date(v).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) : v == null || v === '' ? 'empty' : ['amount', 'salary', 'adv_cut'].includes(k) ? rs(Number(v)) : String(v))

const KIND = { absent: 'absent', half: 'half day', paidleave: 'paid leave' }
function describe(r) {
  const d = r.new_data || r.old_data || {}
  const att = r.tbl === 'emp_entries' && KIND[d.kind]   // an attendance mark: the amount is days (0.5, 1), not rupees
  const what = TBL[r.tbl] || r.tbl
  if (r.action === 'UPDATE') {
    const ks = Object.keys(r.new_data || {}).filter((k) => !['created_at', 'updated_at'].includes(k))
    return what + ' #' + r.row_id + ': ' + ks.map((k) => (FIELD[k] || k) + ' ' + (att && k === 'amount' ? (r.old_data || {})[k] : val(k, (r.old_data || {})[k])) + ' to ' + (att && k === 'amount' ? r.new_data[k] : val(k, r.new_data[k]))).join(', ')
  }
  const bits = [d.name, d.category, att ? KIND[d.kind] : d.kind, d.email, d.bill_no, d.amount != null && !att ? rs(Number(d.amount)) : null, d.d, d.note].filter((x) => x != null && x !== '')
  return what + ' ' + ACT[r.action] + (bits.length ? ': ' + bits.join(' | ') : '')
}
const DESK_TBL = ['shop_fund', 'expenses', 'emp_entries', 'fund_requests', 'bill_tags', 'counts', 'att_punches']
const stamp = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function ActivityLog({ desk }) {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [f, setF] = useState('')
  const [lim, setLim] = useState(100)
  const load = useCallback(async () => {
    setRows(null)
    let q = supabase.from('activity_log').select('*').order('at', { ascending: false }).limit(lim)
    if (f) q = q.eq('tbl', f)
    const [a, r, e] = await Promise.all([q, supabase.from(desk ? 'desk_logins' : 'app_roles').select('email,role,emp_id'), supabase.from(desk ? 'desk_employees' : 'employees').select('id,name')])
    if (a.error) { showMsg(a.error.message + ' (run migration-27.sql in Supabase)'); return setRows([]) }
    const m = {}
    ;(r.data || []).forEach((x) => { const emp = (e.data || []).find((y) => y.id === x.emp_id); m[x.email] = x.role === 'owner' ? 'Owner' : emp ? emp.name : x.email })
    setNames(m); setRows(a.data)
  }, [f, lim])
  useEffect(() => { load() }, [load])
  const who = (r) => (r.actor === 'system' ? 'System (sync or script)' : names[r.actor] || r.actor || '?')
  const build = () => ({ title: 'Activity log', subtitle: f ? TBL[f] : 'All', filename: 'activity-log', columns: ['When', 'Who', 'What'], rows: (rows || []).map((r) => [stamp(r.at), who(r), describe(r)]) })
  return (
    <>
      <div className="tabscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
        <button className={'qc' + (!f ? ' on' : '')} onClick={() => setF('')}>All</button>
        {Object.entries(TBL).filter(([k]) => !desk || DESK_TBL.includes(k)).map(([k, l]) => <button key={k} className={'qc' + (f === k ? ' on' : '')} style={{ whiteSpace: 'nowrap' }} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && <div className="empty"><b>Nothing recorded yet</b><p className="muted small">Changes made after migration-27.sql was run will appear here.</p></div>}
      {rows && rows.length > 0 && <ExportBar build={build} />}
      {(rows || []).map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{who(r)}</b><span className="muted small">{stamp(r.at)}</span></div>
          <div className="small" style={{ marginTop: 2, wordBreak: 'break-word' }}>{describe(r)}</div>
        </div>))}
      {rows && rows.length >= lim && <button className="ghost" onClick={() => setLim(lim + 100)}>Show more</button>}
      <p className="muted small">This log cannot be edited or deleted from the app. It records only this app's own data, never Profit Maker.</p>
    </>)
}

export function ActivityPage({ back, desk }) {
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Activity log</h1></div></header>
      <ActivityLog desk={desk} />
    </div>)
}
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { showMsg } from './dialog'
import { iso, dm } from './expcommon'
import { inMonth, ymOf, daysIn } from './staffcalc'
import MonthPick, { curYm, ymName } from './MonthPick'
import ExportBar from './Export'
import { AttSettings, todayIST, hm, lateBy, hoursOf, hmm } from './PunchClock'
import { span } from './expcommon'

// Daily attendance for everyone on one screen. Everybody counts as present unless you mark absent / half day / paid leave.
// Employees can see their own attendance in their own login (read only).
const OPTIONS = [['', 'Present'], ['absent', 'Absent'], ['half', 'Half day'], ['paidleave', 'Paid leave']]
const ATT = ['absent', 'half', 'paidleave']
const shift = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return iso(t) }

export default function Attendance({ back, desk }) {
  const [d, setD] = useState(iso(new Date()))
  const [emps, setEmps] = useState(null)
  const [ents, setEnts] = useState([])
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const [punches, setPunches] = useState([])
  const [cfg, setCfg] = useState(null)
  const [view, setView] = useState('day')
  const [edit, setEdit] = useState(null)

  const load = useCallback(async () => {
    const from = d.slice(0, 7) + '-01', to = d.slice(0, 7) + '-' + String(daysIn(ymOf(d))).padStart(2, '0')
    const back14 = shift(todayIST(), -14)
    const [a, b, c, k] = await Promise.all([
      supabase.from(desk ? 'desk_employees' : 'employees').select('*').order('name'),
      supabase.from('emp_entries').select('id,emp_id,d,kind').in('kind', ATT).gte('d', from).lte('d', to),
      supabase.from('att_punches').select('*').gte('d', back14 < from ? back14 : from).lte('d', to > todayIST() ? to : todayIST()),
      supabase.rpc('att_config'),
    ])
    if (a.error || b.error) { setErr((a.error || b.error).message); setEmps([]); return }
    setErr(''); setEmps(a.data); setEnts(b.data)
    if (!c.error) setPunches(c.data)
    if (!k.error) setCfg(k.data)
  }, [d])
  useEffect(() => { load() }, [load])

  const punchOf = (id) => punches.find((p) => p.emp_id === id && p.d === d)
  const openOnes = punches.filter((p) => p.t_in && !p.t_out && p.d < todayIST() && p.d >= shift(todayIST(), -14))
  const nameOf = (id) => ((emps || []).find((e) => e.id === id) || {}).name || '#' + id
  const people = (emps || []).filter((e) => e.active && !e.no_attendance && (!e.join_date || e.join_date <= d) && (!e.leave_date || e.leave_date >= d))
  const kindOf = (id) => { const x = ents.find((e) => e.emp_id === id && e.d === d); return x ? x.kind : '' }

  const mark = async (emp, kind) => {
    setBusy(emp.id)
    const del = await supabase.from('emp_entries').delete().eq('emp_id', emp.id).eq('d', d).in('kind', ATT)
    if (del.error) { setBusy(0); return showMsg('Could not save: ' + del.error.message) }
    if (kind) {
      const { error } = await supabase.from('emp_entries').insert({ emp_id: emp.id, d, kind, amount: kind === 'half' ? 0.5 : 1 })
      if (error) { setBusy(0); return showMsg('Could not save: ' + error.message) }
    }
    await load(); setBusy(0)
  }
  const offDates = (id) => ents.filter((x) => x.emp_id === id && x.kind !== 'present').sort((a, b) => a.d.localeCompare(b.d)).map((x) => Number(x.d.slice(8, 10)) + (x.kind === 'half' ? ' (half)' : x.kind === 'paidleave' ? ' (PL)' : '')).join(', ')
  const monthAbs = (id) => ents.filter((e) => e.emp_id === id && inMonth(e.d, ymOf(d)) && e.kind !== 'paidleave').reduce((s, e) => s + (e.kind === 'half' ? 0.5 : 1), 0)

  const saveTimes = async () => {
    const { error } = await supabase.rpc('att_fix', { p_emp: edit.emp.id, p_d: d, p_in: edit.t_in || null, p_out: edit.t_out || null, p_note: edit.note || null })
    if (error) return showMsg('Could not save: ' + error.message)
    setEdit(null); load()
  }
  if (view === 'set') return <div className="app"><AttSettings back={() => setView('day')} /></div>
  if (view === 'month') return <div className="app"><TimesReport back={() => setView('day')} cfg={cfg} /></div>

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Attendance</h1></div></header>
      <div className="btnrow" style={{ margin: '0 0 10px' }}>
        <button className="ghost sm" onClick={() => setView('month')}>Month summary</button>
        {!desk && <button className="ghost sm" onClick={() => setView('set')}>Settings</button>}
      </div>
      {openOnes.length > 0 && (
        <div className="chartcard" style={{ marginBottom: 10, borderLeft: '4px solid #ea580c' }}>
          <b style={{ color: '#ea580c' }}>Forgot to punch out</b>
          {openOnes.sort((a, b) => b.d.localeCompare(a.d)).map((p) => <div key={p.id}><button className="ghost sm" style={{ margin: '4px 0' }} onClick={() => setD(p.d)}>{nameOf(p.emp_id)}, {dm(p.d)}, in {hm(p.t_in)}</button></div>)}
          <span className="muted small">Tap one, then "Edit times" to enter the leaving time.</span>
        </div>)}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button className="ghost sm" onClick={() => setD(shift(d, -1))}>&lsaquo;</button>
        <input className="fsel" type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} style={{ flex: 1 }} />
        <button className="ghost sm" onClick={() => setD(shift(d, 1))} disabled={d >= iso(new Date())}>&rsaquo;</button>
      </div>
      {emps && people.length > 0 && (() => {
        const withP = people.filter((e) => punchOf(e.id) && punchOf(e.id).t_in)
        const late = withP.filter((e) => lateBy(punchOf(e.id), cfg) > 0).length
        const away = people.filter((e) => ['absent', 'paidleave'].includes(kindOf(e.id))).length
        const notIn = people.filter((e) => !(punchOf(e.id) && punchOf(e.id).t_in) && !['absent', 'paidleave'].includes(kindOf(e.id))).length
        return <div className="minis" style={{ marginBottom: 8 }}><div className="mini"><span>Punched in</span><b>{withP.length}</b></div><div className="mini"><span>{d === todayIST() ? 'Not in yet' : 'No punch'}</span><b style={{ color: notIn ? '#ea580c' : undefined }}>{notIn}</b></div><div className="mini"><span>Late</span><b>{late}</b></div><div className="mini"><span>Off</span><b>{away}</b></div></div>
      })()}
      <p className="muted small" style={{ margin: '0 0 8px' }}>{dm(d)}: everyone counts as present unless you mark Absent, Half day or Paid leave. Punch times and short days are only shown to help you decide.</p>
      {err && <p className="error pad">{err}</p>}
      {!emps && <p className="muted pad">Loading...</p>}
      {emps && !people.length && !err && <div className="empty"><b>No working employees on this date</b></div>}
      {people.map((e) => (
        <div key={e.id} className="chartcard" style={{ marginBottom: 8, opacity: busy === e.id ? 0.6 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{e.name}</b><span className="muted small">{e.role || ''}{monthAbs(e.id) ? ' | off this month: ' + offDates(e.id) : ''}</span></div>
          <PunchLine p={punchOf(e.id)} cfg={cfg} d={d} kind={kindOf(e.id)} onEdit={() => { const p = punchOf(e.id); setEdit({ emp: e, t_in: p ? hm(p.t_in) : '', t_out: p ? hm(p.t_out) : '', note: '' }) }} />
          {edit && edit.emp.id === e.id && (
            <div style={{ background: 'var(--accent-soft)', borderRadius: 12, padding: 10, margin: '8px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="small">Came in<input className="fsel" type="time" value={edit.t_in} onChange={(x) => setEdit({ ...edit, t_in: x.target.value })} /></label>
                <label className="small">Left<input className="fsel" type="time" value={edit.t_out} onChange={(x) => setEdit({ ...edit, t_out: x.target.value })} /></label>
              </div>
              <input className="fsel" placeholder="Reason (optional)" value={edit.note} onChange={(x) => setEdit({ ...edit, note: x.target.value })} style={{ width: '100%', marginTop: 8 }} />
              <div className="btnrow" style={{ marginTop: 8 }}><button className="sm" onClick={saveTimes}>Save times</button><button className="ghost sm" onClick={() => setEdit(null)}>Cancel</button></div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>The first times are kept and the change is written to the activity log. Clear both boxes to remove the day's times.</p>
            </div>)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {OPTIONS.map(([k, l]) => <button key={l} disabled={busy === e.id} className={'qc' + (kindOf(e.id) === k ? ' on' : '')} onClick={() => kindOf(e.id) !== k && mark(e, k)}>{l}</button>)}
          </div>
        </div>))}
    </div>
  )
}

function PunchLine({ p, cfg, d, kind, onEdit }) {
  const open = p && p.t_in && !p.t_out
  const late = lateBy(p, cfg)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '6px 0' }}>
      <span className="small">
        {!p && <span className="muted">No punch</span>}
        {p && <>In <b>{hm(p.t_in) || '--'}</b>{late ? <span style={{ color: 'var(--bad)' }}> (late {late}m)</span> : ''} &middot; Out <b>{p.t_out ? hm(p.t_out) : '--'}</b>{hoursOf(p) != null ? ' | ' + hmm(hoursOf(p)) : ''}
          {open && d < todayIST() && <b style={{ color: '#ea580c' }}> forgot to punch out</b>}
          {open && d === todayIST() && <span className="muted"> still in</span>}
          {p.auto_half && <b style={{ color: '#ea580c' }}> | short day (you decide about a half day)</b>}
          {p.fixed_at && <span className="muted"> | fixed by {(p.fixed_by || '').split('@')[0]}</span>}</>}
        {p && kind === 'absent' && <b style={{ color: '#ea580c' }}> marked absent but punched in</b>}
      </span>
      <button className="ghost sm" onClick={onEdit}>{p ? 'Edit times' : 'Add times'}</button>
    </div>)
}

// Month summary for deciding pay: leaves, half days, short days, late days, missing punches. Only shows numbers; nothing here changes salary.
function TimesReport({ back, cfg }) {
  const [ym, setYm] = useState(curYm())
  const [rows, setRows] = useState(null)
  const [ents, setEnts] = useState([])
  const [emps, setEmps] = useState([])
  const sp = span(ym)
  const [openN, setOpenN] = useState('')
  useEffect(() => {
    setRows(null)
    Promise.all([
      supabase.from('att_punches').select('*').gte('d', sp.from).lte('d', sp.to),
      supabase.from('desk_employees').select('id,name,active,no_attendance,join_date,leave_date').order('name'),
      supabase.from('emp_entries').select('emp_id,d,kind').in('kind', ATT).gte('d', sp.from).lte('d', sp.to),
    ]).then(([a, b, c]) => {
      if (a.error) { showMsg(a.error.message); setRows([]); return }
      setRows(a.data); setEmps(b.data || []); setEnts(c.data || [])
    })
  }, [ym])
  const today = todayIST()
  const off = cfg ? cfg.weekly_off : 0
  const lines = (emps || []).filter((e) => !e.no_attendance).map((e) => {
    const ps = (rows || []).filter((p) => p.emp_id === e.id)
    const es = ents.filter((x) => x.emp_id === e.id)
    const dayN = (x) => Number(x.d.slice(8, 10))
    const done = ps.filter((p) => p.t_out)
    const hrs = done.reduce((s, p) => s + hoursOf(p), 0)
    const absent = es.filter((x) => x.kind === 'absent'), half = es.filter((x) => x.kind === 'half'), pl = es.filter((x) => x.kind === 'paidleave')
    const shortD = ps.filter((p) => p.auto_half), lateD = ps.filter((p) => lateBy(p, cfg) > 0)
    const open = ps.filter((p) => p.t_in && !p.t_out && p.d < today)
    // working days with no punch and nothing marked (weekly off, future days and days outside the joining / leaving dates are skipped)
    const noPunch = []
    for (let n = 1; n <= daysIn(ym); n++) {
      const d = sp.from.slice(0, 8) + String(n).padStart(2, '0')
      if (d > today || (e.join_date && d < e.join_date) || (e.leave_date && d > e.leave_date)) continue
      if (off != null && new Date(d + 'T00:00:00').getDay() === Number(off)) continue
      if (ps.some((p) => p.d === d) || es.some((x) => x.d === d)) continue
      noPunch.push(n)
    }
    return { id: e.id, name: e.name, active: e.active, any: ps.length || es.length, days: ps.length, absent: absent.map(dayN), half: half.map(dayN), pl: pl.map(dayN), short: shortD.map((p) => Number(p.d.slice(8, 10))), late: lateD.map((p) => Number(p.d.slice(8, 10))), open: open.map((p) => Number(p.d.slice(8, 10))), noPunch, hrs, avg: done.length ? hrs / done.length : 0 }
  }).filter((l) => l.active || l.any)
  const sum = (a) => a.length
  const lst = (a) => (a.length ? ' (' + a.join(', ') + ')' : '')
  const build = () => ({ title: 'Attendance summary', subtitle: ymName(ym) + ' (numbers only, for deciding pay)', filename: 'attendance-summary-' + ym,
    columns: ['Name', 'Absent', 'Half days', 'Paid leave', 'Short days', 'Late days', 'No punch, not marked', 'Not punched out', 'Days punched', 'Total hours'],
    rows: lines.map((l) => [l.name, sum(l.absent), sum(l.half), sum(l.pl), sum(l.short), sum(l.late), sum(l.noPunch), sum(l.open), l.days, l.hrs.toFixed(1)]), numCols: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
  const nameOf = (id) => ((emps || []).find((e) => e.id === id) || {}).name || '#' + id
  const buildDaily = () => ({ title: 'Arrival and leaving times', subtitle: ymName(ym), filename: 'punch-times-' + ym,
    columns: ['Date', 'Name', 'In', 'Out', 'Hours', 'Late (min)', 'Short day', 'Fixed by'],
    rows: [...(rows || [])].sort((a, b) => a.d.localeCompare(b.d) || nameOf(a.emp_id).localeCompare(nameOf(b.emp_id))).map((p) => [dm(p.d), nameOf(p.emp_id), hm(p.t_in), p.t_out ? hm(p.t_out) : (p.d < today ? 'not punched out' : ''), hoursOf(p) != null ? hoursOf(p).toFixed(2) : '', lateBy(p, cfg) || '', p.auto_half ? 'yes' : '', p.fixed_by ? p.fixed_by.split('@')[0] : '']), numCols: [4, 5] })
  const Mini = ({ k, v, warn }) => <div className="mini"><span>{k}</span><b style={{ color: warn && v ? '#ea580c' : undefined }}>{v}</b></div>
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}><button className="ghost sm" onClick={back}>Back</button><h2 className="h2" style={{ margin: 0 }}>Month summary</h2></div>
      <p className="muted small" style={{ margin: '0 0 8px' }}>Numbers to help you decide before paying. Nothing here changes salary: absent and half days count only when somebody marks them on the Attendance screen.</p>
      <MonthPick ym={ym} onChange={setYm} />
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !lines.length && <div className="empty"><b>No data this month</b></div>}
      {lines.length > 0 && <><ExportBar build={build} /><p className="muted small" style={{ margin: '0 0 4px' }}>Every in and out time of the month, for all people:</p><ExportBar build={buildDaily} /></>}
      {lines.map((l) => (
        <div key={l.name} className="chartcard" style={{ marginBottom: 8 }}>
          <b>{l.name}</b>
          <div className="minis" style={{ marginTop: 6 }}>
            <Mini k="Absent" v={sum(l.absent)} /><Mini k="Half days" v={sum(l.half)} /><Mini k="Paid leave" v={sum(l.pl)} />
          </div>
          <div className="minis" style={{ marginTop: 6 }}>
            <Mini k="Short days" v={sum(l.short)} warn /><Mini k="Late" v={sum(l.late)} warn /><Mini k="No punch" v={sum(l.noPunch)} warn />
          </div>
          <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            {sum(l.absent) > 0 && <div>Absent days{lst(l.absent)}</div>}
            {sum(l.half) > 0 && <div>Half days marked{lst(l.half)}</div>}
            {sum(l.short) > 0 && <div style={{ color: '#ea580c' }}>Short days, not marked as half day{lst(l.short)}</div>}
            {sum(l.late) > 0 && <div>Late on{lst(l.late)}</div>}
            {sum(l.noPunch) > 0 && <div>No punch and nothing marked{lst(l.noPunch)}</div>}
            {sum(l.open) > 0 && <div style={{ color: '#ea580c' }}>Forgot to punch out{lst(l.open)}</div>}
            {l.days > 0 && <div>{l.days} days punched | {hmm(l.hrs)} worked | average {hmm(l.avg)} a day</div>}
          </div>
          {l.days > 0 && <button className="ghost sm" style={{ marginTop: 6 }} onClick={() => setOpenN(openN === l.name ? '' : l.name)}>{openN === l.name ? 'Hide daily times' : 'Show daily times'}</button>}
          {openN === l.name && (
            <div style={{ marginTop: 6 }}>
              {(rows || []).filter((p) => p.emp_id === l.id).sort((a, b) => a.d.localeCompare(b.d)).map((p) => (
                <div key={p.id} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: '1px solid var(--line)' }}>
                  <b>{dm(p.d)}</b>
                  <span>{hm(p.t_in) || '--'} to {p.t_out ? hm(p.t_out) : (p.d < today ? <b style={{ color: '#ea580c' }}>not punched out</b> : 'still in')}{hoursOf(p) != null ? ' | ' + hmm(hoursOf(p)) : ''}{lateBy(p, cfg) ? <span style={{ color: 'var(--bad)' }}> | late {lateBy(p, cfg)}m</span> : ''}{p.auto_half ? <span style={{ color: '#ea580c' }}> | short</span> : ''}{p.fixed_at ? <span className="muted"> | fixed</span> : ''}</span>
                </div>))}
            </div>)}
        </div>))}
    </>)
}
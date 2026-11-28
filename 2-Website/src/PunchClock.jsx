import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { showMsg } from './dialog'
import MonthPick, { curYm } from './MonthPick'
import { span, dm } from './expcommon'

// Arrival and leaving times. The TIME always comes from the database server (never the phone's clock).
// Shared helpers + the employee's "I'm in / I'm leaving" screen + the owner's attendance settings.
const IST = 'Asia/Kolkata'
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: IST })
export const hm = (ts) => (ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }) : '')
const mins = (t) => { if (!t) return null; const [h, m] = t.split(':'); return Number(h) * 60 + Number(m) }
export const lateBy = (p, cfg) => {
  if (!p || !p.t_in || !cfg) return 0
  const over = mins(hm(p.t_in)) - (mins(cfg.start_time) + Number(cfg.grace_min || 0))
  return over > 0 ? over + Number(cfg.grace_min || 0) : 0   // minutes after the start time
}
export const hoursOf = (p) => (p && p.t_in && p.t_out ? (new Date(p.t_out) - new Date(p.t_in)) / 36e5 : null)
export const hmm = (h) => (h == null ? '' : Math.floor(h) + 'h ' + String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0') + 'm')

const getPos = () => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej({ code: 0 })
  navigator.geolocation.getCurrentPosition((p) => res(p.coords), rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
})
const geoMsg = (e) => e && e.code === 1
  ? 'Location is blocked for this app. Open the phone settings, allow Location for this app (or Chrome), then try again.'
  : e && e.code === 0 ? 'This phone cannot give a location.' : 'Could not get your location. Turn on GPS, go near the shop door and try again.'

// ---------- Employee screen ----------
export function Punch({ empId }) {
  const [cfg, setCfg] = useState(null)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ym, setYm] = useState(curYm())
  const load = useCallback(async () => {
    const sp = span(ym)
    const [c, r] = await Promise.all([
      supabase.rpc('att_config'),
      supabase.from('att_punches').select('*').eq('emp_id', empId).gte('d', sp.from).lte('d', sp.to).order('d', { ascending: false }),
    ])
    if (c.error || r.error) { setErr((c.error || r.error).message); return }
    setErr(''); setCfg(c.data); setRows(r.data)
  }, [ym, empId])
  useEffect(() => { load() }, [load])
  const [today, setToday] = useState(null)
  useEffect(() => {
    (async () => { const { data } = await supabase.from('att_punches').select('*').eq('emp_id', empId).eq('d', todayIST()).maybeSingle(); setToday(data || false) })()
  }, [rows, empId])

  const go = async (dir) => {
    setBusy(true)
    try {
      let c = null
      if (cfg && cfg.has_location) { try { c = await getPos() } catch (e) { setBusy(false); return showMsg(geoMsg(e)) } }
      const { data, error } = await supabase.rpc('att_punch', { p_dir: dir, p_lat: c ? c.latitude : null, p_lng: c ? c.longitude : null, p_acc: c ? c.accuracy : null })
      if (error) showMsg(error.message)
      else {
        setToday(data)
        showMsg(dir === 'in' ? 'You are in at ' + hm(data.t_in) + '.' + (lateBy(data, cfg) ? ' (Late by ' + lateBy(data, cfg) + ' min)' : '')
          : 'You left at ' + hm(data.t_out) + '. Worked ' + hmm(hoursOf(data)) + '.' + (data.auto_half ? ' Because the day was short, it is counted as a half day.' : ''))
      }
    } catch (e) { showMsg('Something went wrong: ' + (e.message || e)) }
    setBusy(false); load()
  }

  const state = today === null ? 'load' : !today || !today.t_in ? 'in' : !today.t_out ? 'out' : 'done'
  const big = { width: '100%', padding: '22px 12px', fontSize: 22, fontWeight: 700, border: 0, borderRadius: 18, color: '#fff' }
  return (
    <>
      {err && <p className="error pad">{err}</p>}
      <div className="chartcard" style={{ textAlign: 'center', marginBottom: 12 }}>
        <div className="muted small">Today, {dm(todayIST())}{cfg ? ' | starts ' + cfg.start_time : ''}</div>
        {state === 'load' && <p className="muted">Loading...</p>}
        {state === 'in' && <><p style={{ margin: '8px 0 12px' }}>You have not punched in yet.</p><button disabled={busy} style={{ ...big, background: '#16a34a', opacity: busy ? 0.6 : 1 }} onClick={() => go('in')}>{busy ? 'Checking location...' : "I'm in"}</button></>}
        {state === 'out' && <><p style={{ margin: '8px 0 12px' }}>In since <b>{hm(today.t_in)}</b>{lateBy(today, cfg) ? <span style={{ color: 'var(--bad)' }}> (late {lateBy(today, cfg)} min)</span> : ''}</p><button disabled={busy} style={{ ...big, background: '#dc2626', opacity: busy ? 0.6 : 1 }} onClick={() => go('out')}>{busy ? 'Checking location...' : "I'm leaving"}</button></>}
        {state === 'done' && <p style={{ margin: '10px 0' }}>In <b>{hm(today.t_in)}</b> &middot; Out <b>{hm(today.t_out)}</b> &middot; <b>{hmm(hoursOf(today))}</b>{today.auto_half ? <span style={{ color: 'var(--bad)' }}> (half day)</span> : ''}<br /><span className="muted small">Done for today.</span></p>}
        {cfg && cfg.has_location && <p className="muted small" style={{ margin: '10px 0 0' }}>You can punch only at the shop (within {cfg.radius_m} m). Allow Location when the phone asks.</p>}
      </div>
      <MonthPick ym={ym} onChange={setYm} />
      {rows && !rows.length && <p className="muted small">No punches in this month.</p>}
      {(rows || []).map((p) => (
        <div key={p.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <b>{dm(p.d)}</b>
          <span className="small">{hm(p.t_in) || '--'} to {p.t_out ? hm(p.t_out) : (p.d === todayIST() ? 'still in' : <span style={{ color: 'var(--bad)' }}>not punched out</span>)}{hoursOf(p) != null ? ' | ' + hmm(hoursOf(p)) : ''}{lateBy(p, cfg) ? <span style={{ color: 'var(--bad)' }}> | late {lateBy(p, cfg)}m</span> : ''}{p.fixed_at ? <span className="muted"> | corrected</span> : ''}</span>
        </div>))}
    </>)
}

// ---------- Owner: attendance settings ----------
export function AttSettings({ back }) {
  const [s, setS] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => { if (error) showMsg(error.message); setS(data || {}) }) }, [])
  if (!s) return <p className="muted pad">Loading...</p>
  const set = (k, v) => setS({ ...s, [k]: v })
  const save = async (extra) => {
    setBusy(true)
    const body = { start_time: s.start_time, grace_min: Number(s.grace_min), half_day_hours: Number(s.half_day_hours), radius_m: Number(s.radius_m), updated_at: new Date().toISOString(), ...extra }
    const { error } = await supabase.from('shop_settings').update(body).eq('id', 1)
    setBusy(false)
    if (error) return showMsg('Could not save: ' + error.message)
    if (extra) setS({ ...s, ...extra })
    showMsg('Saved.')
  }
  const here = async () => {
    setBusy(true)
    try { const c = await getPos(); if (c.accuracy > 100) { setBusy(false); return showMsg('The location is not accurate yet (about ' + Math.round(c.accuracy) + ' m). Stand near the shop door with GPS on and try again.') }
      await save({ shop_lat: c.latitude, shop_lng: c.longitude }) } catch (e) { setBusy(false); showMsg(geoMsg(e)) }
  }
  const row = { display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center', marginBottom: 8 }
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}><button className="ghost sm" onClick={back}>Back</button><h2 className="h2" style={{ margin: 0 }}>Attendance settings</h2></div>
      <div className="chartcard">
        <label style={row}><span>Shop opens at</span><input className="fsel" type="time" value={s.start_time ? s.start_time.slice(0, 5) : '09:30'} onChange={(e) => set('start_time', e.target.value)} /></label>
        <label style={row}><span>Grace before "late" (minutes)</span><input className="fsel" type="number" min="0" value={s.grace_min ?? 10} onChange={(e) => set('grace_min', e.target.value)} /></label>
        <label style={row}><span>Counts as half day if less than (hours)</span><input className="fsel" type="number" min="0" step="0.5" value={s.half_day_hours ?? 4} onChange={(e) => set('half_day_hours', e.target.value)} /></label>
        <label style={row}><span>Allowed distance from shop (metres)</span><input className="fsel" type="number" min="30" value={s.radius_m ?? 150} onChange={(e) => set('radius_m', e.target.value)} /></label>
        <button disabled={busy} onClick={() => save()}>Save</button>
      </div>
      <div className="chartcard" style={{ marginTop: 10 }}>
        <b>Shop location</b>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>{s.shop_lat != null ? 'Saved. Employees can punch only within ' + (s.radius_m ?? 150) + ' m of it.' : 'Not set yet, so employees can punch from anywhere. Stand inside the shop and tap the button.'}</p>
        <button disabled={busy} onClick={here}>{s.shop_lat != null ? 'Set the shop location again (use this phone now)' : 'Set the shop location (use this phone now)'}</button>
        {s.shop_lat != null && <button className="ghost sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => save({ shop_lat: null, shop_lng: null })}>Remove location check</button>}
      </div>
    </>)
}

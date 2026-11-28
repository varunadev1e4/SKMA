import { useMemo, useState } from 'react'
import { useBackLayer } from './backstack'

// Company chooser with a search box: tap, type a few letters, tap the company. Replaces a long drop-down list that had to be scrolled.
// value '' means all companies. Works with the phone Back button (closes the list first).
export default function CompanyPick({ value, onChange, companies, all = 'All companies', style }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  useBackLayer(open, () => setOpen(false))
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? companies.filter((c) => String(c).toLowerCase().includes(t)) : companies
  }, [q, companies])
  const choose = (c) => { onChange(c); setOpen(false); setQ('') }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ textAlign: 'left', width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 12px', fontSize: 15, ...style }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: value ? 700 : 400 }}>{value || all}</span><span className="muted">&#9662;</span>
      </button>
      {open && (
        <div role="presentation" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', color: 'var(--text)', width: '100%', maxWidth: 560, maxHeight: '82vh', borderRadius: '18px 18px 0 0', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input autoFocus type="search" placeholder="Type to search companies" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, padding: '11px 12px', fontSize: 16, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
              <button type="button" className="ghost sm" onClick={() => { setOpen(false); setQ('') }}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', display: 'grid', gap: 2 }}>
              {!q.trim() && <button type="button" onClick={() => choose('')} style={{ textAlign: 'left', border: 0, background: !value ? 'var(--accent-soft)' : 'none', color: 'var(--text)', padding: '11px 10px', borderRadius: 10, fontWeight: 700 }}>{all}</button>}
              {list.map((c) => <button type="button" key={c} onClick={() => choose(c)} style={{ textAlign: 'left', border: 0, background: c === value ? 'var(--accent-soft)' : 'none', color: 'var(--text)', padding: '11px 10px', borderRadius: 10, fontWeight: c === value ? 700 : 400 }}>{c}</button>)}
              {!list.length && <p className="muted" style={{ padding: 10 }}>No company matches "{q}".</p>}
            </div>
          </div>
        </div>)}
    </>)
}
import { supabase } from './supabase'
import { SHOP, GSTIN, fetchAll } from './util'
import { inWords } from './exporter'

// Bill copy laid out like the shop's own landscape GST INVOICE (shop | invoice | customer, item table, tax box, totals), built from synced data (sales_lines + bill_heads). Read only.
// Shop details printed at the top and bottom. Change here, or set these in Vercel (VITE_...) to override.
const E = import.meta.env
export const SHOP_INFO = {
  addr1: E.VITE_SHOP_ADDR1 || '',
  addr2: E.VITE_SHOP_ADDR2 || '',
  phone: E.VITE_SHOP_PHONE || '',
  dl: (E.VITE_SHOP_DL || '').split('|'),
  bank: E.VITE_SHOP_BANK || '',
  juris: E.VITE_SHOP_JURIS || '',
  fssai: E.VITE_SHOP_FSSAI || '',
  note: 'section 18 of the drugs & cosmetics act 1940.',
}
const COLS = 'id,fy,d,bill_no,party,party_code,city,product,pack,batch,qty,free,rate,dis,gst,amount,hsn,mrp,exp,mfg'
const COLS_OLD = 'id,fy,d,bill_no,party,party_code,city,product,pack,batch,qty,free,rate,dis,gst,amount'
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const mny = (v) => n2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
const dm = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '')
const clean = (t) => String(t || '').trim().replace(/[%,()*]/g, '')

function group(rows) {
  const m = new Map()
  rows.forEach((r) => { const k = r.fy + '|' + r.bill_no + '|' + r.d; if (!m.has(k)) m.set(k, { key: k, fy: r.fy, bill_no: r.bill_no, d: r.d, party: r.party, city: r.city, code: r.party_code, lines: [] }); m.get(k).lines.push(r) })
  const out = [...m.values()]
  out.forEach((g) => { g.lines.sort((a, b) => a.id - b.id); g.total = totals(g.lines).total })
  return out.sort((a, b) => b.d.localeCompare(a.d))
}

export function totals(lines) {
  let taxable = 0, gst = 0
  lines.forEach((l) => { const a = Number(l.amount) || 0, g = Number(l.gst) || 0; taxable += a; gst += a * g / 100 })
  return { taxable: n2(taxable), gst: n2(gst), total: n2(taxable + gst), qty: lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), free: lines.reduce((s, l) => s + (Number(l.free) || 0), 0) }
}

async function linesFor(nos) {
  let r = await supabase.from('sales_lines').select(COLS).eq('kind', 'S').in('bill_no', nos).order('d', { ascending: false }).limit(2000)
  if (r.error) r = await supabase.from('sales_lines').select(COLS_OLD).eq('kind', 'S').in('bill_no', nos).order('d', { ascending: false }).limit(2000)
  return r.data || []
}

// The number a customer sees on the invoice (InvNo) or the software's own number (FeedNo) both work.
export async function findBills(no, date, party) {
  const t = clean(no)
  if (!t) return []
  let feeds = []
  let h = await supabase.from('bill_heads').select('fy,feed_no,inv_no,d').or('feed_no.eq.' + t + ',inv_no.eq.' + t).limit(50)
  if (!h.error && !(h.data || []).length) h = await supabase.from('bill_heads').select('fy,feed_no,inv_no,d').or('feed_no.ilike.%' + t + '%,inv_no.ilike.%' + t + '%').limit(50)
  if (!h.error) feeds = [...new Set((h.data || []).map((x) => x.feed_no))]
  if (!feeds.length) feeds = [t]
  let rows = await linesFor(feeds)
  if (!rows.length) { const r = await supabase.from('sales_lines').select(COLS_OLD).eq('kind', 'S').ilike('bill_no', '%' + t + '%').order('d', { ascending: false }).limit(1000); rows = r.data || [] }
  let g = group(rows)
  if (date) { const f = g.filter((x) => x.d === String(date).slice(0, 10)); if (f.length) g = f }
  if (party) { const f = g.filter((x) => x.party === party); if (f.length) g = f }
  return g
}

export async function billExtra(g) {
  const [a, b] = await Promise.all([
    supabase.from('bill_heads').select('*').eq('fy', g.fy).eq('feed_no', g.bill_no).limit(5),
    supabase.from('parties').select('phone,phone2').eq('name', g.party).limit(1),
  ])
  const heads = a.data || []
  const hd = heads.find((x) => x.d === g.d) || heads[0] || null
  return { hd, pty: (b.data || [])[0] || null }
}

const slabsOf = (g, hd) => {
  const t = totals(g.lines)
  if (hd) return [[0, hd.gv0, 0], [5, hd.gv1, hd.g1], [12, hd.gv2, hd.g2], [18, hd.gv3, hd.g3], [28, hd.gv4, hd.g4]].map(([r, v, x]) => ({ r, v: n2(v), x: n2(x) }))
  const by = new Map()
  g.lines.forEach((l) => { const r = Number(l.gst) || 0, a = Number(l.amount) || 0; const s = by.get(r) || { r, v: 0, x: 0 }; s.v += a; s.x += a * r / 100; by.set(r, s) })
  return [0, 5, 12, 18, 28].map((r) => { const s = by.get(r); return { r, v: n2(s ? s.v : 0), x: n2(s ? s.x : 0) } })
}

export async function billBlob(g, hd) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  // Landscape A4 laid out like the shop's own GST INVOICE: shop | invoice | customer on top, ruled item table, tax box and totals below.
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const L = 20, R = W - 20, T = 20, B = H - 20
  const t = totals(g.lines), sl = slabsOf(g, hd)
  const sub = hd ? n2(hd.sub_total) : t.taxable
  const gstAmt = hd ? n2(hd.sum_gst) : t.gst
  const net = hd ? n2(hd.net) : Math.round(t.total)
  const inter = !!(hd && hd.inter)
  const p = hd || {}
  const F = (s, z = 8.5) => { doc.setFont('times', s); doc.setFontSize(z) }
  const line = (x1, y1, x2, y2, w = 0.6) => { doc.setDrawColor(40); doc.setLineWidth(w); doc.line(x1, y1, x2, y2) }
  const wrap = (txt, w) => doc.splitTextToSize(String(txt), w)
  const footerTop = B - 158
  const headBottom = 124
  const X1 = 335, X2 = 585   // column dividers of the header block

  // ----- header: shop | invoice | customer -----
  line(L, headBottom, R, headBottom)
  line(X1, T, X1, headBottom); line(X2, T, X2, headBottom)
  F('bold', 13); doc.text(wrap(SHOP.toUpperCase(), X1 - L - 12), L + 6, T + 16)
  F('normal', 8.5)
  let y = T + 30
  ;[SHOP_INFO.addr1, SHOP_INFO.addr2, SHOP_INFO.phone ? 'Phone:' + SHOP_INFO.phone : '', SHOP_INFO.dl.filter(Boolean).length ? 'D.L.Nos :' + SHOP_INFO.dl.filter(Boolean).join(',') : '', 'GSTIN NO:' + GSTIN + (SHOP_INFO.fssai ? '   FSSAI:' + SHOP_INFO.fssai : '')]
    .filter(Boolean).forEach((s) => { wrap(s, X1 - L - 12).forEach((w) => { doc.text(w, L + 6, y); y += 11 }) })

  F('bold', 14); doc.text('GST INVOICE', (X1 + X2) / 2, T + 18, { align: 'center' })
  F('bold', 10); doc.text('Inv No:' + g.bill_no + '   Date:' + dm(g.d), (X1 + X2) / 2, T + 38, { align: 'center' })
  F('normal', 8.5)
  doc.text('Ord No:', X1 + 8, T + 56); doc.text('Date :', X1 + 135, T + 56)
  doc.text('Lr No :', X1 + 8, T + 68); doc.text('Date :', X1 + 135, T + 68)
  doc.text('Type', X2 - 8, T + 56, { align: 'right' }); F('bold', 9); doc.text((hd && hd.typ) || '', X2 - 8, T + 68, { align: 'right' })

  F('bold', 10); doc.text(wrap('To:' + (g.party || ''), R - X2 - 20), X2 + 6, T + 16)
  F('normal', 8.5)
  y = T + 30
  const dls = [p.dl1, p.dl2].filter(Boolean)
  ;[...[p.add1, p.add2, p.add3, p.add4].filter(Boolean), [p.city, p.pin].filter(Boolean).join(' - '), dls.length ? 'D.L.Nos :' + dls.join(',') : '', p.gstin ? 'GSTIN NO:' + p.gstin : '', p.phone ? 'Phone:' + p.phone : '']
    .filter(Boolean).forEach((s) => { wrap(s, R - X2 - 20).forEach((w) => { if (y < headBottom - 3) { doc.text(w, X2 + 6, y); y += 10.5 } }) })

  // ----- item table -----
  const heads = ['S.NO', 'PRODUCT NAME', 'PACK', 'HSNCODE', 'MFG', 'BATCHNO', 'EXPIRY', 'QTY', 'FREE', 'RATE', 'DIS%', 'M.R.P', ...(inter ? ['IGST%'] : ['CGST%', 'SGST%']), 'AMOUNT']
  const wd = [24, 0, 34, 54, 40, 66, 44, 34, 30, 52, 34, 52, ...(inter ? [40] : [36, 36]), 62]
  wd[1] = (R - L) - wd.reduce((s, v) => s + v, 0)
  const body = g.lines.map((l, i) => {
    const gs = Number(l.gst) || 0
    return [String(i + 1), l.product, l.pack || '', l.hsn || '', l.mfg || '', l.batch || '', l.exp || '', n2(l.qty).toFixed(1), n2(l.free).toFixed(1), mny(l.rate), mny(l.dis), l.mrp != null ? mny(l.mrp) : '', ...(inter ? [String(gs)] : [String(gs / 2), String(gs / 2)]), mny(l.amount)]
  })
  const colStyles = {}
  wd.forEach((w, i) => { colStyles[i] = { cellWidth: w, halign: i >= 7 ? 'right' : i === 0 ? 'center' : 'left' } })
  const xs = []; wd.reduce((a, w) => { a += w; xs.push(L + a); return a }, 0)
  const frame = (pg) => {
    doc.setDrawColor(40); doc.setLineWidth(0.8); doc.rect(L, T, R - L, B - T)
    const top = pg === 1 ? headBottom : T + 4
    xs.slice(0, -1).forEach((x) => line(x, top, x, footerTop, 0.4))
  }
  autoTable(doc, {
    startY: headBottom, theme: 'plain', head: [heads], body,
    styles: { font: 'times', fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, overflow: 'linebreak', textColor: 20 },
    headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.6 }, lineColor: [40, 40, 40] },
    columnStyles: colStyles, margin: { left: L, right: L, top: T + 4, bottom: B - footerTop + 4 },
    didParseCell: (d) => { if (d.section === 'head') d.cell.styles.halign = d.column.index >= 7 ? 'right' : d.column.index === 0 ? 'center' : 'left' },
    didDrawPage: (d) => frame(d.pageNumber),
  })

  // ----- footer on the last page: tax box, totals, terms -----
  line(L, footerTop, R, footerTop)
  const gx = [L + 6, L + 56, L + 130, L + 200, L + 270]
  F('bold', 8.5)
  ;['GST%', 'TAXABLE', 'CGSTAMT', 'SGSTAMT', 'IGSTAMT'].forEach((h, i) => (i ? doc.text(h, gx[i] + (i === 1 ? 50 : 48), footerTop + 13, { align: 'right' }) : doc.text(h, gx[i], footerTop + 13)))
  doc.text('NOTE:Have a nice day...', L + 330, footerTop + 13)
  line(L, footerTop + 18, L + 320, footerTop + 18, 0.4)
  F('normal', 8.5)
  let tv = 0, tc = 0, ts = 0, ti = 0
  sl.filter((s) => s.r > 0).forEach((s, i) => {
    const yy = footerTop + 30 + i * 12
    const c = inter ? 0 : s.x / 2, ig = inter ? s.x : 0
    tv += s.v; tc += c; ts += c; ti += ig
    doc.text(s.r.toFixed(2) + '%:', gx[0], yy); doc.text(mny(s.v), gx[1] + 50, yy, { align: 'right' }); doc.text(mny(c), gx[2] + 48, yy, { align: 'right' }); doc.text(mny(c), gx[3] + 48, yy, { align: 'right' }); doc.text(mny(ig), gx[4] + 48, yy, { align: 'right' })
  })
  line(L, footerTop + 76, L + 320, footerTop + 76, 0.4)
  F('bold', 8.5)
  doc.text('Total :', gx[0], footerTop + 88); doc.text(mny(tv), gx[1] + 50, footerTop + 88, { align: 'right' }); doc.text(mny(tc), gx[2] + 48, footerTop + 88, { align: 'right' }); doc.text(mny(ts), gx[3] + 48, footerTop + 88, { align: 'right' }); doc.text(mny(ti), gx[4] + 48, footerTop + 88, { align: 'right' })

  F('normal', 8.5)
  const ax = 520, av = 665, bx = 690
  ;[['0% Taxabale :', mny(sl[0].v), 'Subtotal :', mny(sub)], ['Adjust (-/+) :', mny(hd ? hd.adjust : 0), 'Less Disc :', mny(hd ? hd.less_disc : 0)], ['Cr/Dr Amt :', mny(hd ? hd.cr_note : 0), 'Gst Amt :', mny(gstAmt)], ['Freight Amt :', '0.00', 'Rounding :', mny(hd ? hd.rounding : n2(net - t.total))]]
    .forEach(([a, av2, b, bv], i) => { const yy = footerTop + 13 + i * 12; doc.text(a, ax, yy); doc.text(av2, av, yy, { align: 'right' }); doc.text(b, bx, yy); doc.text(bv, R - 6, yy, { align: 'right' }) })
  doc.text('Total Products :', ax, footerTop + 64); doc.text(String(g.lines.length), av, footerTop + 64, { align: 'right' })
  doc.text('Total Qty :', ax, footerTop + 76); doc.text(n2(t.qty).toFixed(2), av, footerTop + 76, { align: 'right' })
  line(L + 330, footerTop + 94, R, footerTop + 94, 0.4)
  F('normal', 8.5); doc.text(wrap('Tcs%: 0 Tcs Amt: 0   AmtInWords : ' + inWords(net), 420), L + 330, footerTop + 106)
  F('bold', 9); doc.text('NET AMOUNT', R - 120, footerTop + 124, { align: 'right' }); F('bold', 15); doc.text(mny(net), R - 6, footerTop + 126, { align: 'right' })
  line(L, footerTop + 94, L + 320, footerTop + 94, 0.4)
  F('bold', 8); doc.text('Terms:', L + 6, footerTop + 106)
  F('normal', 7.5)
  const terms = ['1.Goods Once Sold Cannot taken Back.The goods supplied in this invoice do not contravene ' + SHOP_INFO.note, '2.Subject to ' + (SHOP_INFO.juris || '') + ' Jurisdiction Only. E.&O.E']
  let ty = footerTop + 116
  terms.forEach((s) => wrap(s, 310).forEach((w) => { doc.text(w, L + 6, ty); ty += 9 }))
  if (SHOP_INFO.bank) wrap(SHOP_INFO.bank, 310).forEach((w) => { doc.text(w, L + 6, ty); ty += 9 })
  F('bold', 8.5); doc.text(SHOP.toUpperCase(), R - 6, footerTop + 142, { align: 'right' })
  F('normal', 8); doc.text('Authorised Signatory', R - 6, footerTop + 153, { align: 'right' })
  return { blob: doc.output('blob'), filename: ('Bill-' + g.bill_no + '-' + g.d).replace(/[^\w-]+/g, '-') + '.pdf', net }
}

// Recent sales bills (newest first) with the printed net amount, for the quick list.
export async function recentBills(from) {
  let rows
  try { rows = await fetchAll('sales_lines', COLS, (q) => q.eq('kind', 'S').gte('d', from), 'recent:' + from) }
  catch (e) { rows = await fetchAll('sales_lines', COLS_OLD, (q) => q.eq('kind', 'S').gte('d', from), 'recent0:' + from) }
  const g = group(rows)
  try {
    const hs = await fetchAll('bill_heads', 'fy,feed_no,d,net,typ', (q) => q.gte('d', from), 'recent-h:' + from)
    const m = new Map(hs.map((h) => [h.fy + '|' + h.feed_no + '|' + h.d, h]))
    g.forEach((x) => { const h = m.get(x.fy + '|' + x.bill_no + '|' + x.d); if (h) { x.net = Number(h.net); x.typ = h.typ } })
  } catch (e) { /* older database without bill_heads */ }
  g.forEach((x) => { if (x.net == null) x.net = Math.round(x.total) })
  return g.sort((a, b) => b.d.localeCompare(a.d) || b.bill_no.localeCompare(a.bill_no, 'en', { numeric: true }))
}

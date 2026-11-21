import { useCallback, useEffect, useState } from 'react'
import { deleteNote, getNotes, getPrice, postNote } from './api'
import { useGuard } from './hooks'

const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-US')}`

// Pure helpers (exported so that they can be checked on their own)
export function costPerCylinder({ purchase, transport, other, price }) {
  const cost = purchase + transport + other
  const margin = price - cost
  return { cost, margin, percent: price > 0 ? (margin / price) * 100 : null }
}

export function calcStep(state, key) {
  // A small four-function calculator without eval: state = { acc, op, cur, fresh }
  const { acc, op, cur } = state
  const apply = (a, o, b) => (o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : o === '/' ? (b === 0 ? NaN : a / b) : b)
  if (/^\d$/.test(key)) return { ...state, cur: state.fresh || cur === '0' ? key : cur + key, fresh: false }
  if (key === '.') return state.fresh ? { ...state, cur: '0.', fresh: false } : cur.includes('.') ? state : { ...state, cur: cur + '.' }
  if (key === 'C') return { acc: null, op: null, cur: '0', fresh: true }
  if (['+', '-', '*', '/', '='].includes(key)) {
    const value = acc === null || state.fresh && op === null ? Number(cur) : state.fresh ? acc : apply(acc, op, Number(cur))
    const shown = Number.isFinite(value) ? String(Math.round(value * 1e9) / 1e9) : 'error'
    return key === '=' ? { acc: null, op: null, cur: shown, fresh: true } : { acc: Number.isFinite(value) ? value : null, op: key, cur: shown, fresh: true }
  }
  return state
}

function Calculator() {
  const [st, setSt] = useState({ acc: null, op: null, cur: '0', fresh: true })
  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+']
  return (
    <div className="card" style={{ maxWidth: 260 }}>
      <h2>Calculator</h2>
      <output aria-label="calculator display" style={{ fontSize: 24, textAlign: 'right', padding: '6px 8px', border: '1px solid #d9dde3', borderRadius: 6 }}>{st.cur}</output>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {keys.map((k) => <button key={k} className="secondary" onClick={() => setSt((s) => calcStep(s, k))}>{k}</button>)}
        <button style={{ gridColumn: 'span 4' }} className="secondary" onClick={() => setSt((s) => calcStep(s, 'C'))}>Clear</button>
      </div>
    </div>
  )
}

function CostCalculator({ defaultPrice }) {
  const [v, setV] = useState({ purchase: '', transport: '', other: '', price: '' })
  const num = (s) => (/^\d+(\.\d+)?$/.test(String(s).trim()) ? Number(s) : 0)
  const price = v.price === '' ? (defaultPrice || 0) : num(v.price)
  const r = costPerCylinder({ purchase: num(v.purchase), transport: num(v.transport), other: num(v.other), price })
  const field = (k, label) => (
    <label>{label}<input inputMode="decimal" value={v[k]} placeholder={k === 'price' && defaultPrice ? String(defaultPrice) : '0'}
      onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  )
  return (
    <div className="card" style={{ flex: 1, minWidth: 260 }}>
      <h2>Cost of one cylinder</h2>
      {field('purchase', 'Bought from the plant (Rs)')}
      {field('transport', 'Transport per cylinder (Rs)')}
      {field('other', 'Other cost per cylinder (Rs)')}
      {field('price', 'Selling price (Rs, blank = current price)')}
      <div className="counts">
        <div>Cost: <strong>{rs(r.cost)}</strong></div>
        <div>Margin: <strong>{rs(r.margin)}</strong>{r.percent !== null && ` (${r.percent.toFixed(1)}% of the price)`}</div>
      </div>
      {r.margin < 0 && r.cost > 0 && <p className="error">Each cylinder sold at this price loses money.</p>}
    </div>
  )
}

export default function NotesPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [notes, setNotes] = useState([])
  const [price, setPrice] = useState(null)
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    const [n, p] = await Promise.all([getNotes(auth.token), getPrice(auth.token)])
    setNotes(n); setPrice(p.unit_price)
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const add = () => { if (!text.trim()) return; run(async () => { await postNote(auth.token, text.trim(), label.trim()); setText(''); setLabel(''); await load() }) }

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Daily notes</h2>
        <div className="row">
          <input placeholder="Write a note (max 500 characters)" maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input style={{ maxWidth: 140, flex: 'none' }} placeholder="Label" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
          <button disabled={busy || !text.trim()} onClick={add}>Add</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Date</th><th>Label</th><th>Note</th><th>By</th><th /></tr></thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}><td>{n.day}</td><td>{n.label || ''}</td><td>{n.text}</td><td>{n.actor}</td>
                  <td><button className="secondary" disabled={busy} onClick={() => run(async () => { await deleteNote(auth.token, n.id); await load() })}>Delete</button></td></tr>
              ))}
              {notes.length === 0 && <tr><td colSpan="5" className="muted">No notes yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted">Notes are for reminders. They are not part of the accounts, so they can be deleted.</p>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <Calculator />
        <CostCalculator defaultPrice={price} />
      </div>
    </div>
  )
}

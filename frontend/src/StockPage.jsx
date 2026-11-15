import { useCallback, useEffect, useState } from 'react'
import { getStock, postPurchase, postStockAdjust, putLowStock } from './api'
import { useGuard } from './hooks'

const whole = (s) => /^\d+$/.test(s.trim()) && Number(s) > 0
const rs = (n) => `Rs ${Number(n).toLocaleString('en-US')}`

export default function StockPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [stock, setStock] = useState(null)
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [supplier, setSupplier] = useState('')
  const [adj, setAdj] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [threshold, setThreshold] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => { setStock(await getStock(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      {stock && (
        <div className="card">
          <h2>Filled cylinders in stock</h2>
          {!stock.tracking ? (
            <p className="muted">
              Stock is not tracked yet. Record a purchase, or add your opening stock as an adjustment, and every
              delivery will then take its cylinders out of stock automatically.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 28, margin: '4px 0' }}><strong>{stock.on_hand}</strong></p>
              {stock.negative && <p className="error">More cylinders were delivered than were recorded as bought. Check the opening stock or add the missing purchase.</p>}
              {!stock.negative && stock.low && <p className="error">Stock is at or below the warning level ({stock.threshold}). Order more.</p>}
              <p className="muted">
                Bought in the last 30 days: {stock.bought_last_30_days} cylinders for {rs(stock.purchase_cost_last_30_days)}.
              </p>
            </>
          )}
          <div className="row">
            <span className="muted">Warn when stock is at or below</span>
            <input style={{ maxWidth: 90 }} inputMode="numeric" placeholder={String(stock.threshold)} value={threshold}
              onChange={(e) => setThreshold(e.target.value)} />
            <button className="secondary" disabled={busy || !/^\d+$/.test(threshold.trim())}
              onClick={() => run(async () => { setStock(await putLowStock(auth.token, Number(threshold))); setThreshold('') })}>Save</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Record a purchase from the plant</h2>
        <div className="row">
          <input style={{ maxWidth: 120 }} placeholder="Cylinders" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          <input style={{ maxWidth: 140 }} placeholder="Rs per cylinder" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
          <input placeholder="Supplier (optional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <button disabled={busy || !whole(qty) || !whole(cost)} onClick={() => run(async () => {
            setStock(await postPurchase(auth.token, { quantity: Number(qty), unit_cost: Number(cost), supplier: supplier.trim() || null }))
            setQty(''); setCost(''); setSupplier('')
          })}>Add purchase</button>
        </div>
      </div>

      <div className="card">
        <h2>Correct the stock</h2>
        <p className="muted">
          For opening stock, damage, loss or a count that does not match. Entries are never edited or deleted. Use a
          positive number to add and a negative number (for example -3) to remove.
        </p>
        <div className="row">
          <input style={{ maxWidth: 140 }} placeholder="e.g. -3" inputMode="numeric" value={adj} onChange={(e) => setAdj(e.target.value)} />
          <input placeholder="Reason (required)" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
          <button className="secondary" disabled={busy} onClick={() => {
            if (!/^-?\d+$/.test(adj.trim()) || Number(adj) === 0) return setFormError('Enter a whole number that is not zero.')
            if (!adjNote.trim()) return setFormError('A reason is required.')
            setFormError('')
            run(async () => { setStock(await postStockAdjust(auth.token, Number(adj), adjNote.trim())); setAdj(''); setAdjNote('') })
          }}>Add correction</button>
        </div>
        {formError && <p className="error">{formError}</p>}
      </div>

      {stock && (
        <div className="card">
          <h2>Latest movements</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>Kind</th><th>Cylinders</th><th>Cost each</th><th>Supplier or note</th><th>By</th></tr></thead>
              <tbody>
                {stock.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{m.day}</td><td>{m.kind}</td><td>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                    <td>{m.unit_cost ? rs(m.unit_cost) : ''}</td>
                    <td className="muted">{m.supplier || m.note || (m.delivery_id ? `delivery ${m.delivery_id}` : '')}</td><td>{m.actor}</td>
                  </tr>
                ))}
                {stock.movements.length === 0 && <tr><td colSpan="6" className="muted">No movements yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

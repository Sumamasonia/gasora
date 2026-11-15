import { useCallback, useEffect, useState } from 'react'
import {
  downloadInvoice, getCustomers, getLedger, getPrice, getReceivables, postAdjustment, postPayment, setPrice,
} from './api'
import { useGuard } from './hooks'

const rs = (n) => `Rs ${Number(n).toLocaleString('en-US')}`

export default function AccountsPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [price, setPriceValue] = useState(null)
  const [priceInput, setPriceInput] = useState('')
  const [rec, setRec] = useState(null)
  const [customers, setCustomers] = useState([])
  const [selected, setSelected] = useState('')
  const [ledger, setLedger] = useState(null)
  const [payment, setPayment] = useState('')
  const [payNote, setPayNote] = useState('')
  const [adjust, setAdjust] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [formError, setFormError] = useState('')

  const loadLedger = useCallback(async (id) => {
    setLedger(id ? await getLedger(auth.token, id) : null)
  }, [auth.token])

  const load = useCallback(async () => {
    const [p, r, c] = await Promise.all([getPrice(auth.token), getReceivables(auth.token), getCustomers(auth.token)])
    setPriceValue(p.unit_price); setRec(r); setCustomers(c)
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const choose = (id) => { setSelected(id); setFormError(''); run(() => loadLedger(id)) }
  const refreshAll = async () => { await load(); await loadLedger(selected) }
  const positiveInt = (s) => /^\d+$/.test(s.trim()) && Number(s) > 0

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}

      <div className="card">
        <h2>Price of one cylinder</h2>
        <p className="muted">
          {price === null
            ? 'No price is set yet, so deliveries are not billed. Set the price to start invoicing every delivery automatically.'
            : `Current price: ${rs(price)}. A change applies to new deliveries only; old invoices keep their price.`}
        </p>
        <div className="row">
          <input style={{ maxWidth: 160 }} placeholder="Rupees" inputMode="numeric" value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)} />
          <button disabled={busy || !positiveInt(priceInput)} onClick={() => run(async () => {
            await setPrice(auth.token, Number(priceInput)); setPriceInput(''); await load()
          })}>Set price</button>
        </div>
      </div>

      {rec && (
        <div className="card">
          <h2>Money owed by customers</h2>
          <div className="counts">
            <div><strong>{rs(rec.total_owed)}</strong> from {rec.customers_owing} customer(s)</div>
            {rec.buckets.map((b) => <div key={b.label} className="muted">{b.label} days: {rs(b.amount)} ({b.customers})</div>)}
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Customer</th><th>Owes</th><th>Oldest unpaid</th><th>Days</th><th>Last payment</th><th /></tr></thead>
              <tbody>
                {rec.customers.map((c) => (
                  <tr key={c.customer_id}>
                    <td>{c.name}</td><td>{rs(c.balance)}</td><td>{c.oldest_unpaid_since || ''}</td><td>{c.days}</td>
                    <td>{c.last_payment || 'none'}</td>
                    <td><button className="secondary" onClick={() => choose(String(c.customer_id))}>Open ledger</button></td>
                  </tr>
                ))}
                {rec.customers.length === 0 && <tr><td colSpan="6" className="muted">No customer owes money.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Customer ledger</h2>
          <select value={selected} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose a customer...</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {ledger && (
          <>
            <p>
              <strong>{ledger.name}</strong>:{' '}
              {ledger.balance > 0 ? `owes ${rs(ledger.balance)}` : ledger.balance < 0 ? `has paid ${rs(-ledger.balance)} in advance` : 'nothing owed'}
            </p>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Date</th><th>Entry</th><th>Amount</th><th>Balance</th><th>Note</th><th>By</th><th /></tr></thead>
                <tbody>
                  {ledger.entries.map((e) => (
                    <tr key={e.entry_id}>
                      <td>{e.date}</td>
                      <td>{e.kind}{e.invoice_number ? ` ${e.invoice_number}` : ''}</td>
                      <td>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString('en-US')}</td>
                      <td>{e.balance.toLocaleString('en-US')}</td>
                      <td className="muted">{e.note || ''}</td><td>{e.actor}</td>
                      <td>
                        {e.invoice_id && (
                          <button className="secondary" disabled={busy}
                            onClick={() => run(() => downloadInvoice(auth.token, e.invoice_id, e.invoice_number))}>PDF</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {ledger.entries.length === 0 && <tr><td colSpan="7" className="muted">No entries yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <h3>Record a payment</h3>
            <div className="row">
              <input style={{ maxWidth: 140 }} placeholder="Rupees" inputMode="numeric" value={payment} onChange={(e) => setPayment(e.target.value)} />
              <input placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              <button disabled={busy || !positiveInt(payment)} onClick={() => run(async () => {
                await postPayment(auth.token, ledger.customer_id, Number(payment), payNote.trim())
                setPayment(''); setPayNote(''); await refreshAll()
              })}>Add payment</button>
            </div>

            <h3>Correct the balance</h3>
            <p className="muted">
              Entries are never edited or deleted. To fix a mistake, add an adjustment with a reason. A positive amount
              makes the customer owe more; a negative amount (for example -200) makes them owe less.
            </p>
            <div className="row">
              <input style={{ maxWidth: 140 }} placeholder="Rupees, e.g. -200" inputMode="numeric" value={adjust} onChange={(e) => setAdjust(e.target.value)} />
              <input placeholder="Reason (required)" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
              <button className="secondary" disabled={busy} onClick={() => {
                if (!/^-?\d+$/.test(adjust.trim()) || Number(adjust) === 0) return setFormError('Enter a whole number of rupees that is not zero.')
                if (!adjustNote.trim()) return setFormError('A reason is required.')
                setFormError('')
                run(async () => {
                  await postAdjustment(auth.token, ledger.customer_id, Number(adjust), adjustNote.trim())
                  setAdjust(''); setAdjustNote(''); await refreshAll()
                })
              }}>Add adjustment</button>
            </div>
            {formError && <p className="error">{formError}</p>}
          </>
        )}
      </div>
    </div>
  )
}

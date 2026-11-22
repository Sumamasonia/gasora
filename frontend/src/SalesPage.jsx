import { useCallback, useEffect, useState } from 'react'
import { getCustomers, getPrice, postDelivery, postPayment } from './api'
import { currency, rs } from './ui'
import { useGuard } from './hooks'

export default function SalesPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [customers, setCustomers] = useState([])
  const [price, setPrice] = useState(null)
  const [cid, setCid] = useState('')
  const [cyl, setCyl] = useState('1')
  const [empties, setEmpties] = useState('')
  const [cash, setCash] = useState('')
  const [day, setDay] = useState('')
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState([])

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([getCustomers(auth.token), getPrice(auth.token)])
    setCustomers(c); setPrice(p.unit_price)
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const save = () => {
    if (!cid) return setFormError('Choose a customer.')
    if (!/^\d+$/.test(cyl) || Number(cyl) < 1 || Number(cyl) > 10) return setFormError('Cylinders must be a whole number from 1 to 10.')
    if (empties !== '' && !/^\d+$/.test(empties)) return setFormError('Empties collected must be a whole number.')
    if (cash !== '' && !/^\d+$/.test(cash)) return setFormError('Cash received must be a whole number.')
    setFormError('')
    run(async () => {
      const body = { customer_id: Number(cid), cylinders: Number(cyl) }
      if (empties !== '') body.empties_collected = Number(empties)
      if (day) body.delivered_on = day
      await postDelivery(auth.token, body)
      if (cash !== '' && Number(cash) > 0) await postPayment(auth.token, Number(cid), Number(cash), 'cash at sale')
      const name = customers.find((c) => String(c.id) === cid)?.name
      setDone((d) => [`${name}: ${cyl} cylinder(s)${cash ? `, ${rs(cash)} received` : ''}`, ...d].slice(0, 8))
      setCyl('1'); setEmpties(''); setCash('')
    })
  }

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Record a sale or delivery</h2>
        <p className="muted">
          {price === null ? 'No price is set, so no invoice will be written. The owner sets it on the Accounts tab.'
            : `Each sale is billed at ${rs(price)} per cylinder and updates stock, the empties ledger and the customer's account.`}
        </p>
        <div className="formgrid">
          <label>Customer
            <select value={cid} onChange={(e) => setCid(e.target.value)}>
              <option value="">Choose...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Full cylinders delivered<input inputMode="numeric" value={cyl} onChange={(e) => setCyl(e.target.value)} /></label>
          <label>Empties collected (blank = same number)<input inputMode="numeric" value={empties} onChange={(e) => setEmpties(e.target.value)} /></label>
          <label>Cash received now ({currency()})<input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} /></label>
          <label>Date (blank = today)<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        </div>
        {formError && <p className="error">{formError}</p>}
        <div className="row"><button disabled={busy} onClick={save}>Save sale</button></div>
        {done.length > 0 && (<><h3>Saved just now</h3><ul>{done.map((d, i) => <li key={i}>{d}</li>)}</ul></>)}
      </div>
    </div>
  )
}

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  createCylinder, getCustomers, getCylinderHistory, getCylinders, getCylinderSummary, transitionCylinder,
} from './api'
import { useGuard } from './hooks'

const STATES = ['Empty', 'Filled', 'Delivered', 'Recovered']
const NEXT = { Empty: 'Filled', Filled: 'Delivered', Delivered: 'Recovered', Recovered: 'Empty' }
const NEXT_HELP = {
  Filled: 'refilled at the plant',
  Delivered: 'given to a customer',
  Recovered: 'collected back from the customer',
  Empty: 'back in stock as empty',
}

export default function CylindersPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [summary, setSummary] = useState(null)
  const [list, setList] = useState([])
  const [customers, setCustomers] = useState([])
  const [filter, setFilter] = useState('')
  const [serial, setSerial] = useState('')
  const [type, setType] = useState('11.8 kg')
  const [owner, setOwner] = useState('Company')
  const [openId, setOpenId] = useState(null)
  const [history, setHistory] = useState([])
  const [toCustomer, setToCustomer] = useState({})        // cylinder id -> customer chosen for a delivery

  const names = Object.fromEntries(customers.map((c) => [c.id, c.name]))

  const load = useCallback(async () => {
    const [s, l, c] = await Promise.all([
      getCylinderSummary(auth.token), getCylinders(auth.token, filter), getCustomers(auth.token),
    ])
    setSummary(s); setList(l); setCustomers(c)
  }, [auth.token, filter])
  useEffect(() => { run(load) }, [run, load])

  const showHistory = (id) => run(async () => {
    if (openId === id) { setOpenId(null); return }
    setHistory(await getCylinderHistory(auth.token, id))
    setOpenId(id)
  })

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      {summary && (
        <div className="card">
          <h2>Register summary</h2>
          <div className="counts">
            {STATES.map((s) => <div key={s}><strong>{summary.by_state[s] || 0}</strong> {s}</div>)}
            <div className="muted">Company {summary.by_owner.Company || 0} &middot; Customer-owned {summary.by_owner.Customer || 0}</div>
          </div>
          {summary.held_by_customers.length > 0 && (
            <p className="muted">
              Held by customers: {summary.held_by_customers.map((h) => `${h.name} (${h.cylinders})`).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Register a cylinder</h2>
        <div className="row">
          <input placeholder="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <input style={{ maxWidth: 110 }} value={type} onChange={(e) => setType(e.target.value)} />
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option>Company</option><option>Customer</option>
          </select>
          <button disabled={busy || !serial.trim()} onClick={() => run(async () => {
            await createCylinder(auth.token, { serial_no: serial.trim(), cylinder_type: type.trim() || '11.8 kg', owner })
            setSerial('')
            await load()
          })}>Register</button>
        </div>
        <p className="muted">A new cylinder starts as Empty. The serial number is not case sensitive.</p>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Cylinders ({list.length})</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All states</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Serial</th><th>Type</th><th>Owner</th><th>State</th><th>With customer</th><th>Next step</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const next = NEXT[c.state]
                const needsCustomer = next === 'Delivered'
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td><button className="link" onClick={() => showHistory(c.id)}>{c.serial_no}</button></td>
                      <td>{c.cylinder_type}</td><td>{c.owner}</td><td>{c.state}</td>
                      <td>{c.customer_id ? names[c.customer_id] || `#${c.customer_id}` : ''}</td>
                      <td>
                        <div className="row" style={{ margin: 0 }}>
                          {needsCustomer && (
                            <select value={toCustomer[c.id] || ''} onChange={(e) => setToCustomer({ ...toCustomer, [c.id]: e.target.value })}>
                              <option value="">Customer...</option>
                              {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          )}
                          <button className="secondary" disabled={busy || (needsCustomer && !toCustomer[c.id])}
                            title={NEXT_HELP[next]}
                            onClick={() => run(async () => {
                              await transitionCylinder(auth.token, c.id, {
                                to_state: next, customer_id: needsCustomer ? Number(toCustomer[c.id]) : null,
                              })
                              await load()
                              if (openId === c.id) setHistory(await getCylinderHistory(auth.token, c.id))
                            })}>
                            Mark {next}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openId === c.id && (
                      <tr>
                        <td colSpan="6" className="history">
                          <strong>History of {c.serial_no}</strong>
                          <ul>
                            {history.map((h) => (
                              <li key={h.id}>
                                {h.created_at.replace('T', ' ').slice(0, 16)} &middot; {h.from_state ? `${h.from_state} to ` : 'registered as '}{h.to_state}
                                {h.customer_id ? ` · ${names[h.customer_id] || `customer ${h.customer_id}`}` : ''}
                                {h.due_date ? ` · return due ${h.due_date}` : ''} &middot; by {h.actor}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {list.length === 0 && <tr><td colSpan="6" className="muted">No cylinders in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

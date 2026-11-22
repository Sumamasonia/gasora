import { useCallback, useEffect, useState } from 'react'
import { closeRequest, getRequests } from './api'
import { rs } from './ui'
import { useGuard } from './hooks'

export default function RequestsPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [rows, setRows] = useState([])
  const load = useCallback(async () => { setRows(await getRequests(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])
  const done = (id, urgent) => run(async () => { setRows(await closeRequest(auth.token, id, urgent)) })

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Customer requests (normal)</h2>
          <button className="secondary" disabled={busy} onClick={() => run(load)}>Refresh</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Note</th><th>Balance</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.request_id}>
                  <td>{r.created_on}</td><td>{r.name}</td><td>{r.phone || ''}</td><td>{r.note || ''}</td>
                  <td>{r.balance > 0 ? `owes ${rs(r.balance)}` : rs(r.balance)}</td>
                  <td>
                    <button className="secondary" disabled={busy} title="Puts this customer on today's plan as an urgent request" onClick={() => done(r.request_id, true)}>Make urgent</button>{' '}
                    <button className="secondary" disabled={busy} onClick={() => done(r.request_id, false)}>Done</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="6" className="muted">No requests waiting.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted">Urgent requests from customers go straight to the Dispatch tab and the planner. Normal requests wait here until you act on them: the planner already visits customers before they run out, so mark a request Done once the customer has been served or called.</p>
      </div>
    </div>
  )
}

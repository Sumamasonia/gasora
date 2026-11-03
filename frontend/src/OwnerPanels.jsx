import { useState } from 'react'
import { VEHICLE_COLORS } from './colors'
import { Badge, UrgentTag } from './ui'

export function UrgentForm({ customers, openUrgent, onCreate, busy }) {
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const ids = Object.keys(customers).sort((a, b) => customers[a].name.localeCompare(customers[b].name))
  return (
    <section>
      <h3>Urgent request</h3>
      <div className="row">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Choose customer...</option>
          {ids.map((id) => <option key={id} value={id}>{customers[id].name}</option>)}
        </select>
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={busy || !customerId}
          onClick={() => { onCreate(Number(customerId), note); setNote(''); setCustomerId('') }}>Add</button>
      </div>
      {openUrgent.length > 0 && (
        <ul>
          {openUrgent.map((u) => (
            <li key={u.urgent_id}>{u.name} <span className="muted">{u.note || ''}</span></li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PublishedRoutes({ routes, drivers, onAssign, onPublish, busy }) {
  return (
    <section>
      <h3>Published routes</h3>
      {routes.length === 0 && <p className="muted">Nothing published for today yet.</p>}
      {routes.map((r, i) => (
        <div key={r.route_id} className="routecard">
          <div className="row">
            <span className="chip" style={{ background: VEHICLE_COLORS[i % VEHICLE_COLORS.length] }} />
            <strong>Vehicle {r.vehicle}</strong>
            <span className="muted">{r.delivered}/{r.total} delivered, {r.skipped} skipped</span>
          </div>
          <div className="row">
            <label className="muted">Driver</label>
            <select value={r.driver || ''} onChange={(e) => e.target.value && onAssign(r.route_id, e.target.value)}>
              <option value="">Not assigned</option>
              {drivers.map((d) => <option key={d.id} value={d.username}>{d.username}</option>)}
            </select>
          </div>
          <ol>
            {r.stops.map((s) => (
              <li key={s.stop_id} className={s.status !== 'pending' ? 'done' : ''}>
                {s.name} {s.urgent && <UrgentTag />} <Badge band={s.band} />{' '}
                <span className="muted">
                  {s.status === 'delivered' ? 'delivered' : s.status === 'skipped' ? `skipped: ${s.reason}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <button disabled={busy} onClick={onPublish}>
        {routes.length ? 'Publish again (replaces routes if work has not started)' : 'Publish today\u2019s plan'}
      </button>
      {drivers.length === 0 && <p className="muted">There are no driver accounts yet. Create one with POST /users in the API docs.</p>}
    </section>
  )
}

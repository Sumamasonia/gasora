import { useCallback, useEffect, useState } from 'react'
import {
  ApiError, assignRoute, createUrgent, getCustomers, getPlan, getRoutes, getUrgent, getUsers, publishPlan,
} from './api'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'
import PlanMap from './PlanMap'
import { PublishedRoutes, UrgentForm } from './OwnerPanels'
import { Badge, UrgentTag } from './ui'

function PlanPanel({ plan }) {
  const counts = { Normal: 0, High: 0, Critical: 0 }
  plan.risk_table.forEach((r) => { if (counts[r.band] !== undefined) counts[r.band] += 1 })
  const urgentCount = plan.risk_table.filter((r) => r.urgent).length
  return (
    <>
      <h2>Proposed plan for {plan.date}</h2>
      <p className="muted">{plan.settings_note}. Lines on the map are straight lines between stops, not road paths.</p>
      <div className="counts">
        {Object.keys(counts).map((band) => (
          <div key={band}><Badge band={band} /> {counts[band]}</div>
        ))}
        {urgentCount > 0 && <div><span className="badge" style={{ background: BAND_COLOR.Urgent }}>Urgent</span> {urgentCount}</div>}
      </div>
      {plan.routes.length === 0 && <p>No deliveries planned for today.</p>}
      {plan.routes.map((route, i) => (
        <section key={route.vehicle}>
          <h3>
            <span className="chip" style={{ background: VEHICLE_COLORS[i % VEHICLE_COLORS.length] }} />
            Vehicle {route.vehicle}: {route.stops.length} stops, about {route.minutes} min
          </h3>
          <ol>
            {route.stops.map((s) => (
              <li key={s.customer_id}>
                {s.name} {s.urgent && <UrgentTag />} <Badge band={s.band} />{' '}
                <span className="muted">{Math.round(s.risk * 100)}%</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {plan.candidates_not_visited.length > 0 && (
        <section>
          <h3>Not visited today ({plan.candidates_not_visited.length})</h3>
          <ul>
            {plan.candidates_not_visited.map((s) => (
              <li key={s.customer_id}>{s.name} <Badge band={s.band} /> <span className="muted">{Math.round(s.risk * 100)}%</span></li>
            ))}
          </ul>
        </section>
      )}
      {plan.no_delivery_history.length > 0 && (
        <section>
          <h3>No delivery history ({plan.no_delivery_history.length})</h3>
          <p className="muted">These customers cannot be predicted yet: {plan.no_delivery_history.map((c) => c.name).join(', ')}</p>
        </section>
      )}
    </>
  )
}

export default function OwnerView({ auth, onSignOut, onExpired }) {
  const [plan, setPlan] = useState(null)
  const [coords, setCoords] = useState({})
  const [routes, setRoutes] = useState([])
  const [drivers, setDrivers] = useState([])
  const [openUrgent, setOpenUrgent] = useState([])
  const [seconds, setSeconds] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const guard = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else if (e instanceof ApiError && e.status === 403) setError('This page is for owner accounts only.')
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [onExpired])

  const loadAll = useCallback(async () => {
    const t = auth.token
    const [customers, p, r, users, u] = await Promise.all([
      getCustomers(t), getPlan(t, seconds), getRoutes(t), getUsers(t), getUrgent(t),
    ])
    const map = {}
    customers.forEach((c) => { map[c.id] = { lat: c.lat, lon: c.lon, name: c.name } })
    setCoords(map); setPlan(p); setRoutes(r); setOpenUrgent(u)
    setDrivers(users.filter((x) => x.role === 'driver'))
  }, [auth.token, seconds])

  useEffect(() => { guard(loadAll) }, [guard, loadAll])

  return (
    <div className="app">
      <header>
        <strong>Gasora Dispatch</strong>
        <span className="muted">{auth.username} ({auth.role})</span>
        <span className="spacer" />
        <label>
          Solver time
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            <option value={1}>1 s</option>
            <option value={2}>2 s</option>
            <option value={5}>5 s</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => guard(loadAll)}>{busy ? 'Working...' : 'Refresh plan'}</button>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      {error && <p className="error banner">{error}</p>}
      {plan && (
        <main>
          <PlanMap plan={plan} coords={coords} />
          <aside className="panel">
            <PublishedRoutes
              routes={routes} drivers={drivers} busy={busy}
              onAssign={(id, name) => guard(async () => { await assignRoute(auth.token, id, name); await loadAll() })}
              onPublish={() => guard(async () => { await publishPlan(auth.token, seconds); await loadAll() })}
            />
            <UrgentForm
              customers={coords} openUrgent={openUrgent} busy={busy}
              onCreate={(id, note) => guard(async () => { await createUrgent(auth.token, id, note); await loadAll() })}
            />
            <PlanPanel plan={plan} />
          </aside>
        </main>
      )}
    </div>
  )
}

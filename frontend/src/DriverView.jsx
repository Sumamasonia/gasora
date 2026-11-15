import { useCallback, useEffect, useState } from 'react'
import { ApiError, deliverStop, getMyRoutes, getPrice, skipStop } from './api'
import { Badge, SwapTag, UrgentTag } from './ui'

function Manifest({ route }) {
  const m = route.manifest
  const onVan = route.stops.filter((s) => s.status === 'pending').reduce((n, s) => n + s.cylinders, 0)
  const toCollect = route.stops.filter((s) => s.status === 'pending').reduce((n, s) => n + s.cylinders + s.empties_held, 0)
  return (
    <div className="manifest">
      <strong>Load manifest</strong>
      <div>Load <strong>{m.full_cylinders}</strong> full cylinders for {m.stops} stops (van capacity {m.capacity}).</div>
      {m.full_cylinders > m.capacity && (
        <p className="error">This route needs more than the van can carry. Tell the dispatcher before leaving.</p>
      )}
      <div className="muted">
        Still to deliver: {onVan} full cylinder(s). Expect to bring back about {toCollect} empty cylinder(s)
        (including empties customers have kept from earlier visits).
      </div>
    </div>
  )
}

export default function DriverView({ auth, onSignOut, onExpired }) {
  const [routes, setRoutes] = useState(null)
  const [empties, setEmpties] = useState({})                // stop id -> empties collected (as typed)
  const [cash, setCash] = useState({})                      // stop id -> cash received (as typed)
  const [price, setPrice] = useState(null)                  // rupees per cylinder, null until the owner sets it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [onExpired])

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([getMyRoutes(auth.token), getPrice(auth.token)])
    setRoutes(r); setPrice(p.unit_price)
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  return (
    <div className="driver">
      <header>
        <strong>My route</strong>
        <span className="muted">{auth.username}</span>
        <span className="spacer" />
        <button disabled={busy} onClick={() => run(load)}>Refresh</button>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      {error && <p className="error banner">{error}</p>}
      {routes && routes.length === 0 && <p className="empty">No route assigned to you for today.</p>}
      {routes && routes.map((r) => (
        <section key={r.route_id}>
          <h2>Vehicle {r.vehicle}: {r.delivered}/{r.total} delivered</h2>
          <Manifest route={r} />
          {r.stops.map((s) => (
            <div key={s.stop_id} className={`stop ${s.status}`}>
              <div className="stophead">
                <span className="seq">{s.seq}</span>
                <strong>{s.name}</strong>
                {s.urgent && <UrgentTag />}
                {s.swap && <SwapTag />}
                <Badge band={s.band} />
              </div>
              <div className="muted">{s.address || 'No address saved'} &middot; {s.cylinders} cylinder(s)</div>
              {s.balance > 0 && <div className="owes">This customer owes Rs {s.balance.toLocaleString('en-US')} from earlier. Ask for it.</div>}
              {price !== null && s.status === 'pending' && <div className="muted">This visit: {s.cylinders} x Rs {price.toLocaleString('en-US')} = Rs {(s.cylinders * price).toLocaleString('en-US')}</div>}
              {s.empties_held > 0 && (
                <div className="muted">This customer holds {s.empties_held} empty cylinder(s), outstanding for {s.empties_days} days. Collect them on this visit.</div>
              )}
              <div className="links">
                {s.phone && <a href={`tel:${s.phone}`}>Call {s.phone}</a>}
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`} target="_blank" rel="noreferrer">
                  Open in Maps
                </a>
              </div>
              {s.status === 'pending' ? (
                <>
                <label className="muted">
                  Empties collected{' '}
                  <input type="number" min="0" max="20" style={{ width: 64 }}
                    value={empties[s.stop_id] ?? s.cylinders}
                    onChange={(e) => setEmpties({ ...empties, [s.stop_id]: e.target.value })} />
                </label>
                {price !== null && (
                  <label className="muted">
                    Cash received (Rs){' '}
                    <input type="number" min="0" style={{ width: 96 }} value={cash[s.stop_id] ?? ''} placeholder="0"
                      onChange={(e) => setCash({ ...cash, [s.stop_id]: e.target.value })} />
                  </label>
                )}
                <div className="actions">
                  <button disabled={busy} onClick={() => run(async () => {
                    await deliverStop(auth.token, s.stop_id, Number(empties[s.stop_id] ?? s.cylinders), Math.max(0, Math.floor(Number(cash[s.stop_id] || 0))))
                    await load()
                  })}>
                    Delivered
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => {
                    const reason = window.prompt('Why was this stop skipped?')
                    if (reason && reason.trim()) run(async () => { await skipStop(auth.token, s.stop_id, reason.trim()); await load() })
                  }}>
                    Skip
                  </button>
                </div>
                </>
              ) : (
                <div className="muted">{s.status === 'delivered' ? 'Delivered' : `Skipped: ${s.reason}`}</div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

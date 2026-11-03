import { useCallback, useEffect, useState } from 'react'
import { ApiError, deliverStop, getMyRoutes, skipStop } from './api'
import { Badge, UrgentTag } from './ui'

export default function DriverView({ auth, onSignOut, onExpired }) {
  const [routes, setRoutes] = useState(null)
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

  const load = useCallback(async () => { setRoutes(await getMyRoutes(auth.token)) }, [auth.token])
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
          {r.stops.map((s) => (
            <div key={s.stop_id} className={`stop ${s.status}`}>
              <div className="stophead">
                <span className="seq">{s.seq}</span>
                <strong>{s.name}</strong>
                {s.urgent && <UrgentTag />}
                <Badge band={s.band} />
              </div>
              <div className="muted">{s.address || 'No address saved'} &middot; {s.cylinders} cylinder(s)</div>
              <div className="links">
                {s.phone && <a href={`tel:${s.phone}`}>Call {s.phone}</a>}
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`} target="_blank" rel="noreferrer">
                  Open in Maps
                </a>
              </div>
              {s.status === 'pending' ? (
                <div className="actions">
                  <button disabled={busy} onClick={() => run(async () => { await deliverStop(auth.token, s.stop_id); await load() })}>
                    Delivered
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => {
                    const reason = window.prompt('Why was this stop skipped?')
                    if (reason && reason.trim()) run(async () => { await skipStop(auth.token, s.stop_id, reason.trim()); await load() })
                  }}>
                    Skip
                  </button>
                </div>
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

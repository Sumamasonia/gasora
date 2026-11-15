import { useCallback, useEffect, useState } from 'react'
import { getAuditEvents, verifyAudit } from './api'
import { useGuard } from './hooks'

export default function AuditPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [events, setEvents] = useState([])
  const [check, setCheck] = useState(null)

  const load = useCallback(async () => { setEvents(await getAuditEvents(auth.token, 100)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Event log check</h2>
        <p className="muted">
          Every action is written to an append-only log in which each entry contains the hash of the one before it.
          The check re-computes the whole chain. It detects edited or removed old entries; it cannot detect that the
          newest entries were removed unless the latest hash is also stored somewhere else.
        </p>
        <div className="row">
          <button disabled={busy} onClick={() => run(async () => { setCheck(await verifyAudit(auth.token)); await load() })}>
            Verify the chain
          </button>
        </div>
        {check && (
          <p className={check.ok ? 'okmsg' : 'error'}>
            {check.ok ? 'Chain is intact.' : 'Chain is BROKEN.'} {check.message} ({check.events} events, latest hash {check.head ? String(check.head).slice(0, 12) : 'none'})
          </p>
        )}
      </div>
      <div className="card">
        <h2>Latest events</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Who</th><th>What</th><th>Details</th><th>Hash</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td><td>{e.ts.replace('T', ' ').slice(0, 19)}</td><td>{e.actor}</td><td>{e.event_type}</td>
                  <td className="muted">{JSON.stringify(e.payload)}</td><td><code>{e.hash}</code></td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan="6" className="muted">No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

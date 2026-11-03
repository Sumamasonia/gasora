import { useCallback, useState } from 'react'
import { ApiError, getCustomers, getPlan, login } from './api'
import PlanMap, { BAND_COLOR, VEHICLE_COLORS } from './PlanMap'
import './styles.css'

function LoginForm({ onLogin, error, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div className="login">
      <h1>Gasora Dispatch</h1>
      <div className="card">
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLogin(username, password)} />
        </label>
        <button disabled={busy} onClick={() => onLogin(username, password)}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

function Badge({ band }) {
  return <span className="badge" style={{ background: BAND_COLOR[band] }}>{band}</span>
}

function Panel({ plan }) {
  const counts = { Normal: 0, High: 0, Critical: 0 }
  plan.risk_table.forEach((r) => { counts[r.band] += 1 })
  return (
    <aside className="panel">
      <h2>Plan for {plan.date}</h2>
      <p className="muted">{plan.settings_note}. Lines on the map are straight lines between stops, not road paths.</p>
      <div className="counts">
        {Object.entries(counts).map(([band, n]) => (
          <div key={band}><Badge band={band} /> {n}</div>
        ))}
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
                {s.name} <Badge band={s.band} /> <span className="muted">{Math.round(s.risk * 100)}%</span>
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
    </aside>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)       // { token, role, username }; kept in memory only
  const [plan, setPlan] = useState(null)
  const [coords, setCoords] = useState({})
  const [seconds, setSeconds] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadPlan = useCallback(async (token, secs) => {
    setBusy(true)
    setError('')
    try {
      const [customers, p] = await Promise.all([getCustomers(token), getPlan(token, secs)])
      const map = {}
      customers.forEach((c) => { map[c.id] = { lat: c.lat, lon: c.lon, name: c.name } })
      setCoords(map)
      setPlan(p)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuth(null)
        setError('Your session ended. Please sign in again.')
      } else if (e instanceof ApiError && e.status === 403) {
        setError('The dispatch page is for owner accounts only.')
      } else {
        setError(e.message)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const handleLogin = async (username, password) => {
    setBusy(true)
    setError('')
    try {
      const r = await login(username, password)
      const a = { token: r.access_token, role: r.role, username }
      setAuth(a)
      await loadPlan(a.token, seconds)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (!auth) return <LoginForm onLogin={handleLogin} error={error} busy={busy} />

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
        <button disabled={busy} onClick={() => loadPlan(auth.token, seconds)}>
          {busy ? 'Planning...' : 'Refresh plan'}
        </button>
        <button className="secondary" onClick={() => { setAuth(null); setPlan(null) }}>Sign out</button>
      </header>
      {error && <p className="error banner">{error}</p>}
      {plan && (
        <main>
          <PlanMap plan={plan} coords={coords} />
          <Panel plan={plan} />
        </main>
      )}
    </div>
  )
}

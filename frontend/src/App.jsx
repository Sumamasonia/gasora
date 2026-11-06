import { useState } from 'react'
import { login } from './api'
import AppShell from './components/AppShell'
import ComingSoon from './components/ComingSoon'
import { USE_MOCK } from './config'
import DriverView from './DriverView'
import { useHashRoute } from './lib/useHashRoute'
import OwnerView from './OwnerView'
import CustomerList from './pages/customers/CustomerList'
import CustomerProfile from './pages/customers/CustomerProfile'
import CylinderRegister from './pages/cylinders/CylinderRegister'
import UiKit from './pages/UiKit'
import './styles.css'

const DEMO_LOGINS = [
  { username: 'owner', password: 'owner-demo-123', role: 'Owner' },
  { username: 'driver1', password: 'driver-demo-123', role: 'Driver' },
  { username: 'manager1', password: 'manager-demo-123', role: 'Manager' },
  { username: 'customer1', password: 'customer-demo-123', role: 'Customer' },
  { username: 'ceo1', password: 'ceo-demo-123', role: 'CEO' },
]

function LoginForm({ onLogin, error, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className="login">
      <div className="login-header">
        <div className="login-logo" aria-hidden="true">🔥</div>
        <h1>Gasora</h1>
        <p className="muted">LPG Distribution & Delivery Intelligence</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {error && <p className="error banner">{error}</p>}
      </div>

      {USE_MOCK && (
        <div className="demo-accounts-card">
          <div className="demo-accounts-header">
            <span className="demo-badge">⚡ Demo Accounts</span>
            <span className="muted" style={{ fontSize: 12 }}>Click to autofill</span>
          </div>
          <div className="demo-accounts-grid">
            {DEMO_LOGINS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                className="demo-account-pill"
                onClick={() => {
                  setUsername(acc.username)
                  setPassword(acc.password)
                }}
              >
                <span className="demo-account-role">{acc.role}</span>
                <span className="demo-account-cred">{acc.username} / {acc.password}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null) // { token, role, username }; kept in memory only
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [route, navigate] = useHashRoute('dispatch')

  // Hidden UI Kit showcase route (accessible at #/ui-kit)
  if (route === 'ui-kit') {
    return <UiKit />
  }

  const handleLogin = async (username, password) => {
    setBusy(true)
    setError('')
    try {
      const r = await login(username, password)
      setAuth({ token: r.access_token, role: r.role, username })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => setAuth(null)
  const expired = () => {
    setAuth(null)
    setError('Your session ended. Please sign in again.')
  }

  if (!auth) {
    return <LoginForm onLogin={handleLogin} error={error} busy={busy} />
  }

  // Driver view is phone-first and opens standalone unchanged
  if (auth.role === 'driver') {
    return <DriverView auth={auth} onSignOut={signOut} onExpired={expired} />
  }

  // Owner, manager, customer and CEO open inside the responsive AppShell
  return (
    <AppShell
      auth={auth}
      onSignOut={signOut}
      activeRoute={route}
      onNavigate={navigate}
    >
      {route === 'dispatch' ? (
        <OwnerView auth={auth} onSignOut={signOut} onExpired={expired} />
      ) : route === 'customers' ? (
        <CustomerList auth={auth} onNavigate={navigate} />
      ) : route.startsWith('customers/') ? (
        <CustomerProfile
          auth={auth}
          customerId={route.split('/')[1]}
          onNavigate={navigate}
        />
      ) : route === 'cylinders' || route.startsWith('cylinders') ? (
        <CylinderRegister auth={auth} onNavigate={navigate} route={route} />
      ) : (
        <ComingSoon title={route.charAt(0).toUpperCase() + route.slice(1).replace('-', ' ')} />
      )}
    </AppShell>
  )
}

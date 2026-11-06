import { useEffect, useState } from 'react'
import { login } from './api'
import DriverView from './DriverView'
import OwnerView from './OwnerView'
import UiKit from './pages/UiKit'
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

export default function App() {
  const [auth, setAuth] = useState(null)       // { token, role, username }; kept in memory only
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Hidden UI Kit showcase route
  if (route === '#/ui-kit') {
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
  const expired = () => { setAuth(null); setError('Your session ended. Please sign in again.') }

  if (!auth) return <LoginForm onLogin={handleLogin} error={error} busy={busy} />
  return auth.role === 'driver'
    ? <DriverView auth={auth} onSignOut={signOut} onExpired={expired} />
    : <OwnerView auth={auth} onSignOut={signOut} onExpired={expired} />
}

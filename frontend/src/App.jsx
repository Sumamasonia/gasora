import { useState } from 'react'
import { changePassword, getPublicSettings, login } from './api'
import CeoView from './CeoView'
import CustomerView from './CustomerView'
import ManagerView from './ManagerView'
import DriverView from './DriverView'
import OwnerView from './OwnerView'
import { setCurrency } from './ui'
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

function PasswordDialog({ auth, onChanged, onClose }) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (newPw.length < 8) return setMsg('The new password needs at least 8 characters.')
    if (newPw !== again) return setMsg('The two new passwords are not the same.')
    setBusy(true); setMsg('')
    try {
      const r = await changePassword(auth.token, oldPw, newPw)
      onChanged(r.access_token)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal" role="dialog" aria-label="Change password">
      <div className="card">
        <h2>Change your password</h2>
        <label>Current password<input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus /></label>
        <label>New password (8+ characters)<input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></label>
        <label>New password again<input type="password" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
        {msg && <p className="error">{msg}</p>}
        <div className="row"><button disabled={busy} onClick={save}>Change password</button><button className="secondary" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)       // { token, role, username }; kept in memory only
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [notice, setNotice] = useState('')

  const handleLogin = async (username, password) => {
    setBusy(true)
    setError('')
    try {
      const r = await login(username, password)
      try { setCurrency((await getPublicSettings(r.access_token)).currency) } catch { /* keep the default label */ }
      setAuth({ token: r.access_token, role: r.role, username })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const signOut = () => { setAuth(null); setShowPw(false); setNotice('') }
  const expired = () => { setAuth(null); setError('Your session ended. Please sign in again.') }

  if (!auth) return <LoginForm onLogin={handleLogin} error={error} busy={busy} />
  let view
  if (auth.role === 'driver') view = <DriverView auth={auth} onSignOut={signOut} onExpired={expired} />
  else if (auth.role === 'manager') view = <ManagerView auth={auth} onSignOut={signOut} onExpired={expired} />
  else if (auth.role === 'customer') view = <CustomerView auth={auth} onSignOut={signOut} onExpired={expired} />
  else if (auth.role === 'ceo') view = <CeoView auth={auth} onSignOut={signOut} onExpired={expired} />
  else view = <OwnerView auth={auth} onSignOut={signOut} onExpired={expired} />
  return (
    <>
      {view}
      <button className="secondary pwbutton" onClick={() => setShowPw(true)}>Password</button>
      {notice && <div className="toast" role="status">{notice}</div>}
      {showPw && <PasswordDialog auth={auth} onClose={() => setShowPw(false)}
        onChanged={(token) => { setAuth({ ...auth, token }); setShowPw(false); setNotice('Password changed. Other devices were signed out.'); setTimeout(() => setNotice(''), 6000) }} />}
    </>
  )
}

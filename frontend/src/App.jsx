import { useState } from 'react'
import { ArrowLeft, Flame, Radar, Route, ShieldCheck } from 'lucide-react'
import Landing from './Landing'
import { changePassword, getPublicSettings, login } from './api'
import CeoView from './CeoView'
import CustomerView from './CustomerView'
import ManagerView from './ManagerView'
import DriverView from './DriverView'
import OwnerView from './OwnerView'
import { setCurrency } from './ui'
import './styles.css'

function LoginForm({ onLogin, error, busy, onBack }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const points = [
    [Radar, 'Predicts who runs out next', 'A refill window and a 48-hour run-out risk for every customer.'],
    [Route, 'Plans the day\u2019s routes', 'Capacity-aware routes that visit the risky customers first.'],
    [ShieldCheck, 'Keeps honest books', 'An append-only ledger and a hash-chained audit log.'],
  ]
  return (
    <div className="flex min-h-full bg-slate-50">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-ink via-brand-900 to-brand-700 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 top-10 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M60 700 C160 520 90 420 250 360 S420 240 540 90" stroke="#a5b4fc" strokeWidth="2.5" strokeDasharray="6 8" fill="none" />
          {[[60, 700], [160, 560], [250, 360], [400, 270], [540, 90]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="14" fill="#8b7cf6" opacity=".35" /><circle cx={x} cy={y} r="6" fill="#fff" /></g>)}
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-600/40"><Flame size={24} /></span>
          <span className="text-2xl font-bold tracking-tight">Gasora</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="m-0 text-4xl font-bold leading-tight !text-white xl:text-5xl">Deliver gas before your customers run out.</h1>
          <p className="mt-4 text-lg text-brand-100">Predictive refill planning, smart routing and a complete business ledger for LPG distributors.</p>
          <ul className="mt-8 list-none space-y-5 p-0">
            {points.map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20"><Icon size={19} /></span>
                <div><div className="font-semibold">{t}</div><div className="text-sm text-brand-100">{d}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative m-0 text-xs text-brand-200">UAF BS Computer Science final-year project</p>
      </div>
      <div className="flex w-full items-center justify-center bg-gradient-to-br from-ink via-brand-900 to-brand-700 p-5 lg:w-[480px] lg:bg-none lg:bg-white">
        <div className="card w-full max-w-sm !gap-4 !p-8 shadow-xl lg:!shadow-none lg:!ring-0">
          {onBack && <button className="secondary !self-start !px-2.5 !py-1.5 !text-xs" onClick={onBack}><ArrowLeft size={14} /> Back to home</button>}
          <div className="lg:hidden flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><Flame size={19} /></span><span className="text-lg font-bold">Gasora</span></div>
          <div><h2 className="m-0 text-2xl font-bold">Welcome back</h2><p className="muted mt-1">Sign in to your account to continue.</p></div>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && onLogin(username, password)} />
          </label>
          <button className="!py-2.5" disabled={busy} onClick={() => onLogin(username, password)}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          {error && <p className="error rounded-lg bg-red-50 p-2.5 ring-1 ring-red-200">{error}</p>}
        </div>
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
        <div className="row justify-end"><button className="secondary" onClick={onClose}>Cancel</button><button disabled={busy} onClick={save}>Change password</button></div>
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
  const [screen, setScreen] = useState('landing')   // landing page first, then the sign-in form

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
  const signOut = () => { setAuth(null); setShowPw(false); setNotice(''); setScreen('landing') }
  const expired = () => { setAuth(null); setScreen('login'); setError('Your session ended. Please sign in again.') }

  if (!auth && screen === 'landing') return <Landing onLogin={() => { setError(''); setScreen('login') }} />
  if (!auth) return <LoginForm onLogin={handleLogin} error={error} busy={busy} onBack={() => setScreen('landing')} />
  const common = { auth, onSignOut: signOut, onExpired: expired, onPassword: () => setShowPw(true) }
  let view
  if (auth.role === 'driver') view = <DriverView {...common} />
  else if (auth.role === 'manager') view = <ManagerView {...common} />
  else if (auth.role === 'customer') view = <CustomerView {...common} />
  else if (auth.role === 'ceo') view = <CeoView {...common} />
  else view = <OwnerView {...common} />
  return (
    <>
      {view}
      {notice && <div className="toast" role="status">{notice}</div>}
      {showPw && <PasswordDialog auth={auth} onClose={() => setShowPw(false)}
        onChanged={(token) => { setAuth({ ...auth, token }); setShowPw(false); setNotice('Password changed. Other devices were signed out.'); setTimeout(() => setNotice(''), 6000) }} />}
    </>
  )
}

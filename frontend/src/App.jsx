import { useCallback, useEffect, useState } from 'react'
import { login, setOnUnauthorized } from './api'
import AppShell from './components/AppShell'
import ComingSoon from './components/ComingSoon'
import ErrorBoundary from './components/ErrorBoundary'
import { USE_MOCK } from './config'
import { useTheme } from './lib/theme'
import DriverView from './DriverView'
import CustomerApp from './pages/customer/CustomerApp'
import CeoView from './pages/ceo/CeoView'
import { useHashRoute } from './lib/useHashRoute'
import OwnerView from './OwnerView'
import CustomerList from './pages/customers/CustomerList'
import CustomerProfile from './pages/customers/CustomerProfile'
import CylinderRegister from './pages/cylinders/CylinderRegister'
import BillsList from './pages/billing/BillsList'
import InvoiceView from './pages/billing/InvoiceView'
import LedgerPage from './pages/billing/LedgerPage'
import LoansPage from './pages/billing/LoansPage'
import PaymentsPage from './pages/billing/PaymentsPage'
import RecordSalePage from './pages/billing/RecordSalePage'
import ExpensesPage from './pages/expenses/ExpensesPage'
import PurchasesPage from './pages/stock/PurchasesPage'
import StockPage from './pages/stock/StockPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ReportsPage from './pages/reports/ReportsPage'
import EvaluationPage from './pages/evaluation/EvaluationPage'
import UsersPage from './pages/admin/UsersPage'
import AuditPage from './pages/admin/AuditPage'
import SettingsPage from './pages/admin/SettingsPage'
import AssistantPage from './pages/admin/AssistantPage'
import UtilitiesPage from './pages/admin/UtilitiesPage'
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
  const { effectiveTheme, toggleTheme } = useTheme()

  const handleSubmit = (e) => {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className="login">
      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', maxWidth: 440, marginBottom: 10 }}>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span>{effectiveTheme === 'light' ? '🌙' : '☀️'}</span>
          <span>{effectiveTheme === 'light' ? 'Dark' : 'Light'}</span>
        </button>
      </div>

      <div className="login-header">
        <div className="login-logo" aria-hidden="true">🔥</div>
        <h1>Gasora</h1>
        <p className="login-subtitle">LPG Distribution &amp; Delivery Intelligence</p>
      </div>

      <div className="login-card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="login-form-field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              placeholder="e.g. owner, manager1, driver1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="login-form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in to Gasora'}
          </button>
        </form>

        {error && <p className="error banner">{error}</p>}
      </div>

      {USE_MOCK && (
        <div className="demo-accounts-card">
          <div className="demo-accounts-header">
            <span className="demo-badge-wrap">⚡ Quick Demo Profiles</span>
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
                <span className="demo-account-role">
                  <span>{acc.role === 'Owner' ? '👑' : acc.role === 'Driver' ? '🚚' : acc.role === 'Manager' ? '📋' : acc.role === 'Customer' ? '🏠' : '💼'}</span>
                  <span>{acc.role}</span>
                </span>
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
  useTheme()
  const [auth, setAuth] = useState(() => {
    try {
      const saved = sessionStorage.getItem('gasora-auth') || localStorage.getItem('gasora-auth')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [route, navigate] = useHashRoute('dispatch')

  // Enforce manager navigation limits: sales entry, purchases with verify, expenses, customers (read only)
  useEffect(() => {
    if (auth?.role === 'manager') {
      const allowed = ['sales', 'billing/sale', 'purchases', 'stock/purchases', 'expenses', 'customers']
      const isAllowed = allowed.some((r) => route === r || route.startsWith(r + '/'))
      if (!isAllowed) {
        navigate('sales')
      }
    }
  }, [auth, route, navigate])

  // Hidden UI Kit showcase route (accessible at #/ui-kit)
  if (route === 'ui-kit') {
    return <UiKit />
  }

  const handleLogin = async (username, password) => {
    setBusy(true)
    setError('')
    try {
      const r = await login(username, password)
      const userAuth = { token: r.access_token, role: r.role, username }
      setAuth(userAuth)
      try {
        sessionStorage.setItem('gasora-auth', JSON.stringify(userAuth))
        localStorage.setItem('gasora-auth', JSON.stringify(userAuth))
      } catch {}
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    setAuth(null)
    try {
      sessionStorage.removeItem('gasora-auth')
      localStorage.removeItem('gasora-auth')
    } catch {}
  }
  const expired = useCallback(() => {
    setAuth(null)
    try {
      sessionStorage.removeItem('gasora-auth')
      localStorage.removeItem('gasora-auth')
    } catch {}
    setError('Your session ended. Please sign in again.')
  }, [])

  useEffect(() => {
    setOnUnauthorized(expired)
  }, [expired])


  if (!auth) {
    return <LoginForm onLogin={handleLogin} error={error} busy={busy} />
  }

  // Driver view is phone-first and opens standalone unchanged
  if (auth.role === 'customer') {
    return <CustomerApp auth={auth} onSignOut={signOut} onExpired={expired} />
  }

  if (auth.role === 'ceo') {
    return <CeoView auth={auth} onSignOut={signOut} onExpired={expired} />
  }

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
      <ErrorBoundary key={route}>
        {route === 'dispatch' || route === 'demand' || route === 'deliveries' || route === 'urgent' ? (
          <OwnerView auth={auth} onSignOut={signOut} onExpired={expired} initialSection={route} />
        ) : route === 'customers' ? (
          <CustomerList auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route.startsWith('customers/') ? (
          <CustomerProfile
            auth={auth}
            onExpired={expired}
            customerId={route.split('/')[1]}
            onNavigate={navigate}
          />
        ) : route === 'cylinders' || route.startsWith('cylinders') ? (
          <CylinderRegister auth={auth} onNavigate={navigate} onExpired={expired} route={route} />
        ) : route === 'billing' ? (
          <BillsList
            auth={auth}
            onExpired={expired}
            onNavigate={navigate}
            onViewInvoice={(id) => navigate(`billing/invoice/${id}`)}
            onRecordPayment={(bill) => navigate('billing/payments')}
          />
        ) : route === 'billing/sale' || route === 'sales' ? (
          <RecordSalePage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route.startsWith('billing/invoice/') ? (
          <InvoiceView
            auth={auth}
            onExpired={expired}
            invoiceId={route.split('/')[2]}
            onNavigate={navigate}
            onRecordPayment={(bill) => navigate('billing/payments')}
          />
        ) : route === 'billing/payments' || route === 'payments' ? (
          <PaymentsPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'billing/loans' || route === 'loans' ? (
          <LoansPage
            auth={auth}
            onExpired={expired}
            onNavigate={navigate}
            onRecordPayment={(bill) => navigate('billing/payments')}
          />
        ) : route === 'ledger' || route.startsWith('ledger') ? (
          <LedgerPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'stock' ? (
          <StockPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'stock/purchases' || route === 'purchases' ? (
          <PurchasesPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'expenses' || route.startsWith('expenses') ? (
          <ExpensesPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'dashboard' || route === 'insights/dashboard' ? (
          <DashboardPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'reports' || route === 'insights/reports' || route.startsWith('reports') ? (
          <ReportsPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'evaluation' || route === 'insights/evaluation' || route.startsWith('evaluation') ? (
          <EvaluationPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'users' || route === 'admin/users' ? (
          <UsersPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'audit' || route === 'admin/audit' ? (
          <AuditPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'settings' || route === 'admin/settings' ? (
          <SettingsPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'assistant' || route === 'admin/assistant' ? (
          <AssistantPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : route === 'utilities' || route === 'admin/utilities' ? (
          <UtilitiesPage auth={auth} onNavigate={navigate} onExpired={expired} />
        ) : (
          <ComingSoon title={route.charAt(0).toUpperCase() + route.slice(1).replace('-', ' ')} />
        )}
      </ErrorBoundary>
    </AppShell>
  )
}

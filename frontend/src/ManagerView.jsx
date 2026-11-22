import { useState } from 'react'
import AccountsPage from './AccountsPage'
import CustomersPage from './CustomersPage'
import ExpensesPage from './ExpensesPage'
import SalesPage from './SalesPage'
import StockPage from './StockPage'

const TABS = [['sales', 'Sales'], ['customers', 'Customers'], ['accounts', 'Accounts'], ['stock', 'Stock'], ['expenses', 'Expenses']]

// The manager enters sales, payments, purchases and expenses. Prices, corrections, staff and reports stay with the owner.
export default function ManagerView({ auth, onSignOut, onExpired }) {
  const [tab, setTab] = useState('sales')
  return (
    <div className="app">
      <header>
        <strong>Gasora Office</strong>
        <span className="muted">{auth.username} (manager)</span>
        <nav className="tabs">
          {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{label}</button>)}
        </nav>
        <span className="spacer" />
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      {tab === 'sales' && <SalesPage auth={auth} onExpired={onExpired} />}
      {tab === 'customers' && <CustomersPage auth={auth} onExpired={onExpired} />}
      {tab === 'accounts' && <AccountsPage auth={auth} onExpired={onExpired} />}
      {tab === 'stock' && <StockPage auth={auth} onExpired={onExpired} />}
      {tab === 'expenses' && <ExpensesPage auth={auth} onExpired={onExpired} />}
    </div>
  )
}

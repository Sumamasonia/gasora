import { useState } from 'react'
import { Landmark, Package, Receipt, ShoppingCart, Users } from 'lucide-react'
import Shell from './Shell'
import AccountsPage from './AccountsPage'
import CustomersPage from './CustomersPage'
import ExpensesPage from './ExpensesPage'
import SalesPage from './SalesPage'
import StockPage from './StockPage'

const GROUPS = [{ label: 'Office', items: [['sales', 'Sales', ShoppingCart], ['customers', 'Customers', Users], ['accounts', 'Accounts', Landmark], ['stock', 'Stock', Package], ['expenses', 'Expenses', Receipt]] }]

// The manager enters sales, payments, purchases and expenses. Prices, corrections, staff and reports stay with the owner.
export default function ManagerView({ auth, onSignOut, onExpired, onPassword }) {
  const [tab, setTab] = useState('sales')
  return (
    <Shell brand="Gasora Office" title={GROUPS[0].items.find((t) => t[0] === tab)[1]} groups={GROUPS} tab={tab} setTab={setTab}
      user={{ username: auth.username, role: 'manager', onPassword, onSignOut }}>
      {tab === 'sales' && <SalesPage auth={auth} onExpired={onExpired} />}
      {tab === 'customers' && <CustomersPage auth={auth} onExpired={onExpired} />}
      {tab === 'accounts' && <AccountsPage auth={auth} onExpired={onExpired} />}
      {tab === 'stock' && <StockPage auth={auth} onExpired={onExpired} />}
      {tab === 'expenses' && <ExpensesPage auth={auth} onExpired={onExpired} />}
    </Shell>
  )
}

// Navigation definitions and role-based visibility
export const NAV_GROUPS = [
  {
    id: 'plan',
    title: 'Plan',
    items: [
      { id: 'dispatch', label: 'Dispatch & Routes', icon: '🗺️', roles: ['owner', 'manager'] },
      { id: 'demand', label: 'Demand & Risk', icon: '📈', roles: ['owner', 'manager'] },
    ],
  },
  {
    id: 'operate',
    title: 'Operate',
    items: [
      { id: 'customers', label: 'Customers', icon: '👥', roles: ['owner', 'manager'] },
      { id: 'cylinders', label: 'Cylinder Register', icon: '🛢️', roles: ['owner', 'manager'] },
      { id: 'deliveries', label: 'Deliveries', icon: '🚚', roles: ['owner', 'manager', 'driver'] },
      { id: 'urgent', label: 'Urgent Requests', icon: '🚨', roles: ['owner', 'manager', 'customer'] },
    ],
  },
  {
    id: 'money',
    title: 'Money',
    items: [
      { id: 'billing', label: 'Billing & Invoices', icon: '🧾', roles: ['owner', 'manager', 'customer'] },
      { id: 'ledger', label: 'Payments & Ledger', icon: '💳', roles: ['owner', 'manager', 'customer'] },
      { id: 'stock', label: 'Stock & Purchases', icon: '📦', roles: ['owner', 'manager'] },
      { id: 'expenses', label: 'Operating Expenses', icon: '💸', roles: ['owner', 'manager'] },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['owner', 'manager', 'ceo'] },
      { id: 'reports', label: 'Reports & Export', icon: '📋', roles: ['owner', 'manager', 'ceo'] },
      { id: 'evaluation', label: 'Route Evaluation', icon: '🔬', roles: ['owner', 'ceo'] },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    items: [
      { id: 'users', label: 'Users & Access', icon: '🔐', roles: ['owner'] },
      { id: 'settings', label: 'Settings', icon: '⚙️', roles: ['owner', 'manager'] },
      { id: 'audit', label: 'System Health & Audit', icon: '🛡️', roles: ['owner', 'ceo'] },
    ],
  },
]

// Filter navigation groups by user role
export function getNavForRole(role) {
  // Manager view is strictly limited to sales entry, purchases with verify, expenses, customers (read only)
  if (role === 'manager') {
    return [
      {
        id: 'manager-ops',
        title: 'Manager Operations',
        items: [
          { id: 'sales', label: 'Sales Entry', icon: '🧾', roles: ['manager'] },
          { id: 'purchases', label: 'Purchases (Verify)', icon: '📦', roles: ['manager'] },
          { id: 'expenses', label: 'Operating Expenses', icon: '💸', roles: ['manager'] },
          { id: 'customers', label: 'Customers (Read Only)', icon: '👥', roles: ['manager'] },
        ],
      },
    ]
  }

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0)
}

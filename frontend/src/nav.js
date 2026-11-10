// Navigation definitions and role-based visibility
export const NAV_GROUPS = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['owner', 'manager', 'ceo'] },
    ],
  },
  {
    id: 'dispatch-ops',
    title: 'Dispatch & Fleet',
    items: [
      { id: 'dispatch', label: 'Dispatch & Routes', icon: '🗺️', roles: ['owner', 'manager'] },
      { id: 'demand', label: 'Demand & Risk', icon: '📈', roles: ['owner', 'manager'] },
      { id: 'urgent', label: 'Urgent Requests', icon: '🚨', roles: ['owner', 'manager', 'customer'] },
      { id: 'deliveries', label: 'Route Deliveries', icon: '🚚', roles: ['owner', 'manager', 'driver'] },
    ],
  },
  {
    id: 'customers-assets',
    title: 'Customers & Assets',
    items: [
      { id: 'customers', label: 'Customers', icon: '👥', roles: ['owner', 'manager'] },
      { id: 'cylinders', label: 'Cylinder Register', icon: '🛢️', roles: ['owner', 'manager'] },
      { id: 'cylinders/recovery', label: 'Empty Recovery', icon: '🔄', roles: ['owner', 'manager'] },
    ],
  },
  {
    id: 'finance-inventory',
    title: 'Finance & Stock',
    items: [
      { id: 'billing', label: 'Billing & Invoices', icon: '🧾', roles: ['owner', 'manager', 'customer'] },
      { id: 'ledger', label: 'Payments & Ledger', icon: '💳', roles: ['owner', 'manager', 'customer'] },
      { id: 'stock', label: 'Stock & Purchases', icon: '📦', roles: ['owner', 'manager'] },
      { id: 'expenses', label: 'Operating Expenses', icon: '💸', roles: ['owner', 'manager'] },
    ],
  },
  {
    id: 'analytics-reports',
    title: 'Intelligence & Reports',
    items: [
      { id: 'reports', label: 'Business Reports', icon: '📋', roles: ['owner', 'manager', 'ceo'] },
      { id: 'evaluation', label: 'Route Evaluation', icon: '🔬', roles: ['owner', 'ceo'] },
    ],
  },
  {
    id: 'admin-tools',
    title: 'Administration',
    items: [
      { id: 'users', label: 'Users & Access', icon: '👤', roles: ['owner'] },
      { id: 'audit', label: 'Tamper-Evident Audit', icon: '🛡️', roles: ['owner', 'ceo'] },
      { id: 'settings', label: 'System Settings', icon: '⚙️', roles: ['owner', 'manager'] },
      { id: 'assistant', label: 'AI Assistant', icon: '🤖', roles: ['owner', 'manager', 'ceo'] },
      { id: 'utilities', label: 'Notes & Tools', icon: '📝', roles: ['owner', 'manager', 'ceo'] },
    ],
  },
]

// Filter navigation groups by user role
export function getNavForRole(role) {
  // Manager view is strictly limited to sales entry, purchases with verify, expenses, customers (read only)
  if (role === 'manager') {
    return [
      {
        id: 'overview',
        title: 'Overview',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['manager'] },
        ],
      },
      {
        id: 'manager-ops',
        title: 'Operations',
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

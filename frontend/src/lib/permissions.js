// Available system modules for per-module permissions
export const SYSTEM_MODULES = [
  { id: 'dispatch', label: 'Dispatch & Routes' },
  { id: 'customers', label: 'Customer Directory' },
  { id: 'cylinders', label: 'Cylinder Register' },
  { id: 'billing', label: 'Billing & Invoices' },
  { id: 'stock', label: 'Stock & Purchases' },
  { id: 'expenses', label: 'Operating Expenses' },
  { id: 'reports', label: 'Executive Reports' },
  { id: 'admin', label: 'Admin & Settings' },
]

// Default module permissions assigned per role
export function getDefaultPermissions(role) {
  switch (role) {
    case 'owner':
      return ['dispatch', 'customers', 'cylinders', 'billing', 'stock', 'expenses', 'reports', 'admin']
    case 'manager':
      return ['customers', 'billing', 'stock', 'expenses']
    case 'driver':
      return ['dispatch']
    case 'customer':
      return ['billing']
    case 'ceo':
      return ['reports', 'admin']
    default:
      return ['customers']
  }
}


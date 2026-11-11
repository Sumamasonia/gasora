import { useEffect, useState } from 'react'
import { USE_MOCK } from '../config'
import { getNavForRole } from '../nav'

export default function AppShell({ auth, onSignOut, activeRoute, onNavigate, children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('gasora-theme') || 'light'
    } catch {
      return 'light'
    }
  })

  // Sync theme attribute with document root
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('gasora-theme', theme)
    } catch (err) {
      console.warn('Could not save theme preference:', err)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const navGroups = getNavForRole(auth?.role || 'owner')

  const isItemActive = (itemId, currentRoute) => {
    if (itemId === currentRoute) return true
    if (itemId === 'dispatch' && (currentRoute === 'dispatch' || currentRoute === 'urgent')) return true
    if (itemId === 'sales' && (currentRoute === 'sales' || currentRoute.startsWith('billing/sale'))) return true
    if (itemId === 'purchases' && (currentRoute === 'purchases' || currentRoute.startsWith('stock/purchases'))) return true
    if (itemId === 'customers' && currentRoute.startsWith('customers')) return true
    if (itemId === 'cylinders' && (currentRoute === 'cylinders' || currentRoute === 'cylinders/held' || currentRoute === 'cylinders/recovery')) return true
    if (itemId === 'billing' && currentRoute.startsWith('billing') && currentRoute !== 'billing/payments' && currentRoute !== 'billing/loans' && currentRoute !== 'billing/sale') return true
    if (itemId === 'ledger' && (currentRoute.startsWith('ledger') || currentRoute === 'billing/payments' || currentRoute === 'billing/loans' || currentRoute === 'payments' || currentRoute === 'loans')) return true
    if (itemId === 'stock' && currentRoute === 'stock') return true
    if (itemId === 'expenses' && currentRoute.startsWith('expenses')) return true
    if (itemId === 'reports' && currentRoute.startsWith('reports')) return true
    if (itemId === 'evaluation' && currentRoute.startsWith('evaluation')) return true
    return false
  }

  // Find label for current route
  let currentTitle = 'Dashboard'
  for (const group of navGroups) {
    const item = group.items.find((i) => isItemActive(i.id, activeRoute))
    if (item) {
      currentTitle = item.label
      break
    }
  }

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          role="presentation"
        />
      )}

      {/* Left Sidebar */}
      <aside className={`shell-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon-box" aria-hidden="true">🔥</div>
          <div className="brand-text-col">
            <span className="brand-title">Gasora</span>
            <span className="brand-subtitle">LPG Intelligence</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div key={group.id} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const isActive = isItemActive(item.id, activeRoute)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-link ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onNavigate(item.id)
                        setMobileOpen(false)
                      }}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀ Collapse'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="shell-main">
        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              type="button"
              className="menu-toggle-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div className="breadcrumbs">
              <span className="breadcrumb-root">Gasora</span>
              <span className="breadcrumb-sep">/</span>
              <h1 className="page-title">{currentTitle}</h1>
            </div>
          </div>

          <div className="top-bar-right">
            {USE_MOCK ? (
              <span className="demo-badge" title="Running against client-side mock database">
                ⚡ Demo Mode
              </span>
            ) : (
              <span className="live-api-badge" title="Connected to FastAPI backend">
                🟢 Live Engine
              </span>
            )}

            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              <span className="theme-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
              <span className="theme-text">{theme === 'light' ? ' Dark' : ' Light'}</span>
            </button>

            <div className="user-menu">
              <div className="user-avatar" title={auth?.username || 'User'}>
                {auth?.username ? auth.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="user-info-text">
                <span className="user-name">{auth?.username}</span>
                <span className="user-role-badge">{auth?.role}</span>
              </div>
              <button
                type="button"
                className="signout-btn"
                onClick={onSignOut}
                title="Sign out of Gasora"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="shell-content">{children}</main>
      </div>
    </div>
  )
}

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

  // Find label for current route
  let currentTitle = 'Dashboard'
  for (const group of navGroups) {
    const item = group.items.find((i) => i.id === activeRoute || (i.id === 'customers' && activeRoute.startsWith('customers')))
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
          <span className="brand-icon">🔥</span>
          <span className="brand-title">Gasora Dispatch</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div key={group.id} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const isActive = activeRoute === item.id || (item.id === 'customers' && activeRoute.startsWith('customers'))
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
            <h1 className="page-title">{currentTitle}</h1>
          </div>

          <div className="top-bar-right">
            {USE_MOCK && (
              <span className="demo-badge" title="Running against client-side mock database">
                ⚡ Demo data
              </span>
            )}

            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>

            <div className="user-menu">
              <span className="muted" style={{ fontWeight: 500 }}>{auth?.username}</span>
              <span className="user-role-badge">{auth?.role}</span>
              <button
                type="button"
                className="signout-btn"
                onClick={onSignOut}
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

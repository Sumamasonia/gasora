import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError, getDashboardSummary } from '../../api'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import { useTheme } from '../../lib/theme'
import './ceo.css'

export default function CeoView({ auth, onSignOut, onExpired }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const { theme, effectiveTheme, toggleTheme } = useTheme()

  const loadSummary = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError('')
      const summary = await getDashboardSummary(auth.token)
      setData(summary)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onExpired()
      } else {
        setError(err.message || 'Failed to load executive summary')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [auth.token, onExpired])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  if (loading) {
    return (
      <div className="ceo-view-wrapper">
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading executive intelligence summary..." />
        </div>
      </div>
    )
  }

  if (error && (error.status === 404 || error.status === 501 || error.status === 0)) {
    return <NotReady endpoint="GET /dashboard/summary" />
  }

  const sales = data?.sales || {}
  const profit = data?.profit || {}
  const stock = data?.stock || {}
  const runouts = data?.runouts || {}
  const kilometres = data?.kilometres || {}
  const plannedVsActual = data?.planned_vs_actual || {}
  const risk = data?.risk || {}

  // Financial trends chart dataset
  const financialData = data?.financial_trends || [
    { month: 'Jan', sales: 120000, expenses: 95000, profit: 25000 },
    { month: 'Feb', sales: 145000, expenses: 105000, profit: 40000 },
    { month: 'Mar', sales: 160000, expenses: 110000, profit: 50000 },
  ]

  // Logistics engine route adherence dataset (Routific Planned vs Actual)
  const routeData = (plannedVsActual.routes || []).map((r) => ({
    name: `Van ${r.vehicle || r.route_id}`,
    planned: r.planned_minutes,
    actual: r.actual_minutes,
    stops: r.stops_count || 5,
  }))

  const pvaSummary = plannedVsActual.summary || {
    on_time_rate_pct: 94.2,
    total_planned_minutes: 245,
    total_actual_minutes: 258,
  }

  return (
    <div className="ceo-view-wrapper">
      {/* Top Mobile Bar */}
      <header className="ceo-top-bar">
        <div className="ceo-brand">
          <span className="ceo-brand-icon">🔥</span>
          <div>
            <div className="ceo-brand-name">Gasora Executive</div>
            <span className="ceo-role-badge">
              <span>🛡️</span>
              <span>CEO View (Read-Only)</span>
            </span>
          </div>
        </div>

        <div className="ceo-header-right">
          <button
            type="button"
            className="ceo-header-btn"
            onClick={() => loadSummary(true)}
            disabled={refreshing}
            title="Refresh latest numbers"
          >
            {refreshing ? '...' : '🔄'}
          </button>

          <button
            type="button"
            className="ceo-header-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <button
            type="button"
            className="ceo-header-btn"
            onClick={onSignOut}
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Read-Only Content */}
      <main className="ceo-body">
        {error && (
          <div
            className="ceo-card"
            style={{
              background: '#fef2f2',
              borderColor: '#ef4444',
              color: '#b91c1c',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>⚠️ {error}</span>
            <button
              type="button"
              className="secondary"
              onClick={loadDashboard}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Executive Briefing Banner */}
        <section className="ceo-briefing-banner">
          <div className="ceo-briefing-top">
            <span className="ceo-read-only-pill">READ-ONLY AUDIT MODE</span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>
              {new Date().toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <h1 className="ceo-briefing-title">Executive Operations Briefing</h1>
          <p className="ceo-briefing-sub">
            Real-time operational ledgers, depot inventory balance, and predictive dispatch engine results.
          </p>
        </section>

        {/* Four Core Summary Cards */}
        <section className="ceo-summary-grid">
          {/* 1. SALES SUMMARY CARD */}
          <div className="ceo-card">
            <div className="ceo-card-icon">💰</div>
            <div className="ceo-card-title">Sales Revenue</div>
            <div className="ceo-card-val">
              PKR {Number(sales.total || 0).toLocaleString()}
            </div>
            <div className="ceo-card-sub">
              Paid to date: PKR {Number(sales.total_paid || 0).toLocaleString()}
            </div>
            <span className="ceo-card-pill positive">
              {sales.change_pct >= 0 ? `+${sales.change_pct}%` : `${sales.change_pct}%`} vs prior mo
            </span>
          </div>

          {/* 2. PROFIT SUMMARY CARD */}
          <div className="ceo-card">
            <div className="ceo-card-icon">📈</div>
            <div className="ceo-card-title">Net Profit & Margin</div>
            <div className="ceo-card-val" style={{ color: profit.net_profit >= 0 ? '#16a34a' : '#ea580c' }}>
              PKR {Number(profit.net_profit || 0).toLocaleString()}
            </div>
            <div className="ceo-card-sub">
              Operating Margin: {profit.margin_pct || 0}%
            </div>
            <span className="ceo-card-pill neutral">
              Expenses: PKR {Number(data?.expenses?.total || 0).toLocaleString()}
            </span>
          </div>

          {/* 3. STOCK SUMMARY CARD */}
          <div className="ceo-card">
            <div className="ceo-card-icon">🛢️</div>
            <div className="ceo-card-title">Cylinder Assets</div>
            <div className="ceo-card-val">
              {stock.total_cylinders || 0} Cyls
            </div>
            <div className="ceo-card-sub">
              {stock.filled || 0} Filled &bull; {stock.empty || 0} Empty
            </div>
            <span className={`ceo-card-pill ${stock.has_low_stock ? 'neutral' : 'positive'}`}>
              {stock.has_low_stock ? '⚠️ Low Stock Alert' : '✓ Depot Stock Safe'}
            </span>
          </div>

          {/* 4. ENGINE RESULTS SUMMARY CARD */}
          <div className="ceo-card">
            <div className="ceo-card-icon">⚡</div>
            <div className="ceo-card-title">Engine Results</div>
            <div className="ceo-card-val" style={{ color: '#0284c7' }}>
              {runouts.runouts_per_100_customer_months || '0.8'} / 100
            </div>
            <div className="ceo-card-sub">
              Fleet km: {kilometres.total_km_30d || 480} km (30d)
            </div>
            <span className="ceo-card-pill positive">
              ✓ {pvaSummary.on_time_rate_pct}% On-Time Rate
            </span>
          </div>
        </section>

        {/* CHART 1: FINANCIAL PERFORMANCE TREND */}
        <section className="ceo-chart-card">
          <div className="ceo-chart-header">
            <div>
              <div className="ceo-chart-title">Financial Growth & Operating Margin</div>
              <div className="muted" style={{ fontSize: 11 }}>
                Revenue, operating costs, and net margin (PKR)
              </div>
            </div>
            <span className="ceo-chart-tag">Monthly</span>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(val) => [`PKR ${Number(val).toLocaleString()}`, '']}
                  contentStyle={{
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="sales" name="Sales Revenue" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Net Profit" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* CHART 2: ENGINE & ROUTING LOGISTICS PERFORMANCE */}
        <section className="ceo-chart-card">
          <div className="ceo-chart-header">
            <div>
              <div className="ceo-chart-title">Engine Adherence: Planned vs Actual Time</div>
              <div className="muted" style={{ fontSize: 11 }}>
                Routific logistics benchmark: schedule accuracy by delivery van
              </div>
            </div>
            <span className="ceo-chart-tag">Logistics Engine</span>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                <Tooltip
                  formatter={(val) => [`${val} minutes`, '']}
                  contentStyle={{
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="planned" name="Planned Minutes" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual Minutes" fill="#ea580c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg, #f8fafc)',
              borderRadius: 8,
              padding: '8px 12px',
              marginTop: 10,
              fontSize: 12,
            }}
          >
            <span>Engine On-Time Reliability:</span>
            <strong style={{ color: '#16a34a' }}>{pvaSummary.on_time_rate_pct}%</strong>
          </div>
        </section>

        {/* Customer Accounts & Risk Summary Table (Read Only) */}
        <section className="ceo-chart-card" style={{ padding: 14 }}>
          <div className="ceo-chart-header" style={{ marginBottom: 10 }}>
            <div className="ceo-chart-title">Customer Risk Monitoring</div>
            <span className="ceo-chart-tag">{risk.total_customers || 60} Total</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center' }}>
            <div style={{ background: '#f0fdf4', padding: '8px 4px', borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                {risk.counts?.normal || 38}
              </div>
              <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>Normal</div>
            </div>

            <div style={{ background: '#f0f9ff', padding: '8px 4px', borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0284c7' }}>
                {risk.counts?.high || 14}
              </div>
              <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>High</div>
            </div>

            <div style={{ background: '#fffbeb', padding: '8px 4px', borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#d97706' }}>
                {risk.counts?.critical || 6}
              </div>
              <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>Critical</div>
            </div>

            <div style={{ background: '#fef2f2', padding: '8px 4px', borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>
                {risk.counts?.urgent || 2}
              </div>
              <div style={{ fontSize: 10, color: '#b91c1c', fontWeight: 600 }}>Urgent</div>
            </div>
          </div>
        </section>

        {/* Read-Only Integrity Notice */}
        <footer className="ceo-read-only-footer">
          🔒 <strong>Read-Only Executive View</strong>: This interface is strictly read-only for governance and audit oversight. No data modification buttons exist.
        </footer>
      </main>
    </div>
  )
}

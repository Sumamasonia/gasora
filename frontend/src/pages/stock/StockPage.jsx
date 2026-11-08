import { useEffect, useState } from 'react'
import { getStockMovements, getStockSettings, getStockSummary } from '../../api'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import StockSettingsModal from './StockSettingsModal'
import './stock.css'

export default function StockPage({ auth, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [movements, setMovements] = useState([])
  const [thresholds, setThresholds] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)

  const loadStockData = async () => {
    try {
      setLoading(true)
      const [sumData, movData, setData] = await Promise.all([
        getStockSummary(auth.token),
        getStockMovements(auth.token),
        getStockSettings(auth.token),
      ])
      setSummary(sumData)
      setMovements(movData)
      setThresholds(setData.low_stock_thresholds || {})
    } catch (err) {
      setError(err.message || 'Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStockData()
  }, [auth.token])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size="lg" message="Loading central depot stock & cylinder inventory..." />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="stock-container">
        <div className="error banner">⚠️ {error || 'Failed to load stock'}</div>
        <button type="button" className="secondary" onClick={loadStockData}>
          Retry
        </button>
      </div>
    )
  }

  const byType = summary.by_type || {}
  const lowAlerts = summary.low_stock_alerts || []

  return (
    <div className="stock-container">
      {/* Header */}
      <div className="stock-header">
        <div className="stock-header-title">
          <h1>
            <span>📦</span> Central Depot Stock & Cylinder Inventory
          </h1>
          <p>
            Real-time physical asset counts at {summary.depot_name || 'Main Depot Faisalabad'}. Monitors filled reserves, empty return buffers, and customer allocations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={() => onNavigate('stock/purchases')}>
            📥 Record Refill Purchase
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/sale')}>
            ⚡ Record Sale & Delivery
          </button>
          <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
            ⚙️ Safety Thresholds
          </button>
        </div>
      </div>

      {/* Low-Stock Warning Alert Banner (if any alert triggered) */}
      {lowAlerts.length > 0 && (
        <div className="low-stock-banner">
          <span style={{ fontSize: 24 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Low Stock Safety Alert Triggered:
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {lowAlerts.map((a, idx) => (
                <span key={a.cylinder_type}>
                  {idx > 0 && ' • '}
                  <strong>{a.cylinder_type}</strong> has only <strong>{a.filled} filled units</strong> (threshold is {a.threshold}, deficit of {a.deficit} units)
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="primary"
            style={{ fontSize: 12, padding: '6px 12px', background: '#991b1b', borderColor: '#7f1d1d' }}
            onClick={() => onNavigate('stock/purchases')}
          >
            Order Refills Now
          </button>
        </div>
      )}

      {/* Aggregate KPI Grid */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Available Filled Gas</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            {summary.total_gas_kg.toLocaleString()} kg
          </span>
          <span className="billing-kpi-sub">{summary.total_filled} ready-to-dispatch cylinders</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Empty Buffer at Depot</span>
          <span className="billing-kpi-value" style={{ color: 'var(--text-secondary)' }}>
            {summary.total_empty}
          </span>
          <span className="billing-kpi-sub">Awaiting terminal washing & refill batch</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Cylinders with Customers</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
            {summary.total_delivered}
          </span>
          <span className="billing-kpi-sub">Deployed active consumer assets</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Fleet Registered</span>
          <span className="billing-kpi-value" style={{ color: 'var(--text-primary)' }}>
            {summary.total_cylinders}
          </span>
          <span className="billing-kpi-sub">Company & customer-owned cylinders</span>
        </div>
      </div>

      {/* Stock Cards per Cylinder Type */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '10px 0 16px 0', color: 'var(--text-primary)' }}>
          Stock Reserve by Cylinder Specification
        </h2>

        <div className="stock-type-grid">
          {Object.entries(byType).map(([type, stats]) => {
            const capacityKg = parseFloat(type) || 11.8
            const gasMass = stats.filled * capacityKg

            return (
              <div
                key={type}
                className={`stock-card ${stats.is_low ? 'warning-card' : ''}`}
              >
                <div className="stock-card-header">
                  <div>
                    <h3 className="stock-card-title">{type}</h3>
                    <span className="stock-card-sub">
                      {type === '11.8 kg'
                        ? 'Standard Domestic Home Supply'
                        : type === '15 kg'
                        ? 'Commercial Kitchen & Bakery Refill'
                        : 'Heavy Commercial & Industrial Supply'}
                    </span>
                  </div>

                  {stats.is_low ? (
                    <span className="badge-status overdue" style={{ fontSize: 11 }}>
                      ⚠️ Low Stock ({stats.filled} &le; {stats.threshold})
                    </span>
                  ) : (
                    <span className="badge-status paid" style={{ fontSize: 11 }}>
                      ✓ Healthy ({stats.filled} units)
                    </span>
                  )}
                </div>

                {/* 3 Stats Row: Filled, Empty, Delivered */}
                <div className="stock-stats-row">
                  <div className="stock-stat-box">
                    <span className="stock-stat-label">Filled Ready</span>
                    <span className="stock-stat-num filled">{stats.filled}</span>
                    <span className="muted" style={{ fontSize: 11 }}>at depot</span>
                  </div>

                  <div className="stock-stat-box">
                    <span className="stock-stat-label">Empty Buffer</span>
                    <span className="stock-stat-num empty">{stats.empty}</span>
                    <span className="muted" style={{ fontSize: 11 }}>at depot</span>
                  </div>

                  <div className="stock-stat-box">
                    <span className="stock-stat-label">With Customer</span>
                    <span className="stock-stat-num delivered">{stats.delivered}</span>
                    <span className="muted" style={{ fontSize: 11 }}>held on site</span>
                  </div>
                </div>

                {/* Footer details */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <span className="muted">Safety Reserve Threshold:</span>
                  <strong>Min {stats.threshold} filled units</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="muted">LPG Mass in Reserve:</span>
                  <strong>{Math.round(gasMass).toLocaleString()} kg</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="muted">Total Registered Fleet:</span>
                  <strong>{stats.total} cylinders</strong>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ flex: 1, fontSize: 12, padding: '6px 0' }}
                    onClick={() => onNavigate('stock/purchases')}
                  >
                    + Purchase Refills
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => setSettingsOpen(true)}
                  >
                    ⚙️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Movement History */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 12px 0' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Stock Movement History
            </h2>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: 13 }}>
              Chronological log of bulk purchases, delivery outflows, and empty recoveries.
            </p>
          </div>
          <span className="code-badge" style={{ fontSize: 12 }}>
            {movements.length} total events
          </span>
        </div>

        {movements.length === 0 ? (
          <EmptyState
            title="No Movement History"
            description="Stock movements will automatically appear here as purchases and deliveries occur."
          />
        ) : (
          <div className="datatable-desktop">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Cylinder Specification</th>
                  <th>Net Stock Impact</th>
                  <th>Reference / Doc</th>
                  <th>Source / Counterparty</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 25).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="code-badge" style={{ fontSize: 11 }}>
                        {m.id}
                      </span>
                    </td>

                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {m.date || '—'}
                    </td>

                    <td style={{ fontWeight: 600 }}>
                      <span
                        className={`badge-status ${m.type === 'purchase_inflow' ? 'paid' : 'partial'}`}
                        style={{ fontSize: 11, marginRight: 6 }}
                      >
                        {m.type === 'purchase_inflow' ? '📥 Refill Inflow' : '🚚 Outflow'}
                      </span>
                    </td>

                    <td>
                      <span className="code-badge">{m.cylinder_type}</span>
                    </td>

                    <td
                      style={{
                        fontWeight: 700,
                        color: m.type === 'purchase_inflow' ? 'var(--color-success)' : 'var(--color-primary)',
                      }}
                    >
                      {m.impact}
                    </td>

                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {m.reference || '—'}
                    </td>

                    <td>{m.source_destination || '—'}</td>

                    <td className="muted" style={{ fontSize: 12 }}>
                      {m.actor || 'system'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Settings Modal */}
      {settingsOpen && (
        <StockSettingsModal
          auth={auth}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          currentThresholds={thresholds}
          onSettingsSaved={(newThresh) => {
            setThresholds(newThresh)
            loadStockData()
          }}
        />
      )}
    </div>
  )
}

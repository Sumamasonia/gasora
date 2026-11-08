import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getDashboardSummary } from '../../api'
import { BAND_COLOR } from '../../colors'
import KpiTile from '../../components/KpiTile'
import Spinner from '../../components/Spinner'
import { Badge, UrgentTag } from '../../ui'
import './dashboard.css'

export default function DashboardPage({ auth, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await getDashboardSummary(auth.token)
      setSummary(data)
    } catch (err) {
      setError(err.message || 'Failed to load executive dashboard summary')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [auth.token])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size="lg" message="Computing live executive dashboard KPIs and route analytics..." />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="dashboard-container">
        <div className="error banner">⚠️ {error || 'Failed to load dashboard data'}</div>
        <button type="button" className="secondary" onClick={loadData}>
          Retry
        </button>
      </div>
    )
  }

  // Formatting helpers
  const formatPkr = (val) => `PKR ${(Number(val) || 0).toLocaleString()}`

  // Prepare chart datasets
  const financialData = summary.financial_trends || []

  // Risk band donut data
  const riskCounts = summary.risk?.counts || { Normal: 0, High: 0, Critical: 0, Urgent: 0 }
  const riskDonutData = [
    { name: 'Normal', value: riskCounts.Normal || 0, color: BAND_COLOR.Normal || '#6b8f71' },
    { name: 'High', value: riskCounts.High || 0, color: BAND_COLOR.High || '#e08a00' },
    { name: 'Critical', value: riskCounts.Critical || 0, color: BAND_COLOR.Critical || '#c62828' },
    { name: 'Urgent', value: riskCounts.Urgent || 0, color: BAND_COLOR.Urgent || '#7b1fa2' },
  ].filter((item) => item.value > 0)

  // Loans ageing data
  const ageing = summary.loans?.ageing_breakdown || {}
  const loansChartData = [
    { bucket: 'Current (0-30d)', amount: ageing.current || 0, color: '#10b981' },
    { bucket: '31-60 Days', amount: ageing.days_31_60 || 0, color: '#f59e0b' },
    { bucket: '61-90 Days', amount: ageing.days_61_90 || 0, color: '#f97316' },
    { bucket: '90+ Days', amount: ageing.days_90_plus || 0, color: '#ef4444' },
  ]

  // Stock by type data
  const stockObj = summary.stock?.by_type || {}
  const stockChartData = Object.values(stockObj).map((s) => ({
    type: s.type,
    Filled: s.filled,
    'Empty/Recovered': s.empty,
    Delivered: s.delivered,
    Threshold: s.threshold,
  }))

  // Planned vs actual minutes data (Routific design reference)
  const plannedVsActualTrends = summary.planned_vs_actual?.daily_trends || []
  const pvaSummary = summary.planned_vs_actual?.summary || {}
  const recentRoutes = summary.planned_vs_actual?.routes || []

  return (
    <div className="dashboard-container">
      {/* Dashboard Top Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-area">
          <h1>Operations &amp; Executive Dashboard</h1>
          <p>
            Real-time business telemetry, delivery fleet performance, and financial metrics across Faisalabad.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <span className="demo-data-badge" title="Values dynamically computed from active mock database tables">
            ⚡ Demo Data (Live Computed)
          </span>
          <button type="button" className="secondary" onClick={loadData} title="Refresh live calculations">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="quick-actions-bar" role="toolbar" aria-label="Quick operations actions">
        <span className="quick-actions-label">Quick Actions:</span>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('dispatch')}>
          🗺️ Plan Today's Dispatch
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('billing/sale')}>
          🧾 Record Direct Sale
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('stock')}>
          📦 Manage LPG Stock
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('expenses')}>
          💸 Log Expense
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('billing/loans')}>
          💳 Customer Loans
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('reports')}>
          📋 Detailed Reports
        </button>
        <button type="button" className="quick-action-btn" onClick={() => onNavigate('evaluation')}>
          🔬 Algorithm Evaluation
        </button>
      </div>

      {/* KPI Tiles Grid with Change vs Previous Period */}
      <div className="dashboard-kpi-grid">
        <KpiTile
          title="Total Invoiced Sales"
          value={formatPkr(summary.sales?.total)}
          subtitle={`${formatPkr(summary.sales?.current_period)} this period`}
          trend={summary.sales?.trend}
          icon="💰"
          onClick={() => onNavigate('billing')}
        />

        <KpiTile
          title="Operating Expenses"
          value={formatPkr(summary.expenses?.total)}
          subtitle={`${formatPkr(summary.expenses?.current_period)} this period`}
          trend={summary.expenses?.trend}
          icon="💸"
          onClick={() => onNavigate('expenses')}
        />

        <KpiTile
          title="Net Operating Profit"
          value={formatPkr(summary.profit?.net_profit)}
          subtitle={`${summary.profit?.margin_pct}% operating margin`}
          trend={summary.profit?.trend}
          icon="📈"
          onClick={() => onNavigate('billing')}
        />

        <KpiTile
          title="Customer Receivables (Loans)"
          value={formatPkr(summary.loans?.total_receivables)}
          subtitle={`${summary.loans?.debtor_count} debtors (${formatPkr(summary.loans?.unsecured_risk)} unsecured)`}
          trend={{
            label: `${summary.loans?.debtor_count} open accounts`,
            positive: (summary.loans?.unsecured_risk || 0) === 0,
          }}
          icon="💳"
          onClick={() => onNavigate('billing/loans')}
        />

        <KpiTile
          title="Filled Stock (Ready)"
          value={`${summary.stock?.filled} Cylinders`}
          subtitle={
            summary.stock?.has_low_stock
              ? `⚠️ ${summary.stock?.low_stock_count} type(s) below safety threshold`
              : 'All specifications above safety threshold'
          }
          trend={{
            label: `${summary.stock?.total_cylinders} total fleet assets`,
            positive: !summary.stock?.has_low_stock,
          }}
          icon="🛢️"
          onClick={() => onNavigate('stock')}
        />

        <KpiTile
          title="Customer Run-Outs"
          value={`${summary.runouts?.active_urgent} Active Urgent`}
          subtitle={`${summary.runouts?.runouts_per_100_customer_months} per 100 cust-months (Demo)`}
          trend={{
            label: summary.runouts?.active_urgent === 0 ? 'Zero active stockouts' : 'Requires immediate dispatch',
            positive: summary.runouts?.active_urgent === 0,
          }}
          icon="🚨"
          onClick={() => onNavigate('dispatch')}
        />

        <KpiTile
          title="Fleet Distance (30 Days)"
          value={`${Math.round(summary.kilometres?.total_km_30d)} km`}
          subtitle={`Avg ${summary.kilometres?.avg_km_per_day} km/day across 2 vehicles`}
          trend={summary.kilometres?.trend}
          icon="🚚"
          onClick={() => onNavigate('dispatch')}
        />

        <KpiTile
          title="Route Time Accuracy"
          value={`${pvaSummary.on_time_rate_pct || 88}% On-Time`}
          subtitle={`Avg variance: ${pvaSummary.avg_variance_minutes > 0 ? '+' : ''}${pvaSummary.avg_variance_minutes} min`}
          trend={{
            label: 'Routific Analytics Benchmark',
            positive: (pvaSummary.on_time_rate_pct || 88) >= 80,
          }}
          icon="⏱️"
          onClick={() => onNavigate('evaluation')}
        />
      </div>

      {/* Row 1: Sales vs Expenses Line & Net Profit Bars */}
      <div className="charts-grid-two-col">
        {/* Sales vs Expenses Line Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Sales vs. Operating Expenses</h3>
              <p>Monthly revenue generation compared to fleet and operational expenses</p>
            </div>
            <span className="chart-badge">Financial Overview</span>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={financialData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(val) => [`PKR ${(Number(val) || 0).toLocaleString()}`, '']}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="Invoiced Sales"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Operating Expenses"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Net Profit Bars */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Monthly Net Profit</h3>
              <p>Net earnings after deducting operating expenses and fuel costs</p>
            </div>
            <span className="chart-badge">Profitability</span>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={financialData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(val) => [`PKR ${(Number(val) || 0).toLocaleString()}`, 'Net Operating Profit']}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Bar dataKey="profit" name="Net Profit (PKR)" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Routific Planned vs Actual Route Minutes (Design Reference) & Customer Risk Donut */}
      <div className="charts-grid-two-col">
        {/* Planned vs Actual Route Minutes (Routific Analytics Highlight) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Planned vs. Actual Route Duration</h3>
              <p>Route execution adherence, timeline variance, and driver on-time tracking</p>
            </div>
            <span className="chart-badge">Routific Analytics</span>
          </div>

          {/* Routific Style Key Metrics Banner */}
          <div className="routific-metrics-strip">
            <div className="routific-metric-item">
              <span className="routific-metric-label">Planned Time</span>
              <span className="routific-metric-val">{pvaSummary.total_planned_minutes} min</span>
            </div>
            <div className="routific-metric-item">
              <span className="routific-metric-label">Actual Time</span>
              <span className="routific-metric-val">{pvaSummary.total_actual_minutes} min</span>
            </div>
            <div className="routific-metric-item">
              <span className="routific-metric-label">Net Variance</span>
              <span
                className={`routific-metric-val ${pvaSummary.variance_minutes <= 0 ? 'positive' : 'variance'}`}
              >
                {pvaSummary.variance_minutes > 0 ? '+' : ''}
                {pvaSummary.variance_minutes} min
              </span>
            </div>
            <div className="routific-metric-item">
              <span className="routific-metric-label">On-Time Rate</span>
              <span className="routific-metric-val positive">{pvaSummary.on_time_rate_pct}%</span>
            </div>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer>
              <BarChart data={plannedVsActualTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                <Tooltip
                  formatter={(val, name) => [`${val} minutes`, name]}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="planned_minutes" name="Planned Minutes" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual_minutes" name="Actual Minutes" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Route Variance Pills Preview */}
          <div className="route-variance-pills">
            {recentRoutes.slice(-4).map((r) => (
              <span key={r.id} className={`route-variance-pill ${r.status}`}>
                {r.route_name.split(' - ')[0]}: {r.variance_minutes > 0 ? `+${r.variance_minutes}` : r.variance_minutes}m{' '}
                {r.status === 'on_time' ? '✓ on schedule' : r.status === 'slower' ? '▲ delay' : '▼ fast'}
              </span>
            ))}
          </div>
        </div>

        {/* Customer Run-Out Risk Distribution (Donut Chart) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Customer Run-Out Risk Distribution</h3>
              <p>Predictive depletion model: customer urgency and run-out exposure</p>
            </div>
            <span className="chart-badge">Depletion Risk</span>
          </div>

          <div style={{ width: '100%', height: 210, position: 'relative' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={riskDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {riskDonutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val, name) => [`${val} customers`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="donut-legend-grid">
            {riskDonutData.map((entry) => (
              <div key={entry.name} className="donut-legend-item">
                <span>
                  <span className="donut-legend-color" style={{ background: entry.color }} />
                  <strong>{entry.name}</strong>
                </span>
                <span>
                  {entry.value} cust ({Math.round((entry.value / (summary.risk?.total_customers || 1)) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Loans Ageing & Cylinder Stock by Type */}
      <div className="charts-grid-two-col">
        {/* Receivables & Loans Ageing */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Customer Receivables (Loans Ageing)</h3>
              <p>Outstanding customer debt categorized by overdue duration</p>
            </div>
            <span className="chart-badge">Credit Exposure</span>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={loansChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(val) => [formatPkr(val), 'Outstanding Amount']}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Bar dataKey="amount" name="Receivable Amount (PKR)" radius={[4, 4, 0, 0]}>
                  {loansChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cylinder Stock by Specification */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>Cylinder Inventory by Specification</h3>
              <p>Physical distribution of cylinders across depot and customer field</p>
            </div>
            <span className="chart-badge">Depot Inventory</span>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={stockChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="type" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val, name) => [`${val} Cylinders`, name]}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Filled" name="Filled (Depot Ready)" fill="#059669" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Empty/Recovered" name="Empty / Recovered" fill="#d97706" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Delivered" name="Held by Customers" fill="#2563eb" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Risk Customers Section */}
      <div className="top-risk-section">
        <div className="top-risk-header">
          <div>
            <h3>Top Customers at Run-Out Risk</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
              Prioritized list of customers nearing gas depletion requiring route scheduling
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => onNavigate('dispatch')}>
            View Full Risk List in Dispatch →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="risk-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Area</th>
                <th>Cylinder</th>
                <th>Days Held</th>
                <th>Predicted Depletion</th>
                <th>Run-Out Risk</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(summary.risk?.top_risks || []).map((c) => {
                const riskPct = Math.round(c.risk * 100)
                const barColor = c.urgent
                  ? '#ef4444'
                  : c.band === 'Critical'
                  ? '#f97316'
                  : c.band === 'High'
                  ? '#f59e0b'
                  : '#10b981'

                return (
                  <tr key={c.customer_id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {c.code} · {c.phone}
                      </div>
                    </td>
                    <td>{c.area}</td>
                    <td>
                      <span className="pill">{c.cylinder_type}</span>
                    </td>
                    <td>{c.days_since_delivery} days</td>
                    <td>
                      {c.urgent ? (
                        <strong style={{ color: '#ef4444' }}>Out of Gas (Urgent)</strong>
                      ) : (
                        `Empty in ${c.window_days[0]}–${c.window_days[1]} days`
                      )}
                    </td>
                    <td>
                      <div className="risk-bar-container">
                        <div className="risk-bar-track">
                          <div
                            className="risk-bar-fill"
                            style={{ width: `${Math.min(100, riskPct)}%`, background: barColor }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{riskPct}%</span>
                      </div>
                    </td>
                    <td>
                      {c.urgent ? <UrgentTag /> : <Badge band={c.band} />}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-sm secondary"
                        onClick={() => onNavigate('dispatch')}
                        title="Include customer in today's delivery plan"
                      >
                        Schedule
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Disclaimer & Engine Note */}
      <div className="dashboard-footer-banner">
        <span>
          ⚡ <strong>Demo Data Note</strong>: All operational numbers, fleet distances, and financial indicators are computed live from mock tables. Planned vs Actual route analytics follow the Routific logistics standard.
        </span>
        <button type="button" className="btn-sm" onClick={() => onNavigate('evaluation')}>
          View Algorithm Evaluation Results →
        </button>
      </div>
    </div>
  )
}

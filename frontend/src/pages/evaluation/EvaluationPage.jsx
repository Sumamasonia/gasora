import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getEvaluationResults } from '../../api'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import './evaluation.css'

export default function EvaluationPage({ auth, onNavigate, onExpired }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await getEvaluationResults(auth.token)
      setData(res)
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
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
        <Spinner size="lg" message="Loading multi-policy simulation seeds and benchmark figures..." />
      </div>
    )
  }

  if (error && (error.status === 404 || error.status === 501 || error.status === 0)) {
    return <NotReady endpoint="GET /evaluation" />
  }

  if (error || !data) {
    return (
      <div className="evaluation-container">
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="error banner">⚠️ {error?.message || String(error) || 'Failed to load evaluation data'}</p>
          <button type="button" className="secondary" onClick={loadData} style={{ marginTop: 12 }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const policies = data.policies || []
  const chartData = data.chart_data || []
  const simParams = data.simulation_parameters || {}

  return (
    <div className="evaluation-container">
      {/* Header */}
      <div className="evaluation-header">
        <div>
          <h1>Dispatch Policy &amp; Algorithm Evaluation</h1>
          <p>
            Comparative benchmark across 4 delivery scheduling policies under synthetic simulation.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <span className="demo-data-badge">⚡ Demo Data (Simulation Baseline)</span>
          <button type="button" className="secondary" onClick={loadData} title="Reload simulation metrics">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Mandatory Demo Data Notice Banner - Never State Real Savings */}
      <div className="demo-data-warning-banner" role="alert">
        <div className="demo-data-warning-title">
          <span>⚠️</span>
          <span>DEMO DATA PLACEHOLDERS &middot; SIMULATION BENCHMARK ONLY</span>
        </div>
        <div>
          Every figure in this evaluation represents a synthetic simulation result generated for algorithmic comparison.
          These numbers are <strong>demo placeholders</strong> and do not guarantee or claim actual real-world operational savings.
        </div>
      </div>

      {/* Paired-Seeds Explanation Line & Simulation Parameters */}
      <div className="paired-seeds-card">
        <h4>
          <span>🔬</span>
          <span>Simulation Methodology &amp; Paired-Seeds Protocol</span>
        </h4>
        <p className="paired-seeds-text">
          &ldquo;{data.paired_seeds_explanation}&rdquo;
        </p>

        <div className="simulation-parameters-grid">
          <div className="param-item">
            <span className="param-label">Simulation Duration</span>
            <span className="param-val">{simParams.duration_days} Days</span>
          </div>
          <div className="param-item">
            <span className="param-label">Paired Random Seeds</span>
            <span className="param-val">{simParams.paired_random_seeds} Iterations</span>
          </div>
          <div className="param-item">
            <span className="param-label">Simulated Customers</span>
            <span className="param-val">{simParams.simulated_customers} Cohort</span>
          </div>
          <div className="param-item">
            <span className="param-label">Vehicle Capacity</span>
            <span className="param-val">{simParams.vehicle_capacity} Cylinders / Trip</span>
          </div>
          <div className="param-item">
            <span className="param-label">Evaluation Mode</span>
            <span className="param-val" style={{ color: '#2563eb' }}>Demo Data Benchmark</span>
          </div>
        </div>
      </div>

      {/* Main Table: The Four Policies Comparison */}
      <div className="evaluation-table-card">
        <div className="evaluation-table-header">
          <h3>Comparative Benchmark of the Four Policies</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            All metrics marked demo data &middot; 180-day paired evaluation
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="eval-table">
            <thead>
              <tr>
                <th>Policy Name &amp; Description</th>
                <th>Classification</th>
                <th className="num-col">
                  Run-Outs
                  <span className="demo-data-col-badge">/ 100 cust-mo (Demo)</span>
                </th>
                <th className="num-col">
                  Km / Delivery
                  <span className="demo-data-col-badge">Km per drop (Demo)</span>
                </th>
                <th className="num-col">
                  Total Km
                  <span className="demo-data-col-badge">180 days (Demo)</span>
                </th>
                <th className="num-col">
                  Early Deliveries
                  <span className="demo-data-col-badge">% of drops (Demo)</span>
                </th>
                <th className="num-col">
                  Days Without Gas
                  <span className="demo-data-col-badge">Cust-days (Demo)</span>
                </th>
                <th>Interval Range</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const isHighlight = p.is_gasora

                return (
                  <tr key={p.id} className={isHighlight ? 'highlight-policy' : ''}>
                    <td>
                      <div>
                        <strong>{p.code}</strong>
                        {isHighlight && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              background: '#2563eb',
                              color: '#ffffff',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            PROPOSED
                          </span>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 280 }}>
                        {p.description}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`policy-badge-pill ${
                          p.id === 'P3'
                            ? 'proposed'
                            : p.id === 'P1'
                            ? 'baseline'
                            : p.id === 'P2'
                            ? 'heuristic'
                            : 'ablation'
                        }`}
                      >
                        {p.badge}
                      </span>
                    </td>
                    <td className="num-col">
                      <strong style={{ color: p.is_gasora ? '#16a34a' : p.id === 'P1' ? '#dc2626' : '#d97706' }}>
                        {p.runouts_per_100_customer_months}
                      </strong>
                      <span className="demo-data-col-badge">Demo data</span>
                    </td>
                    <td className="num-col">
                      <strong>{p.km_per_delivery} km</strong>
                      <span className="demo-data-col-badge">Demo data</span>
                    </td>
                    <td className="num-col">
                      <strong>{(Number(p.total_km) || 0).toLocaleString()} km</strong>
                      <span className="demo-data-col-badge">Demo data</span>
                    </td>
                    <td className="num-col">
                      <span>{p.early_deliveries_pct}%</span>
                      <span className="demo-data-col-badge">Demo data</span>
                    </td>
                    <td className="num-col">
                      <strong style={{ color: p.customer_days_without_gas > 50 ? '#dc2626' : '#16a34a' }}>
                        {p.customer_days_without_gas} days
                      </strong>
                      <span className="demo-data-col-badge">Demo data</span>
                    </td>
                    <td>
                      <span className="pill">{p.interval_range}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Charts: Recharts Comparison */}
      <div className="evaluation-charts-grid">
        {/* Chart 1: Service Quality (Run-outs & Outage Days) */}
        <div className="eval-chart-card">
          <div className="eval-chart-header">
            <div>
              <h3>Reliability: Run-Outs &amp; Outage Days</h3>
              <p>Comparison of customer service continuity across the four policies (Demo data)</p>
            </div>
            <span className="demo-data-badge">Demo Data</span>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="policy" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val, name) => [`${val} (Demo data)`, name]}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="runouts"
                  name="Run-Outs / 100 Cust-Mo"
                  fill="#ef4444"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="days_without_gas"
                  name="Total Days Without Gas"
                  fill="#f97316"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Fleet Route Efficiency (Km / Delivery & Total Distance) */}
        <div className="eval-chart-card">
          <div className="eval-chart-header">
            <div>
              <h3>Fleet Efficiency: Distance &amp; Drops</h3>
              <p>Kilometres per delivery and cumulative total distance in 1,000 km (Demo data)</p>
            </div>
            <span className="demo-data-badge">Demo Data</span>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="policy" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val, name) => [`${val} (Demo data)`, name]}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="km_per_delivery"
                  name="Km per Delivery"
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="total_km_k"
                  name="Total Km (x1,000)"
                  fill="#8b5cf6"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Policy Summaries Grid */}
      <div className="policy-cards-row">
        {policies.map((p) => (
          <div
            key={p.id}
            className={`policy-summary-card ${p.is_gasora ? 'gasora-card' : ''}`}
          >
            <div className="policy-card-top">
              <span className="policy-card-title">{p.code}</span>
              <span className="pill">{p.badge}</span>
            </div>
            <p className="policy-card-desc">{p.description}</p>
            <div className="policy-card-stats">
              <div className="stat-mini-box">
                <span className="stat-mini-label">Run-Out Rate</span>
                <span className="stat-mini-val demo-tag">
                  {p.runouts_per_100_customer_months}
                  <span>demo</span>
                </span>
              </div>
              <div className="stat-mini-box">
                <span className="stat-mini-label">Km / Drop</span>
                <span className="stat-mini-val demo-tag">
                  {p.km_per_delivery} km
                  <span>demo</span>
                </span>
              </div>
              <div className="stat-mini-box">
                <span className="stat-mini-label">Early Refills</span>
                <span className="stat-mini-val demo-tag">
                  {p.early_deliveries_pct}%
                  <span>demo</span>
                </span>
              </div>
              <div className="stat-mini-box">
                <span className="stat-mini-label">Outage Days</span>
                <span className="stat-mini-val demo-tag">
                  {p.customer_days_without_gas}d
                  <span>demo</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="dashboard-footer-banner">
        <span>
          ⚡ <strong>Comparative Research Protocol</strong>: Gasora algorithm evaluation benchmarked across identical seeds. Figures are demo placeholders for simulation study.
        </span>
        <button type="button" className="btn-sm" onClick={() => onNavigate('dispatch')}>
          Launch Route Dispatch Optimizer →
        </button>
      </div>
    </div>
  )
}

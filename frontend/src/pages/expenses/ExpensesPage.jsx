import { useEffect, useMemo, useState } from 'react'
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
import { getExpenses, getFuelEstimate } from '../../api'
import EmptyState from '../../components/EmptyState'
import NotReady from '../../components/NotReady'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import AddExpenseModal from './AddExpenseModal'
import './expenses.css'

const CATEGORY_LABELS = {
  fuel: { label: 'Fuel', icon: '⛽' },
  rent: { label: 'Depot Rent', icon: '🏢' },
  salary: { label: 'Staff Salaries', icon: '👤' },
  repair: { label: 'Maintenance & Repairs', icon: '🔧' },
  other: { label: 'Utilities & Other', icon: '📦' },
}

export default function ExpensesPage({ auth, onNavigate, onExpired }) {
  const [data, setData] = useState({ expenses: [], category_totals: {}, monthly_totals: {}, daily_totals: {} })
  const [fuelEst, setFuelEst] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Chart view toggle: 'category' | 'monthly' | 'daily'
  const [chartView, setChartView] = useState('category')

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination (5 items per page)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 5

  useEffect(() => {
    setPage(0)
  }, [selectedCategory, selectedMonth, searchQuery])

  // Modal
  const [addModalOpen, setAddModalOpen] = useState(false)

  const loadExpenses = async () => {
    try {
      setLoading(true)
      const [expData, fuelData] = await Promise.all([
        getExpenses(auth.token),
        getFuelEstimate(auth.token),
      ])
      setData(expData)
      setFuelEst(fuelData)
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [auth.token])

  const expenses = data.expenses || []

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (selectedCategory !== 'all' && (e.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
        return false
      }
      if (selectedMonth !== 'all' && (!e.date || !e.date.startsWith(selectedMonth))) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchNote = e.note && e.note.toLowerCase().includes(q)
        const matchVeh = e.vehicle_id && e.vehicle_id.toLowerCase().includes(q)
        const matchActor = e.actor && e.actor.toLowerCase().includes(q)
        if (!matchNote && !matchVeh && !matchActor) return false
      }
      return true
    })
  }, [expenses, selectedCategory, selectedMonth, searchQuery])

  // KPIs
  const totalSpend = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  )
  const fuelSpend = useMemo(
    () => filteredExpenses.filter((e) => e.category === 'fuel').reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  )
  const rentSpend = useMemo(
    () => filteredExpenses.filter((e) => e.category === 'rent').reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  )
  const salarySpend = useMemo(
    () => filteredExpenses.filter((e) => e.category === 'salary').reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  )

  // Chart datasets
  const categoryChartData = useMemo(() => {
    const cats = ['fuel', 'rent', 'salary', 'repair', 'other']
    return cats.map((cat) => ({
      name: CATEGORY_LABELS[cat]?.label || cat,
      amount: data.category_totals?.[cat] || 0,
      fill: cat === 'fuel' ? '#f59e0b' : cat === 'rent' ? '#0284c7' : cat === 'salary' ? '#16a34a' : cat === 'repair' ? '#64748b' : '#9333ea',
    }))
  }, [data.category_totals])

  const monthlyChartData = useMemo(() => {
    const months = Object.keys(data.monthly_totals || {}).sort()
    return months.map((m) => {
      const label = m === '2026-01' ? 'Jan 2026' : m === '2026-02' ? 'Feb 2026' : m === '2026-03' ? 'Mar 2026' : m
      return {
        month: label,
        amount: data.monthly_totals[m],
      }
    })
  }, [data.monthly_totals])

  const dailyChartData = useMemo(() => {
    const dates = Object.keys(data.daily_totals || {}).sort().slice(-14)
    return dates.map((d) => ({
      date: d.slice(5), // 'MM-DD'
      amount: data.daily_totals[d],
    }))
  }, [data.daily_totals])

  return (
    <div className="expenses-container">
      {/* Header */}
      <div className="expenses-header">
        <div className="expenses-header-title">
          <h1>
            <span>💸</span> Operating Expenses & Cost Intelligence
          </h1>
          <p>
            Track daily operating expenses across fuel, depot rent, driver wages, and maintenance with live Recharts cost aggregation and fleet route fuel estimates.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={() => setAddModalOpen(true)}>
            ➕ Log Expense
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('stock')}>
            📦 Stock & Purchases
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            🧾 Billing & Invoices
          </button>
        </div>
      </div>

      {/* Fuel Cost Estimate Banner (Clearly Labelled as Estimate) */}
      {fuelEst && (
        <div className="fuel-estimate-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="fuel-estimate-badge">⚡ {fuelEst.estimate_label}</span>
              <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#334155' }}>
                {fuelEst.disclaimer}
              </p>
            </div>
            <span className="code-badge" style={{ fontSize: 12 }}>
              Diesel: PKR {fuelEst.fuel_price_pkr}/L • Fleet Avg: {fuelEst.km_per_liter} km/L
            </span>
          </div>

          <div className="fuel-estimate-grid">
            <div className="fuel-estimate-item">
              <span className="fuel-estimate-label">Total Published Route Km</span>
              <span className="fuel-estimate-val" style={{ color: 'var(--color-primary)' }}>
                {fuelEst.total_route_km} km
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                Across {fuelEst.published_routes_count} published routes
              </span>
            </div>

            <div className="fuel-estimate-item">
              <span className="fuel-estimate-label">Estimated Diesel Needed</span>
              <span className="fuel-estimate-val" style={{ color: 'var(--color-accent)' }}>
                {fuelEst.estimated_liters} Liters
              </span>
              <span className="muted" style={{ fontSize: 11 }}>At 7.5 km per Liter standard</span>
            </div>

            <div className="fuel-estimate-item">
              <span className="fuel-estimate-label">Estimated Route Fuel Cost</span>
              <span className="fuel-estimate-val" style={{ color: '#0369a1' }}>
                PKR {fuelEst.estimated_fuel_cost.toLocaleString()}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                Modelled fleet expense (Estimate)
              </span>
            </div>

            <div className="fuel-estimate-item">
              <span className="fuel-estimate-label">Actual Fuel Expenses Logged</span>
              <span className="fuel-estimate-val" style={{ color: '#b45309' }}>
                PKR {fuelEst.actual_fuel_expenses.toLocaleString()}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                {fuelEst.variance >= 0 ? `+PKR ${fuelEst.variance.toLocaleString()} actual variance` : `-PKR ${Math.abs(fuelEst.variance).toLocaleString()} under model`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Aggregate KPI Grid */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Expenses</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-danger)' }}>
            PKR {totalSpend.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">{filteredExpenses.length} entries in active filter</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Fleet Fuel Spend</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-accent)' }}>
            PKR {fuelSpend.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">
            {totalSpend > 0 ? `${Math.round((fuelSpend / totalSpend) * 100)}% of operating costs` : '0%'}
          </span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Depot Facility Rent</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
            PKR {rentSpend.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Warehouse & testing terminal</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Staff & Driver Wages</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            PKR {salarySpend.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Monthly driver payroll disbursements</span>
        </div>
      </div>

      {/* Recharts Bar Chart Card */}
      <div className="expenses-chart-card">
        <div className="chart-header">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {chartView === 'category'
                ? '📊 Expense Breakdown by Category'
                : chartView === 'monthly'
                ? '📈 Monthly Operating Expense Trends'
                : '📅 Daily Expense Incurrence'}
            </h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Interactive visualization of operations expenditure in Pakistani Rupees (PKR)
            </span>
          </div>

          <div className="chart-toggle-group">
            <button
              type="button"
              className={`chart-toggle-btn ${chartView === 'category' ? 'active' : ''}`}
              onClick={() => setChartView('category')}
            >
              By Category
            </button>
            <button
              type="button"
              className={`chart-toggle-btn ${chartView === 'monthly' ? 'active' : ''}`}
              onClick={() => setChartView('monthly')}
            >
              Monthly Trends
            </button>
            <button
              type="button"
              className={`chart-toggle-btn ${chartView === 'daily' ? 'active' : ''}`}
              onClick={() => setChartView('daily')}
            >
              Daily Totals
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'category' ? (
              <BarChart data={categoryChartData} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <YAxis
                  tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                />
                <Tooltip
                  formatter={(val) => [`PKR ${Number(val).toLocaleString()}`, 'Amount']}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : chartView === 'monthly' ? (
              <BarChart data={monthlyChartData} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <YAxis
                  tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                />
                <Tooltip
                  formatter={(val) => [`PKR ${Number(val).toLocaleString()}`, 'Total Spent']}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="amount" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={dailyChartData} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis
                  tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                />
                <Tooltip
                  formatter={(val) => [`PKR ${Number(val).toLocaleString()}`, 'Daily Total']}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Category:</label>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="fuel">⛽ Fuel</option>
            <option value="rent">🏢 Rent</option>
            <option value="salary">👤 Salaries</option>
            <option value="repair">🔧 Repairs</option>
            <option value="other">📦 Other</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Month:</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            <option value="all">All Months</option>
            <option value="2026-03">March 2026</option>
            <option value="2026-02">February 2026</option>
            <option value="2026-01">January 2026</option>
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search description, vehicle #, or recorded by..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(selectedCategory !== 'all' || selectedMonth !== 'all' || searchQuery) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setSelectedCategory('all')
              setSelectedMonth('all')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading operating expenses..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          title="No Expenses Found"
          description="No expenses match your active filter."
          action={
            <button type="button" className="primary" onClick={() => setAddModalOpen(true)}>
              Log First Expense
            </button>
          }
        />
      ) : (
        <>
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description / Purpose</th>
                <th>Vehicle #</th>
                <th style={{ textAlign: 'right' }}>Amount (PKR)</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((exp) => (
                <tr key={exp.id}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {exp.date}
                  </td>

                  <td>
                    <span className={`badge-cat ${exp.category || 'other'}`}>
                      {CATEGORY_LABELS[exp.category]?.icon || '📦'} {CATEGORY_LABELS[exp.category]?.label || exp.category}
                    </span>
                  </td>

                  <td style={{ fontSize: 13 }}>
                    {exp.note || 'Operating expense'}
                  </td>

                  <td>
                    {exp.vehicle_id ? (
                      <span className="code-badge" style={{ fontSize: 11 }}>
                        {exp.vehicle_id}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)', fontSize: 15 }}>
                    {(Number(exp.amount) || 0).toLocaleString()}
                  </td>

                  <td className="muted" style={{ fontSize: 12 }}>
                    {exp.actor || 'owner'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredExpenses.length / PAGE_SIZE)}
          totalItems={filteredExpenses.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
        </>
      )}

      {/* Add Expense Modal */}
      {addModalOpen && (
        <AddExpenseModal
          auth={auth}
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onExpenseCreated={(newExp) => {
            setData((prev) => ({
              ...prev,
              expenses: [newExp, ...prev.expenses],
            }))
            loadExpenses()
          }}
        />
      )}
    </div>
  )
}

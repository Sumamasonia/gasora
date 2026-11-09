import { useEffect, useMemo, useState } from 'react'
import { getLoans } from '../../api'
import EmptyState from '../../components/EmptyState'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import './billing.css'
import CustomerStatementModal from './CustomerStatementModal'

export default function LoansPage({ auth, onNavigate, onRecordPayment, onExpired }) {
  const [data, setData] = useState({ summary: {}, customers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [ageingFilter, setAgeingFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')

  // Selected customer for balance statement modal
  const [statementCustomerId, setStatementCustomerId] = useState(null)

  const loadLoans = async () => {
    try {
      setLoading(true)
      const res = await getLoans(auth.token)
      setData(res)
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLoans()
  }, [auth.token])

  const customers = data.customers || []
  const summary = data.summary || {}

  // Unique areas for filter
  const areas = useMemo(() => {
    const set = new Set(customers.map((c) => c.area).filter(Boolean))
    return Array.from(set).sort()
  }, [customers])

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (typeFilter !== 'all' && (c.customer_type || '').toLowerCase() !== typeFilter.toLowerCase()) {
        return false
      }
      if (areaFilter !== 'all' && c.area !== areaFilter) {
        return false
      }
      if (ageingFilter === 'overdue30' && (c.ageing?.days_31_60 + c.ageing?.days_61_90 + c.ageing?.days_90_plus) <= 0) {
        return false
      }
      if (ageingFilter === 'overdue60' && (c.ageing?.days_61_90 + c.ageing?.days_90_plus) <= 0) {
        return false
      }
      if (ageingFilter === 'overdue90' && (c.ageing?.days_90_plus || 0) <= 0) {
        return false
      }
      if (ageingFilter === 'unsecured' && (c.unsecured_risk || 0) <= 0) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = c.name && c.name.toLowerCase().includes(q)
        const matchCode = c.code && c.code.toLowerCase().includes(q)
        const matchPhone = c.phone && c.phone.includes(q)
        if (!matchName && !matchCode && !matchPhone) return false
      }
      return true
    })
  }, [customers, typeFilter, areaFilter, ageingFilter, searchQuery])

  return (
    <div className="billing-container">
      {/* Header */}
      <div className="billing-header">
        <div className="billing-header-title">
          <h1>
            <span>📊</span> Customer Debt, Loans & Receivables Ageing
          </h1>
          <p>
            Monitor outstanding customer balances, debt ageing buckets (0-30d, 31-60d, 61-90d, 90+d), security deposit coverage, and generate printable statements.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            🧾 Bills Directory
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/payments')}>
            💳 Record Payment
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('ledger')}>
            📋 Financial Ledger
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Receivables</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-danger)' }}>
            PKR {(summary.total_receivables || 0).toLocaleString()}
          </span>
          <span className="billing-kpi-sub">
            Across {summary.debtor_count || 0} customer accounts with debt
          </span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Overdue 30+ Days</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-high)' }}>
            PKR {((summary.overdue_30_days || 0) + (summary.overdue_60_days || 0) + (summary.overdue_90_days || 0)).toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Ageing beyond standard 30-day terms</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Critical Debt (60+ Days)</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-critical)' }}>
            PKR {((summary.overdue_60_days || 0) + (summary.overdue_90_days || 0)).toLocaleString()}
          </span>
          <span className="billing-kpi-sub">High collection risk</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Unsecured Credit Risk</span>
          <span className="billing-kpi-value" style={{ color: '#7b1fa2' }}>
            PKR {(summary.unsecured_risk || 0).toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Debt exceeding security deposits held</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Ageing Risk:</label>
          <select value={ageingFilter} onChange={(e) => setAgeingFilter(e.target.value)}>
            <option value="all">All Debtors</option>
            <option value="overdue30">⚠️ Overdue &gt; 30 Days</option>
            <option value="overdue60">🚨 Critical &gt; 60 Days</option>
            <option value="overdue90">⛔ Delinquent &gt; 90 Days</option>
            <option value="unsecured">🛡️ Unsecured Risk Only</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Type:</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Accounts</option>
            <option value="commercial">🏢 Commercial</option>
            <option value="domestic">🏠 Domestic</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Area:</label>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="all">All Faisalabad Areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search customer name, phone, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(ageingFilter !== 'all' || typeFilter !== 'all' || areaFilter !== 'all' || searchQuery) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setAgeingFilter('all')
              setTypeFilter('all')
              setAreaFilter('all')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Debtors List Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Analyzing customer credit balances & debt ageing..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          title="No Outstanding Debt Found"
          description="All customers matching your filter criteria are fully settled or in credit."
        />
      ) : (
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th>Customer Code & Name</th>
                <th>Type & Area</th>
                <th>Phone Number</th>
                <th style={{ textAlign: 'right' }}>Total Debt (PKR)</th>
                <th style={{ textAlign: 'right' }}>Deposit Held</th>
                <th style={{ textAlign: 'right' }}>Unsecured Risk</th>
                <th style={{ textAlign: 'center' }}>Ageing (0-30d / 31-60d / 61-90d / 90d+)</th>
                <th>Unpaid Bills</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => {
                const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '')
                const waPhone = cleanPhone.startsWith('0') ? `92${cleanPhone.slice(1)}` : cleanPhone

                return (
                  <tr key={c.customer_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="code-badge">{c.code}</span>
                        <strong>{c.name}</strong>
                      </div>
                    </td>

                    <td style={{ fontSize: 13 }}>
                      <div>{c.area || 'Faisalabad'}</div>
                      <div className="muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {c.customer_type}
                      </div>
                    </td>

                    <td style={{ fontSize: 13, fontFamily: 'monospace' }}>
                      {c.phone}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)', fontSize: 15 }}>
                      {(Number(c.total_balance) || 0).toLocaleString()}
                    </td>

                    <td style={{ textAlign: 'right', color: '#475569' }}>
                      {(Number(c.deposit) || 0).toLocaleString()}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {c.unsecured_risk > 0 ? (
                        <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                          PKR {c.unsecured_risk.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-success)', fontSize: 12 }}>
                          ✓ Covered
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      <div style={{ display: 'inline-flex', gap: 4, fontFamily: 'monospace' }}>
                        <span style={{ color: c.ageing?.current ? '#0284c7' : '#94a3b8' }} title="Current (0-30 days)">
                          {Math.round((c.ageing?.current || 0) / 1000)}k
                        </span>
                        <span className="muted">/</span>
                        <span style={{ color: c.ageing?.days_31_60 ? '#d97706' : '#94a3b8' }} title="31-60 days">
                          {Math.round((c.ageing?.days_31_60 || 0) / 1000)}k
                        </span>
                        <span className="muted">/</span>
                        <span style={{ color: c.ageing?.days_61_90 ? '#ea580c' : '#94a3b8' }} title="61-90 days">
                          {Math.round((c.ageing?.days_61_90 || 0) / 1000)}k
                        </span>
                        <span className="muted">/</span>
                        <span style={{ color: c.ageing?.days_90_plus ? '#dc2626' : '#94a3b8', fontWeight: c.ageing?.days_90_plus ? 700 : 400 }} title="90+ days">
                          {Math.round((c.ageing?.days_90_plus || 0) / 1000)}k
                        </span>
                      </div>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <span className="code-badge" style={{ fontSize: 11 }}>
                        {c.unpaid_bills_count} bills
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => setStatementCustomerId(c.customer_id)}
                          title="Generate printable balance statement"
                        >
                          📄 Statement
                        </button>

                        <button
                          type="button"
                          className="primary"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => {
                            if (onRecordPayment) {
                              onRecordPayment({ customer_id: c.customer_id, balance_due: c.total_balance })
                            } else {
                              onNavigate('billing/payments')
                            }
                          }}
                          title="Record payment for this customer"
                        >
                          💳 Pay
                        </button>

                        <a
                          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                            `Assalam-o-Alaikum ${c.name},\nThis is a polite balance reminder from Gasora LPG.\nYour outstanding ledger balance is PKR ${c.total_balance.toLocaleString()}.\nSecurity deposit held on account: PKR ${(c.deposit || 0).toLocaleString()}.\nKindly clear pending dues at your earliest convenience.\nThank you!`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary"
                          style={{ padding: '4px 8px', fontSize: 12, textDecoration: 'none' }}
                          title="Send balance reminder on WhatsApp"
                        >
                          💬
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Balance Statement Modal */}
      {statementCustomerId && (
        <CustomerStatementModal
          auth={auth}
          customerId={statementCustomerId}
          isOpen={Boolean(statementCustomerId)}
          onClose={() => setStatementCustomerId(null)}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { getCustomers, getLedger } from '../../api'
import EmptyState from '../../components/EmptyState'
import NotReady from '../../components/NotReady'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import { exportToCsv } from '../../lib/csv'
import './billing.css'
import LedgerCorrectionModal from './LedgerCorrectionModal'

export default function LedgerPage({ auth, onNavigate, initialCustomerId = null, onExpired }) {
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    initialCustomerId ? String(initialCustomerId) : 'all'
  )
  const [selectedType, setSelectedType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination (5 items per page)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 5

  useEffect(() => {
    setPage(0)
  }, [selectedCustomerId, selectedType, searchQuery])

  // Modal
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false)

  const loadData = async (custFilter = selectedCustomerId) => {
    try {
      setLoading(true)
      const params = custFilter !== 'all' ? { customer_id: custFilter } : {}
      const [entries, custList] = await Promise.all([
        getLedger(auth.token, params),
        getCustomers(auth.token),
      ])
      setLedgerEntries(entries)
      setCustomers(custList)
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(selectedCustomerId)
  }, [auth.token, selectedCustomerId])

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      if (selectedType !== 'all' && entry.entry_type !== selectedType) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchDesc = entry.description && entry.description.toLowerCase().includes(q)
        const matchRef = entry.reference_no && entry.reference_no.toLowerCase().includes(q)
        const matchCust = entry.customer_name && entry.customer_name.toLowerCase().includes(q)
        if (!matchDesc && !matchRef && !matchCust) return false
      }
      return true
    })
  }, [ledgerEntries, selectedType, searchQuery])

  // Aggregate stats
  const totalDebit = useMemo(
    () => filteredEntries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0),
    [filteredEntries]
  )
  const totalCredit = useMemo(
    () => filteredEntries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0),
    [filteredEntries]
  )

  // CSV Export handler
  const handleExportCsv = () => {
    const columns = [
      { key: 'id', label: 'Entry ID' },
      {
        key: 'created_at',
        label: 'Date & Time',
        format: (val) => new Date(val).toLocaleString('en-PK'),
      },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'entry_type', label: 'Transaction Type', format: (v) => (v || '').toUpperCase() },
      { key: 'reference_no', label: 'Reference / Invoice #' },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit (PKR)' },
      { key: 'credit', label: 'Credit (PKR)' },
      { key: 'balance', label: 'Running Balance (PKR)' },
      { key: 'created_by', label: 'Logged By' },
    ]

    const selectedCustName =
      selectedCustomerId !== 'all'
        ? customers.find((c) => String(c.id) === selectedCustomerId)?.name || 'customer'
        : 'general'

    const cleanFilename = `gasora-ledger-${selectedCustName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`

    exportToCsv(filteredEntries, columns, cleanFilename)
  }

  const handleCorrectionPosted = () => {
    loadData(selectedCustomerId)
  }

  return (
    <div className="billing-container">
      {/* Header */}
      <div className="billing-header">
        <div className="billing-header-title">
          <h1>
            <span>📜</span> Financial Ledger (Append-Only)
          </h1>
          <p>
            Immutable audit trail of sales debits, payment credits, deposits, and authorized reconciling corrections with dynamic running balance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary"
            onClick={() => setCorrectionModalOpen(true)}
          >
            ⚖️ Post Correcting Entry
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleExportCsv}
            disabled={filteredEntries.length === 0}
          >
            📥 Export to CSV
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            🧾 Invoices
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/payments')}>
            💳 Payments
          </button>
        </div>
      </div>

      {/* Proposal Money Rules Banner */}
      <div
        style={{
          background: 'rgba(2, 132, 199, 0.08)',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          fontSize: 13,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div>
          <strong>Proposal Money Rules Active</strong>: The ledger is strictly append-only (no edit or delete; a mistake is fixed by a correcting entry). Payment at delivery is recorded as a separate entry, and customer balance is recomputed dynamically from entries.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Debits (Sales/Invoices)</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-danger)' }}>
            PKR {totalDebit.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Total billed to customer accounts</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Credits (Payments/Deposits)</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            PKR {totalCredit.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Total payments & credits received</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Net Balance in View</span>
          <span
            className="billing-kpi-value"
            style={{
              color: totalDebit - totalCredit > 0 ? 'var(--color-danger)' : 'var(--color-success)',
            }}
          >
            PKR {(totalDebit - totalCredit).toLocaleString()}
          </span>
          <span className="billing-kpi-sub">
            {selectedCustomerId !== 'all' ? 'Active customer balance' : 'Net portfolio receivables'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Filter Customer:</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            <option value="all">All Customers (General Ledger)</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.code || `C${c.id}`})
              </option>
            ))}
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Entry Type:</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">All Entry Types</option>
            <option value="invoice">📄 Invoices (Debits)</option>
            <option value="payment">💳 Payments (Credits)</option>
            <option value="deposit">🛡️ Security Deposits</option>
            <option value="correction">⚖️ Corrections</option>
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search description, reference #, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(selectedCustomerId !== 'all' || selectedType !== 'all' || searchQuery) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setSelectedCustomerId('all')
              setSelectedType('all')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Ledger Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading append-only financial ledger..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          title="No Ledger Records Found"
          description="No ledger transactions match the selected filters."
        />
      ) : (
        <>
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Ref / Doc #</th>
                <th>Description / Reason</th>
                <th style={{ textAlign: 'right' }}>Debit (PKR)</th>
                <th style={{ textAlign: 'right' }}>Credit (PKR)</th>
                <th style={{ textAlign: 'right' }}>Running Balance</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{e.id}</td>

                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(e.created_at).toLocaleTimeString('en-PK', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="ghost"
                      style={{ padding: 0, fontWeight: 600, textAlign: 'left' }}
                      onClick={() => onNavigate(`customers/${e.customer_id}`)}
                    >
                      {e.customer_name}
                    </button>
                  </td>

                  <td>
                    <span
                      className={`badge-status ${
                        e.entry_type === 'payment'
                          ? 'paid'
                          : e.entry_type === 'deposit'
                          ? 'partial'
                          : e.entry_type === 'correction'
                          ? 'overdue'
                          : 'unpaid'
                      }`}
                      style={{ fontSize: 11 }}
                    >
                      {e.entry_type}
                    </span>
                  </td>

                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {e.reference_no || '—'}
                  </td>

                  <td style={{ fontSize: 13 }}>
                    <div>{e.description}</div>
                    {e.reason && (
                      <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                        Reason: {e.reason}
                      </div>
                    )}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 600, color: e.debit ? 'var(--color-danger)' : undefined }}>
                    {e.debit ? Number(e.debit).toLocaleString() : '—'}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 600, color: e.credit ? 'var(--color-success)' : undefined }}>
                    {e.credit ? Number(e.credit).toLocaleString() : '—'}
                  </td>

                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      color: e.balance > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                    }}
                  >
                    {e.balance !== undefined ? Number(e.balance).toLocaleString() : '—'}
                  </td>

                  <td className="muted" style={{ fontSize: 12 }}>
                    {e.created_by || 'system'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredEntries.length / PAGE_SIZE)}
          totalItems={filteredEntries.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
        </>
      )}

      {/* Correction Modal */}
      {correctionModalOpen && (
        <LedgerCorrectionModal
          auth={auth}
          customers={customers}
          isOpen={correctionModalOpen}
          onClose={() => setCorrectionModalOpen(false)}
          onCorrectionPosted={handleCorrectionPosted}
          initialCustomerId={selectedCustomerId !== 'all' ? selectedCustomerId : null}
        />
      )}
    </div>
  )
}

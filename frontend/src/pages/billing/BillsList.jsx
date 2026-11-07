import { useEffect, useMemo, useState } from 'react'
import { getBills, getCustomers } from '../../api'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import './billing.css'
import CreateBillModal from './CreateBillModal'

export default function BillsList({ auth, onNavigate, onViewInvoice, onRecordPayment }) {
  const [bills, setBills] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchCustomer, setSearchCustomer] = useState('')

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [bList, cList] = await Promise.all([
        getBills(auth.token),
        getCustomers(auth.token),
      ])
      setBills(bList)
      setCustomers(cList)
    } catch (err) {
      setError(err.message || 'Failed to load bills')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [auth.token])

  // Filter bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Month filter
      if (selectedMonth !== 'all' && (!b.created_at || !b.created_at.startsWith(selectedMonth))) {
        return false
      }
      // Status filter
      if (selectedStatus !== 'all' && (b.status || 'unpaid').toLowerCase() !== selectedStatus.toLowerCase()) {
        return false
      }
      // Customer search
      if (searchCustomer.trim()) {
        const q = searchCustomer.toLowerCase().trim()
        const matchesName = b.customer_name && b.customer_name.toLowerCase().includes(q)
        const matchesCode = b.customer_code && b.customer_code.toLowerCase().includes(q)
        const matchesInv = b.invoice_no && b.invoice_no.toLowerCase().includes(q)
        if (!matchesName && !matchesCode && !matchesInv) return false
      }
      return true
    })
  }, [bills, selectedMonth, selectedStatus, searchCustomer])

  // KPIs
  const totalInvoiced = useMemo(
    () => filteredBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0),
    [filteredBills]
  )
  const totalCollected = useMemo(
    () => filteredBills.reduce((sum, b) => sum + (Number(b.paid_amount) || 0), 0),
    [filteredBills]
  )
  const totalOutstanding = useMemo(
    () => filteredBills.reduce((sum, b) => sum + (Number(b.balance_due) || 0), 0),
    [filteredBills]
  )

  const handleBillCreated = (newBill) => {
    setBills((prev) => [newBill, ...prev])
  }

  return (
    <div className="billing-container">
      {/* Header */}
      <div className="billing-header">
        <div className="billing-header-title">
          <h1>
            <span>🧾</span> Bills & Invoices Directory
          </h1>
          <p>
            Monthly cycle bills, direct sale invoices, payment statuses, and printable vouchers with unique invoice tracking.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={() => setCreateModalOpen(true)}>
            ➕ Issue Bill / Invoice
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/sale')}>
            ⚡ Record Direct Sale
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/payments')}>
            💳 Payments
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing/loans')}>
            📊 Debt & Loans
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Invoiced</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
            PKR {totalInvoiced.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">{filteredBills.length} invoices in view</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Collected Payments</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            PKR {totalCollected.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">
            {totalInvoiced > 0 ? `${Math.round((totalCollected / totalInvoiced) * 100)}% recovery rate` : '0%'}
          </span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Outstanding Receivables</span>
          <span
            className="billing-kpi-value"
            style={{ color: totalOutstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
          >
            PKR {totalOutstanding.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Pending customer payment</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Filter Month:</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            <option value="all">All Months</option>
            <option value="2026-03">March 2026</option>
            <option value="2026-02">February 2026</option>
            <option value="2026-01">January 2026</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Status:</label>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="paid">✓ Paid in Full</option>
            <option value="partial">◐ Partial Payment</option>
            <option value="unpaid">✗ Unpaid</option>
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search invoice number, customer name, or code..."
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(e.target.value)}
          />
        </div>

        {(selectedMonth !== 'all' || selectedStatus !== 'all' || searchCustomer) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setSelectedMonth('all')
              setSelectedStatus('all')
              setSearchCustomer('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Invoices List Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading billing invoices..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredBills.length === 0 ? (
        <EmptyState
          title="No Bills or Invoices Found"
          description="No billing records match the selected month, status, or search filters."
          action={
            <button type="button" className="primary" onClick={() => setCreateModalOpen(true)}>
              Issue New Invoice
            </button>
          }
        />
      ) : (
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date / Due</th>
                <th>Customer</th>
                <th>Items & Type</th>
                <th style={{ textAlign: 'right' }}>Total (PKR)</th>
                <th style={{ textAlign: 'right' }}>Paid (PKR)</th>
                <th style={{ textAlign: 'right' }}>Balance Due</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map((bill) => {
                const isOverdue =
                  bill.status !== 'paid' &&
                  bill.due_date &&
                  new Date(bill.due_date) < new Date()
                const itemsSummary = (bill.items || [])
                  .map((i) => `${i.quantity}x ${i.cylinder_type}`)
                  .join(', ')

                return (
                  <tr key={bill.id}>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        style={{ padding: 0, fontWeight: 700, fontFamily: 'monospace' }}
                        onClick={() => {
                          if (onViewInvoice) onViewInvoice(bill.id)
                          else onNavigate(`billing/invoice/${bill.id}`)
                        }}
                      >
                        {bill.invoice_no}
                      </button>
                    </td>

                    <td style={{ fontSize: 13 }}>
                      <div>
                        {new Date(bill.created_at).toLocaleDateString('en-PK', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Due: {bill.due_date || '—'}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600 }}>{bill.customer_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {bill.customer_code} • {bill.customer_area || 'Faisalabad'}
                      </div>
                    </td>

                    <td style={{ fontSize: 13 }}>
                      <div>{itemsSummary || '1x 11.8 kg'}</div>
                      <div className="muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {bill.bill_type ? bill.bill_type.replace('_', ' ') : 'Sale'}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {(Number(bill.total) || 0).toLocaleString()}
                    </td>

                    <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 600 }}>
                      {(Number(bill.paid_amount) || 0).toLocaleString()}
                    </td>

                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: bill.balance_due > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                      }}
                    >
                      {(Number(bill.balance_due) || 0).toLocaleString()}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge-status ${isOverdue ? 'overdue' : bill.status || 'unpaid'}`}>
                        {isOverdue ? '⚠️ Overdue' : bill.status || 'unpaid'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => {
                            if (onViewInvoice) onViewInvoice(bill.id)
                            else onNavigate(`billing/invoice/${bill.id}`)
                          }}
                          title="View and print invoice"
                        >
                          📄 View
                        </button>

                        {bill.balance_due > 0 && onRecordPayment && (
                          <button
                            type="button"
                            className="primary"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => onRecordPayment(bill)}
                            title="Record payment against this bill"
                          >
                            💳 Pay
                          </button>
                        )}

                        <a
                          href={`https://wa.me/${(bill.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Assalam-o-Alaikum ${bill.customer_name},\nHere is your Gasora LPG Invoice #${bill.invoice_no}.\nTotal: PKR ${(Number(bill.total) || 0).toLocaleString()}\nPaid: PKR ${(Number(bill.paid_amount) || 0).toLocaleString()}\nBalance Due: PKR ${(Number(bill.balance_due) || 0).toLocaleString()}\nDue Date: ${bill.due_date || 'Immediate'}\nThank you!`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary"
                          style={{ padding: '4px 8px', fontSize: 12, textDecoration: 'none' }}
                          title="Share summary via WhatsApp"
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

      {/* Create Bill Modal */}
      {createModalOpen && (
        <CreateBillModal
          auth={auth}
          customers={customers}
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onBillCreated={handleBillCreated}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { getBills, getCustomers, getLedger, getPayments, recordPayment } from '../../api'
import EmptyState from '../../components/EmptyState'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import './billing.css'

export default function PaymentsPage({ auth, onNavigate, initialBill = null }) {
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')

  // Record Payment Modal State
  const [modalOpen, setModalOpen] = useState(Boolean(initialBill))
  const [customerSearch, setCustomerSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerBills, setCustomerBills] = useState([])
  const [selectedBillId, setSelectedBillId] = useState(initialBill ? initialBill.id : '')
  const [customerBalance, setCustomerBalance] = useState(0)

  // Payment Form Inputs
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [successReceipt, setSuccessReceipt] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [pList, cList, bList] = await Promise.all([
        getPayments(auth.token),
        getCustomers(auth.token),
        getBills(auth.token),
      ])
      setPayments(pList)
      setCustomers(cList)
      setBills(bList)

      if (initialBill) {
        const cust = cList.find((c) => c.id === initialBill.customer_id)
        if (cust) {
          selectCustomer(cust, initialBill, bList)
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [auth.token])

  const selectCustomer = async (cust, billToSelect = null, allBills = bills) => {
    setSelectedCustomer(cust)
    setCustomerSearch('')
    setDropdownOpen(false)
    setFormError('')

    // Filter customer's unpaid or partial bills
    const unpaid = allBills.filter(
      (b) => b.customer_id === cust.id && b.status !== 'paid'
    )
    setCustomerBills(unpaid)

    const targetBill = billToSelect || (unpaid.length > 0 ? unpaid[0] : null)
    if (targetBill) {
      setSelectedBillId(targetBill.id)
      setAmount(targetBill.balance_due || targetBill.total || '')
    } else {
      setSelectedBillId('')
      setAmount('')
    }

    // Fetch live ledger balance
    try {
      const ledger = await getLedger(auth.token, { customer_id: cust.id })
      if (Array.isArray(ledger) && ledger.length > 0) {
        setCustomerBalance(ledger[ledger.length - 1].balance || 0)
      } else {
        setCustomerBalance(-(cust.deposit || 0))
      }
    } catch {
      setCustomerBalance(0)
    }
  }

  // Filter customers for dropdown
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return []
    const q = customerSearch.toLowerCase().trim()
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q))
      )
      .slice(0, 6)
  }, [customers, customerSearch])

  // Selected bill object
  const activeBill = useMemo(() => {
    if (!selectedBillId) return null
    return bills.find((b) => b.id === Number(selectedBillId)) || null
  }, [bills, selectedBillId])

  // Live balance calculations
  const numAmount = Number(amount) || 0
  const billBalanceAfter = activeBill
    ? Math.max(0, (activeBill.balance_due || activeBill.total) - numAmount)
    : 0
  const customerBalanceAfter = customerBalance - numAmount

  // Handle bill change in dropdown
  const handleBillSelect = (billId) => {
    setSelectedBillId(billId)
    if (!billId) {
      setAmount('')
      return
    }
    const b = bills.find((item) => item.id === Number(billId))
    if (b) {
      setAmount(b.balance_due || b.total || '')
    }
  }

  // Submit payment
  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!selectedCustomer) {
      setFormError('Please select a customer')
      return
    }

    if (numAmount <= 0) {
      setFormError('Payment amount must be greater than PKR 0')
      return
    }

    setSubmitting(true)
    try {
      const res = await recordPayment(auth.token, {
        customer_id: selectedCustomer.id,
        bill_id: selectedBillId ? Number(selectedBillId) : undefined,
        amount: numAmount,
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      setSuccessReceipt(res)
      setPayments((prev) => [res.payment, ...prev])

      // Refresh bills list
      const refreshedBills = await getBills(auth.token)
      setBills(refreshedBills)
    } catch (err) {
      setFormError(err.message || 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  const resetModal = () => {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setSelectedBillId('')
    setAmount('')
    setPaymentMethod('Cash')
    setReference('')
    setNotes('')
    setFormError('')
    setSuccessReceipt(null)
    setModalOpen(false)
  }

  // Filter payments table
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (methodFilter !== 'all' && (p.payment_method || 'cash').toLowerCase() !== methodFilter.toLowerCase()) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchRec = p.receipt_no && p.receipt_no.toLowerCase().includes(q)
        const matchCust = p.customer_name && p.customer_name.toLowerCase().includes(q)
        const matchInv = p.invoice_no && p.invoice_no.toLowerCase().includes(q)
        const matchRef = p.reference && p.reference.toLowerCase().includes(q)
        if (!matchRec && !matchCust && !matchInv && !matchRef) return false
      }
      return true
    })
  }, [payments, methodFilter, searchQuery])

  // KPIs
  const totalReceived = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments]
  )
  const cashTotal = useMemo(
    () => payments.filter((p) => p.payment_method === 'Cash').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments]
  )
  const digitalTotal = totalReceived - cashTotal

  return (
    <div className="billing-container">
      {/* Header */}
      <div className="billing-header">
        <div className="billing-header-title">
          <h1>
            <span>💳</span> Payment Collection & Receipts
          </h1>
          <p>
            Record partial or full payments against invoices or general customer accounts. Every payment generates a unique receipt and updates the append-only ledger.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setSuccessReceipt(null)
              setModalOpen(true)
            }}
          >
            ➕ Record Payment
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            🧾 Bills Directory
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('ledger')}>
            📋 Financial Ledger
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Collections</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            PKR {totalReceived.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">{payments.length} verified payment receipts</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Cash Collections</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
            PKR {cashTotal.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Driver & depot counter cash</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Digital & Bank Transfers</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-accent)' }}>
            PKR {digitalTotal.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">Bank, JazzCash, EasyPaisa, Cheque</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Method:</label>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">All Methods</option>
            <option value="cash">💵 Cash</option>
            <option value="bank transfer">🏦 Bank Transfer</option>
            <option value="jazzcash">📱 JazzCash</option>
            <option value="easypaisa">📱 EasyPaisa</option>
            <option value="cheque">📜 Cheque</option>
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search receipt #, customer name, invoice #, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(methodFilter !== 'all' || searchQuery) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setMethodFilter('all')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Payments Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading payment records..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          title="No Payment Records Found"
          description="No customer payments match your search filter."
          action={
            <button type="button" className="primary" onClick={() => setModalOpen(true)}>
              Record First Payment
            </button>
          }
        />
      ) : (
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Invoice Ref</th>
                <th>Payment Method</th>
                <th>Reference / Cheque</th>
                <th style={{ textAlign: 'right' }}>Amount Paid (PKR)</th>
                <th>Received By</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="code-badge" style={{ fontWeight: 700 }}>
                      {p.receipt_no}
                    </span>
                  </td>

                  <td style={{ fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>

                  <td>
                    <div style={{ fontWeight: 600 }}>{p.customer_name}</div>
                  </td>

                  <td>
                    {p.invoice_no ? (
                      <button
                        type="button"
                        className="ghost"
                        style={{ padding: 0, fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}
                        onClick={() => onNavigate(`billing/invoice/${p.bill_id}`)}
                      >
                        {p.invoice_no}
                      </button>
                    ) : (
                      <span className="muted">General Account</span>
                    )}
                  </td>

                  <td>
                    <span className="badge-active" style={{ fontSize: 11 }}>
                      {p.payment_method || 'Cash'}
                    </span>
                  </td>

                  <td className="muted" style={{ fontSize: 12 }}>
                    {p.reference || '—'}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)', fontSize: 15 }}>
                    {(Number(p.amount) || 0).toLocaleString()}
                  </td>

                  <td className="muted" style={{ fontSize: 12 }}>
                    {p.created_by || 'system'}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => onNavigate(`customers/${p.customer_id}`)}
                      title="View Customer Profile"
                    >
                      👤 Account
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={resetModal}
          title="Record Customer Payment"
          maxWidth={760}
        >
          {successReceipt ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: '#f0fdf4',
                  border: '2px solid var(--color-success)',
                  borderRadius: 'var(--radius-md)',
                  padding: 20,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 40 }}>✅</span>
                <h3 style={{ margin: '8px 0 4px 0', color: 'var(--color-success)' }}>
                  Payment Recorded Successfully!
                </h3>
                <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 700 }}>
                  Receipt #{successReceipt.receipt_no}
                </div>
                <div style={{ fontSize: 14, color: '#334155', marginTop: 8 }}>
                  Amount Paid:{' '}
                  <strong style={{ color: 'var(--color-success)', fontSize: 16 }}>
                    PKR {Number(successReceipt.payment.amount).toLocaleString()}
                  </strong>
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  Customer Balance After Payment:{' '}
                  <strong
                    style={{
                      color:
                        successReceipt.customer_balance > 0
                          ? 'var(--color-danger)'
                          : 'var(--color-success)',
                    }}
                  >
                    PKR {successReceipt.customer_balance.toLocaleString()}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSuccessReceipt(null)
                    setAmount('')
                    setReference('')
                  }}
                >
                  ➕ Record Another Payment
                </button>
                <button type="button" className="primary" onClick={resetModal}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePaymentSubmit}>
              {formError && (
                <div className="error banner" style={{ marginBottom: 14 }}>
                  ⚠️ {formError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Customer Selector */}
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Customer Account <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>

                  {selectedCustomer ? (
                    <div className="customer-selected-card">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="code-badge">{selectedCustomer.code}</span>
                          <strong>{selectedCustomer.name}</strong>
                          <span className="muted" style={{ fontSize: 12 }}>({selectedCustomer.area})</span>
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>
                          Current Total Balance:{' '}
                          <strong
                            style={{
                              color:
                                customerBalance > 0
                                  ? 'var(--color-danger)'
                                  : 'var(--color-success)',
                            }}
                          >
                            PKR {customerBalance.toLocaleString()}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          setSelectedCustomer(null)
                          setCustomerBills([])
                          setSelectedBillId('')
                        }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="customer-search-container">
                      <input
                        type="text"
                        placeholder="Search customer name, phone, or code..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value)
                          setDropdownOpen(true)
                        }}
                        onFocus={() => setDropdownOpen(true)}
                      />
                      {dropdownOpen && customerSearch.trim().length > 0 && (
                        <div className="customer-search-dropdown">
                          {filteredCustomers.length === 0 ? (
                            <div style={{ padding: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                              No matching customer found
                            </div>
                          ) : (
                            filteredCustomers.map((c) => (
                              <div
                                key={c.id}
                                className="customer-search-item"
                                onClick={() => selectCustomer(c)}
                              >
                                <span>
                                  <strong>{c.name}</strong> ({c.code})
                                </span>
                                <span className="code-badge" style={{ fontSize: 11 }}>{c.phone}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bill Selector */}
                {selectedCustomer && (
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Apply Payment To:
                    </label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => handleBillSelect(e.target.value)}
                    >
                      <option value="">General On Account (No specific invoice)</option>
                      {customerBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.invoice_no} — Total: PKR {b.total.toLocaleString()} (Due: PKR {(b.balance_due || b.total).toLocaleString()})
                        </option>
                      ))}
                    </select>
                    {customerBills.length === 0 && (
                      <span className="muted" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        Customer has no unpaid/partial invoices. Payment will be credited on account.
                      </span>
                    )}
                  </div>
                )}

                {/* Amount & Method */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Amount Received (PKR) <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="50"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 15000"
                      required
                    />
                    {activeBill && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => setAmount(activeBill.balance_due || activeBill.total)}
                        >
                          Pay Full Due
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => setAmount(Math.round((activeBill.balance_due || activeBill.total) / 2))}
                        >
                          Pay 50%
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="Cash">💵 Cash</option>
                      <option value="Bank Transfer">🏦 Bank Transfer</option>
                      <option value="JazzCash">📱 JazzCash</option>
                      <option value="EasyPaisa">📱 EasyPaisa</option>
                      <option value="Cheque">📜 Cheque</option>
                    </select>
                  </div>
                </div>

                {/* Reference & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Reference / Cheque #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HBL Cheque #123456 / Cash receipt"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Remarks / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="Received at counter / driver collection..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Live Balance Impact Preview Card */}
                {selectedCustomer && numAmount > 0 && (
                  <div
                    style={{
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      📊 Balance Impact Preview
                    </div>
                    {activeBill && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Invoice #{activeBill.invoice_no} Balance After:</span>
                        <strong style={{ color: billBalanceAfter > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          PKR {billBalanceAfter.toLocaleString()}
                        </strong>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Total Customer Balance After Payment:</span>
                      <strong style={{ color: customerBalanceAfter > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        PKR {customerBalanceAfter.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="secondary" onClick={resetModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={submitting || !selectedCustomer}>
                  {submitting ? <Spinner size="sm" message="Recording payment..." /> : '💳 Post Payment & Issue Receipt'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}

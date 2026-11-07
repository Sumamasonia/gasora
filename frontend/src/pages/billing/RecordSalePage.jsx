import { useEffect, useMemo, useState } from 'react'
import { getCustomers, getLedger, recordSale } from '../../api'
import Spinner from '../../components/Spinner'
import './billing.css'

const STANDARD_PRICES = {
  '11.8 kg': 3100,
  '15 kg': 3800,
  '45.4 kg': 10500,
}

export default function RecordSalePage({ auth, onNavigate, initialCustomerId = null }) {
  const [customers, setCustomers] = useState([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [customerSearch, setCustomerSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerBalance, setCustomerBalance] = useState(0)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Form inputs
  const [cylinderType, setCylinderType] = useState('11.8 kg')
  const [cylindersDelivered, setCylindersDelivered] = useState(1)
  const [emptiesReceived, setEmptiesReceived] = useState(1)
  const [pricePerCylinder, setPricePerCylinder] = useState(STANDARD_PRICES['11.8 kg'])
  const [paymentAtDelivery, setPaymentAtDelivery] = useState(STANDARD_PRICES['11.8 kg'])
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saleResult, setSaleResult] = useState(null)

  // Load customer directory
  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoadingCustomers(true)
        const list = await getCustomers(auth.token)
        if (active) {
          setCustomers(list)
          if (initialCustomerId) {
            const found = list.find((c) => c.id === Number(initialCustomerId))
            if (found) selectCustomer(found)
          }
        }
      } catch (err) {
        if (active) setError(err.message || 'Failed to load customers')
      } finally {
        if (active) setLoadingCustomers(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [auth.token, initialCustomerId])

  // Select customer and prefill defaults
  const selectCustomer = async (cust) => {
    setSelectedCustomer(cust)
    setCustomerSearch('')
    setDropdownOpen(false)
    setError('')

    const type = cust.cylinder_type || '11.8 kg'
    const demand = cust.demand || 1
    const price = STANDARD_PRICES[type] || 3100
    const total = demand * price

    setCylinderType(type)
    setCylindersDelivered(demand)
    setEmptiesReceived(demand)
    setPricePerCylinder(price)
    setPaymentAtDelivery(total)

    // Fetch live ledger balance
    try {
      setLoadingBalance(true)
      const ledger = await getLedger(auth.token, { customer_id: cust.id })
      if (Array.isArray(ledger) && ledger.length > 0) {
        const last = ledger[ledger.length - 1]
        setCustomerBalance(last.balance || 0)
      } else {
        setCustomerBalance(-(cust.deposit || 0))
      }
    } catch {
      setCustomerBalance(0)
    } finally {
      setLoadingBalance(false)
    }
  }

  // Handle cylinder type change -> update price
  const handleTypeChange = (e) => {
    const newType = e.target.value
    setCylinderType(newType)
    const newPrice = STANDARD_PRICES[newType] || 3100
    setPricePerCylinder(newPrice)
    setPaymentAtDelivery((Number(cylindersDelivered) || 1) * newPrice)
  }

  // Filter customers for autocomplete
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return []
    const q = customerSearch.toLowerCase().trim()
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.area && c.area.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [customers, customerSearch])

  // Live financial calculations
  const numDelivered = Number(cylindersDelivered) || 0
  const numPrice = Number(pricePerCylinder) || 0
  const subtotal = numDelivered * numPrice
  const numPaid = Number(paymentAtDelivery) || 0
  const balanceAdded = Math.max(0, subtotal - numPaid)
  const projectedBalance = customerBalance + balanceAdded

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!selectedCustomer) {
      setError('Please select a customer to record the sale')
      return
    }

    if (numDelivered <= 0) {
      setError('Cylinders delivered must be at least 1')
      return
    }

    if (numPrice < 0) {
      setError('Price per cylinder cannot be negative')
      return
    }

    if (Number(emptiesReceived) < 0) {
      setError('Empties received cannot be negative')
      return
    }

    if (numPaid < 0) {
      setError('Payment at delivery cannot be negative')
      return
    }

    setSubmitting(true)
    try {
      const res = await recordSale(auth.token, {
        customer_id: selectedCustomer.id,
        cylinders_delivered: numDelivered,
        empties_received: Number(emptiesReceived) || 0,
        price_per_cylinder: numPrice,
        payment_at_delivery: numPaid,
        cylinder_type: cylinderType,
        payment_method: numPaid > 0 ? paymentMethod : undefined,
        payment_reference: numPaid > 0 && paymentReference ? paymentReference : undefined,
        notes: notes.trim() || undefined,
      })

      setSaleResult(res)
    } catch (err) {
      setError(err.message || 'Failed to record sale')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCylinderType('11.8 kg')
    setCylindersDelivered(1)
    setEmptiesReceived(1)
    setPricePerCylinder(STANDARD_PRICES['11.8 kg'])
    setPaymentAtDelivery(STANDARD_PRICES['11.8 kg'])
    setPaymentMethod('Cash')
    setPaymentReference('')
    setNotes('')
    setError('')
    setSaleResult(null)
  }

  return (
    <div className="billing-container">
      {/* Header */}
      <div className="billing-header">
        <div className="billing-header-title">
          <h1>
            <span>🔥</span> Record Direct Sale, Fill & Delivery
          </h1>
          <p>
            Atomic transaction: simultaneously updates physical cylinders, central stock, customer bill, and append-only financial ledger.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            ← Back to Bills
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('ledger')}>
            💳 View Ledger
          </button>
        </div>
      </div>

      {/* Success State Card */}
      {saleResult ? (
        <div className="billing-preview-card" style={{ borderColor: 'var(--color-success)', background: '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>✅</span>
            <div>
              <h2 style={{ margin: '0 0 4px 0', color: 'var(--color-success)', fontSize: 22 }}>
                Sale & Delivery Successfully Recorded!
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Invoice <strong>#{saleResult.invoice_no}</strong> issued for {saleResult.customer_name}.
              </p>
            </div>
          </div>

          <div className="billing-kpi-grid" style={{ marginTop: 12 }}>
            <div className="billing-kpi-card">
              <span className="billing-kpi-label">Invoice Number</span>
              <span className="billing-kpi-value" style={{ fontSize: 20 }}>
                {saleResult.invoice_no}
              </span>
              <span className="billing-kpi-sub">Unique bill identifier</span>
            </div>
            <div className="billing-kpi-card">
              <span className="billing-kpi-label">Gross Sale Total</span>
              <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
                PKR {saleResult.total_amount.toLocaleString()}
              </span>
              <span className="billing-kpi-sub">{saleResult.cylinders_delivered}x {saleResult.cylinder_type}</span>
            </div>
            <div className="billing-kpi-card">
              <span className="billing-kpi-label">Payment at Delivery</span>
              <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
                PKR {saleResult.payment_at_delivery.toLocaleString()}
              </span>
              <span className="billing-kpi-sub">
                {saleResult.payment ? `Rec #${saleResult.payment.receipt_no}` : 'No payment collected'}
              </span>
            </div>
            <div className="billing-kpi-card">
              <span className="billing-kpi-label">New Customer Balance</span>
              <span
                className="billing-kpi-value"
                style={{ color: saleResult.customer_balance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
              >
                PKR {saleResult.customer_balance.toLocaleString()}
              </span>
              <span className="billing-kpi-sub">
                {saleResult.customer_balance > 0 ? 'Outstanding customer debt' : 'Zero debt / in credit'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <button
              type="button"
              className="primary"
              onClick={() => onNavigate(`billing/invoice/${saleResult.sale_id}`)}
            >
              📄 View & Print Invoice
            </button>
            <a
              href={`https://wa.me/${(selectedCustomer?.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `Assalam-o-Alaikum ${saleResult.customer_name},\nYour Gasora LPG delivery invoice #${saleResult.invoice_no} is confirmed.\nQuantity: ${saleResult.cylinders_delivered}x ${saleResult.cylinder_type}\nTotal: PKR ${saleResult.total_amount.toLocaleString()}\nPaid at delivery: PKR ${saleResult.payment_at_delivery.toLocaleString()}\nBalance: PKR ${saleResult.balance_due.toLocaleString()}\nThank you for choosing Gasora!`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              💬 Share on WhatsApp
            </a>
            <button type="button" className="secondary" onClick={resetForm}>
              ➕ Record Another Sale
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate('billing')}>
              🧾 Go to All Bills
            </button>
          </div>
        </div>
      ) : (
        /* Form & Live Financial Preview */
        <div className="billing-split-layout">
          {/* Left Column: Form */}
          <form onSubmit={handleSubmit} className="billing-form-card">
            {error && (
              <div className="error banner" style={{ margin: 0 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Step 1: Customer Search & Selection */}
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                1. Select Customer <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>

              {selectedCustomer ? (
                <div className="customer-selected-card">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="code-badge">{selectedCustomer.code || `C${selectedCustomer.id}`}</span>
                      <strong style={{ fontSize: 16 }}>{selectedCustomer.name}</strong>
                      <span className="badge-active" style={{ fontSize: 11 }}>
                        {selectedCustomer.customer_type === 'commercial' ? '🏢 Commercial' : '🏠 Domestic'}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      📍 {selectedCustomer.area || 'Faisalabad'} • 📞 {selectedCustomer.phone} • Standard: {selectedCustomer.cylinder_type}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      Security Deposit: <strong>PKR {(selectedCustomer.deposit || 0).toLocaleString()}</strong> •{' '}
                      Current Balance:{' '}
                      <strong style={{ color: customerBalance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {loadingBalance ? 'calculating...' : `PKR ${customerBalance.toLocaleString()}`}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 13 }}
                    onClick={() => {
                      setSelectedCustomer(null)
                      setCustomerSearch('')
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="customer-search-container">
                  <input
                    type="text"
                    placeholder="Search by customer name, phone, area, or code (e.g., Al-Madina, 0300...)"
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
                        <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                          No customers found matching &quot;{customerSearch}&quot;
                        </div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <div
                            key={c.id}
                            className="customer-search-item"
                            onClick={() => selectCustomer(c)}
                          >
                            <div>
                              <strong>{c.name}</strong>
                              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                                {c.code || `C${c.id}`} • {c.area || 'Faisalabad'}
                              </span>
                            </div>
                            <span className="code-badge" style={{ fontSize: 11 }}>
                              {c.phone}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {loadingCustomers && <span className="muted" style={{ fontSize: 12 }}>Loading customer list...</span>}
                </div>
              )}
            </div>

            {/* Step 2: Cylinders & Quantities */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Cylinder Specification
                </label>
                <select value={cylinderType} onChange={handleTypeChange}>
                  <option value="11.8 kg">11.8 kg (Domestic Refill)</option>
                  <option value="15 kg">15 kg (Commercial Refill)</option>
                  <option value="45.4 kg">45.4 kg (Industrial Refill)</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Cylinders Delivered <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={cylindersDelivered}
                  onChange={(e) => {
                    const val = e.target.value
                    setCylindersDelivered(val)
                    const n = Number(val) || 0
                    setPaymentAtDelivery(n * pricePerCylinder)
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Empties Received (Collected)
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={emptiesReceived}
                    onChange={(e) => setEmptiesReceived(e.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: '0 10px', fontSize: 12 }}
                    title="Match delivered count"
                    onClick={() => setEmptiesReceived(cylindersDelivered)}
                  >
                    Match
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3: Pricing & Delivery Payment */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Price per Cylinder (PKR) <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={pricePerCylinder}
                  onChange={(e) => {
                    const p = Number(e.target.value) || 0
                    setPricePerCylinder(e.target.value)
                    setPaymentAtDelivery(numDelivered * p)
                  }}
                  required
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Standard rate: PKR {STANDARD_PRICES[cylinderType]?.toLocaleString()}
                </span>
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Payment at Delivery (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={paymentAtDelivery}
                  onChange={(e) => setPaymentAtDelivery(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setPaymentAtDelivery(subtotal)}
                  >
                    Paid in Full
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setPaymentAtDelivery(0)}
                  >
                    On Credit (PKR 0)
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={numPaid === 0}
                >
                  <option value="Cash">💵 Cash</option>
                  <option value="Bank Transfer">🏦 Bank Transfer</option>
                  <option value="JazzCash">📱 JazzCash</option>
                  <option value="EasyPaisa">📱 EasyPaisa</option>
                  <option value="Cheque">📜 Cheque</option>
                </select>
              </div>
            </div>

            {numPaid > 0 && (
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Payment Reference / Challan No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash collected by driver / Bank ref #12345"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            )}

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Sale & Delivery Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Special instructions, gate pass info, or cylinder verification note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <button type="button" className="ghost" onClick={resetForm} disabled={submitting}>
                Reset
              </button>
              <button type="submit" className="primary" disabled={submitting || !selectedCustomer}>
                {submitting ? <Spinner size="sm" message="Recording sale & ledger..." /> : '✅ Confirm Sale & Post to Ledger'}
              </button>
            </div>
          </form>

          {/* Right Column: Live Financial Preview Card */}
          <div className="billing-preview-sticky">
            <div className="billing-preview-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="preview-badge">⚡ Live Transaction Preview</span>
                <span className="code-badge" style={{ fontSize: 12 }}>
                  {cylinderType}
                </span>
              </div>

              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Customer Account</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedCustomer ? selectedCustomer.name : 'No customer selected'}
                </div>
                {selectedCustomer && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {selectedCustomer.code} • {selectedCustomer.area}
                  </div>
                )}
              </div>

              <table className="preview-line-items">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>LPG Refill ({cylinderType})</td>
                    <td style={{ textAlign: 'center' }}>{numDelivered}</td>
                    <td style={{ textAlign: 'right' }}>PKR {numPrice.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>PKR {subtotal.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>Empties Returned</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{emptiesReceived || 0}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>0</td>
                  </tr>
                </tbody>
              </table>

              <div className="preview-total-row">
                <span>Gross Sale Value:</span>
                <span style={{ fontWeight: 600 }}>PKR {subtotal.toLocaleString()}</span>
              </div>

              <div className="preview-total-row">
                <span>Payment at Delivery:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                  - PKR {numPaid.toLocaleString()}
                </span>
              </div>

              <div className="preview-total-row grand-total">
                <span>Balance Added to Debt:</span>
                <span style={{ color: balanceAdded > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  PKR {balanceAdded.toLocaleString()}
                </span>
              </div>

              <div
                style={{
                  background: 'var(--bg-subtle)',
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="muted">Current Balance:</span>
                  <span>PKR {customerBalance.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Projected New Balance:</span>
                  <span style={{ color: projectedBalance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    PKR {projectedBalance.toLocaleString()}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                💡 <strong>Proposal Rule</strong>: Ledger is strictly append-only. Submitting creates a Debit entry for the sale and an independent Credit entry for payment at delivery.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

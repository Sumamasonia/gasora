import { useMemo, useState } from 'react'
import { createBill } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

const STANDARD_PRICES = {
  '11.8 kg': 3100,
  '15 kg': 3800,
  '45.4 kg': 10500,
}

export default function CreateBillModal({ auth, customers = [], isOpen, onClose, onBillCreated }) {
  const [customerSearch, setCustomerSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [billType, setBillType] = useState('monthly')
  const [periodMonth, setPeriodMonth] = useState('2026-03')
  const [periodStart, setPeriodStart] = useState('2026-03-01')
  const [periodEnd, setPeriodEnd] = useState('2026-03-31')

  const [items, setItems] = useState([
    { id: 1, cylinder_type: '11.8 kg', quantity: 2, unit_price: 3100 },
  ])
  const [paidAmount, setPaidAmount] = useState(0)
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 15)
    return d.toISOString().split('T')[0]
  })
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

  const selectCustomer = (c) => {
    setSelectedCustomer(c)
    setCustomerSearch('')
    setDropdownOpen(false)
    const type = c.cylinder_type || '11.8 kg'
    const qty = c.demand || 2
    const price = STANDARD_PRICES[type] || 3100
    setItems([{ id: 1, cylinder_type: type, quantity: qty, unit_price: price }])
  }

  // Item management
  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev]
      const updated = { ...copy[index], [field]: value }
      if (field === 'cylinder_type') {
        updated.unit_price = STANDARD_PRICES[value] || 3100
      }
      copy[index] = updated
      return copy
    })
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now(), cylinder_type: '11.8 kg', quantity: 1, unit_price: 3100 },
    ])
  }

  const removeItem = (index) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Live calculations
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  )
  const total = subtotal
  const numPaid = Number(paidAmount) || 0
  const balanceDue = Math.max(0, total - numPaid)
  const status = numPaid >= total ? 'paid' : numPaid > 0 ? 'partial' : 'unpaid'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!selectedCustomer) {
      setError('Please select a customer for this invoice')
      return
    }

    if (items.length === 0) {
      setError('Invoice must have at least one line item')
      return
    }

    for (const [idx, item] of items.entries()) {
      if (!Number(item.quantity) || Number(item.quantity) <= 0) {
        setError(`Item #${idx + 1}: Quantity must be greater than 0`)
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        bill_type: billType,
        period_month: billType === 'monthly' ? periodMonth : undefined,
        period_start: billType === 'custom' ? periodStart : undefined,
        period_end: billType === 'custom' ? periodEnd : undefined,
        items: items.map((i) => ({
          cylinder_type: i.cylinder_type,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        })),
        paid_amount: numPaid,
        due_date: dueDate,
        notes: notes.trim() || undefined,
      }

      const newBill = await createBill(auth.token, payload)
      onBillCreated(newBill)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create bill')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Issue Billing Invoice" maxWidth={860}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error banner" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

        <div className="billing-split-layout" style={{ gap: 18 }}>
          {/* Form Side */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Customer Search */}
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Customer Account <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>

              {selectedCustomer ? (
                <div className="customer-selected-card">
                  <div>
                    <strong>{selectedCustomer.name}</strong> ({selectedCustomer.code})
                    <div className="muted" style={{ fontSize: 12 }}>
                      📍 {selectedCustomer.area || 'Faisalabad'} • 📞 {selectedCustomer.phone}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => setSelectedCustomer(null)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="customer-search-container">
                  <input
                    type="text"
                    placeholder="Search customer name or phone..."
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
                          No matching customer
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

            {/* Bill Type & Period */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Billing Cycle</label>
                <select value={billType} onChange={(e) => setBillType(e.target.value)}>
                  <option value="monthly">Monthly Cycle Bill</option>
                  <option value="custom">Custom Date Range</option>
                  <option value="direct">Single Batch Invoice</option>
                </select>
              </div>

              {billType === 'monthly' ? (
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Select Month</label>
                  <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)}>
                    <option value="2026-03">March 2026</option>
                    <option value="2026-02">February 2026</option>
                    <option value="2026-01">January 2026</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Date Range</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontWeight: 600, margin: 0 }}>Cylinder Line Items</label>
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={addItem}
                >
                  + Add Item
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.8fr 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <select
                      value={item.cylinder_type}
                      onChange={(e) => updateItem(idx, 'cylinder_type', e.target.value)}
                    >
                      <option value="11.8 kg">11.8 kg</option>
                      <option value="15 kg">15 kg</option>
                      <option value="45.4 kg">45.4 kg</option>
                    </select>

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    />

                    <input
                      type="number"
                      min="0"
                      step="50"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                    />

                    {items.length > 1 && (
                      <button
                        type="button"
                        className="ghost"
                        style={{ color: 'var(--color-danger)', padding: 4 }}
                        onClick={() => removeItem(idx)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment & Due Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Initial Payment (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Payment Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Invoice Notes</label>
              <textarea
                rows={2}
                placeholder="Payment terms, delivery reference, or bank details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Live Preview Card */}
          <div>
            <div className="billing-preview-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="preview-badge">Live Invoice Preview</span>
                <span className={`badge-status ${status}`}>{status}</span>
              </div>

              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>INVOICE TO</div>
                <strong style={{ fontSize: 15 }}>{selectedCustomer ? selectedCustomer.name : 'Select customer...'}</strong>
                {selectedCustomer && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {selectedCustomer.area} • {selectedCustomer.phone}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Billing Period:</span>
                <span>{billType === 'monthly' ? periodMonth : `${periodStart} to ${periodEnd}`}</span>
              </div>

              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Payment Due:</span>
                <span>{dueDate}</span>
              </div>

              <table className="preview-line-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>{it.cylinder_type} Refill</td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        PKR {((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="preview-total-row">
                <span>Subtotal:</span>
                <span>PKR {subtotal.toLocaleString()}</span>
              </div>

              <div className="preview-total-row">
                <span>Paid Now:</span>
                <span style={{ color: 'var(--color-success)' }}>- PKR {numPaid.toLocaleString()}</span>
              </div>

              <div className="preview-total-row grand-total">
                <span>Balance Due:</span>
                <span style={{ color: balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  PKR {balanceDue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={submitting || !selectedCustomer}>
            {submitting ? <Spinner size="sm" message="Generating invoice..." /> : '📄 Issue & Post Invoice'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

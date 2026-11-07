import { useEffect, useMemo, useState } from 'react'
import { createLedgerCorrection, getLedger } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

export default function LedgerCorrectionModal({
  auth,
  customers = [],
  isOpen,
  onClose,
  onCorrectionPosted,
  initialCustomerId = null,
}) {
  const [customerSearch, setCustomerSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerBalance, setCustomerBalance] = useState(0)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Form inputs
  const [correctionType, setCorrectionType] = useState('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [referenceNo, setReferenceNo] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialCustomerId && customers.length > 0) {
      const found = customers.find((c) => c.id === Number(initialCustomerId))
      if (found) selectCustomer(found)
    }
  }, [initialCustomerId, customers])

  const selectCustomer = async (cust) => {
    setSelectedCustomer(cust)
    setCustomerSearch('')
    setDropdownOpen(false)
    setError('')

    try {
      setLoadingBalance(true)
      const ledger = await getLedger(auth.token, { customer_id: cust.id })
      if (Array.isArray(ledger) && ledger.length > 0) {
        setCustomerBalance(ledger[ledger.length - 1].balance || 0)
      } else {
        setCustomerBalance(-(cust.deposit || 0))
      }
    } catch {
      setCustomerBalance(0)
    } finally {
      setLoadingBalance(false)
    }
  }

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

  // Projected balance calculation
  const numAmount = Number(amount) || 0
  const projectedBalance =
    correctionType === 'credit'
      ? customerBalance - numAmount
      : customerBalance + numAmount

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!selectedCustomer) {
      setError('Please select a customer for the correction')
      return
    }

    if (!reason.trim()) {
      setError('Reason is strictly required for ledger audit integrity')
      return
    }

    if (numAmount <= 0) {
      setError('Correction amount must be greater than PKR 0')
      return
    }

    setSubmitting(true)
    try {
      const res = await createLedgerCorrection(auth.token, {
        customer_id: selectedCustomer.id,
        reason: reason.trim(),
        correction_type: correctionType,
        amount: numAmount,
        reference_no: referenceNo.trim() || undefined,
      })

      onCorrectionPosted(res)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to post correction')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Post Ledger Correcting Entry"
      maxWidth={680}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          ⚠️ <strong>Append-Only Accounting Rule</strong>: Historical ledger entries cannot be edited or deleted. A correcting entry appends an auditable reversing or adjusting line item to the immutable ledger.
        </div>

        {error && <div className="error banner" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer Selection */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Customer Account <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>

            {selectedCustomer ? (
              <div className="customer-selected-card">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="code-badge">{selectedCustomer.code}</span>
                    <strong>{selectedCustomer.name}</strong>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Current Ledger Balance:{' '}
                    <strong
                      style={{
                        color:
                          customerBalance > 0
                            ? 'var(--color-danger)'
                            : 'var(--color-success)',
                      }}
                    >
                      {loadingBalance ? 'calculating...' : `PKR ${customerBalance.toLocaleString()}`}
                    </strong>
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

          {/* Correction Direction & Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Correction Type <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <select
                value={correctionType}
                onChange={(e) => setCorrectionType(e.target.value)}
              >
                <option value="credit">Credit Adjustment (Reduces Customer Debt)</option>
                <option value="debit">Debit Adjustment (Increases Customer Debt)</option>
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Adjustment Amount (PKR) <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                step="50"
                placeholder="e.g. 3100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Audit Reason (Strictly Required) */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Correction Reason (Required for Audit Trail) <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <textarea
              rows={2}
              placeholder="Explicit explanation for this adjustment (e.g., Refund for damaged valve cylinder replacement approved by Owner)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Related Reference / Original Document # (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. INV-2026-0004 / Challan #104"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>

          {/* Live Balance Impact Preview */}
          {selectedCustomer && numAmount > 0 && (
            <div
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Current Balance:</span>
                <span>PKR {customerBalance.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Adjustment:</span>
                <span style={{ color: correctionType === 'credit' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                  {correctionType === 'credit' ? '-' : '+'} PKR {numAmount.toLocaleString()} ({correctionType.toUpperCase()})
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 6,
                  marginTop: 4,
                }}
              >
                <span>New Recomputed Balance:</span>
                <span style={{ color: projectedBalance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  PKR {projectedBalance.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={submitting || !selectedCustomer || !reason.trim() || numAmount <= 0}
          >
            {submitting ? <Spinner size="sm" message="Posting entry..." /> : '⚖️ Post Correcting Entry'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createMyRequest,
  getMyBalance,
  getMyBills,
  getMyDeliveryStatus,
  getMyNextDelivery,
  getMyOrders,
} from '../../api'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import DeliveryStatusPage from './DeliveryStatusPage'
import './customer.css'

export default function CustomerApp({ auth, onSignOut, onExpired }) {
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'track' | 'request' | 'orders' | 'bills'
  const [balance, setBalance] = useState(null)
  const [nextDelivery, setNextDelivery] = useState(null)
  const [deliveryStatus, setDeliveryStatus] = useState(null)
  const [orders, setOrders] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successToast, setSuccessToast] = useState('')

  // Form state for Place Request
  const [requestType, setRequestType] = useState('normal') // 'normal' | 'urgent'
  const [cylinders, setCylinders] = useState(3)
  const [requestNote, setRequestNote] = useState('')

  // Invoice view modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  // Theme preference
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('gasora-theme') || 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('gasora-theme', theme)
    } catch (err) {
      console.warn('Could not save theme:', err)
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  // Load customer profile, balance, next delivery, orders, and bills
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [bal, nextDel, delStat, ords, bls] = await Promise.all([
        getMyBalance(auth.token),
        getMyNextDelivery(auth.token),
        getMyDeliveryStatus(auth.token),
        getMyOrders(auth.token),
        getMyBills(auth.token),
      ])
      setBalance(bal)
      setNextDelivery(nextDel)
      setDeliveryStatus(delStat)
      setOrders(ords || [])
      setBills(bls || [])
      if (bal?.cylinder_type) {
        // default cylinders count if available
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onExpired()
      } else {
        setError(err.message || 'Failed to load customer data')
      }
    } finally {
      setLoading(false)
    }
  }, [auth.token, onExpired])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle submitting a refill request
  const handlePlaceRequest = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await createMyRequest(auth.token, {
        request_type: requestType,
        cylinders: Number(cylinders),
        note: requestNote.trim(),
      })
      setSuccessToast(
        requestType === 'urgent'
          ? `🚨 Urgent refill request #${res.request_no} submitted with highest priority!`
          : `✓ Refill request #${res.request_no} received successfully.`
      )
      setTimeout(() => setSuccessToast(''), 4500)
      setRequestNote('')
      // Refresh data
      await loadData()
      setActiveTab('orders')
    } catch (err) {
      setError(err.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="customer-app-wrapper">
      {/* Top Mobile Bar */}
      <header className="customer-top-bar">
        <div className="customer-brand">
          <span className="customer-brand-icon">🔥</span>
          <div>
            <div className="customer-brand-name">Gasora Portal</div>
            <div className="customer-account-badge" title={balance?.customer_name || 'Customer'}>
              {balance?.customer_name || 'Al-Madina Bakers'}
            </div>
          </div>
        </div>

        <div className="customer-header-right">
          <button
            type="button"
            className="customer-header-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <button
            type="button"
            className="customer-header-btn"
            onClick={onSignOut}
            title="Sign out of account"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Viewport Content */}
      <main className="customer-body">
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Spinner size="lg" message="Loading your customer portal..." />
          </div>
        ) : (
          <>
            {error && (
              <div className="customer-card urgent-banner" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="urgent-banner-title">⚠️ Error</div>
                  <div className="urgent-banner-text">{error}</div>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={loadCustomerData}
                  style={{ padding: '6px 12px', fontSize: 13, alignSelf: 'center', flexShrink: 0 }}
                >
                  Retry
                </button>
              </div>
            )}

            {successToast && (
              <div
                className="customer-card"
                style={{
                  background: '#f0fdf4',
                  borderColor: '#86efac',
                  color: '#166534',
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {successToast}
              </div>
            )}

            {/* TAB 1: HOME */}
            {activeTab === 'home' && (
              <div className="tab-pane-home">
                {/* Next Expected Delivery Hero Card */}
                <div className="customer-card next-delivery-card">
                  <div className="card-title-row">
                    <span className="card-title">
                      🚚 Next Expected Delivery
                    </span>
                    <span className="next-delivery-status-pill">
                      {nextDelivery?.status === 'delivered'
                        ? '✓ Delivered'
                        : nextDelivery?.scheduled
                        ? 'Planned Today'
                        : 'Predicted Window'}
                    </span>
                  </div>

                  <div className="next-delivery-window">
                    {nextDelivery?.window || 'Today (10:00 AM – 1:00 PM)'}
                  </div>

                  <div className="muted" style={{ fontSize: 13 }}>
                    Expected:{' '}
                    <strong>
                      {nextDelivery?.cylinders}x {nextDelivery?.cylinder_type || 'Commercial Cylinders'}
                    </strong>
                  </div>

                  <div className="next-delivery-details">
                    <div>
                      <span className="balance-subitem-label">Vehicle</span>
                      <div className="balance-subitem-val">
                        Van #{nextDelivery?.vehicle_no || 1}
                      </div>
                    </div>
                    <div>
                      <span className="balance-subitem-label">Assigned Driver</span>
                      <div className="balance-subitem-val">
                        {nextDelivery?.driver_name || 'Driver on Shift'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="next-delivery-cta-btn"
                    onClick={() => setActiveTab('track')}
                  >
                    <span>📍 View Live Delivery Status</span>
                    <span>→</span>
                  </button>
                </div>

                {/* Account Balance Card */}
                <div className="customer-card">
                  <div className="card-title-row">
                    <span className="card-title">
                      💳 Account Balance & Credit
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#e0f2fe',
                        color: '#0369a1',
                      }}
                    >
                      {balance?.customer_code || 'C0001'}
                    </span>
                  </div>

                  <div className="balance-metric-row">
                    <div>
                      <span className="balance-subitem-label">Outstanding Balance</span>
                      <div className={`balance-amount ${balance?.balance > 0 ? 'positive' : 'zero'}`}>
                        PKR {Number(balance?.balance || 0).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="balance-subitem-label">Security Deposit Held</span>
                      <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 15 }}>
                        PKR {Number(balance?.deposit || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="balance-subgrid">
                    <div>
                      <div className="balance-subitem-label">Total Invoiced</div>
                      <div className="balance-subitem-val">
                        PKR {Number(balance?.total_invoiced || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="balance-subitem-label">Total Settled</div>
                      <div className="balance-subitem-val" style={{ color: '#16a34a' }}>
                        PKR {Number(balance?.total_paid || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button
                      type="button"
                      className="view-invoice-btn"
                      style={{ flex: 1 }}
                      onClick={() => setActiveTab('bills')}
                    >
                      🧾 View Bills ({balance?.unpaid_bills_count || 0} unpaid)
                    </button>
                    <button
                      type="button"
                      className="view-invoice-btn"
                      style={{ flex: 1, borderColor: '#ea580c', color: '#ea580c' }}
                      onClick={() => setActiveTab('request')}
                    >
                      ➕ Request Refill
                    </button>
                  </div>
                </div>

                {/* Quick Refill Banner */}
                <div
                  className="customer-card"
                  style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    textAlign: 'center',
                    padding: 18,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🛢️</div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: 16 }}>Need a Cylinder Replacement?</h3>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 14px 0' }}>
                    Place a normal or urgent request. Urgent refills are prioritized for high-demand shifts.
                  </p>
                  <button
                    type="button"
                    className="request-submit-btn normal"
                    onClick={() => setActiveTab('request')}
                  >
                    Place Cylinder Request
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: TRACK DELIVERY (Routific Design Reference) */}
            {activeTab === 'track' && (
              <DeliveryStatusPage
                auth={auth}
                onExpired={onExpired}
                onRequestRefill={() => setActiveTab('request')}
              />
            )}

            {/* TAB 3: PLACE A REQUEST */}
            {activeTab === 'request' && (
              <div className="tab-pane-request">
                <div className="card-title-row" style={{ marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>
                    🛢️ Place Refill Request
                  </h2>
                </div>

                <form onSubmit={handlePlaceRequest}>
                  {/* Normal vs Urgent Selector */}
                  <div className="request-type-selector">
                    <button
                      type="button"
                      className={`type-select-btn ${requestType === 'normal' ? 'selected-normal' : ''}`}
                      onClick={() => setRequestType('normal')}
                    >
                      <span style={{ fontSize: 20 }}>📦</span>
                      <span>Normal Refill</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Scheduled next day
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`type-select-btn ${requestType === 'urgent' ? 'selected-urgent' : ''}`}
                      onClick={() => setRequestType('urgent')}
                    >
                      <span style={{ fontSize: 20 }}>🚨</span>
                      <span>Urgent Refill</span>
                      <span style={{ fontSize: 11, color: '#dc2626' }}>
                        High Priority
                      </span>
                    </button>
                  </div>

                  {/* Urgent Explanation Banner in Red */}
                  {requestType === 'urgent' && (
                    <div className="urgent-banner">
                      <div className="urgent-banner-title">
                        <span>🚨 Urgent Request Priority</span>
                      </div>
                      <div className="urgent-banner-text">
                        Urgent requests are planned first by the routing engine to prevent gas run-outs.
                      </div>
                    </div>
                  )}

                  {/* Cylinder Quantity Selection */}
                  <div className="customer-card">
                    <label className="card-title" style={{ display: 'block', marginBottom: 8 }}>
                      Number of Cylinders ({balance?.cylinder_type || '45.4 kg'})
                    </label>

                    <div className="stepper-row">
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => setCylinders((c) => Math.max(1, c - 1))}
                        disabled={cylinders <= 1}
                      >
                        -
                      </button>
                      <span className="stepper-val">{cylinders}</span>
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => setCylinders((c) => Math.min(20, c + 1))}
                        disabled={cylinders >= 20}
                      >
                        +
                      </button>
                    </div>

                    <div className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
                      Standard specification for your account: {balance?.cylinder_type || '45.4 kg Commercial'}
                    </div>
                  </div>

                  {/* Notes / Special Instructions */}
                  <div className="customer-card">
                    <label className="card-title" htmlFor="req-notes" style={{ display: 'block', marginBottom: 6 }}>
                      Notes or Instructions (Optional)
                    </label>
                    <textarea
                      id="req-notes"
                      rows={3}
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="e.g. Empty cylinders ready at loading bay, call supervisor on arrival..."
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid var(--color-border, #cbd5e1)',
                        padding: 10,
                        fontSize: 13,
                        boxSizing: 'border-box',
                        background: 'var(--color-bg, #ffffff)',
                        color: 'inherit',
                      }}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className={`request-submit-btn ${requestType === 'urgent' ? 'urgent' : 'normal'}`}
                    disabled={submitting}
                  >
                    {submitting
                      ? 'Submitting Request...'
                      : requestType === 'urgent'
                      ? '🚨 Submit Urgent Refill Request'
                      : 'Submit Refill Request'}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 4: ORDERS */}
            {activeTab === 'orders' && (
              <div className="tab-pane-orders">
                <div className="card-title-row" style={{ marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>
                    📦 My Orders & Requests
                  </h2>
                  <button
                    type="button"
                    className="customer-header-btn"
                    onClick={() => setActiveTab('request')}
                  >
                    + New Request
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="customer-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                    <h3>No requests yet</h3>
                    <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                      You haven&apos;t placed any cylinder refill requests yet.
                    </p>
                    <button
                      type="button"
                      className="request-submit-btn normal"
                      onClick={() => setActiveTab('request')}
                    >
                      Place Your First Request
                    </button>
                  </div>
                ) : (
                  orders.map((ord) => (
                    <div key={ord.id} className="order-item-card">
                      <div className="order-top-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="order-no">{ord.order_no}</span>
                          {ord.type === 'urgent' && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: '#dc2626',
                                color: '#ffffff',
                              }}
                            >
                              URGENT
                            </span>
                          )}
                        </div>

                        <span className={`order-status-badge ${ord.status}`}>
                          {ord.status === 'in_route' ? 'In Route' : ord.status}
                        </span>
                      </div>

                      <div className="order-details-line">
                        {ord.cylinders}x {ord.cylinder_type}
                      </div>

                      {ord.note && (
                        <div
                          className="muted"
                          style={{
                            fontSize: 12,
                            fontStyle: 'italic',
                            margin: '4px 0',
                            background: 'var(--color-bg, #f8fafc)',
                            padding: '4px 8px',
                            borderRadius: 6,
                          }}
                        >
                          &ldquo;{ord.note}&rdquo;
                        </div>
                      )}

                      <div className="order-meta-line">
                        <span>
                          Placed:{' '}
                          {new Date(ord.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {ord.delivered_at && (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>
                            Delivered{' '}
                            {new Date(ord.delivered_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 5: BILLS */}
            {activeTab === 'bills' && (
              <div className="tab-pane-bills">
                <div className="card-title-row" style={{ marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>
                    🧾 Billing & Invoices
                  </h2>
                </div>

                {/* Summary Banner */}
                <div
                  className="customer-card"
                  style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    borderColor: '#bfdbfe',
                    color: '#1e3a8a',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>
                        ACCOUNT STATEMENT
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
                        PKR {Number(balance?.balance || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12 }}>Current balance due</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>DEPOSIT HELD</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                        PKR {Number(balance?.deposit || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {bills.length === 0 ? (
                  <div className="customer-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
                    <h3>No Invoices Found</h3>
                    <p className="muted" style={{ fontSize: 13 }}>
                      You have no recorded invoices at this time.
                    </p>
                  </div>
                ) : (
                  bills.map((bill) => (
                    <div key={bill.id} className="bill-item-card">
                      <div className="bill-top-row">
                        <span className="bill-inv-no">{bill.invoice_no}</span>
                        <span
                          className="order-status-badge"
                          style={{
                            background:
                              bill.status === 'paid'
                                ? '#dcfce7'
                                : bill.status === 'partial'
                                ? '#fef3c7'
                                : '#fee2e2',
                            color:
                              bill.status === 'paid'
                                ? '#15803d'
                                : bill.status === 'partial'
                                ? '#b45309'
                                : '#b91c1c',
                          }}
                        >
                          {bill.status}
                        </span>
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Issued:{' '}
                        {new Date(bill.created_at || bill.due_date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>

                      <div className="bill-amount-row">
                        <span className="bill-total-pkr">
                          PKR {Number(bill.total || 0).toLocaleString()}
                        </span>
                        {bill.balance_due > 0 ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#ea580c' }}>
                            Due: PKR {Number(bill.balance_due).toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
                            ✓ Fully Settled
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="view-invoice-btn"
                        onClick={() => setSelectedInvoice(bill)}
                      >
                        📄 View Invoice Voucher
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Invoice Voucher Modal */}
      {selectedInvoice && (
        <div
          className="customer-modal-overlay"
          onClick={() => setSelectedInvoice(null)}
          role="presentation"
        >
          <div
            className="customer-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="customer-modal-header">
              <div>
                <span className="demo-badge" style={{ fontSize: 10 }}>OFFICIAL INVOICE</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 17, fontWeight: 800 }}>
                  {selectedInvoice.invoice_no}
                </h3>
              </div>
              <button
                type="button"
                className="customer-modal-close-btn"
                onClick={() => setSelectedInvoice(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="muted">Billed To:</span>
                <strong>{selectedInvoice.customer_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="muted">Customer Code:</span>
                <span>{selectedInvoice.customer_code || 'C0001'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="muted">Date:</span>
                <span>
                  {new Date(selectedInvoice.created_at || selectedInvoice.due_date).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Status:</span>
                <span
                  style={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color:
                      selectedInvoice.status === 'paid'
                        ? '#16a34a'
                        : selectedInvoice.status === 'partial'
                        ? '#d97706'
                        : '#dc2626',
                  }}
                >
                  {selectedInvoice.status}
                </span>
              </div>
            </div>

            {/* Line Items */}
            <div
              style={{
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--color-bg, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>Item</th>
                    <th style={{ textAlign: 'center', padding: '8px 6px' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border, #f1f5f9)' }}>
                      <td style={{ padding: '8px 10px' }}>{it.cylinder_type}</td>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '8px 6px' }}>
                        PKR {Number(it.unit_price).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                        PKR {(it.quantity * it.unit_price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals */}
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Invoice Total:</span>
                <strong>PKR {Number(selectedInvoice.total).toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                <span>Paid to Date:</span>
                <strong>PKR {Number(selectedInvoice.paid_amount || 0).toLocaleString()}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTop: '1px solid var(--color-border, #e2e8f0)',
                  fontSize: 15,
                }}
              >
                <span>Balance Due:</span>
                <strong style={{ color: selectedInvoice.balance_due > 0 ? '#ea580c' : '#16a34a' }}>
                  PKR {Number(selectedInvoice.balance_due || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="view-invoice-btn"
              onClick={() => window.print()}
              style={{ background: '#ea580c', color: '#ffffff', borderColor: '#ea580c', marginBottom: 8 }}
            >
              🖨️ Print / Save Voucher
            </button>
            <button
              type="button"
              className="view-invoice-btn"
              onClick={() => setSelectedInvoice(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sticky Tab Navigation */}
      <nav className="customer-bottom-nav" aria-label="Customer portal navigation">
        <button
          type="button"
          className={`customer-nav-tab ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <span className="tab-icon">🏠</span>
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`customer-nav-tab ${activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('track')}
        >
          <span className="tab-icon">🚚</span>
          <span>Tracking</span>
        </button>

        <button
          type="button"
          className={`customer-nav-tab ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <span className="tab-icon">➕</span>
          <span>Request</span>
        </button>

        <button
          type="button"
          className={`customer-nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span className="tab-icon">📦</span>
          <span>Orders</span>
        </button>

        <button
          type="button"
          className={`customer-nav-tab ${activeTab === 'bills' ? 'active' : ''}`}
          onClick={() => setActiveTab('bills')}
        >
          <span className="tab-icon">🧾</span>
          <span>Bills</span>
        </button>
      </nav>
    </div>
  )
}

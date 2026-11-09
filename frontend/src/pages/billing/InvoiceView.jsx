import { useEffect, useState } from 'react'
import { getBill } from '../../api'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import './billing.css'

export default function InvoiceView({ auth, invoiceId, onNavigate, onRecordPayment, onExpired }) {
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function fetchInvoice() {
      if (!invoiceId) return
      try {
        setLoading(true)
        setError('')
        const data = await getBill(auth.token, invoiceId)
        if (active) setBill(data)
      } catch (err) {
        if (err && err.status === 401) { onExpired?.(); return; }
        if (active) setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchInvoice()
    return () => {
      active = false
    }
  }, [auth.token, invoiceId])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size="lg" message="Loading printable invoice..." />
      </div>
    )
  }

  if (error && (error.status === 404 || error.status === 501 || error.status === 0)) {
    return <NotReady endpoint={`GET /bills/${invoiceId}`} />
  }

  if (error || !bill) {
    return (
      <div className="billing-container">
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="error banner">⚠️ {error?.message || String(error) || 'Invoice not found'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => { setLoading(true); getBill(auth.token, invoiceId).then(setBill).catch(setError).finally(() => setLoading(false)); }}>
              Retry
            </button>
            <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
              ← Return to Bills Directory
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Format clean phone for WhatsApp link
  // e.g. 0300-7654321 -> 923007654321
  const rawPhone = bill.customer_phone || ''
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '')
  const cleanPhone = digitsOnly.startsWith('0')
    ? `92${digitsOnly.slice(1)}`
    : digitsOnly.startsWith('92')
    ? digitsOnly
    : `92${digitsOnly}`

  // Format message text for WhatsApp share link
  const itemsText = (bill.items || [])
    .map((item) => `${item.quantity}x ${item.cylinder_type} @ PKR ${Number(item.unit_price).toLocaleString()}`)
    .join(', ')

  const shareSummary = `*Gasora LPG Distribution & Supply*
Official Invoice *#${bill.invoice_no}*

Customer: *${bill.customer_name}* (${bill.customer_code || ''})
Invoice Date: ${new Date(bill.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
Items: ${itemsText}

*Gross Total:* PKR ${Number(bill.total || 0).toLocaleString()}
*Paid to Date:* PKR ${Number(bill.paid_amount || 0).toLocaleString()}
*Balance Due:* PKR ${Number(bill.balance_due || 0).toLocaleString()}
*Payment Due:* ${bill.due_date || 'Immediate'}

Main Depot: Faisalabad, Punjab
Helpline: +92 41 8765432
Thank you for your business!`

  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareSummary)}`

  const isOverdue =
    bill.status !== 'paid' &&
    bill.due_date &&
    new Date(bill.due_date) < new Date()

  return (
    <div className="billing-container">
      {/* Top Action Bar (Hidden on print) */}
      <div className="invoice-actions-bar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="secondary" onClick={() => onNavigate('billing')}>
            ← Back to Bills
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Viewing Invoice <strong style={{ color: 'var(--text-primary)' }}>#{bill.invoice_no}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {bill.balance_due > 0 && onRecordPayment && (
            <button
              type="button"
              className="primary"
              onClick={() => onRecordPayment(bill)}
            >
              💳 Record Payment
            </button>
          )}

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-whatsapp"
            title="Share encoded summary on WhatsApp"
          >
            <span>💬</span> Share on WhatsApp
          </a>

          <button
            type="button"
            className="secondary"
            onClick={() => window.print()}
            title="Print or Save as PDF"
          >
            🖨️ Print Invoice
          </button>
        </div>
      </div>

      {/* Printable Invoice Page */}
      <div className="printable-invoice-page">
        {/* Invoice Header */}
        <div className="invoice-header">
          <div className="invoice-logo-title">
            <h2>🔥 GASORA LPG</h2>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
              LPG Distribution & Smart Supply Intelligence<br />
              Main Depot: Near D Ground, Faisalabad, Punjab<br />
              NTN / Reg: 34102-LPG-01 • Phone: +92 41 8765432
            </div>
          </div>

          <div className="invoice-meta">
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              TAX INVOICE / DELIVERY VOUCHER
            </div>
            <div className="invoice-number">{bill.invoice_no}</div>
            <div style={{ marginTop: 6, display: 'inline-block' }}>
              <span className={`badge-status ${isOverdue ? 'overdue' : bill.status || 'unpaid'}`}>
                {isOverdue ? '⚠️ Overdue' : bill.status ? bill.status.toUpperCase() : 'UNPAID'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Invoice Meta Grid */}
        <div className="invoice-address-grid">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              BILLED TO:
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              {bill.customer_name}
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
              Customer Code: <strong>{bill.customer_code || `C${bill.customer_id}`}</strong>
            </div>
            <div style={{ fontSize: 13, color: '#334155' }}>
              Phone: {bill.customer_phone || '—'}
            </div>
            <div style={{ fontSize: 13, color: '#334155' }}>
              Delivery Area: {bill.customer_area || 'Faisalabad'}
            </div>
            {bill.customer_address && (
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                Address: {bill.customer_address}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              INVOICE DETAILS:
            </div>
            <div style={{ fontSize: 13, color: '#334155' }}>
              Invoice Date:{' '}
              <strong>
                {new Date(bill.created_at).toLocaleDateString('en-PK', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </strong>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
              Payment Due Date:{' '}
              <strong style={{ color: isOverdue ? '#b91c1c' : '#0f172a' }}>
                {bill.due_date
                  ? new Date(bill.due_date).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'On Delivery'}
              </strong>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
              Billing Cycle: <strong style={{ textTransform: 'capitalize' }}>{bill.bill_type ? bill.bill_type.replace('_', ' ') : 'Sale'}</strong>
            </div>
            {bill.customer_balance !== undefined && (
              <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                Current Net Balance: <strong>PKR {bill.customer_balance.toLocaleString()}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Cylinder Specification & Description</th>
              <th style={{ textAlign: 'center', width: 90 }}>Quantity</th>
              <th style={{ textAlign: 'right', width: 130 }}>Unit Rate (PKR)</th>
              <th style={{ textAlign: 'right', width: 140 }}>Total Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {(bill.items || []).map((item, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <strong>LPG Cylinder Refill — {item.cylinder_type}</strong>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    100% certified commercial & domestic liquefied petroleum gas fill
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{(Number(item.unit_price) || 0).toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {(Number(item.total) || (Number(item.quantity) * Number(item.unit_price))).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Box */}
        <div className="invoice-totals">
          <div className="invoice-totals-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#64748b' }}>Subtotal:</span>
              <span>PKR {(Number(bill.subtotal) || Number(bill.total) || 0).toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#64748b' }}>Sales Tax (0%):</span>
              <span>PKR 0</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 16,
                fontWeight: 700,
                borderTop: '1px solid #cbd5e1',
                paddingTop: 6,
              }}
            >
              <span>Grand Total:</span>
              <span>PKR {(Number(bill.total) || 0).toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#15803d' }}>
              <span>Paid to Date:</span>
              <span>- PKR {(Number(bill.paid_amount) || 0).toLocaleString()}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 17,
                fontWeight: 800,
                color: bill.balance_due > 0 ? '#b91c1c' : '#15803d',
                borderTop: '2px dashed #0284c7',
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <span>Balance Due:</span>
              <span>PKR {(Number(bill.balance_due) || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Payments History if any */}
        {bill.payments && bill.payments.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
              RECEIPTED PAYMENTS RECORDED AGAINST THIS INVOICE:
            </div>
            <table className="invoice-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {bill.payments.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.receipt_no}</strong></td>
                    <td>{new Date(p.created_at).toLocaleDateString('en-PK')}</td>
                    <td>{p.payment_method}</td>
                    <td>{p.reference || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                      {Number(p.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes & Terms */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 10, fontSize: 12, color: '#64748b' }}>
          <div>
            <strong>Notes & Terms:</strong> {bill.notes || 'Payment due within 15 days of invoice date. Check cylinder seal before acceptance.'}
          </div>
          <div style={{ marginTop: 4 }}>
            Safety Notice: Cylinders must be kept vertical in well-ventilated areas away from ignition sources. Gasora is not liable for customer-side pipe leaks.
          </div>
        </div>

        {/* Signature Line for Print */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 20 }}>
          <div style={{ borderTop: '1px solid #94a3b8', width: 180, textAlign: 'center', fontSize: 12 }}>
            Customer Signature
          </div>
          <div style={{ borderTop: '1px solid #94a3b8', width: 180, textAlign: 'center', fontSize: 12 }}>
            Authorized Depot Signature
          </div>
        </div>
      </div>
    </div>
  )
}

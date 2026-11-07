import { useEffect, useState } from 'react'
import { getCustomerStatement } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import './billing.css'

export default function CustomerStatementModal({ auth, customerId, isOpen, onClose }) {
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!customerId) return
      try {
        setLoading(true)
        setError('')
        const res = await getCustomerStatement(auth.token, customerId)
        if (active) setStatement(res)
      } catch (err) {
        if (active) setError(err.message || 'Failed to load statement')
      } finally {
        if (active) setLoading(false)
      }
    }
    if (isOpen) {
      load()
    }
    return () => {
      active = false
    }
  }, [auth.token, customerId, isOpen])

  if (!isOpen) return null

  const customer = statement?.customer
  const ledger = statement?.ledger || []
  const currentBalance = statement?.current_balance ?? 0
  const deposit = statement?.deposit_held ?? 0

  const totalDebit = ledger.reduce((sum, e) => sum + (Number(e.debit) || 0), 0)
  const totalCredit = ledger.reduce((sum, e) => sum + (Number(e.credit) || 0), 0)

  // Clean phone for WhatsApp share
  const rawPhone = customer?.phone || ''
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '')
  const cleanPhone = digitsOnly.startsWith('0')
    ? `92${digitsOnly.slice(1)}`
    : digitsOnly.startsWith('92')
    ? digitsOnly
    : `92${digitsOnly}`

  const shareText = `*Gasora Statement of Account*
Customer: *${customer?.name || ''}* (${customer?.code || ''})
Date: ${new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}

*Total Invoiced:* PKR ${totalDebit.toLocaleString()}
*Total Payments:* PKR ${totalCredit.toLocaleString()}
*Current Balance Due:* PKR ${currentBalance.toLocaleString()}
*Security Deposit Held:* PKR ${deposit.toLocaleString()}

Please reconcile any pending balances. For queries, contact Gasora Main Depot Faisalabad.`

  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareText)}`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Statement of Account" maxWidth={860}>
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading customer statement & ledger history..." />
        </div>
      ) : error || !statement ? (
        <div className="error banner">⚠️ {error || 'Failed to load statement'}</div>
      ) : (
        <div>
          {/* Action Bar (hidden on print) */}
          <div className="invoice-actions-bar no-print" style={{ marginBottom: 16 }}>
            <div>
              <span className="code-badge">{customer?.code}</span>{' '}
              <strong style={{ fontSize: 16 }}>{customer?.name}</strong>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
                style={{ fontSize: 13, padding: '7px 14px' }}
              >
                💬 Share Statement
              </a>
              <button
                type="button"
                className="secondary"
                style={{ fontSize: 13 }}
                onClick={() => window.print()}
              >
                🖨️ Print Statement
              </button>
            </div>
          </div>

          {/* Printable Statement Document */}
          <div className="printable-statement-page" style={{ padding: 10 }}>
            {/* Header */}
            <div className="invoice-header">
              <div className="invoice-logo-title">
                <h2>🔥 GASORA LPG DISTRIBUTION</h2>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
                  Main Depot: Near D Ground, Faisalabad<br />
                  Phone: +92 41 8765432 • NTN: 34102-LPG-01
                </div>
              </div>

              <div className="invoice-meta">
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
                  CUSTOMER ACCOUNT STATEMENT
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Generated on:{' '}
                  <strong>
                    {new Date(statement.statement_date).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div className="invoice-address-grid">
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>ACCOUNT DETAILS:</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{customer?.name}</div>
                <div style={{ fontSize: 13 }}>Customer Code: <strong>{customer?.code}</strong></div>
                <div style={{ fontSize: 13 }}>Phone: {customer?.phone}</div>
                <div style={{ fontSize: 13 }}>Area: {customer?.area || 'Faisalabad'}</div>
                {customer?.address && <div style={{ fontSize: 12, color: '#64748b' }}>Address: {customer.address}</div>}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>FINANCIAL POSITION:</div>
                <div style={{ fontSize: 13 }}>
                  Security Deposit Held: <strong>PKR {deposit.toLocaleString()}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Total Invoiced: <strong>PKR {totalDebit.toLocaleString()}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Total Payments: <strong style={{ color: '#15803d' }}>PKR {totalCredit.toLocaleString()}</strong>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: currentBalance > 0 ? '#b91c1c' : '#15803d' }}>
                  Current Balance Due: PKR {currentBalance.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Chronological Ledger Transactions */}
            <h4 style={{ margin: '20px 0 8px 0', fontSize: 14 }}>Transaction & Ledger History</h4>
            <table className="invoice-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Ref #</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debit (PKR)</th>
                  <th style={{ textAlign: 'right' }}>Credit (PKR)</th>
                  <th style={{ textAlign: 'right' }}>Balance (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {new Date(entry.created_at).toLocaleDateString('en-PK', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td>
                      <span
                        className={`badge-status ${
                          entry.entry_type === 'payment'
                            ? 'paid'
                            : entry.entry_type === 'deposit'
                            ? 'partial'
                            : 'unpaid'
                        }`}
                        style={{ fontSize: 10, padding: '2px 6px' }}
                      >
                        {entry.entry_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace' }}>{entry.reference_no || '—'}</span>
                    </td>
                    <td>{entry.description}</td>
                    <td style={{ textAlign: 'right', fontWeight: entry.debit ? 600 : 400 }}>
                      {entry.debit ? entry.debit.toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: entry.credit ? 600 : 400, color: entry.credit ? '#15803d' : undefined }}>
                      {entry.credit ? entry.credit.toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {entry.balance !== undefined ? entry.balance.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Unpaid Bills Summary if any */}
            {statement.unpaid_bills && statement.unpaid_bills.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#b91c1c' }}>
                  Outstanding Invoices Pending Settlement:
                </h4>
                <table className="invoice-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Due Date</th>
                      <th style={{ textAlign: 'right' }}>Invoice Total</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th style={{ textAlign: 'right' }}>Balance Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.unpaid_bills.map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.invoice_no}</strong></td>
                        <td>{new Date(b.created_at).toLocaleDateString('en-PK')}</td>
                        <td>{b.due_date || 'Immediate'}</td>
                        <td style={{ textAlign: 'right' }}>PKR {(Number(b.total) || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: '#15803d' }}>PKR {(Number(b.paid_amount) || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                          PKR {(Number(b.balance_due) || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Signature Block for Print */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 20 }}>
              <div style={{ borderTop: '1px solid #94a3b8', width: 180, textAlign: 'center', fontSize: 12 }}>
                Customer Verification
              </div>
              <div style={{ borderTop: '1px solid #94a3b8', width: 180, textAlign: 'center', fontSize: 12 }}>
                Accountant / Depot Incharge
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }} className="no-print">
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

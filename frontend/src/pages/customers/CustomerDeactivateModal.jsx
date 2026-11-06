import { useState } from 'react'
import { deactivateCustomer, updateCustomer } from '../../api'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'

export default function CustomerDeactivateModal({ isOpen, onClose, customer, token, onSuccess }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!customer) return null

  const isDeactivating = customer.is_active !== false

  const handleConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      let result
      if (isDeactivating) {
        result = await deactivateCustomer(token, customer.id)
        showToast(`Customer "${customer.name}" deactivated. Excluded from route planning.`, 'info')
      } else {
        result = await updateCustomer(token, customer.id, { is_active: true })
        showToast(`Customer "${customer.name}" reactivated. Restored to route planning.`, 'success')
      }
      onSuccess(result)
      onClose()
    } catch (err) {
      setError(err.message || 'Operation failed')
      showToast(err.message || 'Failed to update customer status', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDeactivating ? 'Deactivate Customer' : 'Reactivate Customer'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={isDeactivating ? 'danger' : ''}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy
              ? 'Updating...'
              : isDeactivating
              ? 'Deactivate Customer'
              : 'Reactivate Customer'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div className="error banner">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 36 }}>{isDeactivating ? '⚠️' : '🔄'}</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {customer.name} <span className="code-badge">{customer.code || `C${String(customer.id).padStart(4, '0')}`}</span>
            </h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {customer.area} • {customer.customer_type} • {customer.cylinder_type}
            </p>
          </div>
        </div>

        {isDeactivating ? (
          <div className="card" style={{ background: 'var(--bg-subtle)', padding: 14, gap: 8, fontSize: 14 }}>
            <p style={{ fontWeight: 600 }}>What happens when you deactivate:</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                <strong>Customer leaves planning:</strong> This customer will no longer appear on daily dispatch routes or delivery proposals.
              </li>
              <li>
                <strong>History is kept:</strong> All past delivery records, held cylinders, billing invoices, and ledger transactions remain completely safe and intact.
              </li>
              <li>
                <strong>Reversible:</strong> You can reactivate this customer at any time to resume regular deliveries.
              </li>
            </ul>
          </div>
        ) : (
          <div className="card" style={{ background: 'var(--bg-subtle)', padding: 14, gap: 8, fontSize: 14 }}>
            <p style={{ fontWeight: 600 }}>What happens when you reactivate:</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                <strong>Customer restored to planning:</strong> This customer will immediately become eligible for daily dispatch routes and schedule proposals.
              </li>
              <li>
                <strong>Historical continuity:</strong> Their existing cylinder holdings, deposit records, and delivery history are fully maintained.
              </li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

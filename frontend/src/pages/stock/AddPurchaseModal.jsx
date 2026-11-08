import { useState } from 'react'
import { createPurchase } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

const VENDOR_SUGGESTIONS = [
  'Parco LPG Terminal (Faisalabad Point)',
  'Pakistan State Oil - LPG Division',
  'Aven Gas Terminal Sheikhupura',
  'Shell Gas Pakistan Ltd',
  'Supernet LPG Terminal',
]

const STANDARD_UNIT_COSTS = {
  '11.8 kg': 2650,
  '15 kg': 3250,
  '45.4 kg': 8850,
}

export default function AddPurchaseModal({ auth, isOpen, onClose, onPurchaseCreated }) {
  const [vendor, setVendor] = useState('')
  const [cylinderType, setCylinderType] = useState('11.8 kg')
  const [quantity, setQuantity] = useState(30)
  const [unitCost, setUnitCost] = useState(STANDARD_UNIT_COSTS['11.8 kg'])
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleTypeChange = (newType) => {
    setCylinderType(newType)
    setUnitCost(STANDARD_UNIT_COSTS[newType] || 2650)
  }

  const numQty = Number(quantity) || 0
  const numCost = Number(unitCost) || 0
  const totalCost = numQty * numCost

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!vendor.trim()) {
      setError('Vendor name is required')
      return
    }

    if (numQty <= 0) {
      setError('Quantity must be greater than 0')
      return
    }

    if (numCost < 0) {
      setError('Unit cost cannot be negative')
      return
    }

    setSubmitting(true)
    try {
      const res = await createPurchase(auth.token, {
        vendor: vendor.trim(),
        item: cylinderType,
        cylinder_type: cylinderType,
        quantity: numQty,
        unit_cost: numCost,
        date,
        invoice_no: invoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      onPurchaseCreated(res.purchase)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to record purchase')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record LPG Stock Purchase" maxWidth={680}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error banner" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Vendor selection with datalist */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Wholesale LPG Supplier / Refinery Terminal <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              list="vendor-options"
              placeholder="e.g. Parco LPG Terminal (Faisalabad Point)"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              required
            />
            <datalist id="vendor-options">
              {VENDOR_SUGGESTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          {/* Cylinder Type & Quantity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Cylinder Specification <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <select value={cylinderType} onChange={(e) => handleTypeChange(e.target.value)}>
                <option value="11.8 kg">11.8 kg (Domestic Refill)</option>
                <option value="15 kg">15 kg (Commercial Refill)</option>
                <option value="45.4 kg">45.4 kg (Industrial Refill)</option>
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Quantity Received (Units) <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Pricing & Invoice # */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Cost per Cylinder (PKR) <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Supplier Invoice / Bilty #
              </label>
              <input
                type="text"
                placeholder="e.g. PUR-PARCO-9105"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes & Weighbridge Slip</label>
            <textarea
              rows={2}
              placeholder="Truck plate number, weighbridge tare/gross kg, or inspection notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Live Cost & Stock Preview Banner */}
          <div
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Total Batch Cost:</span>
              <strong style={{ fontSize: 16, color: 'var(--color-primary)' }}>
                PKR {totalCost.toLocaleString()}
              </strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 4 }}>
              ⚡ <strong>Automatic Stock Effect</strong>: Saving this purchase immediately increments Filled stock by <strong>+{numQty} cylinders</strong> ({cylinderType}) at the central depot.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={submitting || !vendor.trim() || numQty <= 0}>
            {submitting ? <Spinner size="sm" message="Saving & updating stock..." /> : '📥 Save Purchase & Increase Stock'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

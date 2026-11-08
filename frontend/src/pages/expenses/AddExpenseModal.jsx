import { useState } from 'react'
import { createExpense } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

export default function AddExpenseModal({ auth, isOpen, onClose, onExpenseCreated }) {
  const [category, setCategory] = useState('fuel')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [vehicleId, setVehicleId] = useState('')
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const numAmount = Number(amount) || 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (numAmount <= 0) {
      setError('Amount must be greater than PKR 0')
      return
    }

    setSubmitting(true)
    try {
      const newExpense = await createExpense(auth.token, {
        category,
        amount: numAmount,
        date,
        vehicle_id: vehicleId.trim() || undefined,
        note: note.trim() || undefined,
      })

      onExpenseCreated(newExpense)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to record expense')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Operating Expense" maxWidth={560}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error banner" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Category */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Expense Category <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="fuel">⛽ Fuel (Fleet Diesel / Petrol)</option>
              <option value="rent">🏢 Rent (Depot & Warehouse)</option>
              <option value="salary">👤 Salaries & Driver Wages</option>
              <option value="repair">🔧 Vehicle & Equipment Repairs</option>
              <option value="other">📦 Utilities & Overheads (Other)</option>
            </select>
          </div>

          {/* Amount & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Amount (PKR) <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                step="50"
                placeholder="e.g. 15000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Expense Date <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Vehicle ID (Conditional if fuel/repair) */}
          {(category === 'fuel' || category === 'repair') && (
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Fleet Vehicle Registration # (Optional)
              </label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">General Fleet / Unspecified</option>
                <option value="FD-8921">FD-8921 (Van 1 - Muhammad Tariq)</option>
                <option value="FD-4412">FD-4412 (Van 2 - Zahid Ali)</option>
                <option value="FD-3190">FD-3190 (Depot Backup Shehzore)</option>
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Description & Receipt Details
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Diesel refill 50 Liters from PSO Station / Depot electricity bill..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={submitting || numAmount <= 0}>
            {submitting ? <Spinner size="sm" message="Saving expense..." /> : '💸 Post Expense'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

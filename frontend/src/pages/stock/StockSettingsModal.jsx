import { useState } from 'react'
import { updateStockSettings } from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

export default function StockSettingsModal({
  auth,
  isOpen,
  onClose,
  currentThresholds = {},
  onSettingsSaved,
}) {
  const [t11, setT11] = useState(currentThresholds['11.8 kg'] ?? 25)
  const [t15, setT15] = useState(currentThresholds['15 kg'] ?? 15)
  const [t45, setT45] = useState(currentThresholds['45.4 kg'] ?? 10)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        low_stock_thresholds: {
          '11.8 kg': Math.max(1, Number(t11)),
          '15 kg': Math.max(1, Number(t15)),
          '45.4 kg': Math.max(1, Number(t45)),
        },
      }
      await updateStockSettings(auth.token, payload)
      onSettingsSaved(payload.low_stock_thresholds)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save stock thresholds')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure Low-Stock Safety Thresholds" maxWidth={500}>
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          When the central depot&apos;s available <strong>Filled</strong> cylinder count drops below these minimum reserves, automated low-stock warnings will be surfaced to dispatch and operations.
        </p>

        {error && <div className="error banner" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              11.8 kg Domestic Minimum Filled Reserve (Units)
            </label>
            <input
              type="number"
              min="1"
              max="200"
              value={t11}
              onChange={(e) => setT11(e.target.value)}
              required
            />
            <span className="muted" style={{ fontSize: 11 }}>Recommended: 25 units (~2 days of domestic demand)</span>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              15 kg Commercial Minimum Filled Reserve (Units)
            </label>
            <input
              type="number"
              min="1"
              max="200"
              value={t15}
              onChange={(e) => setT15(e.target.value)}
              required
            />
            <span className="muted" style={{ fontSize: 11 }}>Recommended: 15 units (~1.5 days of restaurant demand)</span>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              45.4 kg Industrial Minimum Filled Reserve (Units)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={t45}
              onChange={(e) => setT45(e.target.value)}
              required
            />
            <span className="muted" style={{ fontSize: 11 }}>Recommended: 10 units</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? <Spinner size="sm" message="Saving thresholds..." /> : '💾 Save Settings'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

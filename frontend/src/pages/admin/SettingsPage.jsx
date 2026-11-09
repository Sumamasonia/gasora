import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getBackup,
  getSettings,
  resetDemoData,
  restoreBackup,
  updateSettings,
} from '../../api'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import './admin.css'

export default function SettingsPage({ auth, onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  // Settings State
  const [businessName, setBusinessName] = useState('Gasora LPG Distribution')
  const [businessAddress, setBusinessAddress] = useState('Main Depot, Sheikhupura Road, Faisalabad')
  const [currency, setCurrency] = useState('PKR')
  const [overdueDays, setOverdueDays] = useState(15)
  const [alertDays, setAlertDays] = useState(5)
  const [lowStockLevel, setLowStockLevel] = useState(25)
  const [theme, setTheme] = useState('light')
  const [simulateTamper, setSimulateTamper] = useState(false)

  // Modals & File Upload
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [restoreModalData, setRestoreModalData] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  const fileInputRef = useRef(null)

  // Fetch current settings
  const fetchSettingsData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await getSettings(auth.token)
      if (data) {
        setBusinessName(data.business_name || 'Gasora LPG Distribution')
        setBusinessAddress(data.business_address || 'Main Depot, Sheikhupura Road, Faisalabad')
        setCurrency(data.currency || 'PKR')
        setOverdueDays(data.overdue_days !== undefined ? data.overdue_days : 15)
        setAlertDays(data.alert_days !== undefined ? data.alert_days : 5)
        setLowStockLevel(data.low_stock_level !== undefined ? data.low_stock_level : 25)
        setTheme(data.theme || 'light')
        setSimulateTamper(Boolean(data.simulate_tampered_audit))
      }
    } catch (err) {
      setError(err.message || 'Failed to load system settings')
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        business_name: businessName.trim(),
        business_address: businessAddress.trim(),
        currency: currency.trim() || 'PKR',
        overdue_days: Math.max(1, parseInt(overdueDays, 10) || 15),
        alert_days: Math.max(1, parseInt(alertDays, 10) || 5),
        low_stock_level: Math.max(0, parseInt(lowStockLevel, 10) || 25),
        theme,
        simulate_tampered_audit: simulateTamper,
      }
      await updateSettings(auth.token, payload)
      setToastMessage('✓ Settings saved and applied successfully.')
      setTimeout(() => setToastMessage(''), 4000)
    } catch (err) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Backup: Download all mock data as JSON
  const handleDownloadBackup = async () => {
    setBackingUp(true)
    setError('')
    try {
      const backupData = await getBackup(auth.token)
      const jsonStr = JSON.stringify(backupData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const nowStr = new Date().toISOString().split('T')[0]
      const link = document.createElement('a')
      link.href = url
      link.download = `gasora-backup-${nowStr}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setToastMessage('✓ Backup JSON downloaded successfully.')
      setTimeout(() => setToastMessage(''), 4000)
    } catch (err) {
      setError(err.message || 'Failed to generate database backup')
    } finally {
      setBackingUp(false)
    }
  }

  // Trigger File Input for Restore
  const handleTriggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // Handle File Selection & Validation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result
        if (typeof text !== 'string') throw new Error('File read failed')
        const parsed = JSON.parse(text)

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid file format: JSON root must be an object')
        }

        // Schema validation
        const requiredCollections = ['customers', 'users', 'cylinders']
        const missing = requiredCollections.filter((key) => !Array.isArray(parsed[key]))
        if (missing.length > 0) {
          throw new Error(
            `Invalid backup schema: missing expected collection(s): ${missing.join(', ')}`
          )
        }

        // Prepare summary for confirmation modal
        setRestoreModalData({
          parsed,
          customersCount: parsed.customers?.length || 0,
          usersCount: parsed.users?.length || 0,
          cylindersCount: parsed.cylinders?.length || 0,
          billsCount: parsed.bills?.length || 0,
          exportedAt: parsed._exported_at || 'Unknown date',
        })
      } catch (err) {
        setError(`Backup validation failed: ${err.message}`)
      }
    }
    reader.onerror = () => {
      setError('Failed to read the selected backup file')
    }
    reader.readAsText(file)
  }

  // Confirm Restore
  const handleConfirmRestore = async () => {
    if (!restoreModalData?.parsed) return
    setRestoring(true)
    setError('')
    try {
      const res = await restoreBackup(auth.token, restoreModalData.parsed)
      setRestoreModalData(null)
      setToastMessage(`✓ ${res.message || 'Database restored successfully from backup file.'}`)
      setTimeout(() => setToastMessage(''), 5000)
      await fetchSettingsData()
    } catch (err) {
      setError(err.message || 'Failed to restore database from backup')
    } finally {
      setRestoring(false)
    }
  }

  // Confirm Reset Demo Data
  const handleConfirmReset = async () => {
    setResetting(true)
    setError('')
    try {
      const res = await resetDemoData(auth.token)
      setResetModalOpen(false)
      setToastMessage(`✓ ${res.message || 'Demo data reset to initial seed state.'}`)
      setTimeout(() => setToastMessage(''), 5000)
      await fetchSettingsData()
    } catch (err) {
      setError(err.message || 'Failed to reset demo data')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="admin-page-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <span>⚙️</span>
            <span>Settings & System Administration</span>
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Business configurations, overdue parameters, currency, theme, and JSON backup/restore.
          </p>
        </div>

        {auth?.role === 'owner' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="secondary"
              onClick={handleDownloadBackup}
              disabled={backingUp}
              style={{ fontSize: 13 }}
            >
              {backingUp ? 'Exporting...' : '⬇️ Download Backup'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleTriggerFileInput}
              style={{ fontSize: 13 }}
            >
              ⬆️ Restore from Backup
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input for restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,application/json"
        style={{ display: 'none' }}
      />

      {toastMessage && (
        <div
          style={{
            background: '#dcfce7',
            borderColor: '#86efac',
            color: '#15803d',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 700,
            fontSize: 13,
            border: '1px solid',
          }}
        >
          {toastMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fee2e2',
            borderColor: '#fca5a5',
            color: '#b91c1c',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 13,
            border: '1px solid',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spinner />
          <p className="muted" style={{ marginTop: 12 }}>Loading system settings...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
          {/* Main Settings Form */}
          <form onSubmit={handleSaveSettings} className="admin-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              🏢 Business Profile & Operations
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Gasora LPG Distribution"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Base Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="PKR">PKR (Pakistani Rupee - ₨)</option>
                  <option value="USD">USD (US Dollar - $)</option>
                  <option value="EUR">EUR (Euro - €)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Depot & Business Address
              </label>
              <input
                type="text"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="e.g. Main Depot, Sheikhupura Road, Faisalabad"
                style={{ width: '100%' }}
              />
            </div>

            <h3 style={{ margin: '24px 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              📊 Billing, Alerts & Stock Thresholds
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Overdue Threshold (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={overdueDays}
                  onChange={(e) => setOverdueDays(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Invoices older than this are flagged overdue (default: 15 days).
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Alert Warning (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={alertDays}
                  onChange={(e) => setAlertDays(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Days before due date to alert staff (default: 5 days).
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Low Stock Threshold (Cylinders)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={lowStockLevel}
                  onChange={(e) => setLowStockLevel(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Triggers reorder warning when filled stock drops below this level.
                </span>
              </div>
            </div>

            <h3 style={{ margin: '24px 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              🎨 Theme & Appearance
            </h3>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              {['light', 'dark', 'system'].map((th) => (
                <label
                  key={th}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    border: `2px solid ${theme === th ? '#2563eb' : '#e2e8f0'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: theme === th ? '#eff6ff' : '#fff',
                    fontWeight: theme === th ? 700 : 500,
                  }}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={th}
                    checked={theme === th}
                    onChange={() => setTheme(th)}
                  />
                  <span>
                    {th === 'light' ? '☀️ Light Mode' : th === 'dark' ? '🌙 Dark Mode' : '💻 System Preference'}
                  </span>
                </label>
              ))}
            </div>

            <h3 style={{ margin: '24px 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              🛡️ Audit & Security Demo Switch
            </h3>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 14,
                marginBottom: 24,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ paddingRight: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                  Simulate Tampered Event Log
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  When enabled, event row #3 simulates content modification to demonstrate the SHA-256 chain verification failure alert in the Activity Log.
                </div>
              </div>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={simulateTamper}
                  onChange={(e) => setSimulateTamper(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Disaster Recovery & Demo Management */}
          {auth?.role === 'owner' && (
            <div className="admin-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                💾 Backup, Restore & Data Reset
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
                  <h4 style={{ margin: '0 0 6px 0' }}>Export Database Backup</h4>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 12px 0' }}>
                    Download a full JSON snapshot of customers, cylinders, billing records, ledger entries, and audit logs.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleDownloadBackup}
                    disabled={backingUp}
                    style={{ width: '100%', fontSize: 13 }}
                  >
                    {backingUp ? 'Downloading...' : 'Download JSON Backup'}
                  </button>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⬆️</div>
                  <h4 style={{ margin: '0 0 6px 0' }}>Restore from JSON File</h4>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 12px 0' }}>
                    Upload and validate an existing JSON backup. Confirms collection counts before applying changes.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleTriggerFileInput}
                    style={{ width: '100%', fontSize: 13 }}
                  >
                    Upload & Restore File...
                  </button>
                </div>

                <div style={{ border: '1px solid #fee2e2', borderRadius: 8, padding: 16, background: '#fef2f2' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                  <h4 style={{ margin: '0 0 6px 0', color: '#991b1b' }}>Reset Demo Database</h4>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 12px 0' }}>
                    Clears working state from localStorage and restores original demo accounts, customers, and seed numbers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(true)}
                    style={{
                      width: '100%',
                      fontSize: 13,
                      background: '#dc2626',
                      borderColor: '#b91c1c',
                      color: '#fff',
                    }}
                  >
                    Reset Demo Data
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Database Restore */}
      {restoreModalData && (
        <Modal
          title="Confirm Database Restoration"
          onClose={() => setRestoreModalData(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde047',
                color: '#854d0e',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⚠️ Warning: Restoring from this backup will overwrite your current working database collections.
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
              The selected backup file passed schema validation. The following collections will be loaded into system memory:
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><strong>Customers:</strong> {restoreModalData.customersCount} records</div>
                <div><strong>Cylinders:</strong> {restoreModalData.cylindersCount} cylinders</div>
                <div><strong>Users / Staff:</strong> {restoreModalData.usersCount} accounts</div>
                <div><strong>Invoices:</strong> {restoreModalData.billsCount} bills</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                Exported At: {restoreModalData.exportedAt}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setRestoreModalData(null)}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoring}
                style={{ background: '#2563eb', color: '#fff' }}
              >
                {restoring ? 'Restoring Database...' : 'Yes, Confirm & Restore'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Reset Demo Data */}
      {resetModalOpen && (
        <Modal
          title="Reset Demo Database"
          onClose={() => setResetModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              🚨 Are you sure you want to reset all mock demo data?
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
              This action will clear all modifications from localStorage and restore factory seed values for all customers, orders, inventory, expenses, and ledger entries.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetting}
                style={{ background: '#dc2626', borderColor: '#b91c1c', color: '#fff' }}
              >
                {resetting ? 'Resetting...' : 'Yes, Reset Demo Data'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

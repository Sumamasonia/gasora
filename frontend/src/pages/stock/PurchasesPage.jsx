import { useEffect, useMemo, useState } from 'react'
import { getPurchases, updatePurchase, verifyPurchase } from '../../api'
import EmptyState from '../../components/EmptyState'
import NotReady from '../../components/NotReady'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import AddPurchaseModal from './AddPurchaseModal'
import './stock.css'

export default function PurchasesPage({ auth, onNavigate, onExpired }) {
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [verifiedFilter, setVerifiedFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [verifyingId, setVerifyingId] = useState(null)

  // Edit form state
  const [editVendor, setEditVendor] = useState('')
  const [editUnitCost, setEditUnitCost] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const isManagerOrOwner = auth.role === 'owner' || auth.role === 'manager'

  const loadPurchases = async () => {
    try {
      setLoading(true)
      const data = await getPurchases(auth.token)
      setPurchases(data)
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPurchases()
  }, [auth.token])

  // Handle Verify Tick (Manager/Owner only)
  const handleVerify = async (purchaseId) => {
    if (!isManagerOrOwner) return
    try {
      setVerifyingId(purchaseId)
      const verified = await verifyPurchase(auth.token, purchaseId)
      setPurchases((prev) =>
        prev.map((p) => (p.id === purchaseId ? { ...p, ...verified } : p))
      )
    } catch (err) {
      alert(err.message || 'Verification failed')
    } finally {
      setVerifyingId(null)
    }
  }

  // Open edit modal for unverified purchase
  const openEdit = (p) => {
    if (p.verified) {
      alert('A verified purchase cannot be edited.')
      return
    }
    setEditingPurchase(p)
    setEditVendor(p.vendor)
    setEditUnitCost(p.unit_cost)
    setEditNotes(p.notes || '')
    setEditDate(p.date)
    setEditError('')
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingPurchase) return
    setEditBusy(true)
    setEditError('')
    try {
      const updated = await updatePurchase(auth.token, editingPurchase.id, {
        vendor: editVendor.trim(),
        unit_cost: Number(editUnitCost),
        date: editDate,
        notes: editNotes.trim(),
      })
      setPurchases((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      )
      setEditingPurchase(null)
    } catch (err) {
      setEditError(err.message || 'Failed to update purchase')
    } finally {
      setEditBusy(false)
    }
  }

  // Filter purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (typeFilter !== 'all' && (p.cylinder_type || p.item) !== typeFilter) {
        return false
      }
      if (verifiedFilter === 'verified' && !p.verified) return false
      if (verifiedFilter === 'pending' && p.verified) return false
      if (monthFilter !== 'all' && (!p.date || !p.date.startsWith(monthFilter))) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchVendor = p.vendor && p.vendor.toLowerCase().includes(q)
        const matchInv = p.invoice_no && p.invoice_no.toLowerCase().includes(q)
        const matchNotes = p.notes && p.notes.toLowerCase().includes(q)
        if (!matchVendor && !matchInv && !matchNotes) return false
      }
      return true
    })
  }, [purchases, typeFilter, verifiedFilter, monthFilter, searchQuery])

  // KPIs
  const totalCost = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.total_cost) || 0), 0),
    [purchases]
  )
  const totalUnits = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0),
    [purchases]
  )
  const verifiedCount = useMemo(
    () => purchases.filter((p) => p.verified).length,
    [purchases]
  )
  const pendingCount = purchases.length - verifiedCount

  return (
    <div className="stock-container">
      {/* Header */}
      <div className="stock-header">
        <div className="stock-header-title">
          <h1>
            <span>📥</span> Bulk Stock Purchases & Refill Inflow
          </h1>
          <p>
            Track wholesale cylinder refills from licensed refinery terminals. Saving a purchase automatically rises Filled stock counts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={() => setAddModalOpen(true)}>
            ➕ Record Purchase
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('stock')}>
            📦 Stock Levels
          </button>
          <button type="button" className="secondary" onClick={() => onNavigate('expenses')}>
            💸 Operating Expenses
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Total Procurement Cost</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-primary)' }}>
            PKR {totalCost.toLocaleString()}
          </span>
          <span className="billing-kpi-sub">{totalUnits} cylinders refilled</span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Verified Batches</span>
          <span className="billing-kpi-value" style={{ color: 'var(--color-success)' }}>
            {verifiedCount} / {purchases.length}
          </span>
          <span className="billing-kpi-sub">
            {purchases.length > 0 ? `${Math.round((verifiedCount / purchases.length) * 100)}% verified` : '0%'}
          </span>
        </div>

        <div className="billing-kpi-card">
          <span className="billing-kpi-label">Pending Verification</span>
          <span
            className="billing-kpi-value"
            style={{ color: pendingCount > 0 ? 'var(--color-accent)' : 'var(--color-success)' }}
          >
            {pendingCount}
          </span>
          <span className="billing-kpi-sub">Requires manager weighbridge verification</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="billing-filter-bar">
        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Cylinder Type:</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Specifications</option>
            <option value="11.8 kg">11.8 kg (Domestic)</option>
            <option value="15 kg">15 kg (Commercial)</option>
            <option value="45.4 kg">45.4 kg (Industrial)</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Verification:</label>
          <select value={verifiedFilter} onChange={(e) => setVerifiedFilter(e.target.value)}>
            <option value="all">All Batches</option>
            <option value="verified">✓ Verified Only</option>
            <option value="pending">⏳ Pending Verification</option>
          </select>
        </div>

        <div className="billing-filter-item">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Month:</label>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">All Months</option>
            <option value="2026-03">March 2026</option>
            <option value="2026-02">February 2026</option>
            <option value="2026-01">January 2026</option>
          </select>
        </div>

        <div className="billing-filter-item" style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search vendor, invoice #, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(typeFilter !== 'all' || verifiedFilter !== 'all' || monthFilter !== 'all' || searchQuery) && (
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13 }}
            onClick={() => {
              setTypeFilter('all')
              setVerifiedFilter('all')
              setMonthFilter('all')
              setSearchQuery('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Purchases Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading wholesale purchase records..." />
        </div>
      ) : error ? (
        <div className="error banner">⚠️ {error}</div>
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          title="No Purchases Found"
          description="No purchase records match your search criteria."
          action={
            <button type="button" className="primary" onClick={() => setAddModalOpen(true)}>
              Record First Purchase
            </button>
          }
        />
      ) : (
        <div className="datatable-desktop">
          <table className="datatable">
            <thead>
              <tr>
                <th>Invoice / Bilty #</th>
                <th>Date</th>
                <th>Supplier / Terminal</th>
                <th>Specification</th>
                <th style={{ textAlign: 'center' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Cost (PKR)</th>
                <th style={{ textAlign: 'right' }}>Total Cost (PKR)</th>
                <th style={{ textAlign: 'center' }}>Verification</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="code-badge" style={{ fontWeight: 700 }}>
                      {p.invoice_no || `PUR-${p.id}`}
                    </span>
                  </td>

                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {p.date}
                  </td>

                  <td>
                    <div style={{ fontWeight: 600 }}>{p.vendor}</div>
                    {p.notes && <div className="muted" style={{ fontSize: 11 }}>{p.notes}</div>}
                  </td>

                  <td>
                    <span className="code-badge">{p.cylinder_type || p.item}</span>
                  </td>

                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    +{p.quantity}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    {(Number(p.unit_cost) || 0).toLocaleString()}
                  </td>

                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {(Number(p.total_cost) || 0).toLocaleString()}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {p.verified ? (
                      <span className="badge-verified" title={`Verified by ${p.verified_by || 'manager'} on ${p.verified_at ? new Date(p.verified_at).toLocaleDateString() : 'file'}`}>
                        ✓ Verified by {p.verified_by || 'manager'}
                      </span>
                    ) : isManagerOrOwner ? (
                      <button
                        type="button"
                        className="btn-verify"
                        onClick={() => handleVerify(p.id)}
                        disabled={verifyingId === p.id}
                        title="Click to verify this wholesale delivery as manager"
                      >
                        {verifyingId === p.id ? 'Verifying...' : '✓ Verify Batch'}
                      </button>
                    ) : (
                      <span className="badge-unverified" title="Awaiting manager verification">
                        ⏳ Pending Verification
                      </span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    {p.verified ? (
                      <span className="muted" style={{ fontSize: 11 }} title="Verified purchases cannot be modified">
                        🔒 Locked
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                        onClick={() => openEdit(p)}
                        title="Edit unverified purchase details"
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Purchase Modal */}
      {addModalOpen && (
        <AddPurchaseModal
          auth={auth}
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onPurchaseCreated={(newP) => setPurchases((prev) => [newP, ...prev])}
        />
      )}

      {/* Edit Purchase Modal (Unverified only) */}
      {editingPurchase && (
        <Modal
          isOpen={Boolean(editingPurchase)}
          onClose={() => setEditingPurchase(null)}
          title={`Edit Purchase #${editingPurchase.id} (${editingPurchase.invoice_no})`}
          maxWidth={540}
        >
          <form onSubmit={handleEditSubmit}>
            {editError && <div className="error banner" style={{ marginBottom: 12 }}>⚠️ {editError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Vendor</label>
                <input
                  type="text"
                  value={editVendor}
                  onChange={(e) => setEditVendor(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Unit Cost (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={editUnitCost}
                  onChange={(e) => setEditUnitCost(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setEditingPurchase(null)} disabled={editBusy}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={editBusy}>
                {editBusy ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

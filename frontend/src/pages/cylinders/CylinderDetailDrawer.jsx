import { useCallback, useEffect, useState } from 'react'
import { getCylinder, getCylinderHistory, transitionCylinder } from '../../api.js'
import FormField from '../../components/FormField.jsx'
import Spinner from '../../components/Spinner.jsx'
import { useToast } from '../../components/Toast.jsx'

export default function CylinderDetailDrawer({
  isOpen,
  onClose,
  cylinderId,
  auth,
  customers = [],
  onNavigate,
  onCylinderUpdated,
}) {
  const { showToast } = useToast()
  const isOwner = auth?.role === 'owner' || auth?.role === 'manager'
  const isDriver = auth?.role === 'driver'

  const [cylinder, setCylinder] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Transition form state
  const [activeAction, setActiveAction] = useState(null) // null | 'Filled' | 'Delivered' | 'Recovered' | 'Empty'
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const loadCylinder = useCallback(async () => {
    if (!cylinderId) return
    setLoading(true)
    setError(null)
    try {
      const [cylData, histData] = await Promise.all([
        getCylinder(auth.token, cylinderId),
        getCylinderHistory(auth.token, cylinderId),
      ])
      setCylinder(cylData)
      setHistory(histData || [])
    } catch (err) {
      setError(err.message || 'Failed to load cylinder details')
    } finally {
      setLoading(false)
    }
  }, [auth.token, cylinderId])

  useEffect(() => {
    if (isOpen && cylinderId) {
      loadCylinder()
      setActiveAction(null)
      setSelectedCustomerId('')
      setDueDate('')
      setNote('')
      setActionError(null)
    }
  }, [isOpen, cylinderId, loadCylinder])

  // Keydown Escape handler
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Current holder customer
  const currentHolderCustomer =
    cylinder?.customer_id && customers
      ? customers.find((c) => c.id === cylinder.customer_id)
      : null

  // Initiate action
  const handleStartMove = (toState) => {
    setActiveAction(toState)
    setActionError(null)
    setNote('')
    if (toState === 'Delivered') {
      // Default due date: today + 15 days
      const d = new Date()
      d.setDate(d.getDate() + 15)
      setDueDate(d.toISOString().split('T')[0])
      if (customers.length > 0) {
        setSelectedCustomerId(customers[0].id)
      }
    }
  }

  // Submit transition
  const handleExecuteTransition = async (e) => {
    e.preventDefault()
    if (!activeAction) return

    setActionBusy(true)
    setActionError(null)

    const payload = {
      to_state: activeAction,
      note: note.trim() || undefined,
    }

    if (activeAction === 'Delivered') {
      if (!selectedCustomerId) {
        setActionError('Please select a customer')
        setActionBusy(false)
        return
      }
      payload.customer_id = Number(selectedCustomerId)
      if (dueDate) {
        payload.due_date = dueDate
      }
    } else if (activeAction === 'Recovered') {
      // Automatically uses real holder
      if (cylinder.customer_id) {
        payload.customer_id = cylinder.customer_id
      }
    }

    try {
      const updated = await transitionCylinder(auth.token, cylinder.id, payload)
      showToast(
        `Cylinder ${updated.serial_no} moved from ${cylinder.state} ➔ ${updated.state}`,
        'success'
      )
      setCylinder(updated)
      setActiveAction(null)
      if (onCylinderUpdated) onCylinderUpdated(updated)
      await loadCylinder()
    } catch (err) {
      setActionError(err.message || 'Transition rejected')
      showToast(err.message || 'Transition rejected', 'danger')
    } finally {
      setActionBusy(false)
    }
  }

  // Format date helper
  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    return new Date(isoStr).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="drawer-header">
          <div>
            <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
              Cylinder Detail & History
            </span>
            <h2 id="drawer-title" className="drawer-title">
              {cylinder ? cylinder.serial_no : 'Loading...'}
            </h2>
          </div>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            aria-label="Close drawer"
            style={{ fontSize: 18, padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <Spinner size="md" message="Loading cylinder history..." />
            </div>
          ) : error ? (
            <div className="error banner">{error}</div>
          ) : !cylinder ? null : (
            <>
              {/* Status and Attributes Card */}
              <div className="card" style={{ padding: 16, gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Current Lifecycle State:</span>
                  <span
                    className={
                      cylinder.state === 'Empty'
                        ? 'badge-empty'
                        : cylinder.state === 'Filled'
                        ? 'badge-filled'
                        : cylinder.state === 'Delivered'
                        ? 'badge-delivered'
                        : 'badge-recovered'
                    }
                    style={{ fontSize: 13, padding: '3px 10px' }}
                  >
                    ● {cylinder.state}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Cylinder Capacity:</span>
                  <span style={{ fontWeight: 600 }}>{cylinder.cylinder_type}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Ownership:</span>
                  <span className={cylinder.owner === 'Company' ? 'badge-company' : 'badge-customer-owner'}>
                    {cylinder.owner}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Current Location / Holder:</span>
                  {cylinder.customer_id ? (
                    <button
                      type="button"
                      className="ghost"
                      style={{
                        padding: 0,
                        minHeight: 'auto',
                        color: 'var(--color-primary)',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                      onClick={() => {
                        onClose()
                        onNavigate(`customers/${cylinder.customer_id}`)
                      }}
                    >
                      📍 {currentHolderCustomer ? currentHolderCustomer.name : `Customer #${cylinder.customer_id}`} ➔
                    </button>
                  ) : (
                    <span style={{ fontWeight: 500 }}>🏭 Central Depot (Plant)</span>
                  )}
                </div>

                {cylinder.customer_id && currentHolderCustomer && (
                  <div
                    style={{
                      background: 'var(--bg-subtle)',
                      padding: 10,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div><strong>Address:</strong> {currentHolderCustomer.address}</div>
                    <div><strong>Area:</strong> {currentHolderCustomer.area}</div>
                    <div><strong>Phone:</strong> {currentHolderCustomer.phone}</div>
                  </div>
                )}
              </div>

              {/* Valid Next Moves Block */}
              <div className="valid-moves-block">
                <div className="valid-moves-title">
                  <span>Available Lifecycle Actions ({auth?.role})</span>
                </div>

                {/* State: Empty */}
                {cylinder.state === 'Empty' && (
                  <>
                    {isOwner ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                          Cylinder is empty at the depot. Refill to mark as filled & ready for delivery.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleStartMove('Filled')}
                          disabled={activeAction === 'Filled'}
                        >
                          Refill (Move to Filled) ➔
                        </button>
                      </div>
                    ) : (
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                        🔒 Plant refilling (Empty ➔ Filled) is an internal depot stock move managed by owners.
                      </p>
                    )}
                  </>
                )}

                {/* State: Filled */}
                {cylinder.state === 'Filled' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      Cylinder is filled and inspected. Assign delivery to a customer account.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleStartMove('Delivered')}
                      disabled={activeAction === 'Delivered'}
                    >
                      🚚 Deliver to Customer ➔
                    </button>
                  </div>
                )}

                {/* State: Delivered */}
                {cylinder.state === 'Delivered' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      Currently held by{' '}
                      <strong>{currentHolderCustomer?.name || `Customer #${cylinder.customer_id}`}</strong>.
                      Collect the empty cylinder back to depot.
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleStartMove('Recovered')}
                      disabled={activeAction === 'Recovered'}
                    >
                      ↩️ Recover Empty from Customer ➔
                    </button>
                  </div>
                )}

                {/* State: Recovered */}
                {cylinder.state === 'Recovered' && (
                  <>
                    {isOwner ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                          Recovered empty is back at depot. Return to stock as Empty ready for refilling.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleStartMove('Empty')}
                          disabled={activeAction === 'Empty'}
                        >
                          Return to Stock (Move to Empty) ➔
                        </button>
                      </div>
                    ) : (
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                        🔒 Stock intake (Recovered ➔ Empty) is an internal depot stock move managed by owners.
                      </p>
                    )}
                  </>
                )}

                {/* Active Action Form */}
                {activeAction && (
                  <form
                    onSubmit={handleExecuteTransition}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-md)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      marginTop: 8,
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: 14 }}>
                      Confirm Move: {cylinder.state} ➔ {activeAction}
                    </h4>

                    {actionError && <div className="error banner">{actionError}</div>}

                    {activeAction === 'Delivered' && (
                      <>
                        <FormField label="Recipient Customer" required id="move-cust">
                          <select
                            id="move-cust"
                            value={selectedCustomerId}
                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                            required
                          >
                            <option value="">Select recipient customer...</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.area || 'Faisalabad'})
                              </option>
                            ))}
                          </select>
                        </FormField>

                        <FormField
                          label="Return Due Date"
                          required
                          hint="Defaults to delivery day + 15 days"
                          id="move-due"
                        >
                          <input
                            id="move-due"
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            required
                          />
                        </FormField>
                      </>
                    )}

                    <FormField label="Transaction Note" id="move-note">
                      <input
                        id="move-note"
                        type="text"
                        placeholder="e.g. Regular scheduled drop-off, driver verification..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </FormField>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setActiveAction(null)}
                        disabled={actionBusy}
                      >
                        Cancel
                      </button>
                      <button type="submit" disabled={actionBusy}>
                        {actionBusy ? 'Executing Move...' : `Confirm ${activeAction}`}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Vertical History Timeline */}
              <div>
                <h3 style={{ fontSize: 15, margin: '0 0 4px', fontWeight: 700 }}>
                  Audit History Timeline ({history.length} events)
                </h3>
                <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
                  Tamper-evident record of all lifecycle moves, actors, and return due dates
                </p>

                {history.length === 0 ? (
                  <p className="muted">No transaction history recorded yet.</p>
                ) : (
                  <div className="timeline">
                    {history.map((item, index) => {
                      const cust = item.customer_id
                        ? customers.find((c) => c.id === item.customer_id)
                        : null
                      return (
                        <div key={item.id || index} className="timeline-item">
                          <div className="timeline-dot" />
                          <div className="timeline-content">
                            <div className="timeline-header">
                              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                {item.txn_type === 'register'
                                  ? 'Registered'
                                  : `${item.from_state || 'Empty'} ➔ ${item.to_state}`}
                              </span>
                              <span className="muted">{formatDate(item.created_at)}</span>
                            </div>

                            <div style={{ fontSize: 12, marginTop: 2 }}>
                              <span className="muted">Actor: </span>
                              <strong>{item.actor || 'system'}</strong>
                              {item.customer_id && (
                                <span style={{ marginLeft: 8 }}>
                                  <span className="muted">Customer: </span>
                                  <strong>{cust ? cust.name : `#${item.customer_id}`}</strong>
                                </span>
                              )}
                            </div>

                            {item.due_date && (
                              <div style={{ fontSize: 12, color: 'var(--color-high)' }}>
                                📅 Return Due Date: <strong>{item.due_date}</strong>
                              </div>
                            )}

                            {item.note && (
                              <div className="timeline-note">
                                💬 &ldquo;{item.note}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { ApiError, deliverStop, getCylinders, getMyRoutes, skipStop } from './api'
import { Badge, UrgentTag } from './ui'

export default function DriverView({ auth, onSignOut, onExpired }) {
  const [routes, setRoutes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  // State for Complete-Stop Sheet
  const [completingStop, setCompletingStop] = useState(null)
  const [availableFilled, setAvailableFilled] = useState([])
  const [customerEmpties, setCustomerEmpties] = useState([])
  const [selectedDeliveredIds, setSelectedDeliveredIds] = useState([])
  const [selectedEmptyIds, setSelectedEmptyIds] = useState([])
  const [loadingCylinders, setLoadingCylinders] = useState(false)

  // State for Skip Sheet
  const [skippingStop, setSkippingStop] = useState(null)
  const [skipReason, setSkipReason] = useState('')

  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [onExpired])

  const load = useCallback(async () => {
    const r = await getMyRoutes(auth.token)
    setRoutes(r)
  }, [auth.token])

  useEffect(() => { run(load) }, [run, load])

  // Open the complete stop sheet and load serial numbers
  const handleOpenCompleteSheet = async (stop) => {
    setCompletingStop(stop)
    setSelectedDeliveredIds([])
    setSelectedEmptyIds([])
    setLoadingCylinders(true)
    try {
      // 1. Fetch available Filled cylinders
      const filled = await getCylinders(auth.token, { state: 'Filled' })
      setAvailableFilled(filled || [])

      // 2. Fetch Delivered cylinders held by this customer
      const held = await getCylinders(auth.token, { customer_id: stop.customer_id, state: 'Delivered' })
      setCustomerEmpties(held || [])
    } catch (err) {
      console.warn('Could not load cylinders for stop completion:', err)
    } finally {
      setLoadingCylinders(false)
    }
  }

  // Submit complete stop
  const handleConfirmDelivery = async () => {
    if (!completingStop) return
    const stopId = completingStop.stop_id

    // "an empty choice sends the old body: {}"
    const body = {}
    if (selectedDeliveredIds.length > 0) {
      body.delivered_cylinder_ids = selectedDeliveredIds
    }
    if (selectedEmptyIds.length > 0) {
      body.empty_cylinder_ids = selectedEmptyIds
    }

    await run(async () => {
      const res = await deliverStop(auth.token, stopId, body)
      setCompletingStop(null)
      if (res && res.cylinders_moved > 0) {
        setToastMessage(`Delivered! ${res.cylinders_moved} cylinder(s) updated in registry.`)
      } else {
        setToastMessage('Stop marked as delivered.')
      }
      setTimeout(() => setToastMessage(''), 4000)
      await load()
    })
  }

  // Submit skip stop
  const handleConfirmSkip = async () => {
    if (!skippingStop || !skipReason.trim()) return
    const stopId = skippingStop.stop_id
    const reason = skipReason.trim()

    await run(async () => {
      await skipStop(auth.token, stopId, reason)
      setSkippingStop(null)
      setSkipReason('')
      setToastMessage('Stop skipped.')
      setTimeout(() => setToastMessage(''), 4000)
      await load()
    })
  }

  const toggleSelectDelivered = (id) => {
    setSelectedDeliveredIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectEmpty = (id) => {
    setSelectedEmptyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="driver phone-container">
      {/* Driver App Header */}
      <header className="driver-header">
        <div className="driver-brand">
          <span className="driver-brand-icon">🔥</span>
          <strong>Gasora Driver</strong>
        </div>
        <span className="driver-username muted">{auth.username}</span>
        <span className="spacer" />
        <button className="driver-refresh-btn" disabled={busy} onClick={() => run(load)}>
          {busy ? '...' : '↻ Refresh'}
        </button>
        <button className="driver-signout-btn secondary" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {error && <p className="error banner">{error}</p>}
      {toastMessage && <div className="driver-toast">{toastMessage}</div>}

      {routes && routes.length === 0 && (
        <div className="empty-route-card">
          <div className="empty-icon">🚚</div>
          <h3>No Route Assigned</h3>
          <p className="muted">You have no active routes assigned for today. Contact dispatch to assign a route.</p>
        </div>
      )}

      {routes && routes.map((r) => {
        const stops = r.stops || []
        const pendingStops = stops.filter((s) => s.status === 'pending')
        const completedStops = stops.filter((s) => s.status !== 'pending')

        // Manifest calculations
        const cylindersToLoad = pendingStops.reduce((sum, s) => sum + (s.cylinders || 1), 0)
        const emptiesToCollect = cylindersToLoad // Standard 1-to-1 LPG exchange expectation
        const stopsLeft = pendingStops.length
        const currentStop = pendingStops[0] || null
        const nextStops = pendingStops.slice(1)

        return (
          <div key={r.route_id} className="driver-route-view">
            {/* Manifest Summary on Top (cylinders to load, empties to collect, stops left) */}
            <div className="driver-manifest-summary">
              <div className="manifest-header">
                <strong>Vehicle {r.vehicle} Manifest</strong>
                <span className="manifest-progress-text">
                  {r.delivered}/{r.total} completed ({r.skipped} skipped)
                </span>
              </div>

              <div className="manifest-tiles-grid">
                <div className="manifest-tile load-tile">
                  <span className="manifest-tile-value">{cylindersToLoad}</span>
                  <span className="manifest-tile-label">Cylinders to Load</span>
                  <span className="manifest-tile-sub">Filled</span>
                </div>

                <div className="manifest-tile empty-tile">
                  <span className="manifest-tile-value">{emptiesToCollect}</span>
                  <span className="manifest-tile-label">Empties to Collect</span>
                  <span className="manifest-tile-sub">Target swap</span>
                </div>

                <div className="manifest-tile stops-tile">
                  <span className="manifest-tile-value">{stopsLeft}</span>
                  <span className="manifest-tile-label">Stops Left</span>
                  <span className="manifest-tile-sub">of {r.total}</span>
                </div>
              </div>
            </div>

            {/* ONE LARGE CURRENT-STOP CARD */}
            {currentStop ? (
              <div className={`driver-current-stop-card ${currentStop.urgent ? 'urgent-stop' : ''}`}>
                <div className="current-stop-badge-strip">
                  <span className="current-stop-pill">CURRENT STOP &bull; #{currentStop.seq}</span>
                  {currentStop.urgent && <UrgentTag />}
                  <Badge band={currentStop.band} />
                </div>

                <h2 className="current-customer-name">{currentStop.name}</h2>

                <div className="current-address-row">
                  <span className="address-icon">📍</span>
                  <span className="address-text">{currentStop.address || 'Address on file in Faisalabad'}</span>
                </div>

                <div className="current-demand-pill">
                  📦 <strong>{currentStop.cylinders} cylinder{currentStop.cylinders > 1 ? 's' : ''}</strong> to deliver
                </div>

                {/* Direct Action Links: Call & Open in Maps */}
                <div className="current-stop-links">
                  {currentStop.phone ? (
                    <a href={`tel:${currentStop.phone}`} className="driver-link-btn call-btn">
                      📞 Call {currentStop.phone}
                    </a>
                  ) : (
                    <span className="driver-link-btn disabled">No phone</span>
                  )}

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${currentStop.lat},${currentStop.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="driver-link-btn maps-btn"
                  >
                    🗺️ Open in Maps
                  </a>
                </div>

                {/* Stop Action Buttons */}
                <div className="current-stop-actions">
                  <button
                    className="driver-complete-btn"
                    disabled={busy}
                    onClick={() => handleOpenCompleteSheet(currentStop)}
                  >
                    ✓ Complete Delivery
                  </button>
                  <button
                    className="driver-skip-btn secondary"
                    disabled={busy}
                    onClick={() => {
                      setSkippingStop(currentStop)
                      setSkipReason('')
                    }}
                  >
                    ✕ Skip Stop
                  </button>
                </div>
              </div>
            ) : (
              <div className="route-completed-card">
                <div className="celebration-icon">🎉</div>
                <h3>All Deliveries Completed!</h3>
                <p className="muted">Great job! All {r.total} stops on today&apos;s route have been visited.</p>
              </div>
            )}

            {/* LIST OF THE NEXT STOPS */}
            {nextStops.length > 0 && (
              <div className="driver-next-stops-section">
                <h4 className="next-stops-title">Upcoming Stops ({nextStops.length})</h4>
                <div className="next-stops-list">
                  {nextStops.map((s) => (
                    <div key={s.stop_id} className="next-stop-row">
                      <span className="next-stop-seq">{s.seq}</span>
                      <div className="next-stop-info">
                        <div className="next-stop-top">
                          <strong>{s.name}</strong>
                          {s.urgent && <UrgentTag />}
                          <Badge band={s.band} />
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {s.address ? s.address.slice(0, 32) : 'Faisalabad'} &middot; {s.cylinders} cyl
                        </span>
                      </div>
                      <div className="next-stop-quick-links">
                        {s.phone && (
                          <a href={`tel:${s.phone}`} className="quick-icon-link" title={`Call ${s.phone}`}>
                            📞
                          </a>
                        )}
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          className="quick-icon-link"
                          title="Open in Maps"
                        >
                          🗺️
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COMPLETED STOPS LIST */}
            {completedStops.length > 0 && (
              <div className="driver-completed-stops-section">
                <details className="completed-details">
                  <summary className="completed-summary">
                    <span>Visited Stops ({completedStops.length})</span>
                    <span className="muted" style={{ fontSize: 12 }}>Tap to expand</span>
                  </summary>
                  <div className="completed-stops-list">
                    {completedStops.map((s) => (
                      <div key={s.stop_id} className={`completed-stop-row ${s.status}`}>
                        <span className="completed-status-icon">
                          {s.status === 'delivered' ? '✓' : '✕'}
                        </span>
                        <div className="completed-info">
                          <strong>{s.name}</strong>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {s.status === 'delivered' ? 'Delivered' : `Skipped: ${s.reason}`}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>#{s.seq}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )
      })}

      {/* COMPLETE-STOP SHEET (OPTIONAL SERIAL PICKER) */}
      {completingStop && (
        <div className="complete-stop-sheet-overlay" onClick={() => setCompletingStop(null)}>
          <div className="complete-stop-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>Confirm Delivery: {completingStop.name}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Demand: {completingStop.cylinders} cylinder(s) &middot; Stop #{completingStop.seq}
              </p>
            </div>

            <div className="sheet-body">
              {loadingCylinders ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <span className="muted">Loading available cylinders...</span>
                </div>
              ) : (
                <>
                  <div className="cylinder-picker-group">
                    <div className="picker-title-row">
                      <strong>1. Filled Cylinders Delivered:</strong>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Selected: {selectedDeliveredIds.length}
                      </span>
                    </div>
                    <div className="cylinder-chips-scroll">
                      {availableFilled.length === 0 ? (
                        <p className="muted" style={{ fontSize: 12 }}>No filled cylinders in truck stock.</p>
                      ) : (
                        availableFilled.slice(0, 15).map((cyl) => {
                          const isPicked = selectedDeliveredIds.includes(cyl.id)
                          return (
                            <button
                              key={cyl.id}
                              type="button"
                              className={`cylinder-serial-chip ${isPicked ? 'picked' : ''}`}
                              onClick={() => toggleSelectDelivered(cyl.id)}
                            >
                              <span className="serial-no">{cyl.serial_no}</span>
                              <span className="cyl-weight">{cyl.cylinder_type}</span>
                              {isPicked && <span className="picked-mark">✓</span>}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="cylinder-picker-group" style={{ marginTop: 12 }}>
                    <div className="picker-title-row">
                      <strong>2. Empty Cylinders Collected:</strong>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Selected: {selectedEmptyIds.length}
                      </span>
                    </div>
                    <div className="cylinder-chips-scroll">
                      {customerEmpties.length === 0 ? (
                        <p className="muted" style={{ fontSize: 12 }}>Customer has no recorded delivered cylinders.</p>
                      ) : (
                        customerEmpties.map((cyl) => {
                          const isPicked = selectedEmptyIds.includes(cyl.id)
                          return (
                            <button
                              key={cyl.id}
                              type="button"
                              className={`cylinder-serial-chip empty-chip ${isPicked ? 'picked' : ''}`}
                              onClick={() => toggleSelectEmpty(cyl.id)}
                            >
                              <span className="serial-no">{cyl.serial_no}</span>
                              <span className="cyl-weight">{cyl.cylinder_type}</span>
                              {isPicked && <span className="picked-mark">✓</span>}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="optional-hint-box">
                    💡 <em>Optional:</em> Select serial numbers for asset tracking. Leaving unselected will record standard delivery.
                  </div>
                </>
              )}
            </div>

            <div className="sheet-footer">
              <button
                type="button"
                className="confirm-delivery-btn"
                disabled={busy}
                onClick={handleConfirmDelivery}
              >
                {busy ? 'Recording...' : selectedDeliveredIds.length || selectedEmptyIds.length ? 'Confirm with Cylinders' : 'Confirm Delivery'}
              </button>
              <button
                type="button"
                className="cancel-btn secondary"
                disabled={busy}
                onClick={() => setCompletingStop(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SKIP STOP SHEET WITH REASONS */}
      {skippingStop && (
        <div className="complete-stop-sheet-overlay" onClick={() => setSkippingStop(null)}>
          <div className="complete-stop-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3 style={{ color: '#dc2626' }}>Skip Stop: {skippingStop.name}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Please provide the reason why this delivery could not be completed.
              </p>
            </div>

            <div className="sheet-body">
              <div className="skip-preset-pills">
                {[
                  'Customer away / Gate locked',
                  'Shop closed',
                  'Cash / Payment issue',
                  'Refill not needed yet',
                  'Road inaccessible / Construction',
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className={`skip-preset-pill ${skipReason === reason ? 'active' : ''}`}
                    onClick={() => setSkipReason(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 10 }}>
                <input
                  type="text"
                  className="skip-reason-input"
                  placeholder="Or enter custom reason..."
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="sheet-footer">
              <button
                type="button"
                className="confirm-skip-btn"
                disabled={busy || !skipReason.trim()}
                onClick={handleConfirmSkip}
              >
                {busy ? 'Saving...' : 'Confirm Skip'}
              </button>
              <button
                type="button"
                className="cancel-btn secondary"
                disabled={busy}
                onClick={() => setSkippingStop(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
